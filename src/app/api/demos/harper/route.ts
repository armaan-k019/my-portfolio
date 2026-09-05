export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[harper] route hit");
  console.log("[harper] ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);

  try {
    const body = await request.json() as {
      businessName: string;
      industry: string;
      yearsInOperation: string;
      employees: string;
      revenue: string;
      description: string;
      contracts: string;
      risks: string;
    };
    console.log("[harper] body:", JSON.stringify(body));

    const userPrompt = `Analyze this business and return a commercial insurance coverage profile as JSON.

Business Name: ${body.businessName || "Client Business"}
Industry: ${body.industry}
Years in Operation: ${body.yearsInOperation}
Number of Employees: ${body.employees}
Annual Revenue: ${body.revenue}
Business Description: ${body.description}
Key Contracts / Clients: ${body.contracts || "Not specified"}
Known Risks / Concerns: ${body.risks || "None listed"}

Return this exact JSON structure with realistic values for this specific business. coverage_lines should have 4-7 items sorted Required first, then Strongly Recommended, Recommended, Optional. premium values are annual USD estimates.

{
  "risk_profile": "Low",
  "risk_summary": "string",
  "total_premium_min": 0,
  "total_premium_max": 0,
  "coverage_lines": [
    {
      "name": "string",
      "priority": "Required",
      "why_needed": "string",
      "premium_min": 0,
      "premium_max": 0,
      "typical_limit": "string",
      "without_it": "string"
    }
  ],
  "coverage_gaps": [
    {
      "gap_name": "string",
      "explanation": "string",
      "addressed_by": "string"
    }
  ],
  "key_risk_notes": ["string", "string", "string"]
}`;

    console.log("[harper] calling Anthropic API");

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ANTHROPIC_API_KEY}`,
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: "You are a commercial insurance expert. You must respond with ONLY a valid JSON object. No markdown, no explanation, no code blocks. Just raw JSON.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    console.log("[harper] Anthropic status:", apiRes.status);

    const apiText = await apiRes.text();
    console.log("[harper] Anthropic raw response:", apiText);

    if (!apiRes.ok) {
      return Response.json({ error: `Anthropic API error ${apiRes.status}: ${apiText}` }, { status: 500 });
    }

    const apiData = JSON.parse(apiText) as { content: { type: string; text: string }[] };
    const rawText = apiData.content[0].text;
    console.log("[harper] Claude text:", rawText);

    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}") + 1;

    if (start === -1 || end === 0) {
      console.error("[harper] no JSON object found in Claude response");
      return Response.json({ error: "Claude did not return valid JSON." }, { status: 500 });
    }

    const parsed = JSON.parse(cleaned.slice(start, end));
    console.log("[harper] parsed successfully");
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[harper] caught error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
