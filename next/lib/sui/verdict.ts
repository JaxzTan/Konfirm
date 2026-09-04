import { bcs } from '@mysten/sui/bcs';
import { suiClient } from './client';

/**
 * BCS layout of `konfirm::registry::Verdict`. Field order here must match the
 * struct declaration in move/sources/registry.move exactly — BCS is positional,
 * so a reordered field decodes as garbage rather than failing loudly.
 *
 * `id: UID` is a 32-byte address on the wire. `String` is Move's
 * `std::string::String`, a UTF-8 `vector<u8>`, which is what bcs.string() reads.
 *
 * We parse `content` rather than asking for `include: { json: true }` because
 * the SDK documents the json shape as varying between transports, while the
 * BCS bytes are the same everywhere.
 */
const VerdictStruct = bcs.struct('Verdict', {
  id: bcs.Address,
  claimHash: bcs.byteVector(),
  lang: bcs.u8(),
  state: bcs.u8(),
  score: bcs.u8(),
  spreadLo: bcs.u8(),
  spreadHi: bcs.u8(),
  confidence: bcs.u8(),
  modelCount: bcs.u8(),
  models: bcs.vector(bcs.string()),
  requestIds: bcs.vector(bcs.string()),
  traceBlob: bcs.string(),
  challengeCount: bcs.u64(),
  createdAtMs: bcs.u64(),
  attester: bcs.Address,
});

/** Mirrors the STATE_* constants in registry.move. */
export const STATE_VERDICT = 0;
export const STATE_DISPUTED = 1;
export const STATE_UNVERIFIABLE = 2;
export const STATE_INSUFFICIENT = 3;
/** registry.move's sentinel for "this state carries no score". */
export const NO_SCORE = 255;

export type OnChainVerdict = {
  objectId: string;
  claimHashHex: string;
  lang: number;
  state: number;
  /** null when the on-chain value is NO_SCORE. */
  score: number | null;
  spreadLo: number;
  spreadHi: number;
  confidence: number;
  modelCount: number;
  models: string[];
  requestIds: string[];
  traceBlob: string;
  challengeCount: number;
  createdAtMs: number;
  attester: string;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads one Verdict from the fullnode. Returns null when the object doesn't
 * exist, isn't a Verdict, or the node can't be reached — all of which the
 * caller renders as "no such record" rather than a crash, since this page is
 * reached from shared links and a bad id is the expected case, not an error.
 */
export async function fetchOnChainVerdict(objectId: string): Promise<OnChainVerdict | null> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(objectId)) return null;

  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  if (!packageId) return null;

  let object;
  try {
    ({ object } = await suiClient.core.getObject({ objectId, include: { content: true } }));
  } catch {
    // getObject throws on a missing object as well as on transport failure.
    return null;
  }

  // Guard the type before decoding: any object id at all can be pasted into
  // this route, and BCS would happily misparse an unrelated struct's bytes.
  if (object.type !== `${packageId}::registry::Verdict`) return null;

  const v = VerdictStruct.parse(object.content);

  return {
    objectId: object.objectId,
    claimHashHex: toHex(v.claimHash),
    lang: v.lang,
    state: v.state,
    score: v.score === NO_SCORE ? null : v.score,
    spreadLo: v.spreadLo,
    spreadHi: v.spreadHi,
    confidence: v.confidence,
    modelCount: v.modelCount,
    models: v.models,
    requestIds: v.requestIds,
    traceBlob: v.traceBlob,
    challengeCount: Number(v.challengeCount),
    createdAtMs: Number(v.createdAtMs),
    attester: v.attester,
  };
}

/**
 * The PII-redacted reasoning trace /api/attest archived to Walrus: the full
 * /api/verdict result, so descriptions, key signals and per-model reasoning.
 * None of that is on-chain — the chain holds the summary and this blob id.
 *
 * Returns null on any failure. Walrus testnet being flaky is anticipated
 * (TRD risk R-2), and a verdict without its trace is still a valid public
 * record, so the page degrades to the on-chain fields instead of failing.
 */
export async function fetchTrace(blobId: string): Promise<Record<string, unknown> | null> {
  const aggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR;
  if (!aggregator || !blobId) return null;

  try {
    const response = await fetch(`${aggregator}/v1/blobs/${blobId}`, {
      // The blob is immutable once written, so it can be cached hard. Without
      // this the page refetches it on every view of the same shared link.
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
