import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a financial analyst embedded in Rho's business banking platform. You have access to 6 months of a company's transaction data across cards, ACH, and AP invoices. Your job is to detect drift - not one-off anomalies, but slow-moving patterns that compound over time and that a CFO would not notice by scanning a transaction list.

Analyze the data and return a JSON array of drift signals. Each signal must have:
- id (string)
- title (short, plain english, max 8 words)
- severity: 'high' | 'medium' | 'low'
- category (the spend category affected)
- summary (2 sentences max - what is drifting and why it matters)
- monthlyDelta (estimated % change per month, as a number)
- affectedVendors (array of vendor name strings)

Important: Pay close attention to small recurring charges that appear every month at the exact same amount with no corresponding growth in team size or usage - these often represent forgotten subscriptions and should always be flagged, even if the absolute dollar amount is small. A $47/month charge appearing 6 times in a row with no variation is a signal worth including at low severity. Also flag vendors with inconsistent billing amounts month-to-month (high variance with no clear pattern). Aim for 3–4 signals total.

Respond ONLY with a valid JSON array. No preamble, no markdown.`;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { transactions: unknown[] };
    const { transactions } = body;

    console.log("drift-detect: ANTHROPIC_API_KEY defined:", !!process.env.ANTHROPIC_API_KEY, "| transactions received:", transactions?.length ?? 0);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let message: Anthropic.Message;
    try {
      message = await client.messages.create(
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(transactions) }],
        },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ signals: [], error: "Analysis failed." });
    }

    let raw = textBlock.text.trim();
    // Strip markdown fences if present
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    // Extract JSON array
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start !== -1 && end !== -1) {
      raw = raw.slice(start, end + 1);
    }

    const signals = JSON.parse(raw);
    return Response.json({ signals });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("drift-detect error:", err);
    return Response.json({ signals: [], error: `Analysis failed: ${message}` });
  }
}
