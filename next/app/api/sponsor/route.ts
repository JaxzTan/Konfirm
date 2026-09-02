import { NextRequest, NextResponse } from "next/server";
import { createSponsoredTransaction } from "@/lib/enoki/sponsor";
import { rateLimit } from "@/lib/rateLimit";

// Same 3 req/min/IP as /api/attest, and for the same reason: every call here
// reserves gas from the sponsor's pool (TR-13, NFR-2).
const LIMIT = 3;
const WINDOW_MS = 60_000;

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Step 1 of the sponsored flow: turn a transaction kind into sponsored bytes.
 *
 * The private Enoki key never leaves the server, which is the whole reason
 * this route exists (see lib/enoki/sponsor.ts for why the wallet can't do it).
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = rateLimit(`sponsor:${ip}`, LIMIT, WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many transactions, try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }

  const body = await request.json().catch(() => null);
  const sender = typeof body?.sender === "string" ? body.sender.toLowerCase() : null;
  const transactionKindBytes = body?.transactionKindBytes;

  if (!sender || !SUI_ADDRESS.test(sender)) {
    return NextResponse.json({ error: "Missing or invalid sender." }, { status: 400 });
  }
  if (typeof transactionKindBytes !== "string" || !BASE64.test(transactionKindBytes)) {
    return NextResponse.json({ error: "Missing or invalid transactionKindBytes." }, { status: 400 });
  }

  try {
    const { bytes, digest } = await createSponsoredTransaction({ sender, transactionKindBytes });
    return NextResponse.json({ bytes, digest });
  } catch (error) {
    // Enoki rejects anything outside the Portal allowlist here. Surfacing the
    // message verbatim is what turns "the button does nothing" into "target
    // 0x…::registry::create_verdict is not allowed" during a demo rehearsal.
    console.error("Enoki sponsor failed:", error);
    const message = error instanceof Error ? error.message : "Sponsorship failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
