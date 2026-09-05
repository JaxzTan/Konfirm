import Link from "next/link";
import { createTranslator } from "next-intl";

import { HistoryList } from "./HistoryList";
import { headingFont, messagesByLocale, resolveLocale, TIME_ZONE } from "@/lib/locale";

/**
 * The wallet's own record of what it has attested.
 *
 * Server component only for the locale plumbing — every other page in the app
 * resolves `?lang=` and builds its strings here, and the list underneath has
 * to be a client component because the address lives in the wallet session
 * (useKonfirmIdentity), which never exists on the server.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const locale = resolveLocale((await searchParams).lang);
  const heading = headingFont(locale);

  const t = createTranslator({
    locale,
    timeZone: TIME_ZONE,
    messages: messagesByLocale[locale],
    namespace: "App",
  });

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#f7f5ef]">
      <header className="flex items-center gap-3 bg-[#0f2e23] px-[18px] py-[14px]">
        <Link href={`/?lang=${locale}`} className="flex flex-1 items-center gap-[10px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c98a3a] text-[15px] font-bold text-[#0f2e23]">
            K
          </span>
          <span className={`text-[19px] text-[#f7f5ef] ${heading}`}>Konfirm</span>
        </Link>
      </header>

      <div className="grid content-start gap-[18px] px-[22px] py-[26px]">
        <div className="grid gap-[7px]">
          <h1 className={`text-[26px] leading-[1.25] text-[#0f2e23] ${heading}`}>
            {t("historyTitle")}
          </h1>
          <p className="text-[13.5px] leading-[1.6] text-[#6b7280]">{t("historySub")}</p>
        </div>

        <HistoryList
          locale={locale}
          labels={{
            signedOut: t("historySignedOut"),
            empty: t("historyEmpty"),
            loading: t("historyLoading"),
            offline: t("historyOffline"),
            pending: t("historyPending"),
            blob: t("historyBlob"),
            copy: t("historyCopy"),
            copied: t("historyCopied"),
            view: t("historyView"),
            challenges: (count: number) => t("historyChallenges", { count }),
            verdictTrue: t("verdictTrue"),
            verdictFalse: t("verdictFalse"),
            verdictDisputed: t("verdictDisputed"),
            verdictUnverifiable: t("verdictUnverifiable"),
            verdictInsufficient: t("verdictInsufficient"),
            signIn: t("google"),
          }}
        />
      </div>
    </div>
  );
}
