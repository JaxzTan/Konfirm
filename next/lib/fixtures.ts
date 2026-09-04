import type { ModelResult, Tone } from "@/app/components/ui";

export const VERDICT_STATES = [
  "false",
  "true",
  "disputed",
  "unverifiable",
  "insufficient",
] as const;

export type VerdictState = (typeof VERDICT_STATES)[number];

export type Verdict = {
  state: VerdictState;
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
  models?: { name: string; score: number; reasoning: string; requestId: string }[];
  modelCount?: number;
  positions?: { stance: string; models: string[]; reasoning: string }[];
  respondedModel?: { name: string; score: number; reasoning: string; requestId: string };
};

/**
 * Fold a real `/api/verdict` response into the same shape the fixtures use,
 * so the result panel has exactly one rendering path. The API is the source
 * of truth for content; `t` only supplies the stance labels, which are UI
 * chrome rather than model output.
 */
export function verdictFromApi(api: ApiVerdict, t: T): Verdict {
  const state = resolveVerdictState(api.state);
  const tone: Tone = state === "true" ? "t" : "f";
  const title =
    api.verdict ??
    t(
      state === "true"
        ? "verdictTrue"
        : state === "disputed"
          ? "verdictDisputed"
          : state === "unverifiable"
            ? "verdictUnverifiable"
            : state === "insufficient"
              ? "verdictInsufficient"
              : "verdictFalse",
    );

  const responded = api.respondedModel;

  return {
    state,
    score: api.score ?? null,
    tone,
    title,
    description: api.description ?? "",
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
