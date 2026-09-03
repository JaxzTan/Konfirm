"use client";

import { useTranslations } from "next-intl";

import { btn } from "@/app/components/ui";
import { Centered } from "../Centered";
import { useFlow } from "../flow";

/** Screen 08 — `/failed`. Replaces the raw `alert()` the flow used to throw. */
export default function FailedPage() {
  const t = useTranslations("App");
  const { error, attest, reset } = useFlow();

  return (
    <Centered
      title={t("errorTitle")}
      body={
        <p className="w-full break-all rounded-[10px] border border-[#f2d5cc] bg-[#fdf0ed] px-[14px] py-3 text-left font-mono text-[11.5px] leading-[1.5] text-[#6b3527]">
          {error ?? "SponsorError: gas station rejected tx — budget exceeded (code 429)"}
        </p>
      }
    >
      <div className="grid w-full max-w-[320px] gap-[9px]">
        <button type="button" onClick={attest} className={btn.solid}>
          {t("retry")}
        </button>
        <button type="button" onClick={reset} className={btn.outline}>
          {t("another")}
        </button>
      </div>
    </Centered>
  );
}
