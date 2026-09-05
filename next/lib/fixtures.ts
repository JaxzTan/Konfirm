import type { ModelResult, Tone } from "@/app/components/ui";
import type { Locale } from "@/lib/locale";

export const VERDICT_STATES = [
  "false",
  "likely_false",
  "partially_true",
  "likely_true",
  "true",
  "disputed",
  "unverifiable",
  "insufficient",
] as const;

/** The 5 states that carry a real score, in the same order as aggregate.ts's
 *  own buckets (finalTrustScore < 12.5/37.5/62.5/87.5) — kept together so a
 *  raw score can be bucketed the same way everywhere it needs to (see
 *  bucketStateFromScore()). */
const SCORED_STATES = ["false", "likely_false", "partially_true", "likely_true", "true"] as const;

/** Mirrors aggregate.ts's own bucket boundaries — used wherever a raw 0-100
 *  score needs to become one of the 5 scored states, without re-deriving a
 *  binary true/false and losing the distinction the backend already makes. */
export function bucketStateFromScore(score: number): (typeof SCORED_STATES)[number] {
  if (score < 12.5) return "false";
  if (score < 37.5) return "likely_false";
  if (score < 62.5) return "partially_true";
  if (score < 87.5) return "likely_true";
  return "true";
}

export type VerdictState = (typeof VERDICT_STATES)[number];

export type Verdict = {
  state: VerdictState;
  /**
   * The locale `title`, `description`, `signals` and the per-model reasoning
   * were generated in. The API writes them via the LLM in the language that
   * was active when the check ran, so switching language afterwards cannot
   * retranslate them — see localizeVerdict().
   */
  locale: Locale;
  score: number | null;
  tone: Tone;
  title: string;
  description: string;
  signals: string[];
  models: ModelResult[];
  modelCount: number;
  positions?: Position[];
};

export type Position = {
  stance: "t" | "f";
  label: string;
  models: string;
  reasoning: string;
};

/** `?v=` is user input; anything unrecognised falls back to the false variant. */
export function resolveVerdictState(value: string | undefined): VerdictState {
  return (VERDICT_STATES as readonly string[]).includes(value ?? "")
    ? (value as VerdictState)
    : "false";
}

type T = { (key: string): string; raw(key: string): unknown };

/** Shape returned by `/api/verdict`. Kept loose since it is translated field-by-field below. */
type ApiVerdict = {
  state: string;
  score?: number;
  verdict?: string;
  description?: string;
  flags?: string[];
  models?: { name: string; score: number; reasoning: string[]; requestId: string }[];
  modelCount?: number;
  positions?: { stance: string; models: string[]; reasoning: string }[];
  respondedModel?: { name: string; score: number; reasoning: string[]; requestId: string };
};

/** True-leaning half of the 5 scored states — everything else (including
 *  partially_true, the genuinely ambiguous middle) reads as the "f" tone. */
const TRUE_LEANING = new Set<VerdictState>(["true", "likely_true"]);

/** Per-state copy that exists in every locale — the fallback when the LLM's own wording cannot be used. */
export const TITLE_KEY: Record<VerdictState, string> = {
  true: "verdictTrue",
  likely_true: "verdictLikelyTrue",
  partially_true: "verdictPartiallyTrue",
  likely_false: "verdictLikelyFalse",
  false: "verdictFalse",
  disputed: "verdictDisputed",
  unverifiable: "verdictUnverifiable",
  insufficient: "verdictInsufficient",
};

export const DESC_KEY: Record<VerdictState, string> = {
  true: "descTrue",
  likely_true: "descLikelyTrue",
  partially_true: "descPartiallyTrue",
  likely_false: "descLikelyFalse",
  false: "descFalse",
  disputed: "descDisputed",
  unverifiable: "descUnverifiable",
  insufficient: "descInsufficient",
};

/**
 * Fold a real `/api/verdict` response into the same shape the fixtures use,
 * so the result panel has exactly one rendering path. The API is the source
 * of truth for content; `t` only supplies the stance labels, which are UI
 * chrome rather than model output.
 */
export function verdictFromApi(api: ApiVerdict, t: T, locale: Locale): Verdict {
  const state = resolveVerdictState(api.state);
  const tone: Tone = TRUE_LEANING.has(state) ? "t" : "f";
  const title = api.verdict ?? t(TITLE_KEY[state]);

  const responded = api.respondedModel;

  return {
    state,
    locale,
    score: api.score ?? null,
    tone,
    title,
    description: api.description ?? t(DESC_KEY[state]),
    signals: api.flags ?? [],
    models: (api.models ?? (responded ? [responded] : [])).map((m) => ({
      name: m.name,
      score: `${m.score}%`,
      reasoning: m.reasoning,
      requestId: m.requestId,
    })),
    modelCount: api.modelCount ?? api.models?.length ?? (responded ? 1 : 0),
    positions: api.positions?.map((p) => {
      const isTrue = /true|benar|真/i.test(p.stance);
      return {
        stance: isTrue ? ("t" as const) : ("f" as const),
        label: t(isTrue ? "sideTrue" : "sideFalse"),
        models: p.models.join(" · "),
        reasoning: p.reasoning,
      };
    }),
  };
}

/**
 * Reconcile a verdict with the locale the UI is *currently* in.
 *
 * The header copy comes back from /api/verdict as LLM prose written in the
 * check-time locale. Switching language on a result screen re-renders every
 * t() string but cannot retranslate that prose, which left the card mixing two
 * languages. When the two disagree we drop the LLM wording for the per-state
 * strings, which are translated for all three locales.
 *
 * `signals` and the per-model reasoning are LLM prose too and have no
 * translated equivalent, so they are dropped rather than shown in the wrong
 * language.
 */
export function localizeVerdict(verdict: Verdict, locale: Locale, t: T): Verdict {
  if (verdict.locale === locale) return verdict;
  return {
    ...verdict,
    locale,
    title: t(TITLE_KEY[verdict.state]),
    description: t(DESC_KEY[verdict.state]),
    signals: [],
    models: verdict.models.map((m) => ({ ...m, reasoning: [] })),
    positions: undefined,
  };
}
