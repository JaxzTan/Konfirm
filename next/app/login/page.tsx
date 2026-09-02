import Link from "next/link";
import { createTranslator } from "next-intl";

import enMessages from "@/messages/en.json";
import bmMessages from "@/messages/bm.json";
import zhMessages from "@/messages/zh.json";
import { GoogleLogin } from "@/app/components/GoogleLogin";

const messagesByLocale = { en: enMessages, bm: bmMessages, zh: zhMessages };

type Locale = "en" | "bm" | "zh";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const locale = (["en", "bm", "zh"].includes(params.lang ?? "") ? params.lang : "en") as Locale;

  const t = createTranslator({
    locale,
    timeZone: "Asia/Kuala_Lumpur",
    messages: messagesByLocale[locale],
    namespace: "Login",
  });

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div className="bg-[#0f2e23] p-8 pt-24 sm:p-16 flex flex-col justify-center relative">
        <Link href="/" className="flex items-center gap-3 absolute top-8 left-8 sm:top-16 sm:left-16">
          <span className="text-white font-serif font-bold text-2xl">Konfirm</span>
        </Link>

        <h1 className="text-white font-serif text-3xl sm:text-5xl font-bold mb-6 max-w-md leading-tight">
          {t("leftHeadline")}
        </h1>
        <p className="text-gray-400 text-base max-w-sm leading-relaxed">
          {t("leftSub")}
        </p>
      </div>

      <div className="flex items-center justify-center p-8 sm:p-16 bg-[#f7f5ef]">
        <div className="w-full max-w-sm">
          <h2 className="font-serif text-3xl font-bold mb-2 text-gray-900">{t("rightHeading")}</h2>
          <p className="text-gray-600 text-base mb-8">{t("rightSub")}</p>

          <GoogleLogin label={t("continueGoogle")} redirectTo={`/home?lang=${locale}`} />
        </div>
      </div>
    </div>
  );
}
