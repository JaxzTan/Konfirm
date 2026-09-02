'use client';

import { useEffect, useState } from 'react';
import { useConnectWallet, useWallets } from '@mysten/dapp-kit';
import { isEnokiWallet } from '@mysten/enoki';
import { FcGoogle } from 'react-icons/fc';

import { useKonfirmIdentity } from '@/lib/signer';

export type GoogleLoginLabels = {
  signIn: string;
  unavailable: string;
};

/**
 * The app's only sign-in surface (P2 #1).
 *
 * Enoki registers its zkLogin wallet through the wallet-standard, so from
 * here it is an ordinary wallet connect — no zkLogin details leak into the
 * UI. We deliberately don't use dapp-kit's <ConnectButton />: it shows a
 * wallet picker full of terms ("connect", "wallet", "extension") that mean
 * nothing to the NFR-5 persona. One button, one provider, no jargon.
 *
 * Renders nothing once someone is signed in, so it can sit next to the
 * signed-in branch without either caller having to check.
 */
export function GoogleLogin({
  labels,
  className,
}: {
  labels: GoogleLoginLabels;
  className?: string;
}) {
  const { isSignedIn } = useKonfirmIdentity();
  const { mutate: connect, isPending } = useConnectWallet();

  // providers.tsx registers the Enoki wallet inside an effect, so during
  // SSR and the first client render there is legitimately no wallet yet.
  // Without this flag the "unavailable" message below would flash on every
  // page load before the button appears.
  const [registrationSettled, setRegistrationSettled] = useState(false);
  useEffect(() => setRegistrationSettled(true), []);

  // Enoki only registers a wallet for a provider configured in both
  // providers.tsx *and* the Enoki Portal. A missing wallet here is therefore
  // a config problem, not a user problem — hence the neutral message below
  // rather than a dead button that would fail on click.
  const wallet = useWallets()
    .filter(isEnokiWallet)
    .find((candidate) => candidate.provider === 'google');

  if (isSignedIn) return null;

  // No wallet *yet* vs. no wallet *at all* look identical here, so only the
  // settled case is treated as a configuration failure.
  if (!wallet) {
    if (!registrationSettled) {
      return (
        <button type="button" disabled className={className}>
          <FcGoogle className="w-6 h-6" />
          {labels.signIn}
        </button>
      );
    }
    return <p className="text-sm text-gray-500">{labels.unavailable}</p>;
  }

  return (
    <button
      type="button"
      onClick={() => connect({ wallet })}
      disabled={isPending}
      className={className}
    >
      <FcGoogle className="w-6 h-6" />
      {labels.signIn}
    </button>
  );
}
