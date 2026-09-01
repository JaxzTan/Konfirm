import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";
import ShareButtons from "./ShareButtons";

import enMessages from "@/messages/en.json";
import bmMessages from "@/messages/bm.json";
import zhMessages from "@/messages/zh.json";

const messagesByLocale = { en: enMessages, bm: bmMessages, zh: zhMessages };

type Locale = "en" | "bm" | "zh";

type Verdict = {
  objectId: string;
  state: "true" | "false" | "unavailable" | "insufficient";
  modelCount: number;
};

// TODO: replace with a real Sui fullnode read; headline/description come from
// Card.mockHeadline/mockDescription below since real content arrives pre-localized
async function getVerdict(objectId: string): Promise<Verdict | null> {
  if (!objectId) return null;

  return {
    objectId,
    state: "false",
    modelCount: 3,
  };
}

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { objectId } = await params;
  const searchParamsResolved = await searchParams;
  const locale = (["en", "bm", "zh"].includes(searchParamsResolved.lang ?? "")
    ? searchParamsResolved.lang
    : "en") as Locale;

  const t = createTranslator({
    locale,
    timeZone: "Asia/Kuala_Lumpur",
    messages: messagesByLocale[locale],
    namespace: "Card",
  });

  const verdict = await getVerdict(objectId);

  if (!verdict) notFound();

  const isTrue = verdict.state === "true";
  const headline = t("mockHeadline");
  const description = t("mockDescription");
  const verifyPath = `/v/${verdict.objectId}?lang=${locale}`;
  const verifyUrl =
    (process.env.NEXT_PUBLIC_SITE_URL ?? "https://konfirm.my") + verifyPath;

  return (
    <div className="min-h-screen bg-[#f7f5ef] flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md rounded-3xl p-6 sm:p-8 flex flex-col bg-[#0f2e23]">
        <span className="text-white font-serif font-bold text-2xl mb-6 sm:mb-8">Konfirm</span>

        <h1
          className={`font-serif font-bold text-3xl sm:text-4xl mb-4 ${
            isTrue ? "text-[#5fbf8f]" : "text-[#e08a6f]"
          }`}
        >
          {headline}
        </h1>

        <p className="text-white text-base leading-relaxed mb-8 sm:mb-10">{description}</p>

        {verdict.modelCount < 3 && (
          <div className="bg-[#c98a3a]/20 border border-[#c98a3a]/40 rounded-lg px-3 py-2 mb-6 self-start">
            <span className="text-[#f0d9a8] text-xs font-semibold">
              ⚠ {t("onlyModelsParticipated", { count: verdict.modelCount })}
            </span>
          </div>
        )}

        <div className="border-t border-dashed border-white/20 pt-4 flex flex-col gap-2 mt-auto">
          <span className="text-gray-400 text-[10px] uppercase tracking-wide leading-tight">
            {t("verifiedOnChain")}
          </span>
          <span className="text-[#c98a3a] text-xs font-mono break-all">{verifyUrl}</span>
        </div>
      </div>

      <div className="w-full max-w-md">
        <ShareButtons
          shareUrl={verifyUrl}
          shareText={`Konfirm checked this claim — ${headline}.`}
          shareLabel={t("shareToWhatsapp")}
          copyLabel={t("copyLink")}
          copiedLabel={t("copied")}
        />
        <a
          href={verifyPath}
          className="block text-center text-sm text-gray-600 mt-4 underline"
        >
          {t("viewFullVerdict")}
        </a>
      </div>
    </div>
  );
}
