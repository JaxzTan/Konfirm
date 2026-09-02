import { NextRequest, NextResponse } from "next/server";

// TODO: replace with a real OCR/vision call once a provider is picked
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { image } = body;

  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  return NextResponse.json({
    text: "URGENT!! Bridge exploded reported near KL area, share to warn your family before government hides this news!!!",
  });
}
