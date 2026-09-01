'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
  useSuiClient,
} from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { registerEnokiWallets } from '@mysten/enoki';
import '@mysten/dapp-kit/dist/index.css';

const { networkConfig } = createNetworkConfig({
  testnet: {
    network: 'testnet',
    url: process.env.NEXT_PUBLIC_SUI_RPC ?? getJsonRpcFullnodeUrl('testnet'),
  },
});

const queryClient = new QueryClient();

function EnokiWalletRegistration() {
  const client = useSuiClient();

  useEffect(() => {
    const { unregister } = registerEnokiWallets({
      client,
      network: 'testnet',
      apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? '',
      providers: {
        google: {
          clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
        },
      },
    });

    return unregister;
  }, [client]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <EnokiWalletRegistration />
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
