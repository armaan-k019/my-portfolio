import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

interface RecommendationItem {
  title: string;
  explanation: string;
  urgency: "Low" | "Medium" | "High" | "Critical";
}

export interface CorgiRecommendation {
  current_coverage_adequate: boolean;
  recommended_coverage_limit: string;
  risk_factors: string[];
  recommendations: RecommendationItem[];
  regulatory_note: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      companyName: string;
      modelType: string;
      fundingStage: string;
      currentCoverage: string;
      meanShift: number;
      varianceChangePct: number;
      overlapPct: number;
      riskDeltaScore: number;
      riskLevel: string;
      baselineClusterCenter: number;
      recentClusterCenter: number;
      baselineOutliers: number;
      recentOutliers: number;
      secondaryClusterDetected: boolean;
    };

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `You are an AI liability insurance underwriter at Corgi Insurance. Analyze the following model drift data and provide coverage recommendations.

COMPANY CONTEXT:
- Company: ${body.companyName || "Client company"}
- AI Model Type: ${body.modelType}
- Funding Stage: ${body.fundingStage}
- Current AI Liability Coverage: ${body.currentCoverage}

MODEL DRIFT METRICS:
- Mean Shift: ${body.meanShift.toFixed(3)} (absolute change in output distribution mean)
- Variance Change: ${body.varianceChangePct > 0 ? "+" : ""}${body.varianceChangePct.toFixed(1)}%
- Distribution Overlap: ${body.overlapPct.toFixed(1)}% of recent outputs fall within baseline IQR
- Risk Delta Score: ${body.riskDeltaScore}/100 (${body.riskLevel})
- Baseline Cluster Center: ${body.baselineClusterCenter.toFixed(3)}, Outliers: ${body.baselineOutliers}
- Recent Cluster Center: ${body.recentClusterCenter.toFixed(3)}, Outliers: ${body.recentOutliers}
- Secondary Cluster Detected in T1: ${body.secondaryClusterDetected ? "YES — bimodal output behavior detected (high concern)" : "No"}

Based on this data, return ONLY valid JSON with no preamble or markdown:
{
  "current_coverage_adequate": true or false,
  "recommended_coverage_limit": "$Xm or same as current",
  "risk_factors": ["specific risk factor 1 grounded in the metrics", "specific risk factor 2", "specific risk factor 3"],
  "recommendations": [
    {"title": "short action title", "explanation": "2 sentences grounded in the actual drift data", "urgency": "Low|Medium|High|Critical"},
    {"title": "...", "explanation": "...", "urgency": "..."},
    {"title": "...", "explanation": "...", "urgency": "..."}
  ],
  "regulatory_note": "One sentence about relevant AI regulation exposure for this model type and drift level (e.g. EU AI Act, CFPB, EEOC, GDPR)."
}`,
        },
      ],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    const parsed = JSON.parse(text.slice(start, end)) as CorgiRecommendation;

    return Response.json(parsed);
  } catch (err) {
    console.error("[corgi/recommendations] error:", err);
    return Response.json({ error: "Failed to generate recommendations." }, { status: 500 });
  }
}
