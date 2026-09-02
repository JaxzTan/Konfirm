// In-memory fixed-window limiter. Good enough for a single-instance/local
// deploy (TR-13's actual target); on Vercel's serverless functions each cold
// start gets its own empty Map, so this is not a real cross-instance limit
// in production — a real deploy needs Vercel KV or similar. Not building
// that here since NEXT_PUBLIC_SUI_NETWORK is testnet and the sponsor's
// balance is the real backstop in the meantime.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { ok: true };
}
