import { fetchOnChainVerdict, fetchTrace, STATE_VERDICT } from '@/lib/sui/verdict';
import { bucketStateFromScore, SCORED_STATES, VERDICT_STATES, type VerdictState } from '@/lib/fixtures';

/** True-leaning half of the 5 scored states — mirrors fixtures.ts's own set. */
const TRUE_LEANING = new Set<VerdictState>(['true', 'likely_true']);

export type Card = {
  objectId: string;
  /** "unclear" covers disputed/unverifiable/insufficient — the states with
   *  no real score at all. A scored bucket always becomes "true" or "false"
   *  here (partially_true and likely_false both read as "false"), same
   *  binary the rest of the app already uses for this — this card just has
   *  no room to show the finer 5-bucket label. "view full result" is what
   *  /v/[objectId]'s real state breakdown is for. */
  state: 'true' | 'false' | 'unclear';
  modelCount: number;
  /** Real per-verdict description from the Walrus trace, or null when the
   *  trace is unreadable — falls back to the generic string-table copy. */
  description: string | null;
  /** The message that was checked, from the same trace. Empty when the blob
   *  is unreadable, or when the record predates claims being archived. */
  claim: string;
};

/**
 * Reads the real on-chain Verdict — same source /v/[objectId] uses.
 *
 * Lives here rather than in the page because two renderers consume it: the
 * HTML card at /card/[objectId] and the PNG at /api/card/[objectId]. They
 * have to agree on what the card says, and the surest way to guarantee that
 * is to give them one function rather than two copies that drift.
 */
export async function getCard(objectId: string): Promise<Card | null> {
  const onChain = await fetchOnChainVerdict(objectId);
  if (!onChain) return null;

  const trace = await fetchTrace(onChain.traceBlob);
  const traceState = trace?.state;
  const resolved: VerdictState | null =
    typeof traceState === 'string' && (VERDICT_STATES as readonly string[]).includes(traceState)
      ? (traceState as VerdictState)
      : onChain.state === STATE_VERDICT && onChain.score !== null
        ? bucketStateFromScore(onChain.score)
        : null;

  // "unclear" for anything that isn't one of the 5 *scored* buckets — not
  // just null. "unverifiable"/"disputed"/"insufficient" are real, non-null
  // VerdictState values, so a plain `resolved === null` check here would
  // silently drop them into the true/false binary below (a CANNOT_BE_VERIFIED
  // claim would read as "false" instead of "unclear" — genuinely wrong, not
  // just less specific).
  const state: Card['state'] =
    resolved !== null && (SCORED_STATES as readonly string[]).includes(resolved)
      ? TRUE_LEANING.has(resolved)
        ? 'true'
        : 'false'
      : 'unclear';

  return {
    objectId: onChain.objectId,
    state,
    modelCount: onChain.modelCount,
    description: typeof trace?.description === 'string' ? trace.description : null,
    claim: typeof trace?.claim === 'string' ? trace.claim : '',
  };
}
