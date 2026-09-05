// Walrus publisher HTTP API (testnet): PUT the blob bytes, get back either
// `newlyCreated` (first time this exact content is stored) or
// `alreadyCertified` (identical bytes already on Walrus) — both carry the
// blobId, which is all create_verdict's trace_blob field needs.

/**
 * The longest Walrus testnet will hold a blob: `walrus info` reports "Blobs
 * can be stored for at most 53 epochs in the future", and an epoch is one day.
 *
 * This is also the fallback, deliberately. The publisher defaults to a single
 * epoch — one day — and that default silently destroyed traces: verdicts
 * attested on 3 and 4 September had unreadable blobs by the 5th while their
 * on-chain records survived, leaving a permanent receipt pointing at nothing.
 * A misconfigured WALRUS_EPOCHS should fail towards keeping data, not losing
 * it.
 */
export const MAX_EPOCHS = 53;

function epochs(): number {
  const configured = Number(process.env.WALRUS_EPOCHS);
  return Number.isInteger(configured) && configured > 0 && configured <= MAX_EPOCHS
    ? configured
    : MAX_EPOCHS;
}

export async function uploadToWalrus(publisherUrl: string, data: unknown): Promise<string> {
  // `permanent=true` makes Walrus store the blob in a non-deletable object.
  // Without it the publisher creates a deletable one, so the trace behind a
  // verdict could be removed while the chain still points at it — which is
  // exactly the claim "a receipt nobody can edit" is not allowed to break.
  const url = `${publisherUrl}/v1/blobs?epochs=${epochs()}&permanent=true`;

  const response = await fetch(url, {
    method: "PUT",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Walrus publisher returned ${response.status}: ${await response.text()}`);
  }

  const body = await response.json();
  const blobId = body.newlyCreated?.blobObject?.blobId ?? body.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error(`Walrus publisher response had no blobId: ${JSON.stringify(body)}`);
  }

  return blobId;
}
