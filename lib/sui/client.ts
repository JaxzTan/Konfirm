import { SuiGrpcClient } from '@mysten/sui/grpc';

/**
 * dapp-kit's SuiClientProvider only knows how to build a JSON-RPC client
 * (@mysten/sui/jsonRpc), and public JSON-RPC endpoints were shut down
 * industry-wide on 2026-07-31 — every method on them now returns
 * "Method not found." dapp-kit hasn't shipped a fix as of its latest
 * release (1.1.17, 2026-08-17).
 *
 * The fullnode host itself still works fine — it just needs the gRPC-web
 * client instead. This is used directly by registerEnokiWallets() and by
 * the custom useSignAndExecuteTransaction hook in this directory, bypassing
 * dapp-kit's SuiClientProvider/useSuiClient entirely. dapp-kit's
 * WalletProvider and wallet-standard hooks (useCurrentAccount,
 * useConnectWallet, etc.) are unaffected by any of this — they don't talk
 * to the network.
 */
export const suiNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as
  | 'mainnet'
  | 'testnet'
  | 'devnet';

export const suiClient = new SuiGrpcClient({
  network: suiNetwork,
  baseUrl: process.env.NEXT_PUBLIC_SUI_RPC ?? 'https://fullnode.testnet.sui.io:443',
});
