'use client';

import { shortenAddress, useKonfirmIdentity } from '@/lib/signer';

export type AccountBadgeLabels = {
  signedInAs: string;
  signOut: string;
};

/**
 * Shows who is signed in, plus the way back out (P2 #6).
 *
 * Renders nothing while signed out. The address is shown because with
 * zkLogin there is no other visible sign that login worked — there's no
 * wallet extension, no popup on signing, nothing. Seeing the same short
 * address on a later visit is also how a user confirms FR-11 identity
 * stability for themselves.
 */
export function AccountBadge({
  labels,
  className,
}: {
  labels: AccountBadgeLabels;
  className?: string;
}) {
  const { address, signOut, isSigningOut } = useKonfirmIdentity();

  if (!address) return null;

  return (
    // No colours here on purpose: this renders on the dark header and on the
    // light login page. It inherits whatever the caller sets via `className`,
    // and uses opacity for hierarchy so it stays legible on either ground.
    <div className={className ?? 'flex items-center gap-3 text-xs'}>
      <span className="opacity-70">
        {labels.signedInAs}{' '}
        <span className="font-mono opacity-100" title={address}>
          {shortenAddress(address)}
        </span>
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={isSigningOut}
        className="underline opacity-70 hover:opacity-100 disabled:opacity-40"
      >
        {labels.signOut}
      </button>
    </div>
  );
}
