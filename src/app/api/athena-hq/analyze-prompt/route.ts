import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

export async function POST(request: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const body = await request.json() as {
      prompt: string;
      brand: string;
      description: string;
      competitors: string[];
    };

    const { prompt, brand, description, competitors } = body;

    if (!prompt || !brand) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    const allBrands = [brand, ...competitors.filter(Boolean)];

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are simulating how an AI assistant like ChatGPT or Perplexity would respond to a user query. Respond naturally to the query below, then score each brand.

USER QUERY: "${prompt}"

Context about the brands:
- ${brand}: ${description || "a company in this space"}
${competitors.filter(Boolean).map(c => `- ${c}: a competitor brand`).join("\n")}

Instructions:
1. Write a realistic AI search response (150-250 words) that a helpful AI assistant might give. Mention brands organically where relevant — don't force mentions.
2. Then score how prominently each brand appeared in your response.

Scoring tiers:
- "primary" (3pts): Mentioned first, recommended most strongly, or the clear leader in the response
- "secondary" (2pts): Mentioned and discussed, but not the lead recommendation
- "brief" (1pt): Brief or passing mention, listed among many options
- "none" (0pts): Not mentioned at all

Return ONLY this JSON (no other text):
{
  "responseText": "your full AI search response here",
  "brandScores": [
${allBrands.map(b => `    {"brand": ${JSON.stringify(b)}, "tier": "none", "score": 0}`).join(",\n")}
  ]
}

Replace each tier ("primary"|"secondary"|"brief"|"none") and score (3|2|1|0) based on how each brand actually appeared in your response. Return valid JSON only.`,
        },
      ],
    });

    clearTimeout(timeout);

    const text = (message.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    const parsed = JSON.parse(text.slice(start, end)) as {
      responseText: string;
      brandScores: { brand: string; tier: string; score: number }[];
    };

    // Normalize scores to match tier
    const tierScores: Record<string, number> = { primary: 3, secondary: 2, brief: 1, none: 0 };
    const normalizedScores = parsed.brandScores.map(bs => ({
      brand: bs.brand,
      tier: bs.tier as "primary" | "secondary" | "brief" | "none",
      score: tierScores[bs.tier] ?? 0,
    }));

    // Ensure all brands are represented
    for (const b of allBrands) {
      if (!normalizedScores.find(s => s.brand === b)) {
        normalizedScores.push({ brand: b, tier: "none", score: 0 });
      }
    }

    return Response.json({
      prompt,
      responseText: parsed.responseText,
      brandScores: normalizedScores,
    });
  } catch (err) {
    clearTimeout(timeout);
    console.error("[athena-hq/analyze-prompt] error:", err);
    return Response.json({ error: "Analysis failed." }, { status: 500 });
  }
}
