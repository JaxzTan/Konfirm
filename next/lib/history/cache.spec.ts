import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CACHE_LIMIT, readCache, rememberVerdict, writeCache, type CachedVerdict } from './cache';

const A = `0x${'aa'.repeat(32)}`;
const B = `0x${'bb'.repeat(32)}`;

function entry(n: number): CachedVerdict {
  return {
    objectId: `0x${String(n).padStart(64, '0')}`,
    traceBlob: `blob-${n}`,
    state: 0,
    score: 80,
    savedAtMs: 1_000 + n,
  };
}

describe('history cache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips entries for one address', () => {
    writeCache(A, [entry(1), entry(2)]);
    expect(readCache(A)).toEqual([entry(1), entry(2)]);
  });

  it('keeps addresses isolated from each other', () => {
    writeCache(A, [entry(1)]);
    writeCache(B, [entry(2)]);
    expect(readCache(A)).toEqual([entry(1)]);
    expect(readCache(B)).toEqual([entry(2)]);
  });

  it('returns an empty list for an address that has nothing stored', () => {
    expect(readCache(A)).toEqual([]);
  });

  it('returns an empty list rather than throwing when the stored value is corrupt', () => {
    localStorage.setItem(`konfirm:history:${A}`, '{not json');
    expect(readCache(A)).toEqual([]);
  });

  it('drops stored rows that are missing required fields', () => {
    localStorage.setItem(
      `konfirm:history:${A}`,
      JSON.stringify([entry(1), { objectId: '0xabc' }, null, 'nope']),
    );
    expect(readCache(A)).toEqual([entry(1)]);
  });

  it('swallows a write that exceeds the storage quota', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => writeCache(A, [entry(1)])).not.toThrow();
  });

  it('returns an empty list when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readCache(A)).toEqual([]);
  });

  describe('rememberVerdict', () => {
    it('puts the newest entry first', () => {
      rememberVerdict(A, entry(1));
      rememberVerdict(A, entry(2));
      expect(readCache(A).map((e) => e.objectId)).toEqual([entry(2).objectId, entry(1).objectId]);
    });

    it('replaces an existing entry with the same objectId instead of duplicating it', () => {
      rememberVerdict(A, entry(1));
      rememberVerdict(A, { ...entry(1), traceBlob: 'newer' });
      const stored = readCache(A);
      expect(stored).toHaveLength(1);
      expect(stored[0].traceBlob).toBe('newer');
    });

    it(`keeps at most ${CACHE_LIMIT} entries, discarding the oldest`, () => {
      for (let n = 1; n <= CACHE_LIMIT + 5; n++) rememberVerdict(A, entry(n));
      const stored = readCache(A);
      expect(stored).toHaveLength(CACHE_LIMIT);
      expect(stored[0].objectId).toBe(entry(CACHE_LIMIT + 5).objectId);
      expect(stored.at(-1)!.objectId).toBe(entry(6).objectId);
    });
  });
});
