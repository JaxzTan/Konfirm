"use client";

import { useTranslations } from "next-intl";

import { Spinner } from "@/app/components/ui";
import { useFlow } from "../flow";

/** Screen 07 — `/loading`. The on-chain write, not the AI check. */
export default function LoadingPage() {
  const t = useTranslations("App");
  const { locale } = useFlow();
  return <Spinner locale={locale} title={t("attesting")} sub={t("attestingSub")} />;
}
