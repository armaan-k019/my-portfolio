import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

interface BrandScore {
  brand: string;
  tier: "primary" | "secondary" | "brief" | "none";
  score: number;
}

interface PromptResult {
  prompt: string;
  responseText: string;
  brandScores: BrandScore[];
  failed?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      brand: string;
      description: string;
      industry: string;
      competitors: string[];
      promptResults: PromptResult[];
    };

    const { brand, description, industry, competitors, promptResults } = body;

    if (!brand || !promptResults?.length) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Build a concise summary of results for Claude
    const resultSummary = promptResults
      .filter(r => !r.failed)
      .map((r, i) => {
        const brandScore = r.brandScores.find(s => s.brand === brand);
        const topCompetitor = r.brandScores
          .filter(s => s.brand !== brand)
          .sort((a, b) => b.score - a.score)[0];
        return `Prompt ${i + 1}: "${r.prompt}"
  → ${brand}: ${brandScore?.tier ?? "none"} (${brandScore?.score ?? 0}pts)
  → Top competitor: ${topCompetitor?.brand ?? "N/A"} at ${topCompetitor?.tier ?? "none"} (${topCompetitor?.score ?? 0}pts)`;
      })
      .join("\n\n");

    const totalScore = promptResults.reduce((sum, r) => {
      const bs = r.brandScores.find(s => s.brand === brand);
      return sum + (bs?.score ?? 0);
    }, 0);

    const mentionCount = promptResults.filter(r => {
      const bs = r.brandScores.find(s => s.brand === brand);
      return (bs?.score ?? 0) > 0;
    }).length;

    const topCompetitorOverall = (() => {
      const compScores: Record<string, number> = {};
      for (const comp of competitors.filter(Boolean)) {
        compScores[comp] = promptResults.reduce((sum, r) => {
          const bs = r.brandScores.find(s => s.brand === comp);
          return sum + (bs?.score ?? 0);
        }, 0);
      }
      return Object.entries(compScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    })();

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `You are a GEO (Generative Engine Optimization) strategist. Based on the AI visibility analysis below, generate exactly 4 specific, actionable recommendations for how "${brand}" can improve its presence in AI-generated search responses.

BRAND: ${brand} — ${description || `a company in the ${industry} space`}
INDUSTRY: ${industry}
COMPETITORS: ${competitors.filter(Boolean).join(", ") || "N/A"}
OVERALL SCORE: ${totalScore}/15
MENTIONED IN: ${mentionCount} of ${promptResults.length} prompts

PROMPT-BY-PROMPT RESULTS:
${resultSummary}

${topCompetitorOverall ? `LEADING COMPETITOR: ${topCompetitorOverall} consistently outranked ${brand}` : ""}

Generate 4 GEO recommendations. Each must be specific to these results — reference actual prompt performance, competitor gaps, and score patterns. No generic advice.

Return ONLY this JSON (no other text):
{
  "recommendations": [
    {
      "title": "Short action title (4-7 words)",
      "explanation": "2-3 sentences grounded in the actual results. Reference specific prompts, competitors, or score patterns.",
      "difficulty": "Easy|Medium|Advanced",
      "category": "Content|Technical|PR|Positioning"
    }
  ]
}`,
        },
      ],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    const parsed = JSON.parse(text.slice(start, end)) as {
      recommendations: { title: string; explanation: string; difficulty: string; category: string }[];
    };

    return Response.json({ recommendations: parsed.recommendations });
  } catch (err) {
    console.error("[athena-hq/recommendations] error:", err);
    return Response.json({ error: "Failed to generate recommendations." }, { status: 500 });
  }
}
