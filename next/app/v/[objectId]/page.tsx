import Link from "next/link";
import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";

import {
  fetchOnChainVerdict,
  fetchTrace,
  STATE_VERDICT,
  STATE_DISPUTED,
  STATE_INSUFFICIENT,
} from "@/lib/sui/verdict";
import enMessages from "@/messages/en.json";
import bmMessages from "@/messages/bm.json";
import zhMessages from "@/messages/zh.json";

const messagesByLocale = { en: enMessages, bm: bmMessages, zh: zhMessages };

type Locale = "en" | "bm" | "zh";

type ModelResult = {
  model: string;
  requestId: string;
  score: number | null;
  reasoning: string;
};

type Verdict = {
  objectId: string;
  state: "true" | "false" | "disputed" | "unavailable" | "insufficient";
  score: number | null;
  /** Empty when the Walrus trace couldn't be read — the chain has no prose. */
  description: string;
  /** sha256(normalize(text) || lang). The claim text itself is stored nowhere. */
  claimHashHex: string;
  modelCount: number;
  flags: string[];
  models: ModelResult[];
  challengeCount: number;
  createdAtMs: number;
  /** False when Walrus was unreachable or the blob is gone. */
  hasTrace: boolean;
};


/**
 * Splits the on-chain STATE_VERDICT into the page's "true"/"false" halves.
 *
 * The chain deliberately does not store that label — normalizeVerdictArgs maps
 * both to STATE_VERDICT and keeps only the numeric score, so the label has to
 * come back from somewhere. The Walrus trace carries the original string; the
 * score threshold is the fallback for when the trace is unreadable.
 */
function displayState(state: number, score: number | null, traceState?: unknown): Verdict["state"] {
  if (traceState === "true" || traceState === "false") return traceState;

  switch (state) {
    case STATE_VERDICT:
      return score !== null && score >= 50 ? "true" : "false";
    case STATE_DISPUTED:
      return "disputed";
    case STATE_INSUFFICIENT:
      return "insufficient";
    default:
      return "unavailable";
  }
}

/**
 * Reads the record from Sui, then enriches it from the Walrus trace.
 *
 * The split matters: everything the page treats as *evidence* — score, model
 * count, request IDs, dispute count, timestamp — comes from the chain, which
 * is the whole point of the product. The prose (description, key signals,
 * per-model reasoning) exists only in the Walrus blob, because NFR-4 keeps
 * text off-chain. If Walrus is down the record still renders, minus the prose.
 */
