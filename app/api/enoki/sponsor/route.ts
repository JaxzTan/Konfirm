import { NextRequest, NextResponse } from 'next/server';
import { getEnokiClient, enokiNetwork } from '@/lib/enoki/server';

export async function POST(request: NextRequest) {
  const { transactionKindBytes, sender, allowedMoveCallTargets, allowedAddresses } =
    await request.json();

  if (!transactionKindBytes || !sender) {
    return NextResponse.json(
      { error: 'transactionKindBytes and sender are required' },
      { status: 400 },
    );
  }

  try {
    const sponsored = await getEnokiClient().createSponsoredTransaction({
      network: enokiNetwork,
      transactionKindBytes,
      sender,
      allowedMoveCallTargets,
      allowedAddresses,
    });

    return NextResponse.json(sponsored);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sponsor transaction' },
      { status: 500 },
    );
  }
}
