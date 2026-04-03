import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a CFO advisor writing a 3-paragraph executive summary based on drift signals detected in a company's spend data. Write in plain English, be specific about dollar amounts and percentages, and end with a single prioritized recommendation. Format as exactly three short paragraphs:
1. What is happening (the key drift patterns)
2. What it means (business implications)
3. What to do (one clear recommendation)
Maximum 120 words total. Be direct, not corporate. Write as if you are a trusted advisor, not a report generator.`;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { signals: unknown[] };
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 28000);

    let message: Anthropic.Message;
    try {
      message = await client.messages.create(
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: `Drift signals detected:\n${JSON.stringify(body.signals, null, 2)}`,
          }],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ summary: null, error: "Summary generation failed." });
    }

    return Response.json({ summary: textBlock.text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("drift-summary error:", err);
    return Response.json({ summary: null, error: `Failed: ${msg}` });
  }
}
