import Anthropic from "@anthropic-ai/sdk";
import { CACHED_PICKS } from "@/app/demos/fireworks/cached";
import { DOMAINS } from "@/app/demos/fireworks/corpus";
import {
  DRAFT_COST,
  K_VALUES,
  ROUNDS,
  TEMPERATURES,
  measure,
  type ClaudePick,
  type Measurement,
} from "@/app/demos/fireworks/spec";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You tune speculative decoding for one workload on a toy inference server.

Setup: a draft model proposes k tokens, the target model checks all of them in one forward pass, each draft token is kept with probability min(1, p/q), and the first rejected one is replaced by a sample from the target's leftover probability. Output matches the target model exactly, so k only changes speed. The target is a trigram model and the draft is a bigram model, both trained on the same small made-up corpus. One target pass costs 1 unit and one draft pass costs ${DRAFT_COST}. A round with draft length k costs k * ${DRAFT_COST} + 1 and yields the accepted tokens plus one more. If each token is accepted independently with probability alpha, expected tokens per round is (1 - alpha^(k+1)) / (1 - alpha).

You get the measured acceptance rate alpha, acceptance by draft position, and the most frequent rejections. You do not get the measured speedups: pick k from 1 to ${K_VALUES[K_VALUES.length - 1]} to maximize tokens per unit cost, and the page will compare your pick with a measured grid search.

Answer by calling submit_pick with these fields:

- k: an integer from 1 to ${K_VALUES[K_VALUES.length - 1]}.
- summary: why this k, citing alpha and any drop in acceptance by position. At most 25 words.
- failures: where the draft disagrees with the target, citing the listed rejections by their tokens. At most 30 words.
- fix: one concrete change to the draft model that would raise acceptance on this workload. At most 20 words.

Use only the numbers given. Do not invent measurements. Do not use em dashes; use commas, periods, or parentheses.`;

// Per-instance cache, so each setting is sent to Claude once per warm function.
const cache = new Map<string, ClaudePick>();

function render(m: Measurement): string {
  const domain = DOMAINS.find((d) => d.id === m.domain)!;
  const positions = m.byPosition.map((a, i) => `position ${i + 1}: ${a.toFixed(2)}`).join(", ");
  const hot = m.hotspots
    .map((h) => `after ${JSON.stringify(h.prev)} the draft guessed ${JSON.stringify(h.drafted)}, target sampled ${JSON.stringify(h.got)} (${h.count} times)`)
    .join("\n");
  return `Workload: ${domain.label}. Sampling temperature ${m.temperature}.
Mean acceptance alpha over corpus contexts: ${m.alpha.toFixed(3)}.
Acceptance by draft position, from ${ROUNDS} rounds at k = 8: ${positions}.
Most frequent first rejections at k = 8:
${hot}`;
}

// Claude answers through a forced tool call, so the fields arrive as a parsed
// object. Parsing JSON out of free text failed on every live request, and the
// rejections it cites are JSON and Python fragments full of quotes and braces.
const PICK_TOOL = {
  name: "submit_pick",
  description: "Submit the chosen draft length and the reasoning behind it.",
  input_schema: {
    type: "object" as const,
    properties: {
      k: { type: "integer", description: "Draft length, an integer from 1 to 8." },
      summary: { type: "string", description: "Why this k. At most 25 words." },
      failures: { type: "string", description: "Where the draft disagrees with the target. At most 30 words." },
      fix: { type: "string", description: "One change to the draft model. At most 20 words." },
    },
    required: ["k", "summary", "failures", "fix"],
  },
};

function parse(input: unknown): ClaudePick | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const k = typeof raw.k === "string" ? Number(raw.k) : raw.k;
  if (typeof k !== "number" || !K_VALUES.includes(k)) return null;
  if (typeof raw.summary !== "string" || typeof raw.failures !== "string" || typeof raw.fix !== "string") return null;
  return { k, summary: raw.summary.trim(), failures: raw.failures.trim(), fix: raw.fix.trim() };
}

export async function POST(request: Request) {
  let body: { domain?: unknown; temperature?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // fall through to the checks below
  }
  const domain = DOMAINS.find((d) => d.id === body.domain);
  const temperature = TEMPERATURES.find((t) => t === body.temperature);
  if (!domain || temperature === undefined) {
    return Response.json({ error: "Unknown workload or temperature." }, { status: 400 });
  }

  // The client sends only the setting; the numbers are recomputed here.
  const key = `${domain.id}@${temperature}`;
  const stored = CACHED_PICKS[key] ?? cache.get(key);
  if (stored) return Response.json({ pick: stored });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Claude is offline right now." }, { status: 503 });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        tools: [PICK_TOOL],
        tool_choice: { type: "tool", name: PICK_TOOL.name },
        messages: [{ role: "user", content: render(measure(domain.id, temperature)) }],
      },
      { signal: AbortSignal.timeout(28000) },
    );
    const call = message.content.find((b) => b.type === "tool_use");
    const pick = call && call.type === "tool_use" ? parse(call.input) : null;
    if (!pick) {
      console.error("fireworks pick: unusable answer", message.stop_reason, JSON.stringify(message.content).slice(0, 600));
      return Response.json({ error: "Claude returned nothing usable. Try again." }, { status: 502 });
    }
    cache.set(key, pick);
    return Response.json({ pick });
  } catch (err) {
    console.error("fireworks pick:", err);
    return Response.json({ error: "Claude could not be reached. Try again." }, { status: 502 });
  }
}
