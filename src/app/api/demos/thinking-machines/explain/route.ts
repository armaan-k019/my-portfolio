import Anthropic from "@anthropic-ai/sdk";
import { CACHED_EXPLANATIONS } from "@/app/demos/thinking-machines/cached";
import {
  DIM,
  INVARIANT_SPLITS,
  MAX_BATCH,
  REQUESTS,
  SAMPLES,
  sweep,
  type Explanation,
  type Sweep,
} from "@/app/demos/thinking-machines/probe";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You explain one result from a toy model of nondeterminism in LLM inference.

Context, from the Thinking Machines post "Defeating Nondeterminism in LLM Inference" (Horace He, September 2025): floating-point addition is not associative, so the order of a reduction changes its result. LLM forward passes are run-to-run deterministic, but most kernels are not batch invariant: their reduction strategy (for example split-K in a matmul) depends on batch size, and batch size depends on server load. The post's fix is batch-invariant kernels that use one reduction order for every batch size. It reports an unoptimized deterministic vLLM run at 55 s against 26 s by default, and 42 s with an improved attention kernel.

The toy: one hidden state dotted with two vocabulary rows, float32 accumulation, a split-K heuristic that picks the split count from the batch size, and a batch-invariant kernel with one fixed split count. The weights are made up and chosen so the two logits nearly tie.

Return JSON only, no markdown fences:
{"summary": string, "why": string, "fix": string}

- summary: what a user sending this prompt at temperature 0 would see, using the request tally. At most 20 words.
- why: the mechanism, citing the actual split counts, logits, and the gap in ulps. At most 28 words.
- fix: what the batch-invariant kernel changes here and what it costs, using only the post's numbers given above. At most 18 words.

Use only the numbers given. Do not invent measurements. Do not use em dashes; use commas, periods, or parentheses.`;

// Per-instance cache, so each sample is explained once per warm function.
const cache = new Map<string, Explanation>();

function f32(x: number) {
  return x.toPrecision(9);
}

function render(s: Sweep): string {
  const [t0, t1] = s.sample.tokens;
  const gapUlps = (s.exact[0] - s.exact[1]) / s.ulp;
  const lines = s.ranges.map((r) => {
    const c = s.configs.find((x) => x.splits === r.splits)!;
    return `batch ${r.from}-${r.to}: ${r.splits} splits, logits ${f32(c.logits[0])} vs ${f32(c.logits[1])}, picks ${JSON.stringify(c.winner === 0 ? t0 : t1)}`;
  });
  const inv = s.invariant;
  return `Hidden size ${DIM}. Candidate tokens ${JSON.stringify(t0)} and ${JSON.stringify(t1)}.
float64 reference logits: ${s.exact[0]} vs ${s.exact[1]} (gap ${gapUlps.toFixed(2)} ulps of float32 at this magnitude, ulp ${s.ulp.toExponential(3)}).

Default kernel, by batch size (1 to ${MAX_BATCH}):
${lines.join("\n")}

${REQUESTS} requests under a fixed random load trace: ${s.tally[0]} picked ${JSON.stringify(t0)}, ${s.tally[1]} picked ${JSON.stringify(t1)}.
Batch-invariant kernel (${INVARIANT_SPLITS} split at every batch size): logits ${f32(inv.logits[0])} vs ${f32(inv.logits[1])}, ${s.invariantTally[0]} picked ${JSON.stringify(t0)}, ${s.invariantTally[1]} picked ${JSON.stringify(t1)}.`;
}

function parse(text: string): Explanation | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof raw.summary !== "string" || typeof raw.why !== "string" || typeof raw.fix !== "string") return null;
    return { summary: raw.summary.trim(), why: raw.why.trim(), fix: raw.fix.trim() };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let id: unknown;
  try {
    id = ((await request.json()) as { sample?: unknown }).sample;
  } catch {
    // fall through to the check below
  }
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) {
    return Response.json({ error: "Unknown sample." }, { status: 400 });
  }

  // The client sends only a sample id; the numbers are recomputed here.
  const stored = CACHED_EXPLANATIONS[sample.id] ?? cache.get(sample.id);
  if (stored) return Response.json({ explanation: stored });

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
        messages: [{ role: "user", content: render(sweep(sample)) }],
      },
      { signal: AbortSignal.timeout(28000) },
    );
    const text = message.content.find((b) => b.type === "text");
    const explanation = text && text.type === "text" ? parse(text.text) : null;
    if (!explanation) {
      return Response.json({ error: "Claude returned nothing usable. Try again." }, { status: 502 });
    }
    cache.set(sample.id, explanation);
    return Response.json({ explanation });
  } catch (err) {
    console.error("thinking-machines explain:", err);
    return Response.json({ error: "Claude could not be reached. Try again." }, { status: 502 });
  }
}
