import Link from "next/link";
import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";

import enMessages from "@/messages/en.json";
import bmMessages from "@/messages/bm.json";
import zhMessages from "@/messages/zh.json";

const messagesByLocale = { en: enMessages, bm: bmMessages, zh: zhMessages };

type Locale = "en" | "bm" | "zh";

type ModelResult = {
  model: string;
  requestId: string;
  score: number | null;
  reasoning: string;
};

type Verdict = {
  objectId: string;
  state: "true" | "false" | "unavailable" | "insufficient";
  score: number | null;
  description: string;
  claimText: string;
  modelCount: number;
  flags: string[];
  models: ModelResult[];
  challengeCount: number;
  createdAtMs: number;
};

const mockContent = {
  en: {
    claimText: "Bridge exploded reported near KL area.....",
    description: "This claim does not match any verified sources.",
    flags: ["No original source or date included", "Uses urgency language", "Claims a vague, unnamed source"],
    models: [
      { model: "DeepSeek", reasoning: "No credible source found supporting this claim." },
      { model: "Kimi", reasoning: "Contradicts established government information." },
      { model: "MiniMax", reasoning: "Found old timestamp on similar news, likely outdated." },
    ],
  },
  bm: {
    claimText: "Jambatan meletup dilaporkan berlaku berhampiran kawasan KL.....",
    description: "Dakwaan ini tidak sepadan dengan mana-mana sumber yang disahkan.",
    flags: ["Tiada sumber atau tarikh asal disertakan", "Menggunakan bahasa mendesak", "Mendakwa sumber yang samar dan tidak dinamakan"],
    models: [
      { model: "DeepSeek", reasoning: "Tiada sumber yang boleh dipercayai menyokong dakwaan ini." },
      { model: "Kimi", reasoning: "Bercanggah dengan maklumat rasmi kerajaan." },
      { model: "MiniMax", reasoning: "Menemui cap masa lama pada berita serupa, berkemungkinan lapuk." },
    ],
  },
  zh: {
    claimText: "有报道称吉隆坡地区附近发生桥梁爆炸.....",
    description: "此说法与任何已核实的来源都不相符。",
    flags: ["没有原始来源或日期", "使用紧急语气", "声称来自模糊、未具名的来源"],
    models: [
      { model: "DeepSeek", reasoning: "未找到可信来源支持此说法。" },
      { model: "Kimi", reasoning: "与政府官方信息相矛盾。" },
      { model: "MiniMax", reasoning: "发现类似新闻的旧时间戳，可能已过时。" },
    ],
  },
} as const;

// TODO: replace with a real Sui fullnode read; keep the return shape identical
async function getVerdict(objectId: string, locale: Locale): Promise<Verdict | null> {
  if (!objectId) return null;

  const content = mockContent[locale];
  const requestIds = ["gnk_01H8X3K9P2Q", "gnk_01H8X3K9Q4R", "gnk_01H8X3K9S7T"];
  const scores = [18, 25, 26];

  return {
    objectId,
    state: "false",
    score: 25,
    description: content.description,
    claimText: content.claimText,
    modelCount: 3,
    flags: [...content.flags],
    models: content.models.map((m, i) => ({
      model: m.model,
      requestId: requestIds[i],
      score: scores[i],
      reasoning: m.reasoning,
    })),
    challengeCount: 0,
    createdAtMs: Date.now() - 1000 * 60 * 60 * 3,
  };
}

