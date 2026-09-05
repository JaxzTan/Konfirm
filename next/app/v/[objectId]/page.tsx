import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";

import { Donut, Micro, ModelCard, Serif, Chip, Warn, btn } from "@/app/components/ui";
import {
  fetchOnChainVerdict,
  fetchTrace,
  STATE_VERDICT,
  STATE_DISPUTED,
  STATE_INSUFFICIENT,
} from "@/lib/sui/verdict";
import { headingFont, messagesByLocale, resolveLocale, TIME_ZONE } from "@/lib/locale";
import { bucketStateFromScore, TITLE_KEY, VERDICT_STATES, type VerdictState } from "@/lib/fixtures";
import { getCard } from "@/lib/card";

/**
 * Same Open Graph treatment as /card/[objectId] — this is the durable public
 * link (the one people actually bookmark/paste long after the initial
 * share), so it needs its own real preview too, not just the card's.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { objectId } = await params;
  const locale = resolveLocale((await searchParams).lang);
  const card = await getCard(objectId);
  if (!card) return {};

  const messages = messagesByLocale[locale].App;
  const headline =
    card.state === "true" ? messages.verdictTrue : card.state === "false" ? messages.verdictFalse : messages.verdictUnverifiable;
  const description = card.description ?? messages.cardBody;
  const imageUrl = `/api/card/${objectId}?lang=${locale}`;

  return {
    title: `Konfirm — ${headline}`,
    description,
    openGraph: {
      title: `Konfirm — ${headline}`,
      description,
      images: [{ url: imageUrl, width: 1080, height: 1080 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `Konfirm — ${headline}`,
      description,
      images: [imageUrl],
    },
  };
}

/** True-leaning half of the 5 scored states — mirrors fixtures.ts's own set,
 *  not exported from there since it's only needed alongside a live t(). */
const TRUE_LEANING = new Set<VerdictState>(["true", "likely_true"]);

type ModelResult = {
  model: string;
  requestId: string;
  /** Already formatted (e.g. "88%") — the trace stores fixtures.ts's
   *  verdictFromApi() output, which pre-formats scores as display strings,
   *  not raw numbers. Null only when the trace has no entry for this model. */
  score: string | null;
  reasoning: string[];
};

type Verdict = {
  objectId: string;
  state: VerdictState;
  score: number | null;
  /** Empty when the Walrus trace couldn't be read — the chain has no prose. */
  description: string;
  /** sha256(normalize(text) || lang) — the chain's own identifier for the claim. */
  claimHashHex: string;
  /** The message that was checked, from the Walrus trace. Empty when the blob is unreadable. */
  claim: string;
  modelCount: number;
  flags: string[];
  models: ModelResult[];
  challengeCount: number;
  createdAtMs: number;
  /** False when Walrus was unreachable or the blob is gone. */
  hasTrace: boolean;
};

/**
 * Splits the on-chain STATE_VERDICT into one of the 5 scored states.
 *
 * The chain deliberately does not store the granular label — normalizeVerdictArgs
 * maps every scored outcome to STATE_VERDICT and keeps only the numeric score,
 * so the label has to come back from somewhere. The Walrus trace carries the
 * original string (already one of aggregate.ts's buckets); bucketStateFromScore()
 * — the same boundaries aggregate.ts itself uses — is the fallback for when the
 * trace is unreadable, so this page never falls back to a plain true/false split.
 */
