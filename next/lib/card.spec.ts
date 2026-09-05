import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchOnChainVerdict = vi.fn();
const fetchTrace = vi.fn();
vi.mock('./sui/verdict', async () => {
  const actual = await vi.importActual<typeof import('./sui/verdict')>('./sui/verdict');
  return {
    ...actual,
    fetchOnChainVerdict: (id: string) => fetchOnChainVerdict(id),
    fetchTrace: (blob: string) => fetchTrace(blob),
  };
});

import { getCard } from './card';
import { STATE_VERDICT, STATE_DISPUTED, STATE_INSUFFICIENT } from './sui/verdict';

const OBJECT_ID = `0x${'ab'.repeat(32)}`;

function onChain(over: Record<string, unknown> = {}) {
  return {
    objectId: OBJECT_ID,
    traceBlob: 'blob-1',
    state: STATE_VERDICT,
    score: 80,
    modelCount: 3,
    ...over,
  };
}

describe('getCard', () => {
  beforeEach(() => {
    fetchOnChainVerdict.mockReset();
    fetchTrace.mockReset();
    fetchTrace.mockResolvedValue(null);
  });

  it('returns null when the object is not a readable Verdict', async () => {
    fetchOnChainVerdict.mockResolvedValue(null);
    expect(await getCard(OBJECT_ID)).toBeNull();
    expect(fetchTrace).not.toHaveBeenCalled();
  });

  it('prefers the trace state over the score threshold', async () => {
    fetchOnChainVerdict.mockResolvedValue(onChain({ score: 80 }));
    fetchTrace.mockResolvedValue({ state: 'false' });
    expect((await getCard(OBJECT_ID))!.state).toBe('false');
  });

  it('falls back to score >= 50 when the trace has no usable state', async () => {
    fetchOnChainVerdict.mockResolvedValue(onChain({ score: 80 }));
    expect((await getCard(OBJECT_ID))!.state).toBe('true');

    fetchOnChainVerdict.mockResolvedValue(onChain({ score: 20 }));
    expect((await getCard(OBJECT_ID))!.state).toBe('false');
  });

  it('reports "unclear" for states that never reached a verdict', async () => {
    for (const state of [STATE_DISPUTED, STATE_INSUFFICIENT]) {
      fetchOnChainVerdict.mockResolvedValue(onChain({ state, score: null }));
      expect((await getCard(OBJECT_ID))!.state).toBe('unclear');
    }
  });

  it('reports "unclear" rather than "false" when a verdict carries no score', async () => {
    fetchOnChainVerdict.mockResolvedValue(onChain({ state: STATE_VERDICT, score: null }));
    expect((await getCard(OBJECT_ID))!.state).toBe('unclear');
  });

  it('carries the claim and description through from the trace', async () => {
    fetchOnChainVerdict.mockResolvedValue(onChain());
    fetchTrace.mockResolvedValue({ claim: 'Free rice for all', description: 'No source found.' });
    const card = await getCard(OBJECT_ID);
    expect(card).toMatchObject({ claim: 'Free rice for all', description: 'No source found.' });
  });

  it('degrades to empty strings when the Walrus trace is unreadable', async () => {
    fetchOnChainVerdict.mockResolvedValue(onChain());
    const card = await getCard(OBJECT_ID);
    expect(card).toMatchObject({ claim: '', description: null, modelCount: 3 });
  });

  it('ignores trace fields that are not strings', async () => {
    fetchOnChainVerdict.mockResolvedValue(onChain());
    fetchTrace.mockResolvedValue({ claim: { nope: 1 }, description: 42 });
    expect(await getCard(OBJECT_ID)).toMatchObject({ claim: '', description: null });
  });
});