async function getVerdict(objectId: string): Promise<Verdict | null> {
  const onChain = await fetchOnChainVerdict(objectId);
  if (!onChain) return null;

  const trace = await fetchTrace(onChain.traceBlob);

  // Shape of a /api/verdict result, as archived by /api/attest.
  const traceModels = Array.isArray(trace?.models)
    ? (trace.models as { name?: string; score?: number; reasoning?: string; requestId?: string }[])
    : [];
  const reasoningByModel = new Map(
    traceModels.map((m) => [m.name, { reasoning: m.reasoning ?? "", score: m.score ?? null }]),
  );

  return {
    objectId: onChain.objectId,
    state: displayState(onChain.state, onChain.score, trace?.state),
    score: onChain.score,
    description: typeof trace?.description === "string" ? trace.description : "",
    claimHashHex: onChain.claimHashHex,
    modelCount: onChain.modelCount,
    flags: Array.isArray(trace?.flags) ? (trace.flags as string[]) : [],
    // Driven by the on-chain models list, not the trace's: the chain is the
    // record, and a mismatched trace must not add models that were never
    // attested. requestIds is positional against models in create_verdict.
    models: onChain.models.map((model, i) => ({
      model,
      requestId: onChain.requestIds[i] ?? "",
      score: reasoningByModel.get(model)?.score ?? null,
      reasoning: reasoningByModel.get(model)?.reasoning ?? "",
    })),
    challengeCount: onChain.challengeCount,
    createdAtMs: onChain.createdAtMs,
    hasTrace: trace !== null,
  };
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { objectId } = await params;
  const searchParamsResolved = await searchParams;
  const locale = (["en", "bm", "zh"].includes(searchParamsResolved.lang ?? "")
    ? searchParamsResolved.lang
    : "en") as Locale;

  const t = createTranslator({
    locale,
    timeZone: "Asia/Kuala_Lumpur",
    messages: messagesByLocale[locale],
    namespace: "Verify",
  });
  const modelWord = (count: number) => (count === 1 ? t("model") : t("models"));

  const verdict = await getVerdict(objectId);

  if (!verdict) notFound();

  const isScored = verdict.state === "true" || verdict.state === "false";
  const explorerUrl = `https://suiscan.xyz/testnet/object/${verdict.objectId}`;
  const date = new Date(verdict.createdAtMs).toLocaleString(
    locale === "zh" ? "zh-CN" : locale === "bm" ? "ms-MY" : "en-MY",
    { dateStyle: "medium", timeStyle: "short" }
  );

  return (
    <div className="min-h-screen bg-[#f7f5ef]">
      <div className="bg-[#0f2e23] px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#c98a3a] flex items-center justify-center font-bold text-[#0f2e23]">
            K
          </div>
          <span className="text-white font-serif font-bold text-xl">Konfirm</span>
        </Link>
        <span className="text-gray-400 text-xs sm:text-sm text-right">{t("publicRecord")}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="rounded-2xl overflow-hidden border border-gray-300">
          <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] p-5 sm:p-8">
            {/* The claim text is stored nowhere — not on-chain (NFR-4) and not
                in the Walrus trace. Its hash is what lets anyone re-check that
                this record belongs to the message they were forwarded. */}
            <p className="font-mono text-gray-400 text-xs uppercase tracking-widest mb-3 break-all">
              {t("claimFingerprint")}: {verdict.claimHashHex.slice(0, 16)}…
            </p>

            {isScored && verdict.score !== null && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 mb-4">
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: `conic-gradient(${
                      verdict.state === "true" ? "#2c7a52" : "#b8442f"
                    } 0% ${verdict.score}%, rgba(255,255,255,0.12) ${verdict.score}% 100%)`,
                  }}
                >
                  <div className="w-[76px] h-[76px] rounded-full bg-[#0f2e23] flex items-center justify-center">
                    <span className="text-white font-bold text-2xl">
                      {verdict.score}
                      <span className="text-sm font-medium opacity-70">%</span>
                    </span>
                  </div>
                </div>
                <div>
                  <h1 className="text-white font-serif text-2xl font-bold mb-1">
                    {verdict.state === "true"
                      ? messagesByLocale[locale].Home.likelyTrue
                      : messagesByLocale[locale].Home.likelyFalse}
                  </h1>
                  <p className="text-gray-300 text-sm max-w-sm">{verdict.description}</p>
                </div>
              </div>
            )}

            {!isScored && (
              <div className="mb-2">
                <h1 className="text-white font-serif text-2xl font-bold mb-1">{t("cantBeVerified")}</h1>
                {verdict.description && (
                  <p className="text-gray-300 text-sm max-w-md">{verdict.description}</p>
                )}
              </div>
            )}

            {!verdict.hasTrace && (
              <div className="bg-[#c98a3a]/20 border border-[#c98a3a]/40 rounded-lg px-4 py-2.5 mt-3">
                <span className="text-[#f0d9a8] text-sm font-semibold">⚠ {t("traceUnavailable")}</span>
              </div>
            )}

            {verdict.modelCount < 3 && (
              <div className="bg-[#c98a3a]/20 border border-[#c98a3a]/40 rounded-lg px-4 py-2.5 mt-3">
                <span className="text-[#f0d9a8] text-sm font-semibold">
                  ⚠ {t("onlyModelsParticipated", { count: verdict.modelCount, modelWord: modelWord(verdict.modelCount) })}
                </span>
              </div>
            )}

            <p className="text-gray-400 text-xs mt-4 leading-relaxed">
              {t("permanentRecordNote")}
            </p>
          </div>

          {isScored && (
            <div className="bg-white p-5 sm:p-8 border-b border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                {/* Key signals live only in the Walrus trace, so this column
                    drops out entirely rather than leaving a bare heading when
                    the blob has expired. */}
                {verdict.flags.length > 0 && (
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("keySignals")}</p>
                    <div className="flex flex-col gap-2">
                      {verdict.flags.map((flag, i) => (
                        <div
                          key={i}
                          className={`border rounded-lg p-3 text-sm ${
                            verdict.state === "true"
                              ? "bg-[#edf7f0] border-[#cfe3d6] text-[#1f5738]"
                              : "bg-[#fdf0ed] border-[#f2d5cc] text-[#6b3527]"
                          }`}
                        >
                          {flag}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("whatEachModelFound")}</p>
                  <div className="flex flex-col gap-2">
                    {verdict.models.map((m) => (
                      <div key={m.model} className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-sm text-gray-900">{m.model}</span>
                          {m.score !== null && (
                            <span className="text-xs font-mono bg-[#fdf0ed] text-[#b8442f] px-2 py-0.5 rounded-full">
                              {m.score}%
                            </span>
                          )}
                        </div>
                        {m.reasoning && <p className="text-xs text-gray-600 mb-2">{m.reasoning}</p>}
                        <div className="border-t border-dashed border-gray-300 pt-1.5">
                          <span className="text-[10px] font-mono text-gray-400">
                            {t("requestId")}: {m.requestId}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white p-5 sm:p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("onChainRecord")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
              <div className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-1">{t("recordedOn")}</p>
                <p className="font-mono text-gray-900 font-medium">{date}</p>
              </div>
              <div className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-1">{t("publicDisputesFiled")}</p>
                <p className="text-gray-900 font-medium">{verdict.challengeCount}</p>
              </div>
            </div>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full border border-gray-300 rounded-xl py-3.5 font-bold text-sm text-gray-900 bg-white hover:bg-gray-50"
            >
              {t("viewOnExplorer")} ↗
            </a>
            <p className="text-xs text-gray-500 mt-3">
              {t("cannotBeEdited")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
