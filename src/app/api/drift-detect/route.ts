import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SYSTEM_PROMPT_A = `You are a financial analyst embedded in Rho's business banking platform. You have access to 6 months of a company's transaction data across cards, ACH, and AP invoices. Your job is to detect drift - not one-off anomalies, but slow-moving patterns that compound over time and that a CFO would not notice by scanning a transaction list.

Analyze the data and return a JSON array of drift signals. Each signal must have:
- id (string)
- title (short, plain english, max 8 words)
- severity: 'high' | 'medium' | 'low'
- category (the spend category affected)
- summary (2 sentences max - what is drifting and why it matters)
- monthlyDelta (estimated % change per month, as a number)
- affectedVendors (array of vendor name strings)

Important: Pay close attention to small recurring charges that appear every month at the exact same amount with no corresponding growth in team size or usage - these often represent forgotten subscriptions and should always be flagged, even if the absolute dollar amount is small. A $47/month charge appearing 6 times in a row with no variation is a signal worth including at low severity. Also flag vendors with inconsistent billing amounts month-to-month (high variance with no clear pattern). Aim for 3-4 signals total.

Respond ONLY with a valid JSON array. No preamble, no markdown.`;

const SYSTEM_PROMPT_B = `You are a financial analyst embedded in Rho's business banking platform. You have access to 6 months of a company's transaction data across cards, ACH, and AP invoices. Your job is to detect drift - not one-off anomalies, but slow-moving patterns that compound over time and that a CFO would not notice by scanning a transaction list.

This is a healthy spend dataset. Your analysis should reflect that. Flag only genuine anomalies above 8% MoM variance. Do not flag natural minor billing variations under $25 or infrastructure variance under 2%. The executive summary should lead with what is working well, not what could be improved. Severity levels should be calibrated accordingly - LOW means informational only, not actionable.

Analyze the data and return a JSON array of drift signals. Each signal must have:
- id (string)
- title (short, plain english, max 8 words)
- severity: 'high' | 'medium' | 'low'
- category (the spend category affected)
- summary (2 sentences max - what is stable or what minor variance exists and why it is not a concern)
- monthlyDelta (estimated % change per month, as a number)
- affectedVendors (array of vendor name strings)

If the data shows no meaningful drift, return an empty array []. Only include signals for genuine anomalies that cross the 8% MoM threshold. Do not manufacture signals to fill the response.

Respond ONLY with a valid JSON array. No preamble, no markdown.`;

// Pre-aggregate raw transactions into monthly-per-vendor summaries
// so Claude receives trend data rather than individual line items
interface Transaction {
  vendor?: string;
  amount?: number;
  date?: string;
  category?: string;
  [key: string]: unknown;
}

interface VendorSummary {
  vendor: string;
  category: string;
  months: string[];
  monthlyAmounts: number[];
  totalTransactions: number;
}

function aggregateTransactions(transactions: Transaction[]): VendorSummary[] {
  const map = new Map<string, Map<string, { total: number; count: number; category: string }>>();

  for (const tx of transactions) {
    const vendor = (tx.vendor as string) || "Unknown";
    const amount = typeof tx.amount === "number" ? tx.amount : parseFloat(String(tx.amount ?? 0)) || 0;
    const category = (tx.category as string) || "Other";
    const rawDate = tx.date as string | undefined;

    let month = "Unknown";
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        month = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
      }
    }

    if (!map.has(vendor)) map.set(vendor, new Map());
    const vendorMonths = map.get(vendor)!;
    if (!vendorMonths.has(month)) vendorMonths.set(month, { total: 0, count: 0, category });
    const entry = vendorMonths.get(month)!;
    entry.total += amount;
    entry.count += 1;
  }

  const results: VendorSummary[] = [];
  for (const [vendor, monthMap] of map.entries()) {
    const sorted = Array.from(monthMap.entries()).sort(([a], [b]) => {
      const da = new Date(a); const db = new Date(b);
      return isNaN(da.getTime()) || isNaN(db.getTime()) ? 0 : da.getTime() - db.getTime();
    });
    const months = sorted.map(([m]) => m);
    const monthlyAmounts = sorted.map(([, v]) => Math.round(v.total * 100) / 100);
    const totalTransactions = sorted.reduce((s, [, v]) => s + v.count, 0);
    const category = sorted[0]?.[1].category ?? "Other";
    results.push({ vendor, category, months, monthlyAmounts, totalTransactions });
  }

  return results;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { transactions: Transaction[]; scenario?: string };
    const { transactions, scenario } = body;

    console.log("drift-detect: ANTHROPIC_API_KEY defined:", !!process.env.ANTHROPIC_API_KEY, "| transactions received:", transactions?.length ?? 0, "| scenario:", scenario ?? "A");

    const summary = aggregateTransactions(transactions ?? []);
    console.log("drift-detect: aggregated to", summary.length, "vendor summaries");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = scenario === "B" ? SYSTEM_PROMPT_B : SYSTEM_PROMPT_A;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let message: Anthropic.Message;
    try {
      message = await client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: JSON.stringify(summary) }],
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
