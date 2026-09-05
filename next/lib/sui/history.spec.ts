import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CachedVerdict } from '@/lib/history/cache';

const listEvents = vi.fn();
vi.mock('./client', () => ({
  suiClient: { core: { listEvents: (input: unknown) => listEvents(input) } },
}));

const fetchOnChainVerdict = vi.fn();
vi.mock('./verdict', async () => {
  const actual = await vi.importActual<typeof import('./verdict')>('./verdict');
  return { ...actual, fetchOnChainVerdict: (id: string) => fetchOnChainVerdict(id) };
});

import { fetchWalletVerdicts, mergeHistory } from './history';

const PKG = `0x${'9c'.repeat(32)}`;
const WALLET = `0x${'33'.repeat(32)}`;

// history.ts reads the package id at call time, not module load, so stubbing
// it here is enough — no need to reorder imports around it.
vi.stubEnv('NEXT_PUBLIC_PACKAGE_ID', PKG);

function id(n: number) {
  return `0x${String(n).padStart(64, '0')}`;
}

function event(n: number, eventType = `${PKG}::registry::VerdictCreated`) {
  return { eventType, json: { verdict_id: id(n) } };
}

function onChain(n: number, over: Record<string, unknown> = {}) {
  return {
    objectId: id(n),
    traceBlob: `blob-${n}`,
    state: 0,
    score: 70,
    createdAtMs: 1_700_000_000_000 + n,
    challengeCount: 0,
    ...over,
  };
}

function cached(n: number, over: Partial<CachedVerdict> = {}): CachedVerdict {
  return { objectId: id(n), traceBlob: `blob-${n}`, state: 0, score: 70, savedAtMs: 500 + n, ...over };
}

describe('mergeHistory', () => {
  it('marks chain rows confirmed and keeps their on-chain fields', () => {
    const merged = mergeHistory([], [onChain(1) as never]);
    expect(merged).toEqual([
      {
        objectId: id(1),
        traceBlob: 'blob-1',
        state: 0,
        score: 70,
        createdAtMs: 1_700_000_000_001,
        challengeCount: 0,
        confirmed: true,
      },
    ]);
  });

  it('marks cache-only rows unconfirmed', () => {
    const merged = mergeHistory([cached(9)], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ objectId: id(9), confirmed: false, challengeCount: null });
  });

  it('lets the chain win over a stale cached copy of the same verdict', () => {
    const merged = mergeHistory([cached(1, { score: 12, traceBlob: 'stale' })], [onChain(1) as never]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ score: 70, traceBlob: 'blob-1', confirmed: true });
  });

  it('sorts newest first across both sources', () => {
    const merged = mergeHistory(
      [cached(9, { savedAtMs: 1_700_000_000_500 })],
      [onChain(1) as never, onChain(2) as never],
    );
    expect(merged.map((e) => e.objectId)).toEqual([id(9), id(2), id(1)]);
  });
});

describe('fetchWalletVerdicts', () => {
  beforeEach(() => {
    listEvents.mockReset();
    fetchOnChainVerdict.mockReset();
    fetchOnChainVerdict.mockImplementation((objectId: string) =>
      Promise.resolve(onChain(Number(objectId.replace(/^0x0*/, '') || 0))),
    );
  });

  it('returns an empty list for an address that is not a 32-byte hex string', async () => {
    expect(await fetchWalletVerdicts('0x1')).toEqual([]);
    expect(listEvents).not.toHaveBeenCalled();
  });

  it('queries newest first, filtered to this wallet as sender', async () => {
    listEvents.mockResolvedValue({ events: [event(1)], hasNextPage: false, endCursor: null });
    await fetchWalletVerdicts(WALLET);
    expect(listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { sender: WALLET }, order: 'descending' }),
    );
  });

  it('ignores events from the same wallet that are not VerdictCreated', async () => {
    listEvents.mockResolvedValue({
      events: [event(1), event(2, `${PKG}::registry::Challenged`), event(3, '0xother::x::Y')],
      hasNextPage: false,
      endCursor: null,
    });
    const result = await fetchWalletVerdicts(WALLET);
    expect(result.map((v) => v.objectId)).toEqual([id(1)]);
  });

  it('follows pages until the cap is reached', async () => {
    listEvents
      .mockResolvedValueOnce({ events: [event(1), event(2)], hasNextPage: true, endCursor: 'c1' })
      .mockResolvedValueOnce({ events: [event(3)], hasNextPage: false, endCursor: null });
    const result = await fetchWalletVerdicts(WALLET, 3);
    expect(listEvents).toHaveBeenCalledTimes(2);
    expect(listEvents.mock.calls[1][0]).toMatchObject({ before: 'c1' });
    expect(result).toHaveLength(3);
  });

  it('stops paging once the cap is filled', async () => {
    listEvents.mockResolvedValue({ events: [event(1), event(2)], hasNextPage: true, endCursor: 'c1' });
    const result = await fetchWalletVerdicts(WALLET, 2);
    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  it('skips verdicts whose object can no longer be read', async () => {
    listEvents.mockResolvedValue({ events: [event(1), event(2)], hasNextPage: false, endCursor: null });
    fetchOnChainVerdict.mockImplementation((objectId: string) =>
      Promise.resolve(objectId === id(1) ? onChain(1) : null),
    );
    const result = await fetchWalletVerdicts(WALLET);
    expect(result.map((v) => v.objectId)).toEqual([id(1)]);
  });

  it('returns an empty list when the node is unreachable', async () => {
    listEvents.mockRejectedValue(new Error('transport failed'));
    await expect(fetchWalletVerdicts(WALLET)).resolves.toEqual([]);
  });
});
