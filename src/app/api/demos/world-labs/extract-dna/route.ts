export const maxDuration = 30;

import { readText } from "./reader";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim() ?? "";
    if (text.length < 40) {
      return Response.json({ error: "Give the reader at least a few sentences." }, { status: 400 });
    }
    if (text.length > 6000) {
      return Response.json({ error: "Keep the passage under about 1,000 words." }, { status: 400 });
    }
    const out = await readText(text);
    if (out.reading) return Response.json({ result: out.reading });
    return Response.json({ error: out.error }, { status: out.status });
  } catch (err) {
    console.error("extract-dna:", err);
    return Response.json({ error: "Something went wrong reading the passage. Try again." }, { status: 500 });
  }
}
