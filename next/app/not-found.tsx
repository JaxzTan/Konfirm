import Link from "next/link";

import { btn } from "@/app/components/ui";

/** Handoff gap #5: `notFound()` on /card and /v used to hit the Next default. */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#f7f5ef] px-7 py-12 text-center">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-[#6b7280]">
        404
      </p>
      <h1 className="font-serif text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-[#0f2e23]">
        No record here
      </h1>
      <p className="max-w-[36ch] text-[14px] leading-[1.65] text-[#6b7280]">
        That verdict does not exist on-chain, or the link was copied
        incompletely. Check a message yourself instead.
      </p>
      <Link href="/" className={`${btn.solid} block max-w-[320px]`}>
        Konfirm a message
      </Link>
    </div>
  );
}
