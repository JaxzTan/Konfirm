import { notFound } from "next/navigation";
import { createTranslator } from "next-intl";

import ShareButtons from "./ShareButtons";
import { Warn } from "@/app/components/ui";
import { headingFont, messagesByLocale, resolveLocale, TIME_ZONE } from "@/lib/locale";
import { fetchOnChainVerdict, fetchTrace, STATE_VERDICT } from "@/lib/sui/verdict";

type Card = {
  objectId: string;
  /** "unclear" covers disputed/unverifiable/insufficient alike — this card
   *  has no room for that nuance, but it must not claim "false" when the
   *  models never actually reached a verdict. "view full result" is what
   *  /v/[objectId]'s real state breakdown is for. */
  state: "true" | "false" | "unclear";
  modelCount: number;
  /** Real per-verdict description from the Walrus trace, or null when the
   *  trace is unreadable — falls back to the generic string-table copy. */
  description: string | null;
  /** The message that was checked, from the same trace. Empty when the blob
   *  is unreadable, or when the record predates claims being archived. */
  claim: string;
};

/** Reads the real on-chain Verdict — same source /v/[objectId] uses. */
async function getCard(objectId: string): Promise<Card | null> {
  const onChain = await fetchOnChainVerdict(objectId);
  if (!onChain) return null;

  const trace = await fetchTrace(onChain.traceBlob);
  const traceState = trace?.state;
  const state: Card["state"] =
    traceState === "true" || traceState === "false"
      ? traceState
      : onChain.state === STATE_VERDICT && onChain.score !== null
        ? onChain.score >= 50
          ? "true"
          : "false"
        : "unclear";

  return {
    objectId: onChain.objectId,
    state,
    modelCount: onChain.modelCount,
    description: typeof trace?.description === "string" ? trace.description : null,
    claim: typeof trace?.claim === "string" ? trace.claim : "",
  };
}

/** Screen 15 — the screenshot-bait share card. */
export default async function CardPage({
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

  const card = await getCard(objectId);
  if (!card) notFound();

  const isTrue = card.state === "true";
  const headline =
    card.state === "true"
      ? t("verdictTrue")
      : card.state === "false"
        ? t("verdictFalse")
        : t("verdictUnverifiable");
  const verifyPath = `/v/${card.objectId}?lang=${locale}`;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://konfirm.my").replace(
    /^https?:\/\//,
    "",
  );
  const verifyUrl = `${origin}/v/${card.objectId}`;

  return (
    <div className="grid flex-1 content-center gap-[18px] bg-[#f7f5ef] px-5 py-[26px]">
      <div className="grid gap-4 rounded-[26px] bg-gradient-to-b from-[#0f2e23] to-[#0b241b] px-6 py-[26px]">
        <p className="font-serif text-[18px] text-[#f7f5ef]">Konfirm</p>

        {/* The claim first: a shared card that only says "false" without
            saying false about what is not worth screenshotting. */}
        {card.claim && (
          <div className="grid gap-[5px]">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ca3af]">
              {t("claimChecked")}
            </p>
            <p className="line-clamp-3 text-[13.5px] leading-[1.5] text-[#f7f5ef]/85">
              {card.claim}
            </p>
          </div>
        )}

        <h1
          className={`text-[34px] leading-[1.2] ${heading} ${
            isTrue ? "text-[#5fbf8f]" : "text-[#e08a6f]"
          }`}
        >
          {headline}
        </h1>

        <p className="text-[14.5px] leading-[1.65] text-white">
          {card.description ?? t("cardBody")}
        </p>

        {card.modelCount < 3 && (
          <Warn>{card.modelCount === 1 ? t("oneModel") : t("lowModels")}</Warn>
        )}

        <div className="grid gap-[6px] border-t border-dashed border-[#f7f5ef]/30 pt-[14px]">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ca3af]">
            {t("cardWarn")}
          </p>
          <p className="break-all font-mono text-[12.5px] text-[#c98a3a]">{verifyUrl}</p>
        </div>
      </div>

      <ShareButtons
        shareUrl={`https://${verifyUrl}`}
        shareText={`Konfirm — ${headline}.`}
        shareLabel={t("shareWa")}
        copyLabel={t("shareWa")}
        copiedLabel={t("copied")}
      />

      <a
        href={verifyPath}
        className="text-center text-[13.5px] text-[#0f2e23] underline"
      >
        {t("viewFull")}
      </a>
    </div>
  );
}
