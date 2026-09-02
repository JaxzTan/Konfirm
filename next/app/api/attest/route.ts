import { NextRequest, NextResponse } from "next/server";
import { redactDeep } from "@/lib/attest/redact";
import { normalizeVerdictArgs } from "@/lib/attest/verdictArgs";
import { uploadToWalrus } from "@/lib/attest/walrus";
import { LANG_CODES, type Locale } from "@/lib/attest/lang";
import { rateLimit } from "@/lib/rateLimit";

// TR-13: 3 req/min/IP, tighter than /api/verdict's 10 — this is the
// endpoint that ends in a real sponsored on-chain write, so it's the one
// that could actually drain the sponsor's testnet SUI if abused.
const LIMIT = 3;
const WINDOW_MS = 60_000;

// No zkLogin JWT check yet (TRD §"Auth" calls for verifying the JWT/nonce
// binding here) — the client is trusted to only call this after a real
// Enoki login, same "not silently decided" caveat create_verdict's own doc
// comment raises about its own missing capability gate.
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = rateLimit(`attest:${ip}`, LIMIT, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attest requests, try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }

  const body = await request.json();
  const { lang, result } = body as { lang: Locale; result: any };

  if (!(lang in LANG_CODES) || !result?.state) {
    return NextResponse.json({ error: "Missing or invalid lang/result." }, { status: 400 });
  }

  const args = normalizeVerdictArgs(result);

  // The full verdict, PII-redacted (TR-10) — this is the "complete reasoning
  // trace" FR-9 wants archived, not just the on-chain summary fields.
  const trace = redactDeep({ ...result, attestedAt: new Date().toISOString() });

  const publisherUrl = process.env.WALRUS_PUBLISHER;
  if (!publisherUrl) {
    return NextResponse.json({ error: "WALRUS_PUBLISHER is not configured." }, { status: 500 });
  }

  let traceBlob: string;
  try {
    traceBlob = await uploadToWalrus(publisherUrl, trace);
  } catch (error) {
    // R-2 in the TRD's risk table: Walrus testnet being flaky is an
    // anticipated failure mode, not a bug — surface it plainly rather than
    // half-completing an attest with no trace.
    console.error("Walrus upload failed:", error);
    return NextResponse.json({ error: "Walrus upload failed — try again." }, { status: 502 });
  }

  return NextResponse.json({
    traceBlob,
    lang: LANG_CODES[lang],
    state: args.state,
    score: args.score,
    spreadLo: args.spreadLo,
    spreadHi: args.spreadHi,
    confidence: args.confidence,
    modelCount: args.modelCount,
    models: args.models,
    requestIds: args.requestIds,
  });
}
