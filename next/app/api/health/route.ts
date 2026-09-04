import { NextResponse } from "next/server";
import { EnokiClient } from "@mysten/enoki";
import { allowedMoveCallTargets } from "@/lib/enoki/sponsor";
import { suiClient, suiNetwork } from "@/lib/sui/client";

export const dynamic = "force-dynamic";

/**
 * Pre-demo self-check (TRD §9 item 9, P1 #9).
 *
 * Deliberately not a load-bearing endpoint: it answers "is anything
 * misconfigured right now" in one GET, so the failures that only show up
 * mid-demo — a republished Move package that nobody re-allowlisted, an Enoki
 * key scoped to the wrong network — show up before the demo instead.
 *
 * Two things TRD §9 asks for are not observable here and say so in the
 * response rather than being quietly dropped:
 *  - Sponsor SUI balance: gas comes from Enoki's pool, not an address we own,
 *    so there is no balance to read. A valid key plus a matching allowlist is
 *    the closest available proxy.
 *  - Gonka credit: the router exposes no balance endpoint, so this only
 *    reports whether the key is configured.
 */
type Check = { ok: boolean; detail: string };

async function checkEnoki(): Promise<Check> {
  const apiKey = process.env.ENOKI_SECRET_KEY;
  if (!apiKey) return { ok: false, detail: "ENOKI_SECRET_KEY is not set." };
  if (apiKey.startsWith("enoki_public")) {
    return { ok: false, detail: "ENOKI_SECRET_KEY holds a public key; sponsorship needs the private one." };
  }
  try {
    const app = await new EnokiClient({ apiKey }).getApp();
    const providers = app.authenticationProviders.map((p) => p.providerType);
    if (!providers.includes("google")) {
      return { ok: false, detail: "Enoki app has no Google auth provider registered." };
    }
    return { ok: true, detail: `Enoki app reachable; providers: ${providers.join(", ")}.` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Enoki app lookup failed." };
  }
}

async function checkPackage(): Promise<Check> {
  let targets: string[];
  try {
    targets = allowedMoveCallTargets();
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "PACKAGE_ID invalid." };
  }
  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID!;
  try {
    await suiClient.core.getObject({ objectId: packageId });
  } catch {
    return { ok: false, detail: `Package ${packageId} not found on ${suiNetwork}.` };
  }
  // Printed so it can be diffed against the Portal allowlist by eye — a
  // republish changes PACKAGE_ID and silently un-sponsors everything.
  return { ok: true, detail: `Allowlist these exactly: ${targets.join(" , ")}` };
}

export async function GET() {
  const [enoki, movePackage] = await Promise.all([checkEnoki(), checkPackage()]);

  const checks: Record<string, Check> = {
    enoki,
    movePackage,
    walrus: process.env.WALRUS_PUBLISHER
      ? { ok: true, detail: "WALRUS_PUBLISHER configured." }
      : { ok: false, detail: "WALRUS_PUBLISHER is not set; /api/attest will 500." },
    gonka: process.env.GONKA_ROUTER_API_KEY
      ? { ok: true, detail: "Key configured (no balance endpoint — check the dashboard)." }
      : { ok: false, detail: "GONKA_ROUTER_API_KEY is not set." },
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.endsWith(".apps.googleusercontent.com")
      ? { ok: true, detail: "Google client ID present." }
      : { ok: false, detail: "NEXT_PUBLIC_GOOGLE_CLIENT_ID missing or malformed." },
  };

  const ok = Object.values(checks).every((check) => check.ok);
  return NextResponse.json({ ok, network: suiNetwork, checks }, { status: ok ? 200 : 503 });
}
