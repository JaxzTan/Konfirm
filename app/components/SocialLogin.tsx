'use client';

import { useConnectWallet, useCurrentAccount, useWallets } from '@mysten/dapp-kit';
import { isEnokiWallet, type AuthProvider, type EnokiWallet } from '@mysten/enoki';

// Display order of the sign-in buttons. Enoki only registers a wallet for a
// provider that is configured in `providers.tsx` *and* enabled in the Enoki
// Portal, so listing a provider here that isn't set up simply renders nothing.
const PROVIDER_ORDER: AuthProvider[] = ['google', 'twitch'];

// "Continue with" rather than "Sign in with": with zkLogin the first login
// creates the account and later logins return it, so there is no separate
// sign-up. Avoids wallet jargon for the non-crypto persona in NFR-5.
const LABELS: Partial<Record<AuthProvider, string>> = {
  google: 'Continue with Google',
  twitch: 'Continue with Twitch',
};

export function SocialLogin() {
  const account = useCurrentAccount();
  const { mutate: connect, isPending } = useConnectWallet();

  const wallets = useWallets()
    .filter(isEnokiWallet)
    .reduce((map, wallet) => map.set(wallet.provider, wallet), new Map<AuthProvider, EnokiWallet>());

  if (account) return null;

  const available = PROVIDER_ORDER.flatMap((provider) => {
    const wallet = wallets.get(provider);
    return wallet ? [{ provider, wallet }] : [];
  });

  if (available.length === 0) {
    return (
      <p style={{ margin: 0, color: 'var(--muted)' }}>Sign-in is temporarily unavailable.</p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {available.map(({ provider, wallet }) => (
        <button
          key={provider}
          type="button"
          onClick={() => connect({ wallet })}
          disabled={isPending}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1.25rem',
            fontSize: '1rem',
            cursor: isPending ? 'progress' : 'pointer',
          }}
        >
          {/* Enoki ships an official icon per provider, so no local assets. */}
          <img src={wallet.icon} alt="" width={20} height={20} />
          {LABELS[provider] ?? wallet.name}
        </button>
      ))}
    </div>
  );
}
