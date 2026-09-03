// TR-10: strip PII from reasoning text before it leaves the server for
// Walrus (public, permanent-ish storage — see docs/plan_v1.md §2 B1). A
// model's reasoning can quote the original claim text verbatim, and that
// claim may contain a phone number, IC or email.
//
// Patterns are ordered most-specific first: IC before phones, because a
// Malaysian IC is twelve digits with dashes and a loose phone pattern would
// otherwise take a bite out of it.
const MY_IC = /\b\d{6}-\d{2}-\d{4}\b/g;
/** International form, with or without separators: +60 12-345 6789, 60123456789. */
const MY_PHONE_INTL = /\+?60[\s-]?1\d[\s-]?\d{3,4}[\s-]?\d{4}/g;
/** Local form, which is how people actually paste them: 012-345 6789. */
const MY_PHONE_LOCAL = /\b01\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** WhatsApp deep links embed the sender's number in the path. */
const WA_LINK = /https?:\/\/wa\.me\/\S+/g;

export function redactPii(text: string): string {
  return text
    .replace(WA_LINK, "[redacted-link]")
    .replace(EMAIL, "[redacted-email]")
    .replace(MY_IC, "[redacted-ic]")
    .replace(MY_PHONE_INTL, "[redacted-phone]")
    .replace(MY_PHONE_LOCAL, "[redacted-phone]");
}

// Walks an arbitrary JSON-like value and redacts every string leaf, so the
// full /api/verdict result can be archived to Walrus as the reasoning trace
// without hand-listing every field of every verdict state's shape.
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") {
    return redactPii(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(redactDeep) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v)]),
    ) as T;
  }
  return value;
}
