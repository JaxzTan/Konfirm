'use client';

import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';

export default function Home() {
  const account = useCurrentAccount();

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '2rem' }}>Konfirm</h1>
      <ConnectButton />
      {account && (
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Signed in as {account.address}
        </p>
      )}
    </main>
  );
}
