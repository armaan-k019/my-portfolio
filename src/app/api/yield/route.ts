import Anthropic from "@anthropic-ai/sdk";
import YahooFinance from "yahoo-finance2";

const client = new Anthropic();
const yf = new YahooFinance();

export interface Holding {
  ticker: string;
  shares: number;
}

export interface TickerData {
  ticker: string;
  name: string;
  shares: number;
  currentPrice: number;
  dayChangePercent: number;
  marketCap: number;
  sector: string;
  positionValue: number;
  error?: string;
}

export interface GradeEntry {
  grade: string;
  explanation: string;
}

export interface Grades {
  diversification: GradeEntry;
  volatility: GradeEntry;
  capSizeMix: GradeEntry;
  sectorAllocation: GradeEntry;
  dayPerformance: GradeEntry;
  shortTermOutlook: GradeEntry;
  longTermOutlook: GradeEntry;
  overall: GradeEntry;
}

export interface Suggestion {
  title: string;
  explanation: string;
}

async function fetchTickerData(ticker: string, shares: number): Promise<TickerData> {
  const sym = ticker.toUpperCase();
  try {
    const quote = await yf.quote(sym);
    const price = quote.regularMarketPrice ?? 0;
    const dayChangePercent = quote.regularMarketChangePercent ?? 0;
    const name = quote.longName ?? quote.shortName ?? sym;
    const marketCap = quote.marketCap ?? 0;
    const sector = quote.sector ?? "Unknown";

    if (price === 0) {
      return {
        ticker: sym, name, shares, currentPrice: 0, dayChangePercent: 0,
        marketCap: 0, sector: "Unknown", positionValue: 0,
        error: `"${sym}": no price data returned.`,
      };
    }

    return {
      ticker: sym, name, shares, currentPrice: price, dayChangePercent,
      marketCap, sector, positionValue: price * shares,
    };
  } catch {
    return {
      ticker: sym,
      name: sym,
      shares,
      currentPrice: 0,
      dayChangePercent: 0,
      marketCap: 0,
      sector: "Unknown",
      positionValue: 0,
      error: `"${sym}": ticker not found or data unavailable.`,
    };
  }
}

const ANALYSIS_SYSTEM_PROMPT = `You are a portfolio analyst giving a student-style report card on a stock portfolio.

Grade each category with a letter grade (A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F) and a concise 1-2 sentence explanation. Be direct and reference specific tickers when relevant.

Also generate 3-5 specific, actionable suggestions for improving the portfolio. Each suggestion needs a short title (e.g. "Reduce PLTR Concentration") and a 1-2 sentence explanation of what to do and why.

You MUST respond with ONLY a raw JSON object. No preamble, no markdown, no code fences. Do not begin your response with any text before the opening curly brace.

Respond in exactly this format:
{
  "grades": {
    "diversification": { "grade": "B+", "explanation": "..." },
    "volatility": { "grade": "A-", "explanation": "..." },
    "capSizeMix": { "grade": "C+", "explanation": "..." },
    "sectorAllocation": { "grade": "B", "explanation": "..." },
    "dayPerformance": { "grade": "A", "explanation": "..." },
    "shortTermOutlook": { "grade": "B-", "explanation": "..." },
    "longTermOutlook": { "grade": "A-", "explanation": "..." },
    "overall": { "grade": "B+", "explanation": "..." }
  },
  "suggestions": [
    { "title": "Short action title", "explanation": "What to do and why in 1-2 sentences." }
  ]
}`;

const EXTRACT_SYSTEM_PROMPT = `Extract all stock holdings visible in this brokerage screenshot. Return only tickers and share counts that are clearly legible.

You MUST respond with ONLY a raw JSON object. No preamble, no markdown, no code fences.

Respond in exactly this format:
{ "holdings": [ { "ticker": "AAPL", "shares": 10 } ] }

Use standard ticker symbols (uppercase). If a share count is not clearly visible, omit that holding entirely.`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("search")?.trim();
  if (!query || query.length < 2) return Response.json({ results: [] });

  try {
    const data = await yf.search(query);
    const results = (data.quotes ?? [])
      .filter((q) => q.quoteType === "EQUITY" || q.quoteType === "ETF")
      .slice(0, 3)
      .map((q) => ({
        ticker: q.symbol,
        name: ("longname" in q && q.longname) ? q.longname : ("shortname" in q && q.shortname) ? q.shortname : q.symbol,
      }));
    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Screenshot extraction mode
    if (body.base64) {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: body.mediaType || "image/png", data: body.base64 },
          }],
        }],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return Response.json({ error: "Could not extract holdings from screenshot." }, { status: 500 });
      }
      const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      return Response.json(JSON.parse(raw));
    }

    // Portfolio analysis mode
    const holdings = body.holdings as Holding[];
    if (!holdings || holdings.length === 0) {
      return Response.json({ error: "No holdings provided." }, { status: 400 });
    }

    const tickerData = await Promise.all(
      holdings.map((h) => fetchTickerData(h.ticker, h.shares))
    );

    const valid = tickerData.filter((t) => !t.error);
    if (valid.length === 0) {
      return Response.json({ error: "None of the tickers could be found. Check your symbols and try again." }, { status: 400 });
    }

    const totalValue = valid.reduce((sum, t) => sum + t.positionValue, 0);

    const portfolioSummary = valid.map((t) => ({
      ticker: t.ticker,
      name: t.name,
      shares: t.shares,
      currentPrice: `$${t.currentPrice.toFixed(2)}`,
      positionValue: `$${t.positionValue.toFixed(2)}`,
      portfolioWeight: totalValue > 0 ? `${((t.positionValue / totalValue) * 100).toFixed(1)}%` : "N/A",
      dayChange: `${t.dayChangePercent >= 0 ? "+" : ""}${t.dayChangePercent.toFixed(2)}%`,
      marketCap: t.marketCap > 1e9 ? `$${(t.marketCap / 1e9).toFixed(1)}B` : t.marketCap > 1e6 ? `$${(t.marketCap / 1e6).toFixed(0)}M` : "N/A",
      sector: t.sector,
    }));

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `Analyze this portfolio (total value: $${totalValue.toFixed(2)}):\n\n${JSON.stringify(portfolioSummary, null, 2)}`,
      }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "No analysis received." }, { status: 500 });
    }

    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(raw) as { grades: Grades; suggestions?: Suggestion[] };

    return Response.json({ grades: parsed.grades, suggestions: parsed.suggestions ?? [], tickerData, totalValue });
  } catch (err) {
    console.error("Yield API error:", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
