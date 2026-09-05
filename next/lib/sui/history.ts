import type { CachedVerdict } from '@/lib/history/cache';
import { suiClient } from './client';
import { fetchOnChainVerdict, type OnChainVerdict } from './verdict';

/**
 * One row of a wallet's verdict history.
 *
 * `confirmed` is the difference between the two sources: true means this row
 * was read back from Sui, false means it exists only in this browser's cache
 * because the chain hasn't been queried yet or hasn't indexed it. The page
 * renders unconfirmed rows differently rather than hiding them — a verdict
 * whose transaction landed seconds ago is real, just not yet visible to a
 * fullnode query.
 */
export type HistoryEntry = {
  objectId: string;
  traceBlob: string;
  state: number;
  score: number | null;
  createdAtMs: number;
  /** null on an unconfirmed row: challenges are only knowable from the chain. */
  challengeCount: number | null;
  confirmed: boolean;
};

/** How many verdicts back the history page looks. Each one past the event
 *  query costs its own getObject, so this is a real cost, not a display cap. */
export const HISTORY_LIMIT = 30;

/** gRPC caps a page at 50 regardless of what we ask for. */
const PAGE_SIZE = 50;

/**
 * Verdicts are *shared* objects (registry.move calls `transfer::share_object`),
 * so they are owned by nobody and `listOwnedObjects` will never return them.
 * The only link back to the wallet is that it sent the transaction which
 * emitted `VerdictCreated`, which is why this goes through the event index.
 *
 * The filter can carry exactly one predicate — `assertSinglePredicate` in the
 * SDK rejects sender+eventType together — so it filters by sender at the node
 * and narrows to VerdictCreated here.
 */
export async function fetchWalletVerdicts(
  address: string,
  limit = HISTORY_LIMIT,
): Promise<OnChainVerdict[]> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(address)) return [];

  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  if (!packageId) return [];

  const wanted = `${packageId}::registry::VerdictCreated`;
  const objectIds: string[] = [];
  let cursor: string | null = null;

  try {
    while (objectIds.length < limit) {
      const page = await suiClient.core.listEvents({
        filter: { sender: address },
        limit: PAGE_SIZE,
        order: 'descending',
        ...(cursor ? { before: cursor } : {}),
      });

      for (const event of page.events) {
        if (event.eventType !== wanted) continue;
        const verdictId = (event.json as { verdict_id?: string } | undefined)?.verdict_id;
        if (verdictId) objectIds.push(verdictId);
        if (objectIds.length >= limit) break;
      }

      if (!page.hasNextPage || !page.endCursor || objectIds.length >= limit) break;
      cursor = page.endCursor;
    }
  } catch {
    // Same contract as fetchOnChainVerdict: an unreachable node degrades to
    // "nothing to show" and the page falls back to its cache, rather than
    // throwing into a client component with no error boundary of its own.
    return [];
  }

  const verdicts = await Promise.all(objectIds.map((objectId) => fetchOnChainVerdict(objectId)));
  // A verdict can be missing if the object was deleted or the node lost it
  // mid-page; the event proves it once existed, not that it still resolves.
  return verdicts.filter((v): v is OnChainVerdict => v !== null);
}

/**
 * Combines the browser's cache with what the chain returned, chain first.
 *
 * The chain is authoritative on every field it carries — a cached score can
 * be stale if the same claim was re-attested, and only the chain knows the
 * challenge count.
 */
export function mergeHistory(
  cached: CachedVerdict[],
  chain: OnChainVerdict[],
): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();

  for (const entry of cached) {
    byId.set(entry.objectId, {
      objectId: entry.objectId,
      traceBlob: entry.traceBlob,
      state: entry.state,
      score: entry.score,
      createdAtMs: entry.savedAtMs,
      challengeCount: null,
      confirmed: false,
    });
  }

  for (const v of chain) {
    byId.set(v.objectId, {
      objectId: v.objectId,
      traceBlob: v.traceBlob,
      state: v.state,
      score: v.score,
      createdAtMs: v.createdAtMs,
      challengeCount: v.challengeCount,
      confirmed: true,
    });
  }

  return [...byId.values()].sort((a, b) => b.createdAtMs - a.createdAtMs);
}
