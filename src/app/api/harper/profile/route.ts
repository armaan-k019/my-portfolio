import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

export interface CoverageLine {
  name: string;
  priority: "Required" | "Strongly Recommended" | "Recommended" | "Optional";
  why_needed: string;
  premium_min: number;
  premium_max: number;
  typical_limit: string;
  without_it: string;
}

export interface CoverageGap {
  gap_name: string;
  explanation: string;
  addressed_by: string;
}

export interface HarperProfile {
  risk_profile: "Low" | "Moderate" | "Elevated" | "High";
  risk_summary: string;
  total_premium_min: number;
  total_premium_max: number;
  coverage_lines: CoverageLine[];
  coverage_gaps: CoverageGap[];
  key_risk_notes: string[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      businessName: string;
      industry: string;
      yearsInOperation: string;
      employees: string;
      annualRevenue: string;
      businessDescription: string;
      keyContracts: string;
      knownRisks: string;
    };

    const prompt = `You are a commercial insurance underwriter at Harper Insurance. Analyze the following business profile and generate a structured coverage recommendation.

BUSINESS PROFILE:
- Business Name: ${body.businessName || "Client Business"}
- Industry: ${body.industry}
- Years in Operation: ${body.yearsInOperation}
- Number of Employees: ${body.employees}
- Annual Revenue: ${body.annualRevenue}
- Business Description: ${body.businessDescription}
- Key Contracts / Clients: ${body.keyContracts || "Not specified"}
- Known Risks / Concerns: ${body.knownRisks || "None listed"}

INSTRUCTIONS:
- Identify 4–7 relevant commercial coverage lines for this business
- Sort by priority: Required first, then Strongly Recommended, Recommended, Optional
- Premium ranges should be realistic annual estimates in USD based on industry, revenue, and employee count
- Be specific to the actual business described — no generic boilerplate
- Coverage gaps are exposures the business currently has that none of the recommended lines address

IMPORTANT: Your entire response must be a single valid JSON object. Do not include any text before or after the JSON. Do not wrap it in markdown code blocks.

{
  "risk_profile": "Low|Moderate|Elevated|High",
  "risk_summary": "2-sentence summary of the business's overall risk posture grounded in the actual profile",
  "total_premium_min": number (sum of all premium_min values),
  "total_premium_max": number (sum of all premium_max values),
  "coverage_lines": [
    {
      "name": "coverage line name (e.g. Commercial General Liability)",
      "priority": "Required|Strongly Recommended|Recommended|Optional",
      "why_needed": "1-2 sentences specific to this business explaining why",
      "premium_min": number,
      "premium_max": number,
      "typical_limit": "e.g. $1M per occurrence / $2M aggregate",
      "without_it": "1 sentence on what exposure remains if skipped"
    }
  ],
  "coverage_gaps": [
    {
      "gap_name": "short gap name",
      "explanation": "1 sentence describing the unaddressed exposure",
      "addressed_by": "what type of specialized coverage would address this"
    }
  ],
  "key_risk_notes": ["specific risk note 1", "specific risk note 2", "specific risk note 3"]
}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = (message.content[0] as { type: string; text: string }).text;

    const text = rawText
      .replace(/```json|```/g, "")
      .trim();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.error("[harper/profile] no JSON object found in response");
      return Response.json({ error: "Failed to generate coverage profile." }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(start, end)) as HarperProfile;
    return Response.json(parsed);
  } catch (err) {
    console.error("[harper/profile] caught error:", err);
    return Response.json({ error: "Failed to generate coverage profile." }, { status: 500 });
  }
}
