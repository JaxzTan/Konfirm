import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadToWalrus, MAX_EPOCHS } from './walrus';

const PUBLISHER = 'https://publisher.example';

function ok(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

/** The shape the publisher returns the first time these bytes are stored. */
const newlyCreated = { newlyCreated: { blobObject: { blobId: 'BLOB_NEW' } } };

describe('uploadToWalrus', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(ok(newlyCreated));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const urlOf = () => new URL(fetchMock.mock.calls[0][0] as string);

  it('stores for the number of epochs WALRUS_EPOCHS asks for', async () => {
    vi.stubEnv('WALRUS_EPOCHS', '30');
    await uploadToWalrus(PUBLISHER, { a: 1 });
    expect(urlOf().searchParams.get('epochs')).toBe('30');
  });

  it('stores for the maximum when WALRUS_EPOCHS is unset', async () => {
    vi.stubEnv('WALRUS_EPOCHS', '');
    await uploadToWalrus(PUBLISHER, { a: 1 });
    expect(urlOf().searchParams.get('epochs')).toBe(String(MAX_EPOCHS));
  });

  it.each(['nonsense', '0', '-5', '999'])(
    'falls back to the maximum rather than sending %s epochs',
    async (value) => {
      vi.stubEnv('WALRUS_EPOCHS', value);
      await uploadToWalrus(PUBLISHER, { a: 1 });
      expect(urlOf().searchParams.get('epochs')).toBe(String(MAX_EPOCHS));
    },
  );

  it('asks for a permanent blob, so the trace cannot be deleted out from under the chain record', async () => {
    await uploadToWalrus(PUBLISHER, { a: 1 });
    expect(urlOf().searchParams.get('permanent')).toBe('true');
  });

  it('PUTs the JSON body to /v1/blobs', async () => {
    await uploadToWalrus(PUBLISHER, { hello: 'world' });
    expect(urlOf().pathname).toBe('/v1/blobs');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ hello: 'world' }),
    });
  });

  it('returns the blobId of a newly created blob', async () => {
    await expect(uploadToWalrus(PUBLISHER, {})).resolves.toBe('BLOB_NEW');
  });

  it('returns the blobId when the same bytes were already certified', async () => {
    fetchMock.mockResolvedValue(ok({ alreadyCertified: { blobId: 'BLOB_OLD' } }));
    await expect(uploadToWalrus(PUBLISHER, {})).resolves.toBe('BLOB_OLD');
  });

  it('throws when the publisher rejects the upload', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as Response);
    await expect(uploadToWalrus(PUBLISHER, {})).rejects.toThrow(/500/);
  });

  it('throws when the response carries no blobId', async () => {
    fetchMock.mockResolvedValue(ok({ unexpected: true }));
    await expect(uploadToWalrus(PUBLISHER, {})).rejects.toThrow(/no blobId/);
  });
});
