import { NextRequest, NextResponse } from "next/server";
import { executeSponsoredTransaction } from "@/lib/enoki/sponsor";

/**
 * Step 2 of the sponsored flow: hand Enoki the user's signature so it can
 * co-sign as gas owner and submit.
 *
 * No rate limit here on purpose — a caller can only reach this with a digest
 * that /api/sponsor already issued (and rate-limited), and refusing a signed
 * transaction after gas has been reserved would strand it.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const { digest, signature } = (body ?? {}) as { digest?: unknown; signature?: unknown };

  if (typeof digest !== "string" || !digest) {
    return NextResponse.json({ error: "Missing digest." }, { status: 400 });
  }
  if (typeof signature !== "string" || !signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  try {
    return NextResponse.json(await executeSponsoredTransaction({ digest, signature }));
  } catch (error) {
    console.error("Enoki sponsored execute failed:", error);
    const message = error instanceof Error ? error.message : "Execution failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
