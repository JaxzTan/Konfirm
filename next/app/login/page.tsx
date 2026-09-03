import Link from "next/link";
import { createTranslator } from "next-intl";

import { GoogleLogin } from "@/app/components/GoogleLogin";
import { headingFont, messagesByLocale, resolveLocale, TIME_ZONE } from "@/lib/locale";

/**
 * Screen 14. Drawn as an ink block over a cream block rather than a split
 * screen: globals.css pushes every Tailwind breakpoint out of reach, so the
 * app is 440px at every window size and a two-column layout can never fire.
 * (Handoff: known gap #1 — resolved here by committing to the stacked form.)
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const locale = resolveLocale(params.lang);
  const heading = headingFont(locale);

  const t = createTranslator({
    locale,
    timeZone: TIME_ZONE,
    messages: messagesByLocale[locale],
    namespace: "App",
  });

  return (
    <div className="grid min-h-full flex-1 grid-rows-[auto_1fr]">
      <div className="grid gap-[14px] bg-[#0f2e23] px-[22px] pb-[34px] pt-[26px]">
        <Link href={`/?lang=${locale}`} className="text-[19px] text-[#f7f5ef] font-serif">
          Konfirm
        </Link>
        <h1 className={`text-[30px] leading-[1.25] text-[#f7f5ef] ${heading}`}>
          {t("loginHero")}
        </h1>
        <p className="text-[13.5px] leading-[1.55] text-[#9ca3af]">{t("loginHeroSub")}</p>
      </div>

      <div className="grid content-start gap-[14px] bg-[#f7f5ef] px-[22px] py-[30px]">
        <h2 className={`text-[22px] leading-[1.25] text-[#0f2e23] ${heading}`}>
          {t("loginTitle")}
        </h2>
        <p className="text-[14px] leading-[1.65] text-[#6b7280]">{t("loginSub")}</p>
        <GoogleLogin
          labels={{ signIn: t("google"), unavailable: t("errorTitle") }}
          redirectTo={`/?lang=${locale}`}
        />
      </div>
    </div>
  );
}
