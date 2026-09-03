"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Transaction } from "@mysten/sui/transactions";

import { useKonfirmIdentity } from "@/lib/signer";
import { useSignAndExecuteTransaction } from "@/lib/sui/useSignAndExecuteTransaction";
import { computeClaimHash } from "@/lib/attest/claimHash";
import { messagesByLocale, TIME_ZONE, type Locale } from "@/lib/locale";
import { demoVerdict, verdictFromApi, type Verdict, type VerdictState } from "@/lib/fixtures";

export type Mode = "text" | "link" | "photo";

/**
 * Flow state for the whole check, held in the (check) route group's layout.
 *
 * Every screen is its own route — /checking, /confirm, /loading, /result/…
 * — so the claim, the verdict and the pending transaction cannot live in a
 * page. They live here instead: a layout is not remounted when you navigate
 * between its own children, so this survives every step of the flow and is
 * cleared only by reset().
 *
 * Landing on a mid-flow route directly (a shared link, a refresh) leaves this
 * empty, and the screen falls back to the fixture set from the design handoff
 * rather than erroring. That is what makes each designed screen reviewable
 * without walking the flow.
 */
type Flow = {
  locale: Locale;
  /** Path in the current locale — every internal link goes through this. */
  href: (path: string) => string;

  text: string;
  setText: (value: string) => void;
  photoDataUrl: string | null;
  photoPreview: string | null;
  setPhoto: (file: File | undefined) => void;

  verdict: Verdict | null;
  /** The live verdict if there is one, else the fixture for `fallback`. */
  verdictOr: (fallback: VerdictState) => Verdict;
  objectId: string | null;
  error: string | null;

  check: () => Promise<void>;
  attest: () => Promise<void>;
  reset: () => void;
};

const FlowContext = createContext<Flow | null>(null);

export function modeFromPath(pathname: string): Mode {
  if (pathname.startsWith("/link")) return "link";
  if (pathname.startsWith("/photo")) return "photo";
  return "text";
}

export function useFlow(): Flow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("useFlow must be used inside the (check) layout");
  return flow;
}

export function FlowProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone={TIME_ZONE}
      messages={messagesByLocale[locale]}
    >
      <Provider locale={locale}>{children}</Provider>
    </NextIntlClientProvider>
  );
}

function Provider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useTranslations("App");
  const router = useRouter();
  // The input mode is the route (`/`, `/link`, `/photo`), so check() reads it
  // off the path rather than the layout threading it down.
  const mode = modeFromPath(usePathname());
  const { isSignedIn } = useKonfirmIdentity();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [text, setText] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `?lang=` is the only locale carrier, so it has to be re-attached on every
  // navigation or the next screen silently reverts to English.
  const href = (path: string) =>
    locale === "en" ? path : `${path}${path.includes("?") ? "&" : "?"}lang=${locale}`;

  const go = (path: string) => router.push(href(path));

  const setPhoto = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoPreview(dataUrl);
      setPhotoDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setText("");
    setPhotoDataUrl(null);
    setPhotoPreview(null);
    setVerdict(null);
    setObjectId(null);
    setError(null);
    go("/");
  };

  const check = async () => {
    setError(null);
    go("/checking");

    try {
      let claimText = text;

      if (mode === "photo") {
        if (!photoDataUrl) return;
        const ocr = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: photoDataUrl }),
        });
        claimText = (await ocr.json()).text;
        setText(claimText); // visible if the user switches back to Text mode
      }

      const response = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: claimText, language: locale }),
      });
      setVerdict(verdictFromApi(await response.json(), t));

      // Signing in is not consent to publish, so a signed-in user still lands
      // on the confirm screen — they only skip the gate.
      go(isSignedIn ? "/confirm" : "/signin");
    } catch (cause) {
      console.error("Error checking claim:", cause);
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      go("/failed");
    }
  };

  const attest = async () => {
    setError(null);
    go("/loading");

    try {
      const claimHash = await computeClaimHash(text, locale);

      const attestResponse = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: locale, result: verdict }),
      });
      if (!attestResponse.ok) {
        const body = await attestResponse.json().catch(() => ({}));
        throw new Error(body.error ?? `/api/attest returned ${attestResponse.status}`);
      }
      const args = await attestResponse.json();

      const tx = new Transaction();
      tx.moveCall({
        target: `${process.env.NEXT_PUBLIC_PACKAGE_ID}::registry::create_verdict`,
        arguments: [
          tx.pure.vector("u8", claimHash),
          tx.pure.u8(args.lang),
          tx.pure.u8(args.state),
          tx.pure.u8(args.score),
          tx.pure.u8(args.spreadLo),
          tx.pure.u8(args.spreadHi),
          tx.pure.u8(args.confidence),
          tx.pure.u8(args.modelCount),
          tx.pure.vector("string", args.models),
          tx.pure.vector("string", args.requestIds),
          tx.pure.string(args.traceBlob),
          tx.object("0x6"), // Clock
        ],
      });

      const { createdObjects } = await signAndExecute({ transaction: tx });
      const created = createdObjects.find((o) =>
        o.objectType.endsWith("::registry::Verdict"),
      );
      if (!created) {
        throw new Error("Transaction succeeded but no Verdict object was created.");
      }

      setObjectId(created.objectId);
      go(`/result/${verdict?.state ?? "false"}`);
    } catch (cause) {
      console.error("Attest failed:", cause);
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      go("/failed");
    }
  };

  const value: Flow = {
    locale,
    href,
    text,
    setText,
    photoDataUrl,
    photoPreview,
    setPhoto,
    verdict,
    verdictOr: (fallback) => verdict ?? demoVerdict(fallback, t),
    objectId,
    error,
    check,
    attest,
    reset,
  };

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}
