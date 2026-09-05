import { NextRequest, NextResponse } from "next/server";
import { getClaimVerdict } from "@/app/api/verify-claim/route";
import { messagesByLocale, resolveLocale } from "@/lib/locale";

// Purely mechanical fallback signal (not model output) — kept here rather
// than in messages/*.json since it's a technical placeholder, not
// user-facing product copy.
const NO_SIGNALS: Record<string, string> = {
  en: "No specific signals returned.",
  bm: "Tiada isyarat khusus dikembalikan.",
  zh: "未返回具体信号。",
};

// Human-readable names for the UI — Gilbert's AI_MODELS entries are raw
// provider/model IDs (e.g. "moonshotai/Kimi-K2.6"). Kept as the full
// versioned model name (not just the brand) so it's clear which model
// variant actually produced each result.
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "moonshotai/Kimi-K2.6": "Kimi-K2.6",
  "deepseek-ai/DeepSeek-V4-Flash-0731": "DeepSeek-V4-Flash-0731",
  "MiniMaxAI/MiniMax-M2.7": "MiniMax-M2.7",
  "gemini-3.1-flash-lite": "Gemini-3.1-Flash-Lite",
  "gemini-3.5-flash-lite": "Gemini-3.5-Flash-Lite",
};

// Mirrors lib/aggregate.ts's own verdictTrustScores table — used here only to
// turn each model's own claim_verdict label into a per-model display score,
// since aggregate() only returns one trust_score for the whole verdict, not
// one per model.
const VERDICT_SCORES: Record<string, number> = {
  TRUE: 100,
  LIKELY_TRUE: 75,
  PARTIALLY_TRUE: 50,
  LIKELY_FALSE: 25,
  FALSE: 0,
  CANNOT_BE_VERIFIED: 0,
};

function stateFromVerdict(claimVerdict: string | null): "true" | "false" | "unverifiable" {
  if (claimVerdict === "CANNOT_BE_VERIFIED" || claimVerdict === null) return "unverifiable";
  const score = VERDICT_SCORES[claimVerdict] ?? 0;
  return score >= 50 ? "true" : "false";
}

function describe(state: string, greenFlags: string[], redFlags: string[], language: ReturnType<typeof resolveLocale>): string {
  if (state === "unverifiable") {
    return messagesByLocale[language].App.descUnverifiable;
  }
  const flags = state === "true" ? greenFlags : redFlags;
  return flags.slice(0, 2).join(". ") || "";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const claim = body?.text;
  const language = resolveLocale(body?.language);

  if (!claim || typeof claim !== "string") {
    return NextResponse.json({ error: "Missing 'text' in request body." }, { status: 400 });
  }

  try {
    const { finalVerdict, requestIds } = await getClaimVerdict(claim, language);
    const state = stateFromVerdict(finalVerdict.claim_verdict);

    // Dedupe flags across models for the top-level "Key Signals" block.
    const allGreen = [...new Set(finalVerdict.individual_responses.flatMap((r) => r.green_flags))];
    const allRed = [...new Set(finalVerdict.individual_responses.flatMap((r) => r.red_flags))];

    const models = finalVerdict.individual_responses.map((r) => {
      const points = r.verdict === "TRUE" || r.verdict === "LIKELY_TRUE" ? r.green_flags : r.red_flags;
      return {
        name: MODEL_DISPLAY_NAMES[r.model] ?? r.model,
        score: VERDICT_SCORES[r.verdict] ?? 0,
        reasoning: points.length > 0 ? points : [NO_SIGNALS[language]],
        requestId: requestIds[r.model] || "unavailable",
      };
    });

    return NextResponse.json({
      state,
      score: finalVerdict.trust_score,
      description: describe(state, allGreen, allRed, language),
      flags: state === "true" ? allGreen : state === "false" ? allRed : [],
      models,
      modelCount: models.length,
    });
  } catch (error) {
    console.error("Verdict check failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 },
    );
  }
}
