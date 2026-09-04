import { VERDICT_STATES, type VerdictState } from "@/lib/fixtures";
import { ResultPanel } from "../../ResultPanel";

/**
 * `/result/false` · `/result/true` · `/result/disputed` ·
 * `/result/unverifiable` · `/result/insufficient`
 *
 * The five verdict shapes are a closed set, so they are enumerated here and
 * `dynamicParams = false` turns anything else into a real 404 at the routing
 * layer. Calling notFound() from the component instead renders the 404 page
 * but still answers 200: the (check) layout streams behind a Suspense
 * boundary, so the status is already on the wire by the time the page runs.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return VERDICT_STATES.map((state) => ({ state }));
}

export default async function ResultRoute({
  params,
}: {
  params: Promise<{ state: VerdictState }>;
}) {
  await params;
  return <ResultPanel />;
}
