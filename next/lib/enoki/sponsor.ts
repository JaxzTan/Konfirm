import { EnokiClient } from '@mysten/enoki';
import { suiNetwork } from '@/lib/sui/client';

/**
 * Server-side Enoki sponsorship (P1 #4/#7).
 *
 * `docs/Enoki_setup.md` §5 and `docs/plan.md` P1 #6 both assume sponsorship
 * happens automatically once a Move target is allowlisted in the Portal.
 * That is not true of `@mysten/enoki` 1.2.19: `registerEnokiWallets` exposes
 * only `sui:signTransaction` / `sui:signAndExecuteTransaction`, and both call
 * `transaction.build({ client })` against the *user's* address — with a 0-SUI
 * zkLogin account that fails for want of a gas coin. The only sponsorship
 * path in the SDK is `transaction-blocks/sponsor`, which requires the private
 * API key and therefore a server. Hence this module and the two routes under
 * `app/api/sponsor`.
 */

const ENOKI_NETWORKS = ['mainnet', 'testnet'] as const;
type EnokiNetwork = (typeof ENOKI_NETWORKS)[number];

function enokiNetwork(): EnokiNetwork {
  if (!(ENOKI_NETWORKS as readonly string[]).includes(suiNetwork)) {
    throw new Error(`Enoki does not sponsor on ${suiNetwork} — use testnet or mainnet.`);
  }
  return suiNetwork as EnokiNetwork;
}

/**
 * The exhaustive list of calls the sponsor will pay for. Enoki matches these
 * as exact strings, so a republished Move package (new PACKAGE_ID) silently
 * stops being sponsored until this env var is updated — see the redeploy
 * checklist in docs/plan.md P1 #10.
 *
 * `create_verdict` only. `docs/Enoki_setup.md` §2.4 and `docs/plan.md` P1 #4
 * both list a second challenge target, but PRD FR-13 says challenges go
 * through an ordinary wallet — "不接 zkLogin、不接 sponsored tx" — so
 * allowlisting it here would pay for transactions the product says users pay
 * for themselves.
 */
export function allowedMoveCallTargets(): string[] {
  const packageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  if (!packageId || !/^0x[0-9a-fA-F]{64}$/.test(packageId)) {
    throw new Error('NEXT_PUBLIC_PACKAGE_ID is missing or is not a 32-byte hex address.');
  }
  return [`${packageId}::registry::create_verdict`];
}

function client(): EnokiClient {
  const apiKey = process.env.ENOKI_SECRET_KEY;
  if (!apiKey) {
    throw new Error('ENOKI_SECRET_KEY is not configured.');
  }
  return new EnokiClient({ apiKey });
}

/**
 * Wraps a transaction *kind* (no gas, no sender-owned coins) in a sponsored
 * transaction paid for by the Enoki gas pool.
 *
 * `allowedAddresses` is pinned to the one sender so a leaked sponsor response
 * can't be replayed for somebody else's transaction.
 */
export async function createSponsoredTransaction(input: {
  sender: string;
  transactionKindBytes: string;
}): Promise<{ bytes: string; digest: string }> {
  return client().createSponsoredTransaction({
    network: enokiNetwork(),
    sender: input.sender,
    transactionKindBytes: input.transactionKindBytes,
    allowedAddresses: [input.sender],
    allowedMoveCallTargets: allowedMoveCallTargets(),
  });
}

/** Submits the user's signature over the sponsored bytes; Enoki executes it. */
export async function executeSponsoredTransaction(input: {
  digest: string;
  signature: string;
}): Promise<{ digest: string }> {
  return client().executeSponsoredTransaction(input);
}
