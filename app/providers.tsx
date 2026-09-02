'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
<<<<<<< HEAD
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
  useSuiClientContext,
} from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { registerEnokiWallets, isEnokiNetwork } from '@mysten/enoki';
import '@mysten/dapp-kit/dist/index.css';

const suiNetwork = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

const { networkConfig } = createNetworkConfig({
  [suiNetwork]: {
    network: suiNetwork,
    url: process.env.NEXT_PUBLIC_SUI_RPC ?? getJsonRpcFullnodeUrl(suiNetwork as 'testnet'),
  },
});

const queryClient = new QueryClient();

// Enoki wallets are bound to a network, so this must live above
// WalletProvider and re-register whenever the active client/network changes.
function EnokiWalletRegistration() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    if (!isEnokiNetwork(network)) return;

    const { unregister } = registerEnokiWallets({
      client,
      network,
=======
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
>>>>>>> origin/dev
      apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? '',
      providers: {
        google: {
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
        },
      },
    });

    return unregister;
<<<<<<< HEAD
  }, [client, network]);
=======
  }, []);
>>>>>>> origin/dev

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
