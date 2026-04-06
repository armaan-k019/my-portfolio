export const maxDuration = 60;

export async function POST(request: Request) {
  console.log("[erebor/score] hit");
  console.log("[erebor/score] key present:", !!process.env.ANTHROPIC_API_KEY);

  try {
    const body = await request.json() as {
      companyType: string;
      revenueSource: string;
      revenueRange: string;
      jurisdiction: string;
      holdsCrypto: boolean;
      defenseContracts: boolean;
      issuesStablecoins: boolean;
      hasBanking: boolean;
      description: string;
    };

    console.log("[erebor/score] companyType:", body.companyType, "jurisdiction:", body.jurisdiction);

    const prompt = `Score the de-banking risk for this company:

COMPANY PROFILE:
- Type: ${body.companyType}
- Primary Revenue Source: ${body.revenueSource}
- Annual Revenue Range: ${body.revenueRange}
- Jurisdiction: ${body.jurisdiction}
- Holds or transacts in crypto: ${body.holdsCrypto ? "Yes" : "No"}
- Works with defense or government contracts: ${body.defenseContracts ? "Yes" : "No"}
- Issues or operates stablecoins: ${body.issuesStablecoins ? "Yes" : "No"}
- Has existing banking relationships: ${body.hasBanking ? "Yes" : "No"}
- Business description: ${body.description}

Score this company across 5 dimensions that traditional bank compliance teams use to flag accounts. Be specific and grounded in their actual business model. Do not sugarcoat risk.

SCORING GUIDANCE:
- overall_score: 0-100, where higher = more de-banking risk. Crypto exchanges in the US with prior terminations should score 70-90. AI labs with no crypto should score 20-35. Stablecoin operators should score 75-95.
- Dimension scores: 1-10, where 10 = maximum risk in that dimension.
- vulnerability_map: assess each of the 7 banking services listed. Mark "N/A" for stablecoin operations only if the company does not issue or operate stablecoins.
- erebor_fit: "Strong" if overall_score >= 60, "Good" if 40-59, "Moderate" if 20-39, "Not Yet Applicable" if under 20.
- Be highly specific in assessments -- reference the company's actual revenue model, asset types, and jurisdiction.

Return ONLY this JSON object, no markdown, no code blocks:

{
  "overall_score": number,
  "risk_level": "Low" or "Moderate" or "High" or "Critical",
  "banking_stability": "Stable" or "Vulnerable" or "At Risk" or "Critical",
  "erebor_fit": "Strong" or "Good" or "Moderate" or "Not Yet Applicable",
  "summary": "One sentence grounded in their specific business model explaining their overall risk.",
  "dimensions": [
    {
      "name": "Regulatory Exposure",
      "score": number 1-10,
      "assessment": "2-3 sentences specific to this company's regulatory footprint and how bank compliance teams view it.",
      "risk_factor": "One specific risk factor with explanation of why it matters in a compliance review.",
      "what_banks_see": "One sentence describing how a bank compliance algorithm would categorize this dimension."
    },
    {
      "name": "Asset Risk Profile",
      "score": number 1-10,
      "assessment": "2-3 sentences about the types of assets this company holds or transacts in.",
      "risk_factor": "One specific asset-related risk factor.",
      "what_banks_see": "One sentence from the bank compliance perspective."
    },
    {
      "name": "Counterparty Risk",
      "score": number 1-10,
      "assessment": "2-3 sentences about their customers and counterparties.",
      "risk_factor": "One specific counterparty risk factor.",
      "what_banks_see": "One sentence from the bank compliance perspective."
    },
    {
      "name": "Jurisdictional Factors",
      "score": number 1-10,
      "assessment": "2-3 sentences about how their jurisdiction affects banking risk.",
      "risk_factor": "One specific jurisdictional risk factor.",
      "what_banks_see": "One sentence from the bank compliance perspective."
    },
    {
      "name": "Operational Transparency",
      "score": number 1-10,
      "assessment": "2-3 sentences about how legible their business model is to bank compliance.",
      "risk_factor": "One specific transparency risk factor.",
      "what_banks_see": "One sentence from the bank compliance perspective."
    }
  ],
  "vulnerability_map": [
    { "service": "Business Checking Account", "risk": "Low" or "Moderate" or "High" or "Critical" },
    { "service": "Payment Processing", "risk": "Low" or "Moderate" or "High" or "Critical" },
    { "service": "Wire Transfers", "risk": "Low" or "Moderate" or "High" or "Critical" },
    { "service": "Payroll Services", "risk": "Low" or "Moderate" or "High" or "Critical" },
    { "service": "Treasury Management", "risk": "Low" or "Moderate" or "High" or "Critical" },
    { "service": "Lending and Credit", "risk": "Low" or "Moderate" or "High" or "Critical" },
    { "service": "Stablecoin Operations", "risk": "Low" or "Moderate" or "High" or "Critical" or "N/A" }
  ],
  "erebor_fit_verdict": "2-3 sentences: Strong Fit / Good Fit / Emerging Fit / Not Yet, with specific explanation tied to their business.",
  "erebor_services": [
    {
      "service": "Service name (e.g. Segregated Crypto Custody, Stablecoin Settlement Rails, Institutional Business Checking)",
      "why_applicable": "One sentence explaining why this specific company needs this service.",
      "replaces": "What traditional banking service or workaround this replaces for them."
    },
    {
      "service": "Second relevant Erebor service",
      "why_applicable": "One sentence.",
      "replaces": "What it replaces."
    },
    {
      "service": "Third relevant Erebor service",
      "why_applicable": "One sentence.",
      "replaces": "What it replaces."
    }
  ],
  "erebor_narrative": "One paragraph (3-4 sentences) explaining why Erebor was built for companies like this one, referencing their specific business model and the gap in traditional banking they face."
}`;

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
        system:
          "You are an expert in banking compliance, crypto regulation, and de-banking risk. You understand exactly how traditional bank compliance teams assess accounts for risk and closure, and you give specific, accurate assessments grounded in the company's actual business model. You are direct and do not sugarcoat risk. Respond with ONLY valid JSON, no markdown, no code blocks.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    console.log("[erebor/score] status:", apiRes.status);
    console.log("[erebor/score] raw:", raw.slice(0, 300));

    if (!apiRes.ok) {
      return Response.json({ error: `API error ${apiRes.status}: ${raw.slice(0, 200)}` }, { status: 500 });
    }

    const data = JSON.parse(raw) as { content: { text: string }[] };
    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.error("[erebor/score] no JSON found");
      return Response.json({ error: "No valid JSON returned." }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(start, end));
    console.log("[erebor/score] parsed ok, score:", parsed.overall_score);
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[erebor/score] caught error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
