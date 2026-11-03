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

Return JSON only, no markdown fences:
{"k": number, "summary": string, "failures": string, "fix": string}

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

function parse(text: string): ClaudePick | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const k = raw.k;
    if (typeof k !== "number" || !K_VALUES.includes(k)) return null;
    if (typeof raw.summary !== "string" || typeof raw.failures !== "string" || typeof raw.fix !== "string") return null;
    return { k, summary: raw.summary.trim(), failures: raw.failures.trim(), fix: raw.fix.trim() };
  } catch {
    return null;
  }
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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: render(measure(domain.id, temperature)) }],
      },
      { signal: AbortSignal.timeout(28000) },
    );
    const text = message.content.find((b) => b.type === "text");
    const pick = text && text.type === "text" ? parse(text.text) : null;
    if (!pick) {
      return Response.json({ error: "Claude returned nothing usable. Try again." }, { status: 502 });
    }
    cache.set(key, pick);
    return Response.json({ pick });
  } catch (err) {
    console.error("fireworks pick:", err);
    return Response.json({ error: "Claude could not be reached. Try again." }, { status: 502 });
  }
}
