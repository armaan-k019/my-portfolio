export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();
  if (!query || query.length < 2) return Response.json({ results: [] });

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return Response.json({ results: [] });
    const data = await res.json() as { quotes?: Array<{ quoteType: string; symbol: string; longname?: string; shortname?: string }> };
    const results = (data.quotes ?? [])
      .filter((q) => q.quoteType === "EQUITY")
      .slice(0, 5)
      .map((q) => ({ ticker: q.symbol, name: q.longname ?? q.shortname ?? q.symbol }));
    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
