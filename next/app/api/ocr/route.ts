import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { image } = body;

  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const worker = await createWorker(["eng", "msa", "chi_sim"]);

  try {
    const {
      data: { text },
    } = await worker.recognize(image);

    return NextResponse.json({ text: text.trim() });
  } finally {
    await worker.terminate();
  }
}
