export const maxDuration = 60;

import { SURVEYS, DRILL_THRESHOLD, type Candidate, type Mode, type SurveyKind } from "@/app/demos/terranox/engine";

interface Brief {
  mode: Mode;
  budget: number;
  results: { kind: SurveyKind; target: string; readings: Record<string, string> }[];
  belief: Record<string, number>;
  topCells: { cell: string; p: number }[];
  candidates: Candidate[];
  allowed: SurveyKind[];
}

export interface TerranoxAdvice {
  recommendation: { survey: SurveyKind; cell: string };
  reasoning: string;
  expected_information_gain: string;
  expected_cost: number;
  expected_value_ratio: string;
  alternatives_considered: { move: string; why_rejected: string }[];
}

const SYSTEM = `You are Terranox's sequential decision engine. Your job is to recommend the single next move that maximizes information gain per dollar, given the current state of an exploration campaign on a claim block.

Vocabulary you use, because it is how Terranox and its clients talk: information gain per dollar, prospectivity (the current probability a cell hosts a deposit), sequential decision intelligence (each move chosen in light of everything learned so far, not from a fixed plan), expected value, drill hit rate (the probability a hole intercepts), and geological priors (what the survey physics says a reading means before any data).

Survey physics on this block:
- Airborne magnetics, $50k, reads a 3 by 3 block. Warm or cold per cell. Maps structure, not uranium. About 92 percent of deposit cells read warm and 8 percent of empty cells also read warm, so a warm cell is prospective but far from proven. Flying the same ground twice returns the same reading; overlap adds nothing.
- Ground gravity, $200k, one cell. Anomaly or none. Sees density contrast at mid depth; strong on deep deposits (85 percent), weaker on surface ones (60 percent), 20 percent false positive.
- Radiometric, $150k, one cell. Hit or miss. Near certain on a surface deposit (95 percent) and near blind on a deep one (5 percent); 3 percent false positive. A miss on a warm cell does not clear it, it may be buried.
- Geochem, $75k, one cell. Halo or none. 80 percent on surface, 50 percent on deep, 20 percent false positive. The cheapest confirmation on a warm cell.
- Drill, $250k, one cell. Definitive. Ends uncertainty for that cell and is the only way to book a discovery.

Rules:
- Use only the probabilities and candidate scores supplied in the state. Do not invent numbers. When you quote a prospectivity or a gain figure, take it from the state.
- Recommend exactly one move: one survey kind and one target cell, from the allowed survey kinds.
- Prefer cheap wide information early when the belief is flat. Prefer drilling when a cell's prospectivity is high enough that the drill hit rate justifies $250k.
- Never recommend a cell that has already been drilled.
- In learner mode, explain in plain language a newcomer can follow while still naming the concepts. In terranox mode, be dense and technical.
- Do not use em dashes anywhere. Use commas, colons, or periods.
- Respond with ONLY a JSON object, no markdown, no preamble, no code block, in exactly this shape:
{
  "recommendation": { "survey": "magnetics|gravity|radiometric|geochem|drill", "cell": "E5" },
  "reasoning": "2 to 3 sentences using the vocabulary above, explaining why this move beats the alternatives",
  "expected_information_gain": "a short quantitative phrase drawn from the candidate scores, e.g. about 1.2 bits, or lifts the best hole from 8 to 22 percent",
  "expected_cost": 50000,
  "expected_value_ratio": "bits per $100k for a survey, or expected value over cost for a hole, from the candidate score, as a short string",
  "alternatives_considered": [ { "move": "survey and cell", "why_rejected": "one sentence" } ]
}`;

function describe(brief: Brief) {
  const lines: string[] = [];
  lines.push(`Mode: ${brief.mode}`);
  lines.push(`Budget remaining: $${brief.budget.toLocaleString()}`);
  lines.push(`Allowed surveys: ${brief.allowed.map((k) => SURVEYS[k].label).join(", ")}`);
  lines.push(`Moves so far (${brief.results.length}):`);
  if (brief.results.length === 0) lines.push("  none, the belief is the flat prior");
  for (const r of brief.results) {
    const rd = Object.entries(r.readings).map(([c, v]) => `${c}=${v}`).join(" ");
    lines.push(`  ${SURVEYS[r.kind].label} at ${r.target}: ${rd}`);
  }
  lines.push("Highest prospectivity cells now:");
  for (const t of brief.topCells) lines.push(`  ${t.cell}: ${(t.p * 100).toFixed(1)}%`);
  lines.push(`Drill break even: a hole is positive expected value once prospectivity clears ${(DRILL_THRESHOLD * 100).toFixed(0)}% (drill cost over discovery value).`);
  lines.push("Top candidate moves by prospectivity weighted information gain per dollar (engine heuristic):");
  for (const c of brief.candidates.slice(0, 8)) {
    lines.push(c.kind === "drill"
      ? `  Drill ${c.target}: prospectivity ${(c.prospectivity * 100).toFixed(1)}%, expected value $${Math.round(c.hitEV).toLocaleString()} for $${c.cost.toLocaleString()}`
      : `  ${SURVEYS[c.kind].label} at ${c.target}: ${c.infoGainBits.toFixed(2)} bits for $${c.cost.toLocaleString()}, ${c.gainPerDollar.toFixed(2)} bits per $100k`);
  }
  return lines.join("\n");
}

// Phase B: live call to Sonnet. The page falls back to the local heuristic if
// this returns an error, so a missing or rotated key degrades rather than breaks.
export async function POST(request: Request) {
  try {
    const brief = (await request.json()) as Brief;
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return Response.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 500 });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 50_000);
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        temperature: 0.2,
        system: SYSTEM,
        messages: [{ role: "user", content: describe(brief) }],
      }),
    });
    clearTimeout(timer);
    const raw = await apiRes.text();
    if (!apiRes.ok) {
      console.error("[terranox/analyze] upstream", apiRes.status, raw.slice(0, 160));
      return Response.json({ error: `Decision engine unavailable (upstream ${apiRes.status}).` }, { status: 502 });
    }
    const data = JSON.parse(raw) as { content: { text?: string }[] };
    const text = (data.content.map((b) => b.text ?? "").join("")).replace(/```json|```/g, "").trim();
    const start = text.indexOf("{"), end = text.lastIndexOf("}") + 1;
    if (start === -1 || end === 0) return Response.json({ error: "Engine returned no JSON." }, { status: 502 });
    const parsed = JSON.parse(text.slice(start, end)) as TerranoxAdvice;
    if (!parsed.recommendation?.cell || !parsed.recommendation?.survey) {
      return Response.json({ error: "Engine response missing a recommendation." }, { status: 502 });
    }
    return Response.json({ result: parsed });
  } catch (err) {
    console.error("[terranox/analyze]", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
