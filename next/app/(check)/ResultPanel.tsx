"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Chip,
  Donut,
  Micro,
  ModelCard,
  Panel,
  Serif,
  SignalsAndModels,
  Spinner,
  Warn,
  btn,
} from "@/app/components/ui";
import { headingFont } from "@/lib/locale";
import { useFlow } from "./flow";

/**
 * Screens 09–13, the body of `/result/[state]`.
 *
 * The verdict comes from the flow's own state — there is no fixture
 * fallback. Landing here cold (a refresh, a bookmarked URL, no check ever
 * run) sends the user back to `/` instead of showing a canned result, since
 * a result screen that can display fake data as if real is not something a
 * public misinformation checker can afford.
 */
const IMAGE_VERDICT_TONE: Record<string, "t" | "f"> = {
  TRUE: "t",
  LIKELY_TRUE: "t",
  PARTIALLY_TRUE: "f",
  LIKELY_FALSE: "f",
  FALSE: "f",
  CANNOT_BE_VERIFIED: "f",
};

export function ResultPanel() {
  const t = useTranslations("App");
  const { locale, text, verdict, imageCheck, objectId, reset, check, href } = useFlow();
  const router = useRouter();
  const [refutation, setRefutation] = useState<{ summaryFlags: string[]; politeRefutation: string } | null>(null);
  const [refutationLoading, setRefutationLoading] = useState(false);
  const [copiedRefutation, setCopiedRefutation] = useState(false);

  const handleCopyRefutation = async () => {
    if (!refutation) return;
    try {
      await navigator.clipboard.writeText(refutation.politeRefutation);
      setCopiedRefutation(true);
      setTimeout(() => setCopiedRefutation(false), 2000);
    } catch {
      // clipboard unavailable — the text is still selectable/copyable by hand
    }
  };

  useEffect(() => {
    if (!verdict) router.replace(href("/"));
  }, [verdict, href, router]);

  // Fires only for a definitive true/false verdict — a plain-language
  // summary and a polite rebuttal message only make sense once there's an
  // actual verdict to summarize. Loaded after the verdict itself so the
  // main result never waits on this second, purely supplementary call.
  //
  // Depends on state/score, not the whole `verdict` object: localizeVerdict()
  // (lib/fixtures.ts) returns a new Verdict object every time the UI
  // language changes, even for the same check. Depending on `verdict` itself
  // would re-fire this on every language toggle instead of once per real
  // check — an unnecessary AI call each time.
  useEffect(() => {
    if (!verdict || verdict.score === null) return;
    setRefutationLoading(true);
    fetch("/api/sum-and-refute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        original_message: text,
        final_verdict: JSON.stringify({
          state: verdict.state,
          score: verdict.score,
          flags: verdict.signals,
          models: verdict.models,
        }),
        language: locale,
      }),
    })
      .then((r) => r.json())
      .then((r) => {
        if (r.success) {
          setRefutation({
            summaryFlags: r.data.summary_flags ?? [],
            politeRefutation: r.data.polite_refutation ?? "",
          });
        }
      })
      .catch((cause) => console.error("Summary/refutation failed:", cause))
      .finally(() => setRefutationLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict?.state, verdict?.score, text]);

  if (!verdict) return <Spinner locale={locale} title={t("loading")} sub="" />;

  const scored = verdict.score !== null;
  const shareHref = href(`/card/${objectId}`);

  const footer = (primaryLabel: string, primaryAction?: () => void) => (
    <div className="grid gap-[9px] pt-1">
      {primaryAction ? (
        <button type="button" onClick={primaryAction} className={btn.solid}>
          {primaryLabel}
        </button>
      ) : (
        <Link href={shareHref} className={`${btn.solid} block`}>
          {primaryLabel}
        </Link>
      )}
      <button type="button" onClick={reset} className={btn.outline}>
        {t("another")}
      </button>
    </div>
  );

  const head = (
    <>
      {scored ? (
        <>
          <div className="flex items-center gap-4">
            <Donut score={verdict.score!} tone={verdict.tone} locale={locale} />
            <div className="grid gap-[7px]">
              <Serif locale={locale} size={24} className="text-[#f7f5ef]">
                {verdict.title}
              </Serif>
              <p className="text-[13.5px] leading-[1.55] text-[#9ca3af]">
                {verdict.description}
              </p>
            </div>
          </div>
          <div className="rounded-[10px] bg-[#f7f5ef]/10 px-[13px] py-[10px] text-[12.5px] text-[#f7f5ef]">
            {t("confidence", { count: verdict.modelCount })}
          </div>
        </>
      ) : (
        <div className="grid gap-2">
          <Serif locale={locale} size={26} className="text-[#f7f5ef]">
            {verdict.title}
          </Serif>
          <p className="text-[13.5px] leading-[1.55] text-[#9ca3af]">
            {verdict.description}
          </p>
        </div>
      )}

      {verdict.state === "disputed" && (
        <div className="rounded-[10px] bg-[#f7f5ef]/10 px-[13px] py-[10px] text-[12.5px] text-[#f7f5ef]">
          {t("noConsensus", { count: verdict.modelCount })}
        </div>
      )}

      {verdict.modelCount < 3 && (
        <Warn>{verdict.modelCount === 1 ? t("oneModel") : t("lowModels")}</Warn>
      )}
    </>
  );

  return (
    <Panel head={head}>
      {scored && (
        <div className="grid gap-[10px]">
          <Micro>{t("mSummary")}</Micro>
          {refutationLoading ? (
            <div className="grid gap-2">
              <div className="h-3 w-full animate-pulse rounded-full bg-[#ece9e0]" />
              <div className="h-3 w-5/6 animate-pulse rounded-full bg-[#ece9e0]" />
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-[#ece9e0]" />
            </div>
          ) : refutation ? (
            <>
              <ul className="grid list-disc gap-1 pl-[18px] text-[13px] leading-[1.55] text-[#6b7280]">
                {refutation.summaryFlags.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
              <div className="grid gap-[6px] rounded-xl bg-[#f7f5ef] p-[12px]">
                <p className="text-[13.5px] leading-[1.55] text-[#0f2e23]">
                  {refutation.politeRefutation}
                </p>
                <button
                  type="button"
                  onClick={handleCopyRefutation}
                  className="justify-self-end text-[12px] font-semibold text-[#1f4d3d] hover:underline"
                >
                  {copiedRefutation ? t("copied") : t("copyRefutation")}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {scored && (
        <SignalsAndModels
          labels={{ signals: t("mKeySignals"), models: t("mModels") }}
          signals={verdict.signals}
          tone={verdict.tone}
          models={verdict.models}
        />
      )}

      {imageCheck && imageCheck.claim_verdict && (
        <div className="grid gap-[10px]">
          <Micro>{t("mImageCheck")}</Micro>
          <div className="grid gap-[6px]">
            <Chip tone={IMAGE_VERDICT_TONE[imageCheck.claim_verdict] ?? "f"}>
              {imageCheck.claim_verdict.replaceAll("_", " ")}
              {imageCheck.trust_score !== null ? ` · ${imageCheck.trust_score}%` : ""}
            </Chip>
            <p className="text-[12px] leading-[1.5] text-[#6b7280]">{t("mImageCheckNote")}</p>
          </div>
        </div>
      )}

      {verdict.state === "disputed" && verdict.positions && (
        <div className="grid gap-[10px]">
          <Micro>{t("mPositions")}</Micro>
          <div className="grid gap-[9px]">
            {verdict.positions.map((p) => (
              <div
                key={p.label}
                className={`grid gap-[6px] rounded-xl border p-[14px] ${
                  p.stance === "t"
                    ? "border-[#cfe3d6] bg-[#edf7f0] text-[#1f5738]"
                    : "border-[#f2d5cc] bg-[#fdf0ed] text-[#6b3527]"
                }`}
              >
                <p className="text-[13.5px] font-bold">{p.label}</p>
                <p className="font-mono text-[12.5px]">{p.models}</p>
                <p className="text-[13px] leading-[1.55]">{p.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {verdict.state === "unverifiable" && (
        <div className="grid justify-items-center gap-[10px] rounded-xl border border-dashed border-[#d1d5db] px-5 py-[26px] text-center">
          <span
            className={`grid h-10 w-10 place-content-center rounded-xl bg-[#ece9e0] text-[20px] text-[#6b7280] ${headingFont(locale)}`}
          >
            ?
          </span>
          <p className="text-[15px] font-semibold text-[#0f2e23]">{t("unvTitle")}</p>
          <p className="max-w-[36ch] text-[13px] leading-[1.55] text-[#6b7280]">
            {t("unvBody")}
          </p>
        </div>
      )}

      {verdict.state === "insufficient" && (
        <>
          <div className="grid justify-items-center gap-[10px] rounded-xl border border-dashed border-[#d1d5db] px-5 py-[22px] text-center">
            <span className={`text-[22px] text-[#6b7280] ${headingFont(locale)}`}>↻</span>
            <p className="text-[15px] font-semibold text-[#0f2e23]">{t("insTitle")}</p>
          </div>
          <div className="grid gap-[10px]">
            <Micro>{t("mFound")}</Micro>
            <div className="grid gap-[9px]">
              {verdict.models.map((m) => (
                <ModelCard key={m.name} model={m} />
              ))}
            </div>
          </div>
        </>
      )}

      {verdict.state === "insufficient" ? footer(t("tryAgain"), check) : footer(t("share"))}
    </Panel>
  );
}
