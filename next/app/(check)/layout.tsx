import { Suspense } from "react";
import type { ReactNode } from "react";

import { Shell } from "./Shell";

/**
 * Wraps every screen in the check flow. The layout is not remounted when the
 * user moves between its children, which is what lets the flow state in
 * flow.tsx survive /checking → /signin → /confirm → /loading → /result.
 */
export default function CheckLayout({ children }: { children: ReactNode }) {
  // useSearchParams inside Shell needs a Suspense boundary above it.
  return (
    <Suspense>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
