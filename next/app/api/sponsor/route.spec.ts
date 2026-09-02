import { describe, expect, it, vi, beforeEach } from 'vitest';

// lib/enoki/sponsor imports lib/sui/client, which opens a gRPC client at
// module load — mocked out so these stay pure input-validation tests.
const createSponsoredTransaction = vi.fn();
vi.mock('@/lib/enoki/sponsor', () => ({
  createSponsoredTransaction: (input: unknown) => createSponsoredTransaction(input),
}));

import { POST } from './route';

const SENDER = `0x${'ab'.repeat(32)}`;

function request(body: unknown, ip: string) {
  return new Request('http://localhost/api/sponsor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

describe('POST /api/sponsor', () => {
  beforeEach(() => {
    createSponsoredTransaction.mockReset();
    createSponsoredTransaction.mockResolvedValue({ bytes: 'AAAA', digest: 'abc' });
  });

  it('rejects a sender that is not a 32-byte hex address', async () => {
    const response = await POST(request({ sender: '0x1', transactionKindBytes: 'AAAA' }, '1.1.1.1'));
    expect(response.status).toBe(400);
    expect(createSponsoredTransaction).not.toHaveBeenCalled();
  });

  it('rejects transaction bytes that are not base64', async () => {
    const response = await POST(request({ sender: SENDER, transactionKindBytes: 'not base64!' }, '2.2.2.2'));
    expect(response.status).toBe(400);
    expect(createSponsoredTransaction).not.toHaveBeenCalled();
  });

  it('returns the sponsored bytes and digest for a valid request', async () => {
    const response = await POST(request({ sender: SENDER, transactionKindBytes: 'AAAA' }, '3.3.3.3'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bytes: 'AAAA', digest: 'abc' });
  });

  it('rate-limits a single IP to 3 sponsorships per window', async () => {
    for (let i = 0; i < 3; i++) {
      const ok = await POST(request({ sender: SENDER, transactionKindBytes: 'AAAA' }, '4.4.4.4'));
      expect(ok.status).toBe(200);
    }
    const limited = await POST(request({ sender: SENDER, transactionKindBytes: 'AAAA' }, '4.4.4.4'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
  });

  it('surfaces an Enoki allowlist rejection as a 502 with its message', async () => {
    createSponsoredTransaction.mockRejectedValue(new Error('Move call target is not allowed'));
    const response = await POST(request({ sender: SENDER, transactionKindBytes: 'AAAA' }, '5.5.5.5'));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Move call target is not allowed' });
  });
});
