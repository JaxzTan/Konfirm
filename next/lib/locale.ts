import enMessages from "@/messages/en.json";
import bmMessages from "@/messages/bm.json";
import zhMessages from "@/messages/zh.json";

export const LOCALES = ["en", "bm", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const messagesByLocale = { en: enMessages, bm: bmMessages, zh: zhMessages };

export const TIME_ZONE = "Asia/Kuala_Lumpur";

/** `?lang=` is user input; anything unrecognised falls back to English. */
export function resolveLocale(value: string | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : "en";
}

/**
 * Fraunces has no CJK glyphs, so zh headings would fall back to whatever the
 * OS picks. Every heading therefore switches face by locale rather than
 * inheriting one serif for all three. (Handoff: known gap #2.)
 */
export function headingFont(locale: Locale): string {
  return locale === "zh"
    ? "font-[family-name:var(--font-noto-serif-sc)] font-bold tracking-normal"
    : "font-serif font-semibold tracking-[-0.02em]";
}
