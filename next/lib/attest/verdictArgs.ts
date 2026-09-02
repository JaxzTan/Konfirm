// Normalizes /api/verdict's mock response shape (5 different state shapes,
// see next/app/api/verdict/route.ts) into konfirm::registry::create_verdict's
// flat argument list. Kept in one place so the mapping is defined exactly
// once — the Move side documents state/score/confidence semantics in
// move/sources/registry.move's field comments, matched here.

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
    case "false": {
      const scores: number[] = result.models.map((m: any) => m.score);
      return {
        state: STATE_VERDICT,
        score: result.score,
        spreadLo: Math.min(...scores),
        spreadHi: Math.max(...scores),
        // 0 = high, 1 = medium, 2 = n/a (registry.move field comment) — a
        // verdict with all 3 models in is "high," 2 is "medium." A single
        // model can't produce state "true"/"false" in the mock generator,
        // so there's no 1-model case to define here.
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
        requestIds: [], // mock's disputed shape carries no per-model request IDs
      };
    }
    case "unverifiable":
      return {
        state: STATE_UNVERIFIABLE,
        score: NO_SCORE,
        spreadLo: 0,
        spreadHi: 0,
        confidence: 2,
        modelCount,
        models: [], // mock's unverifiable shape names no individual models
        requestIds: [],
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
