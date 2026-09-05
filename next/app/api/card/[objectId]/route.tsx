import { ImageResponse } from "next/og";

import { getCard, type Card } from "@/lib/card";
import { messagesByLocale, resolveLocale, type Locale } from "@/lib/locale";

/** Square: forwards as a photo in a WhatsApp thread without being cropped. */
const SIZE = 1080;

/** Old-Safari UA. Google Fonts serves woff2 to anything modern, and Satori
 *  reads only ttf/otf/woff — asking as a 2011 browser is what gets a woff. */
const TTF_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.30 (KHTML, like Gecko) Version/5.1 Safari/534.30";

/**
 * Fetches a font containing *only* the glyphs this card uses.
 *
 * The `text=` parameter is what makes 中文 viable at all: a full Noto Serif SC
 * is several megabytes and ImageResponse caps the whole bundle at 500KB, while
 * a subset covering one card's characters is a few kilobytes.
 *
 * Returns null on any failure. A card rendered in Satori's built-in font is
 * worse-looking but still readable in Latin; a 500 helps nobody.
 */
async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const query = `family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await fetch(`https://fonts.googleapis.com/css2?${query}`, {
      headers: { "User-Agent": TTF_UA },
      next: { revalidate: 86_400 },
    });
    if (!css.ok) return null;

    const url = (await css.text()).match(/src:\s*url\((.+?)\)\s*format\('(?:truetype|opentype|woff)'\)/)?.[1];
    if (!url) return null;

    const font = await fetch(url, { next: { revalidate: 86_400 } });
    if (!font.ok) return null;
    return await font.arrayBuffer();
  } catch {
    return null;
  }
}

const COLOR = {
  ground: "#0f2e23",
  cream: "#f7f5ef",
  muted: "#9ca3af",
  amber: "#c98a3a",
  good: "#5fbf8f",
  bad: "#e08a6f",
} as const;

/** Satori supports flexbox only — no `display: grid`, which the HTML card at
 *  /card/[objectId] uses throughout. Hence a parallel layout rather than a
 *  shared component. The *content* still comes from one place (lib/card.ts). */
function CardImage({
  card,
  headline,
  claimLabel,
  body,
  warnLabel,
  verifyUrl,
}: {
  card: Card;
  headline: string;
  claimLabel: string;
  body: string;
  warnLabel: string;
  verifyUrl: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: COLOR.ground,
        backgroundImage: `linear-gradient(180deg, ${COLOR.ground} 0%, #0b241b 100%)`,
        padding: 72,
      }}
    >
      {/* flex:1 + centred, so a short verdict sits in the middle of the card
          instead of stranding a third of the canvas as empty green. */}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 40, color: COLOR.cream, marginBottom: 8 }}>
          Konfirm
        </div>

        {card.claim ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: COLOR.muted }}>
              {claimLabel.toUpperCase()}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 12,
                fontSize: 30,
                lineHeight: 1.45,
                color: "rgba(247, 245, 239, 0.85)",
              }}
            >
              {/* Satori has no line-clamp, so the cut happens on the string. */}
              {card.claim.length > 160 ? `${card.claim.slice(0, 160)}…` : card.claim}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 84,
            lineHeight: 1.15,
            color: card.state === "true" ? COLOR.good : card.state === "false" ? COLOR.bad : COLOR.cream,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 32,
            lineHeight: 1.6,
            color: COLOR.cream,
          }}
        >
          {body.length > 220 ? `${body.slice(0, 220)}…` : body}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderTop: `2px dashed rgba(247, 245, 239, 0.3)`,
          paddingTop: 26,
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: COLOR.muted }}>
          {warnLabel.toUpperCase()}
        </div>
        {/* 66 hex characters with no natural break point — without
            break-all this runs off the right edge of the canvas. */}
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 24,
            lineHeight: 1.4,
            color: COLOR.amber,
            wordBreak: "break-all",
          }}
        >
          {verifyUrl}
        </div>
      </div>
    </div>
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  const locale: Locale = resolveLocale(
    new URL(request.url).searchParams.get("lang") ?? undefined,
  );

  const card = await getCard(objectId);
  if (!card) return new Response("No such verdict.", { status: 404 });

  const m = messagesByLocale[locale].App;
  const headline =
    card.state === "true" ? m.verdictTrue : card.state === "false" ? m.verdictFalse : m.verdictUnverifiable;
  const body = card.description ?? m.cardBody;
  const claimLabel = m.claimChecked;
  const warnLabel = m.cardWarn;

  // `||` not `??`: an unset var reads as "" here, not undefined/null.
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://konfirm.my").replace(/^https?:\/\//, "");
  const verifyUrl = `${origin}/v/${card.objectId}`;

  // One request, subset to exactly what this card draws.
  const glyphs = `Konfirm${headline}${body}${card.claim}${claimLabel}${warnLabel}${verifyUrl}`.toUpperCase() +
    `Konfirm${headline}${body}${card.claim}${claimLabel}${warnLabel}${verifyUrl}`;
  // Chosen by content, not by `locale`: a zh claim can be opened at ?lang=en,
  // and Fraunces has no CJK glyphs — that combination is what renders tofu.
  const family = /[\u3400-\u9fff\uf900-\ufaff]/.test(glyphs) ? "Noto Serif SC" : "Fraunces";
  const data = await loadFont(family, 600, glyphs);

  return new ImageResponse(
    (
      <CardImage
        card={card}
        headline={headline}
        claimLabel={claimLabel}
        body={body}
        warnLabel={warnLabel}
        verifyUrl={verifyUrl}
      />
    ),
    {
      width: SIZE,
      height: SIZE,
      ...(data ? { fonts: [{ name: family, data, style: "normal" as const, weight: 600 as const }] } : {}),
      headers: {
        // A Verdict is immutable once written, and so is the blob behind it.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    },
  );
}
