"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Transaction } from "@mysten/sui/transactions";

import { AccountBadge } from "@/app/components/AccountBadge";
import { GoogleLogin } from "@/app/components/GoogleLogin";
import { useKonfirmIdentity } from "@/lib/signer";
import { useSignAndExecuteTransaction } from "@/lib/sui/useSignAndExecuteTransaction";
import { computeClaimHash } from "@/lib/attest/claimHash";
import enMessages from "@/messages/en.json";
import bmMessages from "@/messages/bm.json";
import zhMessages from "@/messages/zh.json";

const messagesByLocale = { en: enMessages, bm: bmMessages, zh: zhMessages };

type Locale = "en" | "bm" | "zh";

export default function Home() {
  const [lang, setLang] = useState<Locale>("en");

  return (
    <NextIntlClientProvider locale={lang} timeZone="Asia/Kuala_Lumpur" messages={messagesByLocale[lang]}>
      <HomeContent lang={lang} setLang={setLang} />
    </NextIntlClientProvider>
  );
}

function HomeContent({
  lang,
  setLang,
}: {
  lang: Locale;
  setLang: (lang: Locale) => void;
}) {
  const t = useTranslations("Home");
  const { isSignedIn } = useKonfirmIdentity();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [mode, setMode] = useState<"text" | "link" | "photo">("text");
  const [text, setText] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [isAttesting, setIsAttesting] = useState(false);
  const [attestError, setAttestError] = useState<string | null>(null);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handlePhotoSelect = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPhotoPreview(dataUrl);
      setPhotoDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const checkText = async (claimText: string) => {
    const response = await fetch("/api/verdict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: claimText, language: lang }),
    });
    return response.json();
  };

  const resetResult = () => {
    setShowResult(false);
    setNeedsLogin(false);
    setNeedsConfirm(false);
    setIsAttesting(false);
    setAttestError(null);
    setObjectId(null);
    setResult(null);
    setText("");
    setPhotoPreview(null);
    setPhotoDataUrl(null);
  };

  const handleCheck = async () => {
    setIsLoading(true);
    setShowResult(false);
    setNeedsLogin(false);

    try {
      let claimText = text;

      if (mode === "photo") {
        if (!photoDataUrl) return;
        const ocrResponse = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: photoDataUrl }),
        });
        const ocrData = await ocrResponse.json();
        claimText = ocrData.text;
        setText(claimText); // so it's visible if the user switches back to Text mode
      }

      const data = await checkText(claimText);
      setResult(data);
      // Already logged in from an earlier claim: skip straight to the
      // confirm step instead of re-prompting for a login that already happened.
      if (isSignedIn) {
        setNeedsConfirm(true);
      } else {
        setNeedsLogin(true);
      }
    } catch (error) {
      console.error("Error checking claim:", error);
      alert("Something went wrong — check the console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  // Enoki signs with no wallet confirmation popup (Enoki_setup.md gotcha
  // #1) — this screen is the only point where the user explicitly agrees
  // before a real, gas-sponsored on-chain write happens.
  useEffect(() => {
    if (needsLogin && isSignedIn) {
      setNeedsLogin(false);
      setNeedsConfirm(true);
    }
  }, [needsLogin, isSignedIn]);

  const handleAttest = async () => {
    setNeedsConfirm(false);
    setAttestError(null);
    setIsAttesting(true);

    try {
      const claimHash = await computeClaimHash(text, lang);

      const attestResponse = await fetch("/api/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, result }),
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
      const verdict = createdObjects.find((o) => o.objectType.endsWith("::registry::Verdict"));
      if (!verdict) {
        throw new Error("Transaction succeeded but no Verdict object was created.");
      }

      setObjectId(verdict.objectId);
      setShowResult(true);
    } catch (error) {
      console.error("Attest failed:", error);
      setAttestError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setIsAttesting(false);
    }
  };

  const modelWord = (count: number) => (count === 1 ? t("model") : t("models"));

  return (
    <div className="min-h-screen bg-[#f7f5ef]">
      <div className="bg-[#0f2e23] px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#c98a3a] flex items-center justify-center font-bold text-[#0f2e23]">
            K
          </div>
          <span className="text-white font-serif font-bold text-xl">Konfirm</span>
        </Link>
        <div className="flex items-center gap-4">
          {/* Renders nothing while signed out, so the header is unchanged
              for anyone who hasn't logged in. */}
          <AccountBadge
            labels={{ signedInAs: t("signedInAs"), signOut: t("signOut") }}
            className="hidden sm:flex items-center gap-3 text-xs text-gray-200"
          />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Locale)}
            className="text-xs text-gray-200 bg-white/10 px-3 py-1.5 rounded-full border-none outline-none cursor-pointer appearance-none pr-6"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23cfd8d2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
              backgroundSize: "12px",
            }}
          >
            <option value="en" className="text-black bg-white">EN</option>
            <option value="bm" className="text-black bg-white">BM</option>
            <option value="zh" className="text-black bg-white">中文</option>
          </select>
          <Link href={`/login?lang=${lang}`} className="text-sm text-gray-300 hover:text-white cursor-pointer">
          {t("signIn")}
          </Link>
      </div>
      </div>

      <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] px-4 sm:px-8 py-10 sm:py-16 text-center">
        <h1 className="text-white font-serif text-3xl sm:text-4xl font-bold mb-3">{t("heroTitle")}</h1>
        <p className="text-gray-300 text-sm max-w-md mx-auto">{t("heroSub")}</p>
      </div>

      {!showResult && !isLoading && !needsLogin && !needsConfirm && !isAttesting && !attestError && (
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
          <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-4">{t("whatToCheck")}</p>

          <div className="flex bg-[#f7f5ef] border border-gray-300 rounded-2xl p-1 mb-5">
            <button onClick={() => setMode("text")} className={`flex-1 py-3 rounded-xl font-bold ${mode === "text" ? "bg-[#1f4d3d] text-white" : "text-gray-600"}`}>{t("tabText")}</button>
            <button onClick={() => setMode("link")} className={`flex-1 py-3 rounded-xl font-bold ${mode === "link" ? "bg-[#1f4d3d] text-white" : "text-gray-600"}`}>{t("tabLink")}</button>
            <button onClick={() => setMode("photo")} className={`flex-1 py-3 rounded-xl font-bold ${mode === "photo" ? "bg-[#1f4d3d] text-white" : "text-gray-600"}`}>{t("tabPhoto")}</button>
          </div>

          {mode === "text" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              placeholder={t("placeholderText")}
              className="w-full min-h-[200px] border border-gray-300 rounded-2xl p-5 text-base bg-[#f7f5ef] text-[#16241f] placeholder:text-gray-400"
            />
          )}

          {mode === "link" && (
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholderLink")}
              className="w-full border border-gray-300 rounded-2xl p-5 text-base bg-[#f7f5ef] text-[#16241f] placeholder:text-gray-400"
            />
          )}

          {mode === "photo" && (
            <label className="w-full min-h-[200px] border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-3 bg-[#f7f5ef] cursor-pointer overflow-hidden">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
              />
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Selected screenshot"
                  className="max-h-[260px] w-auto object-contain rounded-xl"
                />
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-300 flex items-center justify-center text-2xl">
                    📎
                  </div>
                  <p className="font-semibold text-gray-900">{t("uploadPhoto")}</p>
                  <p className="text-sm text-gray-500">{t("uploadSub")}</p>
                </>
              )}
            </label>
          )}

          {mode === "text" && (
            <div className="flex justify-between text-xs text-gray-500 mt-2 mb-5">
              <span>{text.length} / 2000</span>
              <span>{text.length > 0 ? "Detected: —" : t("detecting")}</span>
            </div>
          )}

          <button
            onClick={handleCheck}
            disabled={mode === "photo" ? !photoDataUrl : !text.trim()}
            className="w-full bg-[#1f4d3d] text-white rounded-2xl py-4 font-bold text-base mt-4 disabled:bg-gray-400"
          >
            ✓ {t("checkNow")}
          </button>

          <p className="text-xs text-gray-500 mt-3">{t("checkedBy")}</p>
        </div>
      )}

      {isLoading && (
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-20 text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-[#1f4d3d] rounded-full animate-spin mx-auto mb-6"></div>
          <p className="font-semibold text-lg text-gray-900">{t("loadingTitle")}</p>
          <p className="text-gray-500 text-sm">{t("loadingSub")}</p>
        </div>
      )}

      {/* login is mandatory here — no result without it */}
      {needsLogin && (
        <div className="max-w-md mx-auto px-4 sm:px-8 py-12 sm:py-16 text-center">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-3">{t("loginGateTitle")}</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-8">{t("loginGateBody")}</p>
          {/* Only the login button lives here now — once signed in this
              screen hands off to the dedicated confirm-before-sign step
              below, rather than also housing the attest action itself. */}
          <GoogleLogin
            labels={{ signIn: t("continueGoogle"), unavailable: t("signInUnavailable") }}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-2xl px-6 py-4 font-bold text-base text-gray-900 shadow-sm hover:shadow-md transition disabled:opacity-60"
          />
        </div>
      )}

      {/* Enoki fires the transaction with no wallet popup — this click is
          the only place the user explicitly agrees before it's on-chain. */}
      {needsConfirm && (
        <div className="max-w-md mx-auto px-4 sm:px-8 py-12 sm:py-16 text-center">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-3">{t("confirmTitle")}</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-8">{t("confirmBody")}</p>
          <button
            onClick={handleAttest}
            className="w-full bg-[#1f4d3d] text-white rounded-2xl py-4 font-bold text-base mb-3"
          >
            {t("confirmButton")}
          </button>
          <button
            onClick={resetResult}
            className="w-full border border-gray-300 rounded-2xl py-4 font-bold text-base text-gray-900"
          >
            {t("cancelButton")}
          </button>
        </div>
      )}

      {isAttesting && (
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-20 text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-[#1f4d3d] rounded-full animate-spin mx-auto mb-6"></div>
          <p className="font-semibold text-lg text-gray-900">{t("attestingTitle")}</p>
          <p className="text-gray-500 text-sm">{t("attestingSub")}</p>
        </div>
      )}

      {attestError && (
        <div className="max-w-md mx-auto px-4 sm:px-8 py-12 sm:py-16 text-center">
          <h2 className="font-serif text-2xl font-bold text-gray-900 mb-3">{t("attestErrorTitle")}</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-8">{attestError}</p>
          <button
            onClick={handleAttest}
            className="w-full bg-[#1f4d3d] text-white rounded-2xl py-4 font-bold text-base mb-3"
          >
            {t("retry")}
          </button>
          <button
            onClick={resetResult}
            className="w-full border border-gray-300 rounded-2xl py-4 font-bold text-base text-gray-900"
          >
            {t("checkAnother")}
          </button>
        </div>
      )}

      {showResult && result && (
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 sm:py-10">
          <div className="rounded-2xl overflow-hidden border border-gray-300">

            {(result.state === "true" || result.state === "false") && (
              <>
                <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] p-5 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 mb-4">
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center relative shrink-0"
                      style={{
                        background: `conic-gradient(${result.state === "true" ? "#2c7a52" : "#b8442f"} 0% ${result.score}%, rgba(255,255,255,0.12) ${result.score}% 100%)`,
                      }}
                    >
                      <div className="w-[76px] h-[76px] rounded-full bg-[#0f2e23] flex items-center justify-center">
                        <span className="text-white font-bold text-2xl">
                          {result.score}
                          <span className="text-sm font-medium opacity-70">%</span>
                        </span>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-white font-serif text-2xl font-bold mb-1">{result.verdict}</h2>
                      <p className="text-gray-300 text-sm max-w-sm">{result.description}</p>
                    </div>
                  </div>
                  <div className="bg-white/10 border border-white/10 rounded-lg px-4 py-3">
                    <span className="text-white font-bold text-sm">{t("highConfidence")}</span>
                    <span className="text-gray-300 text-sm"> · {result.modelCount} {t("modelsAgree")}</span>
                  </div>

                  {result.modelCount < 3 && (
                    <div className="bg-[#c98a3a]/20 border border-[#c98a3a]/40 rounded-lg px-4 py-2.5 mt-3">
                      <span className="text-[#f0d9a8] text-sm font-semibold">
                        ⚠ {t("onlyModelsParticipated", { count: result.modelCount, modelWord: modelWord(result.modelCount) })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-white p-5 sm:p-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("keySignals")}</p>
                      <div className="flex flex-col gap-2">
                        {result.flags.map((flag: string, i: number) => (
                          <div
                            key={i}
                            className={`border rounded-lg p-3 text-sm ${
                              result.state === "true"
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
                        {result.models.map((model: any) => (
                          <div key={model.name} className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-sm text-gray-900">{model.name}</span>
                              <span
                                className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                                  result.state === "true"
                                    ? "bg-[#edf7f0] text-[#2c7a52]"
                                    : "bg-[#fdf0ed] text-[#b8442f]"
                                }`}
                              >
                                {model.score}%
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 mb-2">{model.reasoning}</p>
                            <div className="border-t border-dashed border-gray-300 pt-1.5">
                              <span className="text-[10px] font-mono text-gray-400">{t("requestId")}: {model.requestId}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <Link
                      href={`/card/${objectId}?lang=${lang}`}
                      className="flex-1 bg-[#1f4d3d] text-white rounded-xl py-3.5 font-bold text-sm flex items-center justify-center"
                      >
                      {t("share")}
                    </Link>
                    <button
                      onClick={resetResult}
                      className="flex-1 border border-gray-300 rounded-xl py-3.5 font-bold text-sm text-gray-900"
                    >
                      {t("checkAnother")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* models disagree — no score, show both sides */}
            {result.state === "disputed" && (
              <>
                <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] p-5 sm:p-8">
                  <h2 className="text-white font-serif text-2xl font-bold mb-2">{result.title}</h2>
                  <p className="text-gray-300 text-sm max-w-md">{result.description}</p>

                  {result.modelCount < 3 && (
                    <div className="bg-[#c98a3a]/20 border border-[#c98a3a]/40 rounded-lg px-4 py-2.5 mt-4">
                      <span className="text-[#f0d9a8] text-sm font-semibold">
                        ⚠ {t("onlyModelsParticipated", { count: result.modelCount, modelWord: modelWord(result.modelCount) })}
                      </span>
                    </div>
                  )}
                </div>
                <div className="bg-white p-5 sm:p-8">
                  <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("twoPositions")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {result.positions.map((pos: any, i: number) => (
                      <div
                        key={i}
                        className={`border rounded-xl p-4 ${
                          pos.stance === "Likely True"
                            ? "bg-[#edf7f0] border-[#cfe3d6]"
                            : "bg-[#fdf0ed] border-[#f2d5cc]"
                        }`}
                      >
                        <h3
                          className={`font-bold text-base mb-1 ${
                            pos.stance === "Likely True" ? "text-[#1f5738]" : "text-[#6b3527]"
                          }`}
                        >
                          {pos.stance}
                        </h3>
                        <p className="text-xs text-gray-600 mb-2">{pos.models.join(", ")}</p>
                        <p className="text-sm text-gray-700">{pos.reasoning}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href={`/card/${objectId}?lang=${lang}`}
                      className="flex-1 bg-[#1f4d3d] text-white rounded-xl py-3.5 font-bold text-sm flex items-center justify-center"
                    >
                      {t("share")}
                    </Link>
                    <button
                      onClick={resetResult}
                      className="flex-1 border border-gray-300 rounded-xl py-3.5 font-bold text-sm text-gray-900"
                    >
                      {t("checkAnother")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {result.state === "unverifiable" && (
              <>
                <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] p-5 sm:p-8">
                  <h2 className="text-white font-serif text-2xl font-bold mb-2">{result.title}</h2>
                  <p className="text-gray-300 text-sm max-w-md">{result.description}</p>

                  {result.modelCount < 3 && (
                    <div className="bg-[#c98a3a]/20 border border-[#c98a3a]/40 rounded-lg px-4 py-2.5 mt-4">
                      <span className="text-[#f0d9a8] text-sm font-semibold">
                        ⚠ {t("onlyModelsParticipated", { count: result.modelCount, modelWord: modelWord(result.modelCount) })}
                      </span>
                    </div>
                  )}
                </div>
                <div className="bg-white p-5 sm:p-8">
                  <div className="bg-[#f7f5ef] border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-gray-300 flex items-center justify-center text-2xl mx-auto mb-4">
                      ?
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-900">{t("notEnoughToJudge")}</h3>
                    <p className="text-sm text-gray-600 max-w-sm mx-auto">{result.note}</p>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <Link
                      href={`/card/${objectId}?lang=${lang}`}
                      className="flex-1 bg-[#1f4d3d] text-white rounded-xl py-3.5 font-bold text-sm flex items-center justify-center"
                    >
                      {t("share")}
                    </Link>
                    <button
                      onClick={resetResult}
                      className="flex-1 border border-gray-300 rounded-xl py-3.5 font-bold text-sm text-gray-900"
                    >
                      {t("checkAnother")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {result.state === "insufficient" && (
              <>
                <div className="bg-gradient-to-b from-[#0f2e23] to-[#1f4d3d] p-5 sm:p-8">
                  <h2 className="text-white font-serif text-2xl font-bold mb-2">{result.title}</h2>
                  <p className="text-gray-300 text-sm max-w-md mb-4">{result.description}</p>
                  <div className="bg-[#fdf5e8]/20 border border-[#ecd4a8]/40 rounded-lg px-4 py-3 flex items-center gap-2">
                    <span className="text-[#c98a3a] font-bold">⚠</span>
                    <span className="text-[#f0d9a8] text-sm font-semibold">
                      {result.timedOutModels.length} models timed out — only {result.respondedModel.name} responded
                    </span>
                  </div>
                </div>
                <div className="bg-white p-5 sm:p-8">
                  <div className="bg-[#f7f5ef] border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-gray-300 flex items-center justify-center text-2xl mx-auto mb-4">
                      ↻
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-gray-900">{t("tryCheckingAgain")}</h3>
                    <p className="text-sm text-gray-600 max-w-sm mx-auto">
                      {t("tryCheckingAgainSub")}
                    </p>
                  </div>

                  <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3">{t("whatWeFound")}</p>
                  <div className="bg-[#f7f5ef] border border-gray-300 rounded-lg p-3 mb-6">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-sm text-gray-900">{result.respondedModel.name}</span>
                      <span className="text-xs font-mono bg-[#fdf0ed] text-[#b8442f] px-2 py-0.5 rounded-full">
                        {result.respondedModel.score}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{result.respondedModel.reasoning}</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleCheck()}
                      className="flex-1 bg-[#1f4d3d] text-white rounded-xl py-3.5 font-bold text-sm"
                    >
                      ↻ {t("tryAgain")}
                    </button>
                    <button
                      onClick={resetResult}
                      className="flex-1 border border-gray-300 rounded-xl py-3.5 font-bold text-sm text-gray-900"
                    >
                      {t("checkAnother")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
