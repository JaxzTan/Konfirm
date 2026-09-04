"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Chip, Panel, Serif, Spinner, btn } from "@/app/components/ui";
import { headingFont } from "@/lib/locale";
import { useFlow, type LinkCheck } from "./flow";

/**
 * `/result/link` — the VirusTotal safety scan only. This is deliberately not
 * a variant of the AI verdict panel: "is this domain malicious" and "is the
 * claim true" are different questions, so link mode never produces (or
 * shows) a claim verdict, a trust score, or "cannot be verified" language.
 */
const RATING_TONE: Record<LinkCheck["rating"], "t" | "f"> = {
  SAFE: "t",
  CAUTION: "f",
  SUSPICIOUS: "f",
  DANGEROUS: "f",
  INSUFFICIENT_DATA: "f",
};

const RATING_TITLE_KEY: Record<LinkCheck["rating"], string> = {
  SAFE: "linkSafe",
  CAUTION: "linkCaution",
  SUSPICIOUS: "linkSuspicious",
  DANGEROUS: "linkDangerous",
  INSUFFICIENT_DATA: "linkInsufficientData",
};

const RATING_ICON: Record<LinkCheck["rating"], string> = {
  SAFE: "✓",
  CAUTION: "!",
  SUSPICIOUS: "!",
  DANGEROUS: "✕",
  INSUFFICIENT_DATA: "?",
};

export function LinkResultPanel() {
  const t = useTranslations("App");
  const { locale, linkCheck, reset, href } = useFlow();
  const router = useRouter();

  useEffect(() => {
    if (!linkCheck) router.replace(href("/"));
  }, [linkCheck, href, router]);

  if (!linkCheck) return <Spinner locale={locale} title={t("loadingLink")} sub="" />;

  const result = linkCheck;
  const tone = RATING_TONE[result.rating];

  const head = (
    <div className="grid gap-[7px]">
      <Serif locale={locale} size={24} className="text-[#f7f5ef]">
        {t(RATING_TITLE_KEY[result.rating])}
      </Serif>
      <p className="text-[13.5px] leading-[1.55] text-[#9ca3af]">{t("mLinkSafetyNote")}</p>
    </div>
  );

  return (
    <Panel head={head}>
      <div className="grid justify-items-center gap-[12px] rounded-xl border border-dashed border-[#d1d5db] px-5 py-[26px] text-center">
        <span
          className={`grid h-12 w-12 place-content-center rounded-full text-[22px] ${headingFont(locale)} ${
            tone === "t" ? "bg-[#edf7f0] text-[#1f5738]" : "bg-[#fdf0ed] text-[#6b3527]"
          }`}
        >
          {RATING_ICON[result.rating]}
        </span>
        <Chip tone={tone}>
          {t(RATING_TITLE_KEY[result.rating])}
          {result.score !== null ? ` · ${result.score}/100` : ""}
        </Chip>
        {result.rating === "INSUFFICIENT_DATA" ? (
          <p className="max-w-[36ch] text-[13px] leading-[1.55] text-[#6b7280]">
            {t("linkInsufficientBody", { count: result.totalActiveVendors })}
          </p>
        ) : (
          <p className="max-w-[36ch] text-[13px] leading-[1.55] text-[#6b7280]">
            {t("linkVendorSummary", {
              malicious: result.maliciousDetections,
              suspicious: result.suspiciousDetections,
              total: result.totalActiveVendors,
            })}
          </p>
        )}
      </div>

      <div className="grid gap-[9px] pt-1">
        <button type="button" onClick={reset} className={btn.solid}>
          {t("another")}
        </button>
      </div>
    </Panel>
  );
}
