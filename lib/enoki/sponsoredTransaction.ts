import type { Transaction } from '@mysten/sui/transactions';
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { toBase64 } from '@mysten/sui/utils';

type SignTransaction = (input: { transaction: string }) => Promise<{ signature: string }>;

/**
 * Runs the full Enoki gas-sponsorship round trip for a transaction built on
 * the client: build tx-kind bytes -> ask the backend to sponsor -> have the
 * connected wallet sign the sponsored bytes -> ask the backend to execute.
 */
export async function signAndExecuteSponsoredTransaction({
  client,
  transaction,
  sender,
  signTransaction,
  allowedMoveCallTargets,
  allowedAddresses,
}: {
  client: SuiJsonRpcClient;
  transaction: Transaction;
  sender: string;
  signTransaction: SignTransaction;
  allowedMoveCallTargets?: string[];
  allowedAddresses?: string[];
}) {
  const transactionKindBytes = await transaction.build({
    client,
    onlyTransactionKind: true,
  });

  const sponsorResponse = await fetch('/api/enoki/sponsor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionKindBytes: toBase64(transactionKindBytes),
      sender,
      allowedMoveCallTargets,
      allowedAddresses,
    }),
  });

  if (!sponsorResponse.ok) {
    throw new Error((await sponsorResponse.json()).error ?? 'Failed to sponsor transaction');
  }

  const { bytes, digest } = await sponsorResponse.json();

  const { signature } = await signTransaction({ transaction: bytes });

  const executeResponse = await fetch('/api/enoki/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ digest, signature }),
  });

  if (!executeResponse.ok) {
    throw new Error((await executeResponse.json()).error ?? 'Failed to execute transaction');
  }

  return executeResponse.json() as Promise<{ digest: string }>;
}
