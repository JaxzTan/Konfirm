/**
 * The public origin this deployment is reachable at — what share links, QR
 * text and Open Graph image URLs must point to.
 *
 * Precedence, highest first:
 *   1. NGROK_DOMAIN — the tunnel is by definition the only address a phone
 *      outside this laptop's network can open, so while it is set it wins.
 *      Plain (not NEXT_PUBLIC_) on purpose: it is read at runtime from
 *      next/.env, so a new tunnel domain needs a container restart, not a
 *      rebuild. Server-only code — never import this from a client component.
 *   2. NEXT_PUBLIC_SITE_URL — inlined at build time (docker-compose build
 *      args), the real domain in production.
 *   3. https://konfirm.my.
 *
 * `||` not `??` throughout: an unset var reads as "" here, not undefined,
 * which `??` would let through and produce a domain-less URL.
 */
export function siteOrigin(): string {
  const domain = process.env.NGROK_DOMAIN;
  if (domain) return `https://${domain.replace(/^https?:\/\//, "")}`;
  return process.env.NEXT_PUBLIC_SITE_URL || "https://konfirm.my";
}

/** Same origin with the scheme stripped — what the cards print as text. */
export function siteHost(): string {
  return siteOrigin().replace(/^https?:\/\//, "");
}
