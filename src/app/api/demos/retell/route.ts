export const maxDuration = 60;

interface FlaggedMoment {
  turn: string;
  issue: string;
  severity: "Low" | "Medium" | "High";
  explanation: string;
  rewrite: string;
}

interface RetellAnalysis {
  humanityScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  flaggedMoments: FlaggedMoment[];
  strengths: string[];
  overallAssessment: string;
}

const SYSTEM_PROMPT = `You are an expert voice AI conversation analyst specializing in detecting moments where AI voice agents sound robotic, unnatural, or fail to match human conversational norms. Your job is to audit a transcript and return a structured JSON object — nothing else, no markdown, no preamble.

SCORING CALIBRATION — READ CAREFULLY:
- 90-100: Indistinguishable from a skilled human agent. Warm, adaptive, natural throughout.
- 80-89: Genuinely natural with only minor stylistic issues a listener would barely notice.
- 65-79: Mostly competent but with 1-3 noticeable moments that break the human illusion.
- 45-64: Clear robotic patterns. Multiple failures in listening, empathy, or naturalness.
- 25-44: Severely robotic. Rigid, script-following, poor recovery, user frustration likely.
- Below 25: Near-unusable. Almost every turn feels automated.

Most real-world voice agents score 55-75. A genuinely warm, conversational agent with only minor issues should score 80+.

WHAT TO FLAG vs. IGNORE:
Flag only moments that a real human caller would actually notice as unnatural. Do NOT flag:
- Expressions of empathy or warmth ("Oh no!", "Of course!", "Great!") — these are humanizing, not robotic
- Slight formality in information delivery if the rest of the conversation is warm
- Minor stylistic preferences that don't affect the caller's experience
- Closing phrases that are polite but brief

DO flag:
- Repeated identical phrases that ignore what the user just said
- Responses that answer a different question than what was asked
- Complete absence of acknowledgment when the user shares something emotional or frustrating
- Abrupt topic jumps with no transitional language
- Escalation or termination without attempting to resolve the issue first
- Literal, over-precise responses to casual or ambiguous language

SEVERITY GUIDE:
- High: A caller would likely notice and feel frustrated. Core interaction fails.
- Medium: Noticeably unnatural to an attentive listener. Breaks immersion.
- Low: Subtle. Only an analyst or someone listening for it would catch it. Use sparingly — maximum 1-2 Low flags per transcript. If everything else is High/Medium, omit Low flags entirely.

Return this exact structure:
{
  "humanityScore": <number 0-100>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": <1-2 sentence summary>,
  "flaggedMoments": [
    {
      "turn": <the exact agent line that was flagged>,
      "issue": <short issue label, e.g. "Over-literal response", "Missed emotional cue">,
      "severity": <"Low"|"Medium"|"High">,
      "explanation": <1-2 sentences explaining why this sounds robotic>,
      "rewrite": <a more natural version of the agent's line>
    }
  ],
  "strengths": [<string>, ...],
  "overallAssessment": <2-3 sentence detailed assessment>
}

Grade mapping: A = 90-100, B = 75-89, C = 55-74, D = 35-54, F = below 35. Do not use em dashes anywhere in your response.`;

export async function POST(request: Request) {
  console.log("[retell] hit");

  try {
    const body = await request.json() as { transcript: string };
    const { transcript } = body;

    if (!transcript?.trim()) {
      return Response.json({ error: "No transcript provided." }, { status: 400 });
    }

    if (transcript.trim().length < 50) {
      return Response.json({ error: "Transcript is too short. Please paste a full conversation." }, { status: 400 });
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
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Analyze this voice agent transcript:\n\n${transcript}`,
          },
        ],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    console.log("[retell] anthropic status:", apiRes.status);

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
      console.error("[retell] no JSON found in:", text.slice(0, 300));
      return Response.json({ error: "Analysis did not return valid JSON." }, { status: 500 });
    }

    const result = JSON.parse(text.slice(start, end)) as RetellAnalysis;
    console.log(
      "[retell] parsed ok, score:", result.humanityScore,
      "flagged:", result.flaggedMoments?.length
    );
    return Response.json({ result });
  } catch (err) {
    console.error("[retell] error:", err);
    return Response.json(
      { error: "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}
