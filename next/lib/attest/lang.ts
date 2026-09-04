// registry.move's `lang` field doc: "0 = en, 1 = ms, 2 = zh" (TRD §4.1
// enum). The UI's locale key is "bm" (Bahasa Malaysia) for the same
// language the contract calls "ms" — one mapping, defined once, so the two
// naming conventions never have to be reconciled anywhere else.
export const LANG_CODES = { en: 0, bm: 1, zh: 2 } as const;

export type Locale = keyof typeof LANG_CODES;
