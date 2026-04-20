export const maxDuration = 60;

const BASE_SYSTEM_PROMPT = `You are an adversarial test auditor. Your job is to find ways a test could pass while the feature it tests is actually broken.

Rules:
- Be specific. Every weakness must cite actual code or logic from the test provided, not generic boilerplate advice.
- Every weakness must include a concrete bug_example: a specific real-world bug that would slip through this exact test undetected.
- Never say "add more assertions" without specifying exactly what assertion, for what value, at what step.
- The confidence_score must equal the exact sum of the four component scores. Do not inflate components to lift the total. Be honest per component. Most tests score 40-70.
- Voice: analytical, direct. The user is a competent engineer who wants their test critiqued, not taught fundamentals.
- Do not use em dashes anywhere in your response. Use periods, commas, or colons instead.
- The rewrite must be in Revyl's natural-language test style: numbered plain-English steps with explicit, specific assertions at each key moment.

Component scores, each out of 25:
- selector_specificity: how uniquely and robustly elements are targeted. Loose class selectors (.input), positional fallbacks (.first(), .last()), implicit DOM assumptions lose points. Stable hooks (data-testid, accessible roles, labels) earn them.
- assertion_coverage: whether the test verifies actual behavior or just a proxy. URL-only checks, no post-condition state verification, no error-path coverage lose points. Explicit state assertions with expected values earn them.
- wait_strategy: how async behavior is handled. Hardcoded sleeps, missing waits, racing with validation lose points. Deterministic waits tied to observable state earn them.
- edge_coverage: what the test ignores. Happy-path only, no failure modes, no boundary conditions lose points. Coverage of failure modes and partial-success paths earn them.

Generate exactly three future_risks describing realistic, minor UI changes a product team might ship next sprint that would silently break this test. Bias toward changes that script-based tests miss but semantic-understanding tests handle automatically: renamed labels, added loading states, reordered steps, elements moved into modals, new optional fields. Do not suggest changes that would break any reasonable test. The point is to show fragility of this specific test.

Return ONLY valid JSON with no markdown, no preamble, no code blocks:

{
  "confidence_score": number (must equal selector_specificity + assertion_coverage + wait_strategy + edge_coverage),
  "confidence_rationale": "2-3 sentences referencing specific test code. No em dashes.",
  "component_scores": {
    "selector_specificity": { "score": number (0-25), "rationale": "approximately 15 words, specific to this test" },
    "assertion_coverage":   { "score": number (0-25), "rationale": "approximately 15 words, specific to this test" },
    "wait_strategy":        { "score": number (0-25), "rationale": "approximately 15 words, specific to this test" },
    "edge_coverage":        { "score": number (0-25), "rationale": "approximately 15 words, specific to this test" }
  },
  "weaknesses": [
    {
      "category": "one of: missing assertion, loose selector, untested edge case, race condition, false positive risk, environment assumption, hard-coded wait, missing error path, state leak",
      "severity": "low or medium or high",
      "description": "one sentence, specific to this test's actual code",
      "bug_example": "one sentence: a real bug that would pass this test undetected"
    }
  ],
  "future_risks": [
    {
      "change": "short description of the change",
      "why_it_breaks": "1-2 sentences on the specific mechanism. No em dashes.",
      "category": "one of: ui_change, state_addition, timing_shift, layout_move"
    }
  ],
  "rewrite": "the test rewritten in Revyl natural-language style with numbered steps and explicit assertions",
  "rewrite_notes": "2-3 sentences on what changed and why. No em dashes."
}`;

const MISMATCH_EXTENSION = `

A component source has been provided. You must also include a "mismatches" field: an array of specific disagreements between what the test assumes and what the component actually does. Each mismatch must cite the specific line or block of the component and the specific line or assumption in the test. Be concrete.

Add to the JSON:
"mismatches": [
  {
    "test_reference": "what the test does or assumes",
    "component_reference": "what the component actually does",
    "line_hint": "line number or block identifier in the component, if inferable",
    "consequence": "what bug this produces",
    "severity": "high or medium or low"
  }
]`;

export async function POST(request: Request) {
  console.log("[revyl/audit] hit");
  console.log("[revyl/audit] key present:", !!process.env.ANTHROPIC_API_KEY);

  try {
    const body = await request.json() as { testCode: string; componentSource?: string };

    if (!body.testCode?.trim()) {
      return Response.json({ error: "No test provided." }, { status: 400 });
    }

    const hasComponent = !!body.componentSource?.trim();
    const systemPrompt = hasComponent ? BASE_SYSTEM_PROMPT + MISMATCH_EXTENSION : BASE_SYSTEM_PROMPT;

    const userContent = hasComponent
      ? `Audit this test:\n\n${body.testCode}\n\nComponent source:\n\n${body.componentSource}`
      : `Audit this test:\n\n${body.testCode}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55000);

    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    console.log("[revyl/audit] status:", apiRes.status);
    console.log("[revyl/audit] raw:", raw.slice(0, 400));

    if (!apiRes.ok) {
      return Response.json({ error: `Anthropic API error ${apiRes.status}: ${raw.slice(0, 200)}` }, { status: 500 });
    }

    const data = JSON.parse(raw) as { content: { text: string }[] };
    const text = data.content[0].text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) {
      console.error("[revyl/audit] no JSON found in response");
      return Response.json({ error: "Claude did not return valid JSON." }, { status: 500 });
    }

    const parsed = JSON.parse(text.slice(start, end));
    console.log("[revyl/audit] parsed ok, score:", parsed.confidence_score);
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[revyl/audit] caught error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
