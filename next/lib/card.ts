import { fetchOnChainVerdict, fetchTrace, STATE_VERDICT } from '@/lib/sui/verdict';

export type Card = {
  objectId: string;
  /** "unclear" covers disputed/unverifiable/insufficient alike — this card
   *  has no room for that nuance, but it must not claim "false" when the
   *  models never actually reached a verdict. "view full result" is what
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
  const state: Card['state'] =
    traceState === 'true' || traceState === 'false'
      ? traceState
      : onChain.state === STATE_VERDICT && onChain.score !== null
        ? onChain.score >= 50
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
