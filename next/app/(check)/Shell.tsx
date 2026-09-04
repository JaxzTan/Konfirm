"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { resolveLocale } from "@/lib/locale";
import { Chrome } from "./Chrome";
import { FlowProvider } from "./flow";

/**
 * Client half of the (check) layout. The locale is read here rather than in
 * layout.tsx because a Next.js layout never receives searchParams — only
 * pages do — and `?lang=` has to be readable from the shared chrome.
 */
export function Shell({ children }: { children: ReactNode }) {
  const locale = resolveLocale(useSearchParams().get("lang") ?? undefined);

  return (
    <FlowProvider locale={locale}>
      <div className="flex min-h-full flex-1 flex-col bg-white">
        <Chrome />
        {children}
      </div>
    </FlowProvider>
  );
}
