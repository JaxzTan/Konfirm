'use client';

import { useCallback } from 'react';
import { useCurrentAccount, useDisconnectWallet } from '@mysten/dapp-kit';

/**
 * The app's single view of "who is signed in" (P2 #2).
 *
 * Everything above this hook works in terms of an address and a sign-out
 * action. Nothing else in the app should reach for `useCurrentAccount` /
 * `useDisconnectWallet` directly — keeping those two calls in one place is
 * what lets the wallet layer change (Enoki today, something else later)
 * without touching the UI.
 *
 * Note there is no `signIn` here on purpose: signing in needs a specific
 * wallet to connect to, which is `<GoogleLogin />`'s job. This hook only
 * reports the resulting session.
 */
export type KonfirmIdentity = {
  /** zkLogin address for the signed-in user, or null when signed out. */
  address: string | null;
  isSignedIn: boolean;
  signOut: () => void;
  isSigningOut: boolean;
};

export function useKonfirmIdentity(): KonfirmIdentity {
  const account = useCurrentAccount();
  const { mutate: disconnect, isPending } = useDisconnectWallet();

  const signOut = useCallback(() => disconnect(), [disconnect]);

  return {
    address: account?.address ?? null,
    isSignedIn: account != null,
    signOut,
    isSigningOut: isPending,
  };
}

/**
 * `0x1234…cdef`. Sui addresses are 66 characters, which no persona in NFR-5
 * is going to read — this is only ever a recognition aid ("is this the same
 * account as last time?"), never something to copy from.
 */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
