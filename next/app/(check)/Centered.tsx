"use client";

import type { ReactNode } from "react";

import { Serif } from "@/app/components/ui";
import { useFlow } from "./flow";

/** Shared frame for screens 05, 06 and 08. */
export function Centered({
  title,
  body,
  children,
}: {
  title: string;
  body?: ReactNode;
  children: ReactNode;
}) {
  const { locale } = useFlow();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 py-12 text-center">
      <Serif locale={locale} size={24} className="text-[#0f2e23]">
        {title}
      </Serif>
      {body}
      {children}
    </div>
  );
}
