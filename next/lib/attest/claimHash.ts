import { LANG_CODES, type Locale } from "./lang";

// registry.move's claim_hash field comment: "sha256(normalize(text) ||
// lang), 32 bytes. Never the raw claim text." Computed client-side with
// Web Crypto so the raw claim text never has to make a second trip to the
// server just to be hashed — /api/attest never sees it.
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function computeClaimHash(text: string, lang: Locale): Promise<number[]> {
  const bytes = new TextEncoder().encode(normalize(text) + LANG_CODES[lang]);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest));
}
