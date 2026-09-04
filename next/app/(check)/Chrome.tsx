"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AccountBadge } from "@/app/components/AccountBadge";
import { useKonfirmIdentity } from "@/lib/signer";
import { headingFont, LOCALES, type Locale } from "@/lib/locale";
import { useFlow } from "./flow";

/**
 * Header + hero, shared by every screen in the flow. Lives in the layout so
 * it is not remounted on navigation — the language select and the account
 * badge keep their state as the user moves between routes.
 */
export function Chrome() {
  const t = useTranslations("App");
  const { locale, href } = useFlow();
  const { isSignedIn } = useKonfirmIdentity();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const heading = headingFont(locale);

  // Switching language keeps you on the screen you are looking at.
  const switchLocale = (next: Locale) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "en") params.delete("lang");
    else params.set("lang", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <header className="bg-[#0f2e23] px-[18px] py-[14px]">
        <div className="flex items-center gap-3">
          <Link href={href("/")} className="flex flex-1 items-center gap-[10px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#c98a3a] text-[15px] font-bold text-[#0f2e23]">
              K
            </span>
            <span className={`text-[19px] text-[#f7f5ef] ${heading}`}>Konfirm</span>
          </Link>

          <label className="relative">
            <span className="sr-only">Language</span>
            <select
              value={locale}
              onChange={(e) => switchLocale(e.target.value as Locale)}
              className="cursor-pointer appearance-none rounded-full bg-[#f7f5ef]/10 py-[5px] pl-[11px] pr-[22px] text-[12px] text-[#f7f5ef] outline-none focus-visible:ring-2 focus-visible:ring-[#c98a3a]"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 7px center",
                backgroundSize: "10px",
              }}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l} className="bg-white text-black">
                  {l === "en" ? "EN" : l === "bm" ? "BM" : "中文"}
                </option>
              ))}
            </select>
          </label>

          {!isSignedIn && (
            <Link
              href={href("/login")}
              className="text-[13px] text-[#9ca3af] hover:text-[#f7f5ef]"
            >
              {t("signIn")}
            </Link>
          )}
        </div>

        {/* Own row, right-aligned — renders nothing while signed out
            (AccountBadge returns null), so this only ever takes up space
            once there's something to show. Kept off the top row so the
            address text never competes for width with the logo or the
            language selector. */}
        <AccountBadge
          labels={{ signedInAs: t("signedInAs"), signOut: t("signOut") }}
          className="mt-2 flex items-center justify-end gap-2 text-[12px] text-[#9ca3af]"
        />
      </header>

      <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] px-[22px] pb-[34px] pt-[30px] text-center">
        <h1 className={`text-[28px] text-[#f7f5ef] ${heading}`}>{t("heroTitle")}</h1>
        <p className="mt-3 text-[13.5px] leading-[1.55] text-[#9ca3af]">{t("heroSub")}</p>
      </div>
    </>
  );
}
