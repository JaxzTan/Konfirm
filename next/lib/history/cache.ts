/**
 * Per-wallet localStorage cache of verdicts this browser created.
 *
 * The chain is the record of truth — `fetchWalletVerdicts` reads it back from
 * Sui, and that is what makes history work on a device the user has never
 * signed in on before. This cache exists for two narrower reasons:
 *
 *  1. The history page can paint immediately instead of waiting on one
 *     listEvents call plus one getObject per verdict.
 *  2. A verdict whose transaction landed but hasn't been indexed yet still
 *     shows up, marked unconfirmed, rather than silently vanishing.
 *
 * Keyed by address because a browser can sign into more than one Google
 * account, and one account's history must not appear under another's.
 */

export type CachedVerdict = {
  objectId: string;
  /** Walrus blob id of the reasoning trace — the thing worth keeping. */
  traceBlob: string;
  /** Raw on-chain STATE_* value, not the display label. */
  state: number;
  /** null when the state carries no score (registry.move's NO_SCORE). */
  score: number | null;
  savedAtMs: number;
};

/** Enough for a heavy user's recent history; small enough to never approach
 *  the ~5MB localStorage budget shared with everything else on the origin. */
export const CACHE_LIMIT = 50;

const keyFor = (address: string) => `konfirm:history:${address}`;

function isCachedVerdict(value: unknown): value is CachedVerdict {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.objectId === 'string' &&
    typeof v.traceBlob === 'string' &&
    typeof v.state === 'number' &&
    (typeof v.score === 'number' || v.score === null) &&
    typeof v.savedAtMs === 'number'
  );
}

/**
 * Every access is wrapped: localStorage throws outright in a browser set to
 * block site data, and returns stale or foreign JSON if anything else on the
 * origin ever wrote this key. A cache that can't be read is not an error —
 * the page falls back to the chain, which is the real source anyway.
 */
export function readCache(address: string): CachedVerdict[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(keyFor(address));
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCachedVerdict);
  } catch {
    return [];
  }
}

export function writeCache(address: string, entries: CachedVerdict[]): void {
  try {
    localStorage.setItem(keyFor(address), JSON.stringify(entries.slice(0, CACHE_LIMIT)));
  } catch {
    // Quota exceeded or storage blocked. Dropping the cache costs a slower
    // first paint on the history page and nothing else.
  }
}

/**
 * Records one verdict as the newest entry, replacing any earlier row for the
 * same object so a re-attest of the same claim doesn't appear twice.
 */
export function rememberVerdict(address: string, entry: CachedVerdict): void {
  const existing = readCache(address).filter((e) => e.objectId !== entry.objectId);
  writeCache(address, [entry, ...existing]);
}
