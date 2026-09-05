// Normalizes /api/verdict's response shape into konfirm::registry::create_verdict's
// flat argument list. Kept in one place so the mapping is defined exactly
// once — the Move side documents state/score/confidence semantics in
// move/sources/registry.move's field comments, matched here.
//
// /api/verdict currently only ever emits one of the 5 scored buckets
// ("true" | "likely_true" | "partially_true" | "likely_false" | "false") or
// "unverifiable" (see stateFromVerdict() in next/app/api/verdict/route.ts) —
// the "disputed"/"insufficient" branches below match states the Move
// contract and the UI both already support, but nothing in the current
// backend produces them yet. Kept for when aggregate.ts grows a real
// disagreement signal instead of always blending to one score.

// Matches STATE_VERDICT/STATE_DISPUTED/STATE_UNVERIFIABLE/STATE_INSUFFICIENT
// in move/sources/registry.move. Not imported from anywhere — Move has no
// generated TS bindings for its constants — so this literally duplicates
// those four numbers. If the Move module's enum order ever changes, this
// must change with it.
const STATE_VERDICT = 0;
const STATE_DISPUTED = 1;
const STATE_UNVERIFIABLE = 2;
const STATE_INSUFFICIENT = 3;
const NO_SCORE = 255;

export type VerdictArgs = {
  state: number;
  score: number;
  spreadLo: number;
  spreadHi: number;
  confidence: number;
  modelCount: number;
  models: string[];
  requestIds: string[];
};

export function normalizeVerdictArgs(result: any): VerdictArgs {
  const modelCount: number = result.modelCount ?? 0;

  switch (result.state) {
    case "true":
    case "likely_true":
    case "partially_true":
    case "likely_false":
    case "false": {
      const scores: number[] = result.models.map((m: any) => m.score);
      return {
        state: STATE_VERDICT,
        score: result.score,
        spreadLo: Math.min(...scores),
        spreadHi: Math.max(...scores),
        // 0 = high, 1 = medium, 2 = n/a (registry.move field comment) —
        // modelCount >= 3 counts as "high," anything less as "medium."
        confidence: modelCount >= 3 ? 0 : 1,
        modelCount,
        models: result.models.map((m: any) => m.name),
        requestIds: result.models.map((m: any) => m.requestId),
      };
    }
    case "disputed": {
      const models: string[] = [...new Set<string>(result.positions.flatMap((p: any) => p.models as string[]))];
      return {
        state: STATE_DISPUTED,
        score: NO_SCORE,
        spreadLo: 0,
        spreadHi: 0,
        confidence: 2, // disagreement by definition — never "high"/"medium"
        modelCount,
        models,
        requestIds: [], // the disputed shape carries no per-model request IDs
      };
    }
    case "unverifiable":
      // /api/verdict still returns individual_responses even when it
      // can't reach a verdict (aggregate.ts builds that list unconditionally)
      // — record which models were actually consulted rather than nothing.
      return {
        state: STATE_UNVERIFIABLE,
        score: NO_SCORE,
        spreadLo: 0,
        spreadHi: 0,
        confidence: 2,
        modelCount,
        models: (result.models ?? []).map((m: any) => m.name),
        requestIds: (result.models ?? []).map((m: any) => m.requestId),
      };
    case "insufficient":
      return {
        state: STATE_INSUFFICIENT,
        score: NO_SCORE,
        spreadLo: 0,
        spreadHi: 0,
        confidence: 2, // too few models responded to call this confident
        modelCount,
        models: [result.respondedModel.name, ...result.timedOutModels],
        requestIds: [result.respondedModel.requestId],
      };
    default:
      throw new Error(`Unknown verdict state: ${result.state}`);
  }
}
