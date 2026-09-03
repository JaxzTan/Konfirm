"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  Donut,
  Micro,
  ModelCard,
  Panel,
  Serif,
  SignalsAndModels,
  Warn,
  btn,
} from "@/app/components/ui";
import { headingFont } from "@/lib/locale";
import type { VerdictState } from "@/lib/fixtures";
import { useFlow } from "./flow";

/**
 * Screens 09–13, the body of `/result/[state]`.
 *
 * The verdict comes from the flow when there is a real check behind it, and
 * from the fixture set for `state` otherwise, so each variant has a URL that
 * can be opened cold.
 */
export function ResultPanel({ state }: { state: VerdictState }) {
  const t = useTranslations("App");
  const { locale, verdictOr, objectId, reset, check, href } = useFlow();
  const verdict = verdictOr(state);
  const scored = verdict.score !== null;
  const shareHref = href(`/card/${objectId ?? "0x7a3e4f19b8c2d05e"}`);

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
            {t("confidence")}
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
          {t("noConsensus")}
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
        <SignalsAndModels
          labels={{ signals: t("mKeySignals"), models: t("mModels") }}
          signals={verdict.signals}
          tone={verdict.tone}
          models={verdict.models}
        />
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
