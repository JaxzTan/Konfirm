import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { image } = body;

  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  let worker;
  try {
    worker = await createWorker(["eng", "msa", "chi_sim"]);
    const {
      data: { text },
    } = await worker.recognize(image);

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't read text from this image." },
      { status: 500 },
    );
  } finally {
    await worker?.terminate();
  }
}
