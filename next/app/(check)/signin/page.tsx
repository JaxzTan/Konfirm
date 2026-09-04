"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { GoogleLogin } from "@/app/components/GoogleLogin";
import { useKonfirmIdentity } from "@/lib/signer";
import { Centered } from "../Centered";
import { useFlow } from "../flow";

/**
 * Screen 05 — `/signin`. The result is never rendered before this.
 *
 * Distinct from `/login`, which is the standalone entry point: this is the
 * mid-flow gate, and it hands off to /confirm rather than back to the home
 * screen. Signing in is not consent to publish.
 */
export default function SignInPage() {
  const t = useTranslations("App");
  const { isSignedIn } = useKonfirmIdentity();
  const { href } = useFlow();
  const router = useRouter();

  // Someone who signed in earlier should not be asked again.
  useEffect(() => {
    if (isSignedIn) router.push(href("/confirm"));
  }, [isSignedIn, href, router]);

  return (
    <Centered
      title={t("gateTitle")}
      body={<p className="text-[14px] leading-[1.65] text-[#6b7280]">{t("gateBody")}</p>}
    >
      <div className="w-full max-w-[320px]">
        <GoogleLogin
          labels={{ signIn: t("google"), unavailable: t("errorTitle") }}
          redirectTo={href("/confirm")}
        />
      </div>
    </Centered>
  );
}
