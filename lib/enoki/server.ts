import 'server-only';
import { EnokiClient } from '@mysten/enoki';

let client: EnokiClient | undefined;

export function getEnokiClient() {
  if (!client) {
    if (!process.env.ENOKI_SECRET_KEY) {
      throw new Error('ENOKI_SECRET_KEY is not set');
    }
    client = new EnokiClient({ apiKey: process.env.ENOKI_SECRET_KEY });
  }
  return client;
}

export const enokiNetwork = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as
  | 'mainnet'
  | 'testnet'
  | 'devnet';
