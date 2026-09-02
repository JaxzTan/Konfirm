'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { registerEnokiWallets } from '@mysten/enoki';
import { suiClient, suiNetwork } from '@/lib/sui/client';
import '@mysten/dapp-kit/dist/index.css';

const queryClient = new QueryClient();

// dapp-kit's <SuiClientProvider> builds a JSON-RPC client, and JSON-RPC is
// dead (see lib/sui/client.ts) — so this is NOT used for any real network
// call. It exists purely because WalletProvider's internal
// useUnsafeBurnerWallet hook calls useSuiClient() unconditionally (even
// though the burner wallet is off by default) and throws without a
// SuiClientProvider ancestor. That JSON-RPC client is constructed but never
// dialed, since we don't use ConnectButton, AccountDropdownMenu, or any
// dapp-kit hook that queries it — every real call goes through
// lib/sui/client.ts's gRPC client instead.
const { networkConfig } = createNetworkConfig({
  [suiNetwork]: { network: suiNetwork, url: getJsonRpcFullnodeUrl(suiNetwork) },
});

function EnokiWalletRegistration() {
  useEffect(() => {
    const { unregister } = registerEnokiWallets({
      client: suiClient,
      network: suiNetwork,
      apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? '',
      providers: {
        google: {
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
        },
        twitch: {
          clientId: process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID ?? '',
          // Pinned: the SDK otherwise defaults the redirect to the current
          // page URL, so it would change per route and stop matching the URI
          // registered in the Twitch console.
          redirectUrl:
            typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
        },
      },
    });

    return unregister;
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={suiNetwork}>
        <EnokiWalletRegistration />
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
