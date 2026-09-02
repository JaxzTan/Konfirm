'use client';

import { useCurrentAccount, useCurrentWallet } from '@mysten/dapp-kit';
import { signTransaction } from '@mysten/wallet-standard';
import { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { suiClient, suiNetwork } from './client';

type UseSignAndExecuteTransactionArgs = {
  transaction: Transaction;
};

type UseSignAndExecuteTransactionResult = {
  digest: string;
  bytes: string;
  signature: string;
  /** Object IDs created by this transaction, keyed by their Move type. */
  createdObjects: { objectId: string; objectType: string }[];
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error ?? `${url} returned ${response.status}`);
  }
  return json as T;
}

/**
 * Signs and executes a transaction with gas paid by the Enoki sponsor, so a
 * signed-in user never needs SUI (FR-12, TR-13).
 *
 * This replaces dapp-kit's `useSignAndExecuteTransaction` for two reasons:
 *
 *  1. dapp-kit's version depends on `SuiClientProvider`'s JSON-RPC client,
 *     which is dead — see lib/sui/client.ts.
 *  2. Neither dapp-kit's version nor the Enoki wallet's own
 *     `sui:signAndExecuteTransaction` sponsors anything. Both build against
 *     the sender's own coins, and a zkLogin account holds none. Sponsorship
 *     lives behind Enoki's private API key, hence the two server round trips
 *     below — see lib/enoki/sponsor.ts.
 *
 * The wallet still signs, and only ever signs: the sponsor co-signs as gas
 * owner and the user's key never leaves the popup.
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

      // A transaction *kind* carries the commands and nothing about gas, which
      // is exactly the part the sponsor is allowed to fill in. Building it
      // needs no sender and no coins.
      const kindBytes = await transaction.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      const sponsored = await postJson<{ bytes: string; digest: string }>('/api/sponsor', {
        sender: currentAccount.address,
        transactionKindBytes: toBase64(kindBytes),
      });

      const sponsoredTransaction = Transaction.from(fromBase64(sponsored.bytes));
      const { bytes, signature } = await signTransaction(currentWallet, {
        transaction: {
          toJSON: () => sponsoredTransaction.toJSON({ supportedIntents, client: suiClient }),
        },
        account: currentAccount,
        chain: `sui:${suiNetwork}`,
      });

      // The wallet re-builds from the JSON it is handed, so in principle it
      // could hand back different bytes than the sponsor signed off on. Enoki
      // would then reject the signature with a mismatch error that says
      // nothing about why — check it here instead.
      if (bytes !== sponsored.bytes) {
        throw new Error('The wallet altered the sponsored transaction; refusing to submit it.');
      }

      await postJson<{ digest: string }>('/api/sponsor/execute', {
        digest: sponsored.digest,
        signature,
      });

      // Enoki's execute returns only a digest, so effects come from a separate
      // read. `waitForTransaction` polls until the node has indexed it.
      const result = await suiClient.core.waitForTransaction({
        digest: sponsored.digest,
        include: { effects: true, objectTypes: true },
      });

      if (result.$kind === 'FailedTransaction') {
        const { status } = result.FailedTransaction;
        throw new Error(`Transaction failed: ${status.success ? 'unknown error' : status.error.message}`);
      }

      const { effects, objectTypes } = result.Transaction;
      const createdObjects = (effects?.changedObjects ?? [])
        .filter((obj) => obj.idOperation === 'Created')
        .map((obj) => ({ objectId: obj.objectId, objectType: objectTypes?.[obj.objectId] ?? '' }));

      return { digest: sponsored.digest, bytes, signature, createdObjects };
    },
    ...options,
  });
}
