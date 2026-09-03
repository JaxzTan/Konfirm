import Link from "next/link";
import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";

import { Donut, Micro, Serif, SignalsAndModels, Warn, btn } from "@/app/components/ui";
import { demoVerdict } from "@/lib/fixtures";
import { headingFont, messagesByLocale, resolveLocale, TIME_ZONE } from "@/lib/locale";

// TODO: replace with a real Sui fullnode read (handoff gap #4). Until then
// the fixture set stands in, rendered in the requested locale.
async function getRecord(objectId: string) {
  if (!objectId) return null;
  return { objectId, disputes: 1, createdAtMs: Date.parse("2026-09-02T09:14:00+08:00") };
}

/** Screen 16 — the public record a share card points at. No login needed. */
export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ objectId: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { objectId } = await params;
  const locale = resolveLocale((await searchParams).lang);
  const heading = headingFont(locale);

  const t = createTranslator({
    locale,
    timeZone: TIME_ZONE,
    messages: messagesByLocale[locale],
    namespace: "App",
  });

  const record = await getRecord(objectId);
  if (!record) notFound();

  const verdict = demoVerdict("false", t);
  const explorerUrl = `https://suiscan.xyz/testnet/object/${record.objectId}`;
  const recordedAt = new Date(record.createdAtMs).toLocaleString(
    locale === "zh" ? "zh-CN" : locale === "bm" ? "ms-MY" : "en-MY",
    { dateStyle: "medium", timeStyle: "short", timeZone: TIME_ZONE },
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white">
      <header className="flex items-center gap-3 bg-[#0f2e23] px-[18px] py-[14px]">
        <Link href={`/?lang=${locale}`} className="flex flex-1 items-center gap-[10px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c98a3a] text-[15px] font-bold text-[#0f2e23]">
            K
          </span>
          <span className={`text-[19px] text-[#f7f5ef] ${heading}`}>Konfirm</span>
        </Link>
        <span className="text-right text-[12px] text-[#9ca3af]">{t("publicBadge")}</span>
      </header>

      <div className="grid gap-4 bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] px-5 py-[22px]">
        <div className="grid gap-[6px]">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#9ca3af]">
            {t("resultFor")}
          </p>
          <p className="text-[13.5px] leading-[1.6] text-[#f7f5ef]">
            &ldquo;{t("claim")}&rdquo;
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Donut score={verdict.score ?? 0} tone={verdict.tone} locale={locale} />
          <div className="grid gap-[7px]">
            <Serif locale={locale} size={24} className="text-[#f7f5ef]">
              {verdict.title}
            </Serif>
            <p className="text-[13.5px] leading-[1.55] text-[#9ca3af]">
              {verdict.description}
            </p>
          </div>
        </div>

        {verdict.modelCount < 3 && (
          <Warn>{verdict.modelCount === 1 ? t("oneModel") : t("lowModels")}</Warn>
        )}

        <p className="text-[12.5px] leading-[1.55] text-[#9ca3af]">{t("permanence")}</p>
      </div>

      <div className="grid gap-[18px] bg-white p-5">
        <SignalsAndModels
          labels={{ signals: t("mKeySignals"), models: t("mModels") }}
          signals={verdict.signals}
          tone={verdict.tone}
          models={verdict.models}
        />
      </div>

      <div className="grid gap-[14px] border-t border-[#d1d5db] bg-white p-5">
        <Micro>{t("mChain")}</Micro>
        <div className="grid grid-cols-2 gap-[10px]">
          <div className="grid gap-[5px] rounded-xl border border-[#d1d5db] p-[14px]">
            <p className="text-[12px] text-[#6b7280]">{t("recordedOn")}</p>
            <p className="text-[14px] font-semibold text-[#0f2e23]">{recordedAt}</p>
          </div>
          <div className="grid gap-[5px] rounded-xl border border-[#d1d5db] p-[14px]">
            <p className="text-[12px] text-[#6b7280]">{t("disputes")}</p>
            <p className="text-[14px] font-semibold text-[#0f2e23]">{record.disputes}</p>
          </div>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn.outline} block`}
        >
          {t("explorer")}
        </a>
        <p className="text-center text-[12px] leading-[1.5] text-[#6b7280]">
          {t("immutable")}
        </p>
      </div>
    </div>
  );
}
