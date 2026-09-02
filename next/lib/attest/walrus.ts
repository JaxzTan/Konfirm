// Walrus publisher HTTP API (testnet): PUT the blob bytes, get back either
// `newlyCreated` (first time this exact content is stored) or
// `alreadyCertified` (identical bytes already on Walrus) — both carry the
// blobId, which is all create_verdict's trace_blob field needs.
export async function uploadToWalrus(publisherUrl: string, data: unknown): Promise<string> {
  const response = await fetch(`${publisherUrl}/v1/blobs`, {
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
