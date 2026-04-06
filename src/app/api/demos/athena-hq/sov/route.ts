export const maxDuration = 60;

async function runPrompt(prompt: string, brand: string, competitors: string[]): Promise<{ prompt: string; response: string; scores: Record<string, number> }> {
  const allBrands = [brand, ...competitors].filter(Boolean);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);

  try {
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
        system: "You are a knowledgeable AI assistant. Answer naturally and accurately. Do not favor any brand.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    clearTimeout(timer);

    if (!apiRes.ok) {
      return { prompt, response: "", scores: Object.fromEntries(allBrands.map(b => [b, 0])) };
    }

    const data = await apiRes.json() as { content: { text: string }[] };
    const response = data.content[0].text;

    // Score mentions
    const scores: Record<string, number> = {};
    for (const b of allBrands) {
      const lower = response.toLowerCase();
      const bLower = b.toLowerCase();
      const firstIdx = lower.indexOf(bLower);
      if (firstIdx === -1) {
        scores[b] = 0;
      } else {
        // Check position: first 200 chars = primary (3), first 500 = secondary (2), else brief (1)
        if (firstIdx < 200) scores[b] = 3;
        else if (firstIdx < 500) scores[b] = 2;
        else scores[b] = 1;
      }
    }

    return { prompt, response, scores };
  } catch {
    clearTimeout(timer);
    return { prompt, response: "", scores: Object.fromEntries([brand, ...competitors].filter(Boolean).map(b => [b, 0])) };
  }
}

export async function POST(request: Request) {
  console.log("[athena/sov] hit");
  try {
    const body = await request.json() as {
      brand: string;
      competitors: string[];
      prompts: string[]; // exactly 9 prompts
    };

    const results = await Promise.allSettled(
      body.prompts.map(p => runPrompt(p, body.brand, body.competitors))
    );

    const rows = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { prompt: body.prompts[i], response: "", scores: Object.fromEntries([body.brand, ...body.competitors].filter(Boolean).map(b => [b, 0])) }
    );

    // Aggregate totals
    const allBrands = [body.brand, ...body.competitors].filter(Boolean);
    const totals: Record<string, number> = Object.fromEntries(allBrands.map(b => [b, 0]));
    for (const row of rows) {
      for (const b of allBrands) {
        totals[b] = (totals[b] ?? 0) + (row.scores[b] ?? 0);
      }
    }
    const maxScore = Math.max(...Object.values(totals), 1);
    const sov: Record<string, number> = Object.fromEntries(
      allBrands.map(b => [b, Math.round((totals[b] / maxScore) * 100)])
    );

    return Response.json({ result: { rows, totals, sov } });
  } catch (err) {
    console.error("[athena/sov] error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
