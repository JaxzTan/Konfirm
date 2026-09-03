import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobUrl, canonicalize, fetchTrace, traceBytes, uploadToWalrus } from './walrus';

const PUBLISHER = 'https://publisher.example';
const AGGREGATOR = 'https://aggregator.example';

describe('canonicalize', () => {
  it('sorts keys at every depth so the same value always yields the same bytes', () => {
    const a = { b: 1, a: { d: [1, 2], c: 'x' } };
    const b = { a: { c: 'x', d: [1, 2] }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    // Insertion order alone would have produced two different strings, and so
    // two different Walrus blob IDs for one logical trace.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('preserves array order, which is meaningful', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('drops undefined values rather than emitting invalid JSON', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('round-trips through JSON.parse', () => {
    const value = { state: 'false', models: [{ name: 'Kimi', score: 25 }] };
    expect(JSON.parse(canonicalize(value))).toEqual(value);
  });
});

describe('uploadToWalrus', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ newlyCreated: { blobObject: { blobId: 'blob-1' } } }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('asks for the epoch cap, so the blob outlives the judging window', async () => {
    await uploadToWalrus(PUBLISHER, { a: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    // 53 is the verified maximum; 100 is rejected with EInvalidEpochsAhead.
    expect(url).toBe(`${PUBLISHER}/v1/blobs?epochs=53`);
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('never asks for more epochs than the publisher accepts', async () => {
    await uploadToWalrus(PUBLISHER, { a: 1 }, { epochs: 9999 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${PUBLISHER}/v1/blobs?epochs=53`);
  });

  it('reports an existing blob distinctly from a new one', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ alreadyCertified: { blobId: 'blob-1' } }), { status: 200 }),
    );
    await expect(uploadToWalrus(PUBLISHER, { a: 1 })).resolves.toMatchObject({
      blobId: 'blob-1',
      status: 'existing',
    });
  });

  it('refuses a trace over the size cap before touching the network', async () => {
    const huge = { pad: 'x'.repeat(300 * 1024) };
    await expect(uploadToWalrus(PUBLISHER, huge)).rejects.toThrow(/over the/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the publisher status and body on failure', async () => {
    fetchMock.mockResolvedValue(new Response('quota exceeded', { status: 429 }));
    await expect(uploadToWalrus(PUBLISHER, { a: 1 })).rejects.toThrow(/429.*quota exceeded/);
  });

  it('rejects a 200 that carries no blobId', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ surprise: true }), { status: 200 }));
    await expect(uploadToWalrus(PUBLISHER, { a: 1 })).rejects.toThrow(/no blobId/);
  });

  it('sends exactly the canonical bytes, as bytes', async () => {
    const value = { b: 2, a: 1 };
    await uploadToWalrus(PUBLISHER, value);
    const body = fetchMock.mock.calls[0][1].body;

    // Asserting the *type* matters as much as the content: a body that isn't
    // a byte view gets stringified by the runtime, and the publisher stores
    // that string without complaint. That failure is invisible until someone
    // reads the blob back, which is how it was found.
    expect(body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(body)).toBe(canonicalize(value));
    expect(body.byteLength).toBe(traceBytes(value).byteLength);
  });
});

describe('fetchTrace', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_WALRUS_AGGREGATOR', AGGREGATOR);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('builds a public URL a judge can open without our app', () => {
    expect(blobUrl('blob-1')).toBe(`${AGGREGATOR}/v1/blobs/blob-1`);
  });

  it('returns the parsed trace on a hit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"state":"false"}', { status: 200 })));
    await expect(fetchTrace('blob-1')).resolves.toEqual({
      ok: true,
      trace: { state: 'false' },
      url: `${AGGREGATOR}/v1/blobs/blob-1`,
    });
  });

  it('reports a deleted or expired blob as unavailable, not as a crash', async () => {
    // The public publisher owns the Blob object and marks it deletable, so
    // this is an expected state the verify page has to render (§2 B1).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(fetchTrace('blob-1')).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('treats a network failure as unavailable too', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(fetchTrace('blob-1')).resolves.toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('reports non-JSON as malformed rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>nope', { status: 200 })));
    await expect(fetchTrace('blob-1')).resolves.toMatchObject({ ok: false, reason: 'malformed' });
  });
});
