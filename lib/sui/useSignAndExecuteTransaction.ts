'use client';

import { useCurrentAccount, useCurrentWallet } from '@mysten/dapp-kit';
import { signTransaction } from '@mysten/wallet-standard';
import type { Transaction } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { suiClient, suiNetwork } from './client';

type UseSignAndExecuteTransactionArgs = {
  transaction: Transaction;
};

type UseSignAndExecuteTransactionResult = {
  digest: string;
  bytes: string;
  signature: string;
};

/**
 * Drop-in replacement for dapp-kit's useSignAndExecuteTransaction, minus the
 * dependency on SuiClientProvider (see lib/sui/client.ts for why). Reuses
 * dapp-kit's wallet-standard hooks (useCurrentWallet/useCurrentAccount) since
 * those don't touch the network, then builds/signs/executes using the
 * project's own gRPC client instead of dapp-kit's dead JSON-RPC one.
 */
export function useSignAndExecuteTransaction(
  options?: Omit<
    UseMutationOptions<
      UseSignAndExecuteTransactionResult,
      Error,
      UseSignAndExecuteTransactionArgs
    >,
    'mutationFn'
  >,
) {
  const { currentWallet, supportedIntents } = useCurrentWallet();
  const currentAccount = useCurrentAccount();

  return useMutation({
    mutationFn: async ({ transaction }: UseSignAndExecuteTransactionArgs) => {
      if (!currentWallet) {
        throw new Error('No wallet is connected.');
      }
      if (!currentAccount) {
        throw new Error('No wallet account is selected.');
      }
      if (
        !currentWallet.features['sui:signTransaction'] &&
        !currentWallet.features['sui:signTransactionBlock']
      ) {
        throw new Error("This wallet doesn't support the signTransaction feature.");
      }

      transaction.setSenderIfNotSet(currentAccount.address);

      const { bytes, signature } = await signTransaction(currentWallet, {
        transaction: {
          toJSON: () => transaction.toJSON({ supportedIntents, client: suiClient }),
        },
        account: currentAccount,
        chain: `sui:${suiNetwork}`,
      });

      const result = await suiClient.core.executeTransaction({
        transaction: fromBase64(bytes),
        signatures: [signature],
      });

      if (result.$kind === 'FailedTransaction') {
        const { status } = result.FailedTransaction;
        throw new Error(`Transaction failed: ${status.success ? 'unknown error' : status.error.message}`);
      }

      return { digest: result.Transaction.digest, bytes, signature };
    },
    ...options,
  });
}
