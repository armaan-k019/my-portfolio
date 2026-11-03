import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import corpus from "@/app/demos/goodfire/corpus.json";
import {
  buildPrompt,
  MAX_FEATURES,
  MODEL,
  parseLabels,
  QUIET_EXAMPLES,
  SYSTEM_PROMPT,
  TOP_EXAMPLES,
  type FeatureCard,
  type FeatureLabel,
} from "@/app/demos/goodfire/labels";
import savedLabels from "./cache.json";

export const maxDuration = 60;

// Labels saved by scripts/goodfire-cache.mjs for the sample run, keyed by the
// prompt's hash, so the default page loads labels without a live call.
const SAVED = savedLabels as Record<string, FeatureLabel[]>;

// Per-instance cache for runs with other seeds.
const cache = new Map<string, FeatureLabel[]>();
const CACHE_LIMIT = 50;

// Only sentences from the demo's training split can be sent, so the route
// labels this corpus and nothing else.
const TRAIN = new Set(corpus.sentences.filter((s) => s.split === "train").map((s) => s.text));

function cleanCards(raw: unknown): FeatureCard[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FEATURES) return null;
  const out: FeatureCard[] = [];
  for (const item of raw) {
    const x = item as Record<string, unknown>;
    if (!x || typeof x.id !== "number" || !Number.isInteger(x.id) || x.id < 0 || x.id > 255) return null;
    const list = (v: unknown, max: number) =>
      Array.isArray(v) && v.length <= max && v.every((t) => typeof t === "string" && TRAIN.has(t)) ? (v as string[]) : null;
    const top = list(x.top, TOP_EXAMPLES);
    const quiet = list(x.quiet, QUIET_EXAMPLES);
    if (!top || top.length === 0 || !quiet) return null;
    out.push({ id: x.id, top, quiet });
  }
  return out;
}

export async function POST(request: Request) {
  let cards: FeatureCard[] | null = null;
  try {
    const body = (await request.json()) as { features?: unknown };
    cards = cleanCards(body.features);
  } catch {
    // fall through to the check below
  }
  if (!cards) {
    return Response.json({ error: `Send 1 to ${MAX_FEATURES} features built from the demo's training sentences.` }, { status: 400 });
  }

  const prompt = buildPrompt(cards);
  const key = createHash("sha256").update(prompt).digest("hex");
  const hit = SAVED[key] ?? cache.get(key);
  if (hit) return Response.json({ labels: hit, saved: key in SAVED });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The labeler is offline right now." }, { status: 503 });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: AbortSignal.timeout(55000) },
    );
    const text = message.content.find((b) => b.type === "text");
    const labels = text && text.type === "text" ? parseLabels(text.text, cards.map((c) => c.id)) : null;
    if (!labels) {
      return Response.json({ error: "The labeler returned nothing usable. Try again." }, { status: 502 });
    }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, labels);
    return Response.json({ labels });
  } catch (err) {
    console.error("goodfire label:", err);
    return Response.json({ error: "The labeler could not be reached. Try again." }, { status: 502 });
  }
}
