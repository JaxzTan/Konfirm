"use client";

import { useTranslations } from "next-intl";

import { Spinner } from "@/app/components/ui";
import { useFlow } from "../flow";

/** Screen 07 — `/attesting` */
export default function AttestingPage() {
  const t = useTranslations("App");
  const { locale } = useFlow();
  return <Spinner locale={locale} title={t("attesting")} sub={t("attestingSub")} />;
}
