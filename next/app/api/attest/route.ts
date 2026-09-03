// app/api/attest/route.ts
// Order matters: scrub → hash → Walrus → build tx with blobId + hash → sign → execute.
// If the tx fails after upload you get an orphan blob. Acceptable; never the reverse.
import { NextResponse } from "next/server";
import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromHex } from "@mysten/sui/utils";
import { prisma } from "@/lib/prisma";
import { uploadTrace, scrubString } from "@/lib/walrus";

const PKG = process.env.NEXT_PUBLIC_PACKAGE_ID!;
const ATTESTER_CAP = process.env.ATTESTER_CAP_ID!;
const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const attester = Ed25519Keypair.fromSecretKey(process.env.ATTESTER_PRIVATE_KEY!);

export async function POST(req: Request) {
  const { draftId, submittedBy } = (await req.json()) as {
    draftId: string;
    submittedBy: string; // zkLogin address from useKonfirmIdentity(); mock addr if hook not delivered
  };

  // 1. Load the cached verdict — never recompute, LLM output is non-deterministic
  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  if (draft.state !== "verdict" && draft.state !== "disputed") {
    return NextResponse.json({ error: "state not attestable" }, { status: 400 });
  }

  // 2. Walrus: scrub → canonical bytes → sha256 → PUT
  const trace = {
    v: 1,
    claimHash: draft.claimHash,
    lang: draft.lang,
    state: draft.state,
    score: draft.score,
    spread: draft.spread,
    confidence: draft.confidence,
    redFlags: draft.redFlags,
    models: draft.models, // includes gnk_ request IDs + per-model reasoning
    computedAt: draft.createdAt.toISOString(),
  };
  const blob = await uploadTrace(trace);

  // 3. On-chain claim_text is permanent — scrub it with the same rules
  const claimText = scrubString(draft.claimText).slice(0, 2000);

  // 4. Build + sign + execute
  const tx = new Transaction();
  tx.moveCall({
    target: `${PKG}::verdict::submit_verdict`,
    arguments: [
      tx.object(ATTESTER_CAP),
      tx.pure.vector("u8", fromHex(draft.claimHash)),
      tx.pure.string(claimText),
      tx.pure.u8(draft.score ?? 0),
      tx.pure.string(draft.state),
      tx.pure.string(blob.blobId),
      tx.pure.vector("u8", fromHex(blob.traceHash)),
      tx.pure.address(submittedBy),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: attester,
    transaction: tx,
    options: { showObjectChanges: true },
  });

  const verdict = result.objectChanges?.find(
    (c) => c.type === "created" && c.objectType.endsWith("::verdict::Verdict"),
  );
  if (!verdict || verdict.type !== "created") {
    return NextResponse.json({ error: "verdict object not found", digest: result.digest }, { status: 500 });
  }

  // 5. Index off-chain
  await prisma.verdict.create({
    data: {
      objectId: verdict.objectId,
      draftId,
      claimHash: draft.claimHash,
      blobId: blob.blobId,
      traceHash: blob.traceHash,
      submittedBy,
      digest: result.digest,
    },
  });

  return NextResponse.json({
    objectId: verdict.objectId,
    blobId: blob.blobId,
    traceHash: blob.traceHash,
    walrusStatus: blob.status,
    digest: result.digest,
  });
}
