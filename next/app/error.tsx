"use client";

import { useEffect } from "react";

import { btn } from "@/app/components/ui";

/** Handoff gap #5. Mirrors screen 08: mono error box on the false tint. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#f7f5ef] px-7 py-12 text-center">
      <h1 className="font-serif text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-[#0f2e23]">
        Something broke
      </h1>
      <p className="w-full break-all rounded-[10px] border border-[#f2d5cc] bg-[#fdf0ed] px-[14px] py-3 text-left font-mono text-[11.5px] leading-[1.5] text-[#6b3527]">
        {error.digest ? `digest ${error.digest}` : error.message}
      </p>
      <button type="button" onClick={reset} className={`${btn.solid} max-w-[320px]`}>
        Try again
      </button>
    </div>
  );
}
