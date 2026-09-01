import { NextRequest, NextResponse } from 'next/server';
import { getEnokiClient } from '@/lib/enoki/server';

export async function POST(request: NextRequest) {
  const { digest, signature } = await request.json();

  if (!digest || !signature) {
    return NextResponse.json({ error: 'digest and signature are required' }, { status: 400 });
  }

  try {
    const result = await getEnokiClient().executeSponsoredTransaction({ digest, signature });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute transaction' },
      { status: 500 },
    );
  }
}