function displayState(
  state: number,
  score: number | null,
  traceState?: unknown,
): VerdictState {
  if (typeof traceState === "string" && (VERDICT_STATES as readonly string[]).includes(traceState)) {
    return traceState as VerdictState;
  }

  switch (state) {
    case STATE_VERDICT:
      return score !== null ? bucketStateFromScore(score) : "unverifiable";
    case STATE_DISPUTED:
      return "disputed";
    case STATE_INSUFFICIENT:
      return "insufficient";
    default:
      return "unverifiable";
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

  // Shape of fixtures.ts's verdictFromApi() output, as archived by
  // /api/attest — /api/attest receives the frontend's already-formatted
  // Verdict (flow.tsx sends `result: verdict`), not the raw /api/verdict
  // response, so `score` here is already a display string like "88%".
  const traceModels = Array.isArray(trace?.models)
    ? (trace.models as { name?: string; score?: string; reasoning?: string[]; requestId?: string }[])
    : [];
  const reasoningByModel = new Map(
    traceModels.map((m) => [m.name, { reasoning: m.reasoning ?? [], score: m.score ?? null }]),
  );

  return {
    objectId: onChain.objectId,
    state: displayState(onChain.state, onChain.score, trace?.state),
    score: onChain.score,
    description: typeof trace?.description === "string" ? trace.description : "",
    claimHashHex: onChain.claimHashHex,
    claim: typeof trace?.claim === "string" ? trace.claim : "",
    modelCount: onChain.modelCount,
    flags: Array.isArray(trace?.flags) ? (trace.flags as string[]) : [],
    // Driven by the on-chain models list, not the trace's: the chain is the
    // record, and a mismatched trace must not add models that were never
    // attested. requestIds is positional against models in create_verdict.
    models: onChain.models.map((model, i) => ({
      model,
      requestId: onChain.requestIds[i] ?? "",
      score: reasoningByModel.get(model)?.score ?? null,
      reasoning: reasoningByModel.get(model)?.reasoning ?? [],
    })),
    challengeCount: onChain.challengeCount,
    createdAtMs: onChain.createdAtMs,
    hasTrace: trace !== null,
  };
}

/** Screen 16 — the public record a share card points at. No login needed. */
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { objectId } = await params;
  const locale = resolveLocale((await searchParams).lang);
  const heading = headingFont(locale);

  const t = createTranslator({
    locale,
    timeZone: TIME_ZONE,
    messages: messagesByLocale[locale],
    namespace: "App",
  });

  const verdict = await getVerdict(objectId);
  if (!verdict) notFound();

  const scored = verdict.score !== null;
  const tone = TRUE_LEANING.has(verdict.state) ? "t" : "f";
  const title = t(TITLE_KEY[verdict.state]);

  const explorerUrl = `https://suiscan.xyz/testnet/object/${verdict.objectId}`;
  const recordedAt = new Date(verdict.createdAtMs).toLocaleString(
    locale === "zh" ? "zh-CN" : locale === "bm" ? "ms-MY" : "en-MY",
    { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE },
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="flex items-center gap-3 bg-[#0f2e23] px-[18px] py-[14px]">
        <Link href={`/?lang=${locale}`} className="flex flex-1 items-center gap-[10px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c98a3a] text-[15px] font-bold text-[#0f2e23]">
            K
          </span>
          <span className={`text-[19px] text-[#f7f5ef] ${heading}`}>Konfirm</span>
        </Link>
        <span className="text-right text-[12px] text-[#9ca3af]">{t("publicBadge")}</span>
      </header>

      <div className="grid gap-4 bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] px-5 py-[22px]">
        {/* What was checked, then how it is identified on chain. The claim
            comes from the Walrus trace and can be missing when the blob is
            unreadable; the hash comes from the chain and always is. */}
        {verdict.claim && (
          <div className="grid gap-[6px]">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#9ca3af]">
              {t("claimChecked")}
            </p>
            <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55] text-[#f7f5ef]">
              {verdict.claim}
            </p>
          </div>
        )}

        <div className="grid gap-[6px]">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#9ca3af]">
            {t("claimFingerprint")}
          </p>
          <p className="break-all font-mono text-[12px] leading-[1.5] text-[#f7f5ef]">
            {verdict.claimHashHex}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {scored && verdict.score !== null && (
            <Donut score={verdict.score} tone={tone} locale={locale} />
          )}
          <div className="grid gap-[7px]">
            <Serif locale={locale} size={24} className="text-[#f7f5ef]">
              {title}
            </Serif>
            {verdict.description && (
              <p className="text-[13.5px] leading-[1.55] text-[#9ca3af]">
                {verdict.description}
              </p>
            )}
          </div>
        </div>

        {verdict.modelCount < 3 && (
          <Warn>{verdict.modelCount === 1 ? t("oneModel") : t("lowModels")}</Warn>
        )}

        {/* Walrus holds the prose; the chain holds the evidence. Say so rather
            than rendering a page that silently lost half its content. */}
        {!verdict.hasTrace && <Warn>{t("traceUnavailable")}</Warn>}

        <p className="text-[12.5px] leading-[1.55] text-[#9ca3af]">{t("permanence")}</p>
      </div>

      {(verdict.flags.length > 0 || verdict.models.length > 0) && (
        <div className="grid gap-[18px] bg-white p-5">
          {verdict.flags.length > 0 && (
            <div className="grid gap-[10px]">
              <Micro>{t("mKeySignals")}</Micro>
              <div className="flex flex-wrap gap-[7px]">
                {verdict.flags.map((f) => (
                  <Chip key={f} tone={tone}>
                    {f}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {verdict.models.length > 0 && (
            <div className="grid gap-[10px]">
              <Micro>{t("mModels")}</Micro>
              <div className="grid gap-[9px]">
                {verdict.models.map((m) => (
                  <ModelCard
                    key={m.model}
                    model={{
                      name: m.model,
                      score: m.score ?? "—",
                      reasoning: m.reasoning,
                      requestId: m.requestId,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-[14px] border-t border-[#d1d5db] bg-white p-5">
        <Micro>{t("mChain")}</Micro>
        <div className="grid grid-cols-2 gap-[10px]">
          <div className="grid gap-[5px] rounded-xl border border-[#d1d5db] p-[14px]">
            <p className="text-[12px] text-[#6b7280]">{t("recordedOn")}</p>
            <p className="text-[14px] font-semibold text-[#0f2e23]">{recordedAt}</p>
          </div>
          <div className="grid gap-[5px] rounded-xl border border-[#d1d5db] p-[14px]">
            <p className="text-[12px] text-[#6b7280]">{t("disputes")}</p>
            <p className="text-[14px] font-semibold text-[#0f2e23]">{verdict.challengeCount}</p>
          </div>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn.outline} block`}
        >
          {t("explorer")}
        </a>
        <p className="text-center text-[12px] leading-[1.5] text-[#6b7280]">{t("immutable")}</p>
      </div>
    </div>
  );
}
