// Walrus testnet HTTP API. Server-side only — the publisher URL is a secret
// (no NEXT_PUBLIC_ prefix) and the aggregator read is cached per-request by
// Next, which only works on the server.
//
// Numbers here were measured against the live testnet on 2026-09-03, see
// docs/plan_v1.md §1: a 30-byte upload took 10.4s, an aggregator read 1.9s.

/** Verified cap — `epochs=100` is rejected with `EInvalidEpochsAhead`. */
export const MAX_EPOCHS = 53;

/**
 * How long the blob is paid to live. Testnet epochs run 1–2 days, so the cap
 * is roughly 53–106 days. There is no way to extend later: the public
 * publisher owns the resulting Blob object, not us. Default to the cap —
 * storage is free on testnet and a blob that expires mid-demo is the single
 * most expensive failure available here.
 */
const EPOCHS = Math.min(Number(process.env.WALRUS_EPOCHS ?? MAX_EPOCHS), MAX_EPOCHS);

/** Traces are model reasoning, not media. Anything larger is a bug upstream. */
const MAX_BYTES = 256 * 1024;

/** The publisher is slow and occasionally hangs; fail loudly instead. */
const UPLOAD_TIMEOUT_MS = 20_000;

/**
 * Deterministic JSON: object keys sorted at every depth, no incidental
 * whitespace.
 *
 * `JSON.stringify` preserves *insertion* order, so the same verdict built by
 * two different code paths can serialise to two different byte strings — and
 * since Walrus addresses blobs by content, that would mint two blob IDs for
 * one logical trace and break the "same input, same blob" property the verify
 * flow leans on.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

/** The exact bytes that get stored. Everything else derives from these. */
export function traceBytes(trace: unknown): Uint8Array<ArrayBuffer> {
  // Copied into a fresh ArrayBuffer: TextEncoder returns ArrayBufferLike,
  // which neither Blob nor fetch's BodyInit will accept.
  return new Uint8Array(new TextEncoder().encode(canonicalize(trace)));
}

export type WalrusUpload = {
  blobId: string;
  /** Byte length actually stored — worth logging when a size cap trips. */
  size: number;
  /** `existing` when the publisher recognised these exact bytes. */
  status: "new" | "existing";
};

/**
 * PUT the trace and return its blob ID.
 *
 * Callers must redact PII (TR-10) *before* handing the value over: what
 * arrives here is what gets published, and Walrus is public and read by
 * anyone with the ID.
 */
export async function uploadToWalrus(
  publisherUrl: string,
  data: unknown,
  options: { epochs?: number; signal?: AbortSignal } = {},
): Promise<WalrusUpload> {
  const bytes = traceBytes(data);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`Trace is ${bytes.byteLength} bytes, over the ${MAX_BYTES} limit.`);
  }

  const epochs = Math.min(options.epochs ?? EPOCHS, MAX_EPOCHS);
  const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;

  const response = await fetch(`${publisherUrl}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    // The Uint8Array goes over the wire as-is. Do NOT wrap it in a Blob:
    // under the test runtime that serialises to the literal string
    // "[object Blob]" and the publisher happily stores those 13 bytes, which
    // is only visible when you read the blob back (caught exactly that way).
    body: bytes,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Walrus publisher returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  const blobId: string | undefined =
    body.newlyCreated?.blobObject?.blobId ?? body.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error(`Walrus publisher response had no blobId: ${JSON.stringify(body)}`);
  }

  return {
    blobId,
    size: bytes.byteLength,
    status: body.alreadyCertified ? "existing" : "new",
  };
}

/** Public read URL — safe to show a user, and the point of FR-9. */
export function blobUrl(blobId: string): string {
  const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
  if (!aggregator) throw new Error("NEXT_PUBLIC_WALRUS_AGGREGATOR is not configured.");
  return `${aggregator}/v1/blobs/${blobId}`;
}

export type TraceResult<T = unknown> =
  | { ok: true; trace: T; url: string }
  | { ok: false; reason: "unavailable" | "malformed"; url: string };

/**
 * Read a trace back by blob ID.
 *
 * There is deliberately no `mismatch` case. Walrus addresses blobs by their
 * content, so asking the aggregator for ID X and getting a 200 *is* the
 * integrity check — the network cannot serve different bytes under the same
 * ID. A separate `trace_hash` on the Verdict object would prove nothing extra
 * and would cost a Move redeploy (docs/plan_v1.md §4 W3).
 *
 * What this cannot prove is that the blob still exists: the public publisher
 * owns the Blob object and marks it deletable (§2 B1). `unavailable` is a
 * real, expected state, and callers must render it honestly rather than
 * treating it as a crash.
 */
export async function fetchTrace<T = unknown>(blobId: string): Promise<TraceResult<T>> {
  const url = blobUrl(blobId);
  let text: string;

  try {
    // Traces are immutable once written, so this can be cached hard; an hour
    // is short enough that a deleted blob stops being served fairly quickly.
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return { ok: false, reason: "unavailable", url };
    text = await response.text();
  } catch {
    return { ok: false, reason: "unavailable", url };
  }

  try {
    return { ok: true, trace: JSON.parse(text) as T, url };
  } catch {
    return { ok: false, reason: "malformed", url };
  }
}
