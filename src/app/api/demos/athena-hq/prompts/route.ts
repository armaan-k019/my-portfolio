export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[athena/prompts] hit");
  console.log("[athena/prompts] key present:", !!process.env.ANTHROPIC_API_KEY);
  try {
    const body = await request.json() as {
      brand: string;
      industry: string;
      competitors: string[];
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
        max_tokens: 1000,
        system: "You are a knowledgeable AI assistant. Answer naturally and accurately. Do not favor any brand. Respond with ONLY valid JSON — no markdown, no preamble, no code blocks.",
        messages: [
          {
            role: "user",
            content: `Generate 15 real search prompts that someone would type into an AI search engine (ChatGPT, Perplexity, etc.) when researching the "${body.industry}" category.

Brand: ${body.brand}
Competitors: ${body.competitors.filter(Boolean).join(", ") || "none specified"}

Return exactly this JSON structure:
{
  "informational": [
    {"prompt": "string", "volume": "High|Medium|Low", "priority": true|false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false}
  ],
  "comparison": [
    {"prompt": "string", "volume": "High|Medium|Low", "priority": true|false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false}
  ],
  "recommendation": [
    {"prompt": "string", "volume": "High|Medium|Low", "priority": true|false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false},
    {"prompt": "string", "volume": "High|Medium|Low", "priority": false}
  ]
}

Rules:
- Informational: educational "what is / how does" prompts about the category
- Comparison: head-to-head prompts between ${body.brand} and specific competitors
- Recommendation: "what should I use" / "best tool for" prompts
- Mark exactly 3 prompts total as priority: true (the highest-value ones across all groups)
- Volume is estimated monthly AI search frequency: High (>10k), Medium (1k-10k), Low (<1k)`,
          },
        ],
      }),
    });

    clearTimeout(timer);
    const raw = await apiRes.text();
    console.log("[athena/prompts] status:", apiRes.status);

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
    console.error("[athena/prompts] error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
