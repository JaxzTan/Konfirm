"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Micro, btn } from "@/app/components/ui";
import { useFlow, type Mode } from "./flow";

const MODES: { mode: Mode; path: string }[] = [
  { mode: "text", path: "/" },
  { mode: "link", path: "/link" },
  { mode: "photo", path: "/photo" },
];

/** Screens 01–03. The active tab is the route, so the tabs are plain links. */
export function InputBody({ mode }: { mode: Mode }) {
  const t = useTranslations("App");
  const { text, setText, photoDataUrl, photoPreview, setPhoto, check, href } = useFlow();
  const canCheck = mode === "photo" ? !!photoDataUrl : !!text.trim();

  return (
    <div className="grid flex-1 content-start gap-4 px-5 py-[22px]">
      <Micro>{t("inputLabel")}</Micro>

      <div className="flex gap-1 rounded-full bg-[#ece9e0] p-1">
        {MODES.map((m, i) => (
          <Link
            key={m.mode}
            href={href(m.path)}
            aria-current={mode === m.mode ? "page" : undefined}
            className={`flex-1 rounded-full py-[9px] text-center text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f4d3d] ${
              mode === m.mode ? "bg-[#1f4d3d] text-[#f7f5ef]" : "text-[#6b7280]"
            }`}
          >
            {(t.raw("seg") as string[])[i]}
          </Link>
        ))}
      </div>

      {mode === "text" && (
        <div className="grid gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={t("claim")}
            className="min-h-[176px] rounded-xl border border-[#d1d5db] bg-[#f7f5ef] px-[15px] py-[14px] text-[14.5px] leading-[1.65] text-[#0f2e23] placeholder:text-[#9ca3af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f4d3d]"
          />
          <div className="flex justify-between text-[12px] text-[#6b7280]">
            <span className="font-mono">{text.length} / 2000</span>
            <span>{t("autodetect")}</span>
          </div>
        </div>
      )}

      {mode === "link" && (
        <div className="grid gap-2">
          <input
            type="url"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="https://viralnews.my/kkm-lemon-cure"
            className="truncate rounded-xl border border-[#d1d5db] bg-[#f7f5ef] p-[15px] font-mono text-[14.5px] text-[#0f2e23] placeholder:text-[#9ca3af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f4d3d]"
          />
          <p className="text-[12px] text-[#6b7280]">{t("linkHint")}</p>
        </div>
      )}

      {mode === "photo" && (
        <label className="grid min-h-[176px] cursor-pointer place-content-center justify-items-center gap-[10px] rounded-xl border border-dashed border-[#d1d5db] bg-[#f7f5ef] p-5 text-center focus-within:ring-2 focus-within:ring-[#1f4d3d]">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setPhoto(e.target.files?.[0])}
          />
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local FileReader data URL, never a remote asset
            <img
              src={photoPreview}
              alt=""
              className="max-h-[240px] w-auto rounded-lg object-contain"
            />
          ) : (
            <>
              <span className="grid h-10 w-10 place-content-center rounded-xl bg-[#ece9e0] text-[18px]">
                📎
              </span>
              <span className="text-[14.5px] font-semibold text-[#0f2e23]">
                {t("photoTitle")}
              </span>
              <span className="max-w-[32ch] text-[12.5px] leading-[1.55] text-[#6b7280]">
                {t("photoSub")}
              </span>
            </>
          )}
        </label>
      )}

      <button
        type="button"
        onClick={check}
        disabled={!canCheck}
        className={canCheck ? btn.solid : btn.disabled}
      >
        {t("cta")}
      </button>

      <p className="text-center text-[12px] leading-[1.5] text-[#6b7280]">
        {t("footnote")}
      </p>
    </div>
  );
}
