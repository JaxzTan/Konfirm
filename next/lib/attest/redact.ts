// TR-10: strip PII from reasoning text before it leaves the server for
// Walrus (public, permanent storage). A model's reasoning can quote the
// original claim text verbatim, and that claim may contain a phone/IC/email.
const MY_PHONE = /\+?60\d{8,9}/g;
const MY_IC = /\d{6}-\d{2}-\d{4}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

export function redactPii(text: string): string {
  return text.replace(MY_PHONE, "[redacted-phone]").replace(MY_IC, "[redacted-ic]").replace(EMAIL, "[redacted-email]");
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
