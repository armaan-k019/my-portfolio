export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[athena/briefs] hit");
  try {
    const body = await request.json() as {
      brand: string;
      industry: string;
      sovSummary: string;
      citationGaps: string[];
      prompts: string[];
    };

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
        max_tokens: 2000,
        system: "You are a knowledgeable AI assistant and content strategist. Respond with ONLY valid JSON — no markdown, no preamble.",
        messages: [
          {
            role: "user",
            content: `Generate 4 specific content briefs that would improve ${body.brand}'s AI search (GEO) visibility in the "${body.industry}" category.

SOV context: ${body.sovSummary}
Citation gaps for ${body.brand}: ${body.citationGaps.join("; ")}
Tracked prompts sample: ${body.prompts.slice(0, 6).join(" | ")}

Return exactly this JSON array with 4 items:
[
  {
    "title": "Specific, compelling content title",
    "content_type": "Comparison Page|Review Bait|Thought Leadership|Community Post|Press Pitch|Documentation",
    "target_prompt": "which prompt from the library this addresses",
    "citation_gap_addressed": "which source type gap this fills",
    "why_it_works": "2 sentences grounded in the actual audit results explaining why this content would improve AI visibility",
    "h1": "Exact H1 tag for the content",
    "meta_description": "155-character meta description",
    "key_talking_points": ["talking point 1", "talking point 2", "talking point 3"],
    "urgency": "Quick Win|Medium Term|Strategic"
  }
]

Rules:
- Make titles specific to ${body.brand} — no generic titles
- Each brief should address a different citation gap
- Vary content types across the 4 briefs
- key_talking_points should be concrete and specific to the brand's category
- urgency: Quick Win = can publish in <1 week, Medium Term = 2-4 weeks, Strategic = ongoing`,
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
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]") + 1;
    const parsed = JSON.parse(text.slice(start, end));
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[athena/briefs] error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
