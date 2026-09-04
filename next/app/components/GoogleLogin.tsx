"use client";

import { useRouter } from "next/navigation";
import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import { isEnokiWallet } from "@mysten/enoki";

// Google-only per PRD (see fix/login-google-only) — Enoki only registers a
// wallet for a provider that is configured in providers.tsx *and* enabled
// in the Enoki Portal, so this renders nothing if that isn't set up yet.
//
// Accepts either `onConnected` (a callback — only usable from a client
// component, e.g. app/page.tsx) or `redirectTo` (a plain string, safe to
// pass from a server component like app/login/page.tsx). Pass exactly one.
export function GoogleLogin({
  labels,
  onConnected,
  redirectTo,
}: {
  labels: { signIn: string; unavailable: string };
  onConnected?: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { mutate: connect, isPending } = useConnectWallet();

  const googleWallet = useWallets()
    .filter(isEnokiWallet)
    .find((wallet) => wallet.provider === "google");

  if (!googleWallet) {
    return (
      <p className="text-sm text-gray-500 text-center">{labels.unavailable}</p>
    );
  }

  const handleClick = () => {
    connect(
      { wallet: googleWallet },
      {
        onSuccess: () => {
          onConnected?.();
          if (redirectTo) router.push(redirectTo);
        },
      },
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-2xl px-6 py-4 font-bold text-base text-gray-900 shadow-sm hover:shadow-md transition disabled:opacity-60 disabled:cursor-progress"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Enoki ships the provider icon as a remote URL, not a local asset */}
      <img src={googleWallet.icon} alt="" width={20} height={20} />
      {isPending ? "Connecting..." : labels.signIn}
    </button>
  );
}
