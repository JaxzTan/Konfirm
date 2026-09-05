import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Fraunces,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
  Noto_Serif_SC,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { siteOrigin } from "@/lib/site-url";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Fraunces has no CJK glyphs, so zh headings would fall back to whatever the
// OS happens to have. This keeps the serif brand voice in Chinese instead of
// dropping to a sans fallback (handoff gap #2).
const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  // Required for any page's relative openGraph.images URL (e.g.
  // /card/[objectId] and /v/[objectId]) to resolve to something a link
  // unfurler (WhatsApp, Telegram, iMessage) can actually fetch.
  metadataBase: new URL(siteOrigin()),
  title: "Konfirm — Check It Before Send It",
  description:
    "Paste a message, link, or screenshot. Konfirm cross-checks it with 3 AI models and records the verdict on-chain so anyone can verify it independently.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex justify-center bg-[#1a1a1a]">
        <div className="w-full max-w-[440px] min-h-full bg-[var(--background)] flex flex-col">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
