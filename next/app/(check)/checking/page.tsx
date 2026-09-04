"use client";

import { useTranslations } from "next-intl";

import { Spinner } from "@/app/components/ui";
import { useFlow } from "../flow";

/** Screen 04 — `/checking` */
export default function CheckingPage() {
  const t = useTranslations("App");
  const { locale, mode } = useFlow();
  return mode === "link" ? (
    <Spinner locale={locale} title={t("loadingLink")} sub={t("loadingLinkSub")} />
  ) : (
    <Spinner locale={locale} title={t("loading")} sub={t("loadingSub")} />
  );
}
