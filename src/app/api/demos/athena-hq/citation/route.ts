export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[athena/citation] hit");
  try {
    const body = await request.json() as {
      brand: string;
      competitors: string[];
      responses: string[]; // all 9 SOV responses concatenated context
    };

    const allBrands = [body.brand, ...body.competitors].filter(Boolean);
    const combinedContext = body.responses.slice(0, 9).join("\n\n---\n\n");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: "You are a knowledgeable AI assistant. Answer naturally and accurately. Do not favor any brand. Respond with ONLY valid JSON.",
        messages: [
          {
            role: "user",
            content: `Analyze these AI search responses and determine citation signal strength for each brand across source types.

Brands to analyze: ${allBrands.join(", ")}

AI search responses:
${combinedContext}

Source type definitions:
- review_sites: G2, Capterra, TrustRadius, Product Hunt reviews
- news_press: TechCrunch, Forbes, VentureBeat, press coverage
- community: Reddit, Hacker News, Twitter/X, forums
- documentation: official docs, knowledge bases, help centers
- analyst_reports: Gartner, Forrester, IDC analyst coverage
- comparison_pages: dedicated vs/comparison landing pages

For each brand, rate each source type based on what signals appeared in the responses:
- "strong": explicitly mentioned or clearly implied
- "weak": indirect reference or partial signal
- "none": no detectable signal

Return ONLY this JSON (no markdown):
{
  "audit": {
    ${allBrands.map(b => `"${b}": {
      "review_sites": "strong|weak|none",
      "news_press": "strong|weak|none",
      "community": "strong|weak|none",
      "documentation": "strong|weak|none",
      "analyst_reports": "strong|weak|none",
      "comparison_pages": "strong|weak|none"
    }`).join(",\n    ")}
  },
  "top_gaps": ["gap description for ${body.brand} specific to missing source type", "second gap", "third gap"]
}`,
          },
        ],
      }),
    });

    clearTimeout(timer);
    const raw = await apiRes.text();

    if (!apiRes.ok) {
      return Response.json({ error: `API error ${apiRes.status}` }, { status: 500 });
    }

    const data = JSON.parse(raw) as { content: { text: string }[] };
    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    const parsed = JSON.parse(text.slice(start, end));
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[athena/citation] error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
