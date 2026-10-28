import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { flagSession, MAX_SESSION_CHARS, parseSession, type Flag, type Review, type Step } from "@/app/demos/warp/session";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You review one coding agent's terminal session before a human merges its work. You get the numbered steps (agent messages, commands with output, diffs) and the flags a set of fixed rules raised.

Return JSON only, no markdown fences:
{"summary": string, "notes": [{"step": number, "note": string}], "checklist": [string]}

- summary: what the agent did and whether its final claim matches the evidence. At most 30 words.
- notes: up to 4 steps a reviewer should look at, most important first. Each note at most 12 words and says why that step matters. Use only step numbers that exist. You may add a step the rules missed.
- checklist: exactly 3 things to check before merging, each at most 8 words.

Use only what is in the session. Do not invent files, commands, results, or intent. If the session is too short to judge, say so in the summary and return empty notes. Do not use em dashes; use commas, periods, or parentheses.`;

// Per-instance cache so the sample session, which every visitor loads, is
// reviewed once per warm function rather than once per page view.
const cache = new Map<string, Review>();
const CACHE_LIMIT = 50;

function render(steps: Step[], flags: Flag[]): string {
  const lines = steps.map((s) => {
    const body = s.body.slice(0, 20).map((l) => `    ${l}`).join("\n");
    const head = `[${s.index}] ${s.kind}: ${s.head}`;
    return body ? `${head}\n${body}` : head;
  });
  const flagLines = flags.length
    ? flags.map((f) => `step ${f.step}: ${f.label} (${f.severity})`).join("\n")
    : "none";
  return `SESSION\n${lines.join("\n")}\n\nRULE FLAGS\n${flagLines}`;
}

function parseReview(text: string, maxStep: number): Review | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof raw.summary !== "string" || !Array.isArray(raw.notes) || !Array.isArray(raw.checklist)) return null;
    const notes = raw.notes
      .filter(
        (n): n is { step: number; note: string } =>
          !!n &&
          typeof n === "object" &&
          Number.isInteger((n as { step: unknown }).step) &&
          typeof (n as { note: unknown }).note === "string",
      )
      .filter((n) => n.step >= 1 && n.step <= maxStep)
      .slice(0, 4);
    const checklist = raw.checklist.filter((c): c is string => typeof c === "string").slice(0, 3);
    return { summary: raw.summary.trim(), notes, checklist };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let session = "";
  try {
    const body = (await request.json()) as { session?: unknown };
    if (typeof body.session === "string") session = body.session;
  } catch {
    // fall through to the length check
  }
  if (session.length > MAX_SESSION_CHARS) {
    return Response.json({ error: "Session is too long. Trim it to 12,000 characters." }, { status: 400 });
  }
  const steps = parseSession(session);
  if (steps.length < 2) {
    return Response.json({ error: "Paste at least two steps (lines starting with $ or agent:)." }, { status: 400 });
  }

  const key = createHash("sha256").update(session).digest("hex");
  const hit = cache.get(key);
  if (hit) return Response.json({ review: hit });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The reviewer is offline right now." }, { status: 503 });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: render(steps, flagSession(steps)) }],
      },
      { signal: AbortSignal.timeout(28000) },
    );
    const text = message.content.find((b) => b.type === "text");
    const review = text && text.type === "text" ? parseReview(text.text, steps.length) : null;
    if (!review) {
      return Response.json({ error: "The reviewer returned nothing usable. Try again." }, { status: 502 });
    }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, review);
    return Response.json({ review });
  } catch (err) {
    console.error("warp review:", err);
    return Response.json({ error: "The reviewer could not be reached. Try again." }, { status: 502 });
  }
}
