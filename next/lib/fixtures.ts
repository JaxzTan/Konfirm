import type { ModelResult, Tone } from "@/app/components/ui";

export const MODEL_NAMES = ["DeepSeek", "Kimi", "MiniMax"] as const;

const REQ_FALSE = ["gnk_01HQ7F4M2X9B", "gnk_01HQ7F4M31KD", "gnk_01HQ7F4M3B7A"];
const REQ_TRUE = ["gnk_01HQ8B2N4K7P", "gnk_01HQ8B2N4R2V", "gnk_01HQ8B2N51DC"];

const SCORES_FALSE = ["18%", "25%", "10%"];
const SCORES_TRUE = ["88%", "84%", "91%"];

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

function models(reasons: string[], scores: string[], ids: string[]): ModelResult[] {
  return reasons.map((reasoning, i) => ({
    name: MODEL_NAMES[i],
    score: scores[i],
    reasoning,
    requestId: ids[i],
  }));
}

/**
 * The fixture set from the design handoff, rendered in the active locale.
 *
 * This backs the `?s=result&v=…` deep links so every designed screen has a
 * URL, and it is the only content `/card` and `/v` have until the Sui
 * fullnode read lands. A real check never goes through here — `/api/verdict`
 * returns the same shape and is used verbatim.
 */
export function demoVerdict(state: VerdictState, t: T): Verdict {
  const signalsFalse = t.raw("signalsFalse") as string[];
  const signalsTrue = t.raw("signalsTrue") as string[];
  const reasonFalse = t.raw("reasonFalse") as string[];
  const reasonTrue = t.raw("reasonTrue") as string[];

  switch (state) {
    case "true":
      return {
        state,
        score: 88,
        tone: "t",
        title: t("verdictTrue"),
        description: t("descTrue"),
        signals: signalsTrue,
        models: models(reasonTrue, SCORES_TRUE, REQ_TRUE),
        modelCount: 3,
      };
    case "disputed":
      return {
        state,
        score: null,
        tone: "f",
        title: t("verdictDisputed"),
        description: t("descDisputed"),
        signals: [],
        models: [],
        modelCount: 3,
        positions: [
          {
            stance: "f",
            label: t("sideFalse"),
            models: "DeepSeek 32% · MiniMax 44%",
            reasoning: t("posFalse"),
          },
          {
            stance: "t",
            label: t("sideTrue"),
            models: "Kimi 71%",
            reasoning: t("posTrue"),
          },
        ],
      };
    case "unverifiable":
      return {
        state,
        score: null,
        tone: "f",
        title: t("verdictUnverifiable"),
        description: t("descUnverifiable"),
        signals: [],
        models: [],
        modelCount: 3,
      };
    case "insufficient":
      return {
        state,
        score: null,
        tone: "f",
        title: t("verdictInsufficient"),
        description: t("descInsufficient"),
        signals: [],
        models: models(reasonFalse.slice(0, 1), SCORES_FALSE, REQ_FALSE),
        modelCount: 1,
      };
    default:
      return {
        state: "false",
        score: 25,
        tone: "f",
        title: t("verdictFalse"),
        description: t("descFalse"),
        signals: signalsFalse,
        models: models(reasonFalse, SCORES_FALSE, REQ_FALSE),
        modelCount: 3,
      };
  }
}


/** Shape returned by `/api/verdict`. Kept loose — it is a fixture route today. */
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