export default async function VerifyPage({
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
    namespace: "Verify",
  });
  const modelWord = (count: number) => (count === 1 ? t("model") : t("models"));

  const verdict = await getVerdict(objectId, locale);

  if (!verdict) notFound();

  const isScored = verdict.state === "true" || verdict.state === "false";
  const explorerUrl = `https://suiscan.xyz/testnet/object/${verdict.objectId}`;
  const date = new Date(verdict.createdAtMs).toLocaleString(
    locale === "zh" ? "zh-CN" : locale === "bm" ? "ms-MY" : "en-MY",
    { dateStyle: "medium", timeStyle: "short" }
  );

  return (
    <div className="min-h-screen bg-[#f7f5ef]">
      <div className="bg-[#0f2e23] px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#c98a3a] flex items-center justify-center font-bold text-[#0f2e23]">
            K
          </div>
          <span className="text-white font-serif font-bold text-xl">Konfirm</span>
        </Link>
        <span className="text-gray-400 text-xs sm:text-sm text-right">{t("publicRecord")}</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="rounded-2xl overflow-hidden border border-gray-300">
          <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] p-5 sm:p-8">
            <p className="font-mono text-gray-400 text-xs uppercase tracking-widest mb-3">
              {t("resultFor")}: &quot;{verdict.claimText}&quot;
            </p>

            {isScored && verdict.score !== null && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 mb-4">
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: `conic-gradient(${
                      verdict.state === "true" ? "#2c7a52" : "#b8442f"
                    } 0% ${verdict.score}%, rgba(255,255,255,0.12) ${verdict.score}% 100%)`,
                  }}
                >
                  <div className="w-[76px] h-[76px] rounded-full bg-[#0f2e23] flex items-center justify-center">
                    <span className="text-white font-bold text-2xl">
                      {verdict.score}
                      <span className="text-sm font-medium opacity-70">%</span>
                    </span>
                  </div>
                </div>
                <div>
                  <h1 className="text-white font-serif text-2xl font-bold mb-1">
                    {verdict.state === "true"
                      ? messagesByLocale[locale].Home.likelyTrue
                      : messagesByLocale[locale].Home.likelyFalse}
                  </h1>
                  <p className="text-gray-300 text-sm max-w-sm">{verdict.description}</p>
                </div>
              </div>
            )}

            {!isScored && (
              <div className="mb-2">
                <h1 className="text-white font-serif text-2xl font-bold mb-1">{t("cantBeVerified")}</h1>
                <p className="text-gray-300 text-sm max-w-md">{verdict.description}</p>
              </div>
            )}

            {verdict.modelCount < 3 && (
              <div className="bg-[#c98a3a]/20 border border-[#c98a3a]/40 rounded-lg px-4 py-2.5 mt-3">
                <span className="text-[#f0d9a8] text-sm font-semibold">
                  ⚠ {t("onlyModelsParticipated", { count: verdict.modelCount, modelWord: modelWord(verdict.modelCount) })}
                </span>
              </div>
            )}

            <p className="text-gray-400 text-xs mt-4 leading-relaxed">
              {t("permanentRecordNote")}
            </p>
          </div>

          {isScored && (
            <div className="bg-white p-5 sm:p-8 border-b border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("keySignals")}</p>
                  <div className="flex flex-col gap-2">
                    {verdict.flags.map((flag, i) => (
                      <div
                        key={i}
                        className={`border rounded-lg p-3 text-sm ${
                          verdict.state === "true"
                            ? "bg-[#edf7f0] border-[#cfe3d6] text-[#1f5738]"
                            : "bg-[#fdf0ed] border-[#f2d5cc] text-[#6b3527]"
                        }`}
                      >
                        {flag}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("whatEachModelFound")}</p>
                  <div className="flex flex-col gap-2">
                    {verdict.models.map((m) => (
                      <div key={m.model} className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-sm text-gray-900">{m.model}</span>
                          {m.score !== null && (
                            <span className="text-xs font-mono bg-[#fdf0ed] text-[#b8442f] px-2 py-0.5 rounded-full">
                              {m.score}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{m.reasoning}</p>
                        <div className="border-t border-dashed border-gray-300 pt-1.5">
                          <span className="text-[10px] font-mono text-gray-400">
                            {t("requestId")}: {m.requestId}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white p-5 sm:p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("onChainRecord")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4">
              <div className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-1">{t("recordedOn")}</p>
                <p className="font-mono text-gray-900 font-medium">{date}</p>
              </div>
              <div className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-1">{t("publicDisputesFiled")}</p>
                <p className="text-gray-900 font-medium">{verdict.challengeCount}</p>
              </div>
            </div>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full border border-gray-300 rounded-xl py-3.5 font-bold text-sm text-gray-900 bg-white hover:bg-gray-50"
            >
              {t("viewOnExplorer")} ↗
            </a>
            <p className="text-xs text-gray-500 mt-3">
              {t("cannotBeEdited")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
