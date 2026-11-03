import Anthropic from "@anthropic-ai/sdk";
import { runAll, renderFailures, type FailureMode, type Grouping } from "@/app/demos/physical-intelligence/sim";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You triage failures from a scripted robot grasp policy run across randomized tabletop scenes.

The robot: a two-link arm with a base camera, horizontal reach about 58 cm at pregrasp height, a parallel jaw that opens to 8.5 cm, and a wrist that rotates at most 45 degrees either way. The policy estimates the object pose from the camera, rotates the wrist to close across the object's short side, descends, closes, and lifts.

Each failed episode gives scene parameters and the one line the policy logged. The log line is a symptom, not a cause. Two episodes with the same log line can fail for different reasons, and two different log lines can share a cause.

Group the failures by root cause. Return JSON only, no markdown fences:
{"summary": string, "modes": [{"name": string, "cause": string, "fix": string, "episodes": [string]}]}

- summary: the most useful thing to fix first and why. At most 22 words.
- modes: 3 to 6, largest first. Every failed episode appears in exactly one mode.
- name: at most 4 words.
- cause: at most 14 words, citing the parameters that separate this mode from the others.
- fix: one change to the policy or robot, at most 9 words.

Use only the parameters given. Do not invent sensor data, thresholds, or episodes. Do not use em dashes; use commas, periods, or parentheses.`;

// Per-instance cache keyed by seed, so the default scenes every visitor loads
// are grouped once per warm function rather than once per page view.
const cache = new Map<number, Grouping>();
const CACHE_LIMIT = 50;

function parseGrouping(text: string, failedIds: string[]): Grouping | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof raw.summary !== "string" || !Array.isArray(raw.modes)) return null;
    const seen = new Set<string>();
    const modes: FailureMode[] = [];
    for (const m of raw.modes.slice(0, 6)) {
      const x = m as Record<string, unknown>;
      if (!x || typeof x.name !== "string" || typeof x.cause !== "string" || typeof x.fix !== "string" || !Array.isArray(x.episodes)) continue;
      const episodes = x.episodes.filter((id): id is string => typeof id === "string" && failedIds.includes(id) && !seen.has(id));
      episodes.forEach((id) => seen.add(id));
      if (episodes.length > 0) modes.push({ name: x.name.trim(), cause: x.cause.trim(), fix: x.fix.trim(), episodes });
    }
    if (modes.length === 0) return null;
    return { summary: raw.summary.trim(), modes };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let seed: number | null = null;
  try {
    const body = (await request.json()) as { seed?: unknown };
    if (typeof body.seed === "number" && Number.isInteger(body.seed) && body.seed >= 1 && body.seed <= 9999) seed = body.seed;
  } catch {
    // fall through to the check below
  }
  if (seed === null) {
    return Response.json({ error: "Send a seed from 1 to 9999." }, { status: 400 });
  }

  const hit = cache.get(seed);
  if (hit) return Response.json({ grouping: hit });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Claude is offline right now." }, { status: 503 });
  }

  // The server reruns the policy from the seed, so the prompt never contains
  // episode data the browser could have edited.
  const episodes = runAll(seed);
  const failedIds = episodes.filter((e) => !e.ok).map((e) => e.scene.id);
  if (failedIds.length === 0) {
    return Response.json({ grouping: { summary: "No failures in these scenes.", modes: [] } });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: renderFailures(episodes) }],
      },
      { signal: AbortSignal.timeout(28000) },
    );
    const text = message.content.find((b) => b.type === "text");
    const grouping = text && text.type === "text" ? parseGrouping(text.text, failedIds) : null;
    if (!grouping) {
      return Response.json({ error: "Claude returned nothing usable." }, { status: 502 });
    }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as number);
    cache.set(seed, grouping);
    return Response.json({ grouping });
  } catch (err) {
    console.error("physical-intelligence group:", err);
    return Response.json({ error: "Claude could not be reached." }, { status: 502 });
  }
}
