import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      brand: string;
      description: string;
      competitors: string[];
      industry: string;
      promptStyle: "informational" | "comparison" | "recommendation";
    };

    const { brand, description, competitors, industry, promptStyle } = body;

    if (!brand || !industry) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    const styleGuide: Record<string, string> = {
      informational: `questions like "What is the best [product] for [use case]?" or "What are the top [category] tools?" — user wants to learn about the space`,
      comparison: `questions like "[Brand A] vs [Brand B] vs [Brand C]" or "How does [Brand] compare to alternatives?" — user is evaluating options`,
      recommendation: `requests like "Recommend a [product] for [situation]" or "What [product] should I use for [goal]?" — user wants a specific suggestion`,
    };

    const competitorList = competitors.filter(Boolean).join(", ") || "industry alternatives";

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Generate exactly 5 realistic AI search queries that someone in the "${industry}" space might type into an AI assistant like ChatGPT or Perplexity.

Brand being analyzed: ${brand} (${description || industry + " company"})
Competitors: ${competitorList}
Query style: ${styleGuide[promptStyle]}

Rules:
- Each prompt should feel like a real user query, not marketing copy
- Vary the angle and specificity across the 5 prompts
- At least 2 prompts should naturally invite mentioning ${brand} or its category
- Do NOT mention ${brand} directly in the prompts — let it emerge organically from the AI response
- Return ONLY a JSON array of 5 strings, no other text

Example format: ["prompt one", "prompt two", "prompt three", "prompt four", "prompt five"]`,
        },
      ],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]") + 1;
    const prompts = JSON.parse(text.slice(start, end)) as string[];

    if (!Array.isArray(prompts) || prompts.length !== 5) {
      return Response.json({ error: "Failed to generate 5 prompts." }, { status: 500 });
    }

    return Response.json({ prompts });
  } catch (err) {
    console.error("[athena-hq/generate-prompts] error:", err);
    return Response.json({ error: "Failed to generate prompts." }, { status: 500 });
  }
}
