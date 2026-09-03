// lib/walrus.ts — server-only. Never import from a client component.
import "server-only";
import { createHash } from "node:crypto";

const PUBLISHER =
  process.env.WALRUS_PUBLISHER_URL ?? "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
  "https://aggregator.walrus-testnet.walrus.space";
// testnet epochs are short; check publisher's max before demo. Do NOT pass deletable=true.
const EPOCHS = Number(process.env.WALRUS_EPOCHS ?? 30);
const MAX_BYTES = 256 * 1024;
const UPLOAD_TIMEOUT_MS = 20_000;

// ---------- 1. PII scrub (runs before hash + upload; on-chain claim_text uses this too) ----------

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\+?60[\s-]?1\d[\s-]?\d{3,4}[\s-]?\d{4}/g, "[PHONE]"],   // +60 12-345 6789
  [/\b01\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[PHONE]"],          // 012-345 6789
  [/\b\d{6}-\d{2}-\d{4}\b/g, "[IC]"],                        // 990101-14-1234
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[EMAIL]"],
  [/https?:\/\/wa\.me\/\S+/g, "[LINK]"],
];

export function scrubString(s: string): string {
  return PII_PATTERNS.reduce((acc, [re, tag]) => acc.replace(re, tag), s);
}

export function scrubPII<T>(value: T): T {
  if (typeof value === "string") return scrubString(value) as T;
  if (Array.isArray(value)) return value.map(scrubPII) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubPII(v);
    return out as T;
  }
  return value;
}

// ---------- 2. Canonical JSON → deterministic bytes → sha256 ----------

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value as object).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export function traceBytes(trace: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(trace));
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------- 3. Upload ----------

export type WalrusUpload = {
  blobId: string;
  traceHash: string; // sha256 hex of the exact bytes uploaded
  bytes: number;
  status: "new" | "existing";
};

type PublisherResponse =
  | { newlyCreated: { blobObject: { blobId: string } } }
  | { alreadyCertified: { blobId: string } };

export async function uploadTrace(rawTrace: unknown): Promise<WalrusUpload> {
  const scrubbed = scrubPII(rawTrace);
  const bytes = traceBytes(scrubbed);
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`trace too large: ${bytes.byteLength} > ${MAX_BYTES}`);
  }
  const traceHash = sha256Hex(bytes);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${EPOCHS}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`walrus publisher ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as PublisherResponse;

    if ("newlyCreated" in json) {
      return { blobId: json.newlyCreated.blobObject.blobId, traceHash, bytes: bytes.byteLength, status: "new" };
    }
    if ("alreadyCertified" in json) {
      return { blobId: json.alreadyCertified.blobId, traceHash, bytes: bytes.byteLength, status: "existing" };
    }
    throw new Error(`unexpected publisher response: ${JSON.stringify(json)}`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 4. Read + verify (used by /v/[objectId] RSC) ----------

export function blobUrl(blobId: string): string {
  return `${AGGREGATOR}/v1/blobs/${blobId}`;
}

export type VerifiedTrace<T = unknown> =
  | { ok: true; trace: T; hash: string }
  | { ok: false; reason: "unavailable" | "hash_mismatch"; hash?: string };

export async function fetchTrace<T = unknown>(
  blobId: string,
  expectedHashHex: string,
): Promise<VerifiedTrace<T>> {
  const res = await fetch(blobUrl(blobId), { next: { revalidate: 3600 } });
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const bytes = new Uint8Array(await res.arrayBuffer());
  const hash = sha256Hex(bytes);
  if (hash !== expectedHashHex.toLowerCase()) return { ok: false, reason: "hash_mismatch", hash };
  return { ok: true, trace: JSON.parse(new TextDecoder().decode(bytes)) as T, hash };
}
