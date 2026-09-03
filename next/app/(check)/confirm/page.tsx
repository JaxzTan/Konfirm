"use client";

import { useTranslations } from "next-intl";

import { btn } from "@/app/components/ui";
import { Centered } from "../Centered";
import { useFlow } from "../flow";

/**
 * Screen 06 — `/confirm`. Enoki fires the transaction with no wallet popup,
 * so this click is the only place the user explicitly agrees before the
 * verdict is on-chain.
 */
export default function ConfirmPage() {
  const t = useTranslations("App");
  const { attest, reset } = useFlow();

  return (
    <Centered
      title={t("confirmTitle")}
      body={<p className="text-[14px] leading-[1.65] text-[#6b7280]">{t("confirmBody")}</p>}
    >
      <div className="grid w-full max-w-[320px] gap-[9px]">
        <button type="button" onClick={attest} className={btn.solid}>
          {t("confirmYes")}
        </button>
        <button type="button" onClick={reset} className={btn.outline}>
          {t("confirmNo")}
        </button>
      </div>
    </Centered>
  );
}
