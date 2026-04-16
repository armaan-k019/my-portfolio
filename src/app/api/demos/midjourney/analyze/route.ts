export const maxDuration = 60;

interface AutopsyToken {
  token: string;
  impact: "High" | "Medium" | "Low";
  effect: string;
}

interface MidjourneyAnalysis {
  autopsy: AutopsyToken[];
  styleDNA: string;
  rewrite: string;
  summary: string;
}

const SYSTEM_PROMPT = `You are an expert Midjourney prompt analyst. The user will give you a Midjourney prompt. Analyze it and return a JSON object only — no markdown, no preamble, no explanation.

Return this exact structure:
{
  "autopsy": [
    {
      "token": <the specific word or phrase from the prompt>,
      "impact": <"High" | "Medium" | "Low">,
      "effect": <what this token visually contributed — 1 sentence>
    }
  ],
  "styleDNA": <a concise reusable style block — the distilled essence of this prompt's visual identity, ready to paste into a future prompt. Format as a comma-separated descriptor string, not a sentence>,
  "rewrite": <an improved version of the original prompt — more specific, stronger tokens, closes the gap between what was described and what Midjourney likely rendered>,
  "summary": <2-3 sentences explaining what this prompt did well and where it fell short>
}

Rules:
- Identify 4-8 key tokens (individual words or short phrases that carry visual weight)
- Rank by impact honestly — most prompts have 1-2 High, 2-3 Medium, rest Low
- styleDNA should be short enough to append to any future prompt (under 80 chars)
- rewrite should be meaningfully better, not just cosmetically different
- Do not use em dashes anywhere in your response`;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { prompt?: string };
    const { prompt } = body;

    if (!prompt?.trim()) {
      return Response.json({ error: "No prompt provided." }, { status: 400 });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);

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
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Analyze this Midjourney prompt:\n\n${prompt}`,
          },
        ],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();

    if (!apiRes.ok) {
      return Response.json(
        { error: `Analysis API error ${apiRes.status}: ${raw.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const anthropicData = JSON.parse(raw) as { content: { text: string }[] };
    const text = anthropicData.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;

    if (start === -1 || end === 0) {
      return Response.json({ error: "Analysis did not return valid JSON." }, { status: 500 });
    }

    const result = JSON.parse(text.slice(start, end)) as MidjourneyAnalysis;
    return Response.json({ result });
  } catch (err) {
    console.error("[midjourney/analyze] error:", err);
    return Response.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
