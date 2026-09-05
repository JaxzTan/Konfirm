"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Transaction } from "@mysten/sui/transactions";

import { useKonfirmIdentity } from "@/lib/signer";
import { useSignAndExecuteTransaction } from "@/lib/sui/useSignAndExecuteTransaction";
import { computeClaimHash } from "@/lib/attest/claimHash";
import { rememberVerdict } from "@/lib/history/cache";
import { NO_SCORE } from "@/lib/sui/verdict";
import { messagesByLocale, TIME_ZONE, type Locale } from "@/lib/locale";
import { localizeVerdict, verdictFromApi, type Verdict } from "@/lib/fixtures";

export type Mode = "text" | "link" | "photo";

/** VirusTotal's `scan-link` result — a security check, not an AI verdict. */
export type LinkCheck = {
  rating: "SAFE" | "CAUTION" | "SUSPICIOUS" | "DANGEROUS" | "INSUFFICIENT_DATA";
  score: number | null;
  significantTriggered: boolean;
  triggeredBy: string | null;
  maliciousDetections: number;
  suspiciousDetections: number;
  totalActiveVendors: number;
};

/** The 2-model Gemini image-authenticity check — separate signal from the text verdict. */
export type ImageCheck = {
  claim_verdict: string | null;
  trust_score: number | null;
  individual_responses: { model: string; verdict: string; green_flags: string[]; red_flags: string[] }[];
};

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
  mode: Mode;
  /** Path in the current locale — every internal link goes through this. */
  href: (path: string) => string;

  text: string;
  setText: (value: string) => void;
  photoDataUrl: string | null;
  photoPreview: string | null;
  setPhoto: (file: File | undefined) => void;

  verdict: Verdict | null;
  /** VirusTotal result for link mode — shown alongside, never blended into, the text verdict. */
  linkCheck: LinkCheck | null;
  /** Gemini image-authenticity result for photo mode — shown alongside, never blended into, the text verdict. */
  imageCheck: ImageCheck | null;
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
  // The input mode is the route (`/`, `/link`, `/photo`) while the user is on
  // an input screen. But check() immediately navigates to `/checking` (and
  // then `/result/…`), where the path no longer says which mode we came
  // from — so `checkMode` freezes that choice the moment check() fires, and
  // every downstream screen reads it instead of re-deriving from the path.
  const pathMode = modeFromPath(usePathname());
  const [checkMode, setCheckMode] = useState<Mode | null>(null);
  const mode = checkMode ?? pathMode;
  const { isSignedIn, address } = useKonfirmIdentity();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [text, setText] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [linkCheck, setLinkCheck] = useState<LinkCheck | null>(null);
  const [imageCheck, setImageCheck] = useState<ImageCheck | null>(null);
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
    setLinkCheck(null);
    setImageCheck(null);
    setObjectId(null);
    setError(null);
    setCheckMode(null);
    go("/");
  };

  const check = async () => {
    setError(null);
    setLinkCheck(null);
    setImageCheck(null);
    setCheckMode(mode);
    go("/checking");

    try {
      // Link mode asks a different question entirely — "is this domain
      // malicious", not "is this claim true" — so it never touches the AI
      // claim pipeline and never goes to confirm/signin/attest: there is no
      // claim verdict to put on-chain.
      if (mode === "link") {
        const scan = await fetch("/api/scan-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: text }),
        });
        const scanBody = await scan.json();
        if (!scanBody.success) throw new Error(scanBody.error ?? "Link scan failed.");
        setLinkCheck(scanBody.data);
        go("/result/link");
        return;
      }

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

      // Image authenticity is a separate question from "is the claim true" —
      // run it alongside the text verdict, never blended into it.
      const imageSideCheck =
        mode === "photo" && photoDataUrl
          ? fetch("/api/verify-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageBase64: photoDataUrl, language: locale }),
            })
              .then((r) => r.json())
              .then((r) => (r.success ? setImageCheck(r.data) : null))
              .catch((cause) => console.error("Image check failed:", cause))
          : Promise.resolve();

      const [response] = await Promise.all([
        fetch("/api/verdict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: claimText, language: locale }),
        }),
        imageSideCheck,
      ]);
      setVerdict(verdictFromApi(await response.json(), t, locale));

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
        body: JSON.stringify({ lang: locale, result: verdict, claim: text }),
      });
      // Parse defensively: a 500 can come back as an HTML error page, and a
      // raw SyntaxError here would bury the status code that explains it.
      const args = await attestResponse.json().catch(() => ({}));
      if (!attestResponse.ok) {
        throw new Error(args.error ?? `/api/attest returned ${attestResponse.status}`);
      }

      const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
      if (!packageId || !/^0x[0-9a-fA-F]{64}$/.test(packageId)) {
        throw new Error("NEXT_PUBLIC_PACKAGE_ID is missing or is not a 32-byte hex address.");
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::registry::create_verdict`,
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
          tx.object.clock(),
        ],
      });

      const { createdObjects } = await signAndExecute({ transaction: tx });
      const created = createdObjects.find((o) =>
        o.objectType.includes("::registry::Verdict"),
      );
      if (!created) {
        throw new Error("Transaction succeeded but no Verdict object was created.");
      }

      setObjectId(created.objectId);

      // Record it locally before navigating, so /history has something to
      // show on this device the moment the user opens it. The chain is still
      // the source of truth — this only saves the history page from waiting
      // on a fullnode query that may not have indexed the verdict yet.
      if (address) {
        rememberVerdict(address, {
          objectId: created.objectId,
          traceBlob: args.traceBlob,
          state: args.state,
          score: args.score === NO_SCORE ? null : args.score,
          savedAtMs: Date.now(),
        });
      }

      go(`/result/${verdict?.state ?? "false"}`);
    } catch (cause) {
      console.error("Attest failed:", cause);
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      go("/failed");
    }
  };

  // The verdict's prose is frozen in the locale it was generated in; the rest
  // of the screen follows the language switcher. Reconciling here means every
  // consumer reads one already-consistent verdict.
  const shownVerdict = useMemo(
    () => (verdict ? localizeVerdict(verdict, locale, t) : null),
    [verdict, locale, t],
  );

  const value: Flow = {
    locale,
    mode,
    href,
    text,
    setText,
    photoDataUrl,
    photoPreview,
    setPhoto,
    verdict: shownVerdict,
    linkCheck,
    imageCheck,
    objectId,
    error,
    check,
    attest,
    reset,
  };

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}
