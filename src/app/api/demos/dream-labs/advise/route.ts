import Anthropic from "@anthropic-ai/sdk";
import { CACHED_ADVICE } from "@/app/demos/dream-labs/cached";
import {
  MAX_WAYPOINTS,
  adviceKey,
  describe,
  isPath,
  isWidth,
  parseAdvice,
  type Advice,
} from "@/app/demos/dream-labs/advice";
import { PICK, PLACE, ROBOTS, SAMPLES, run } from "@/app/demos/dream-labs/robots";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You plan pick-and-place motions for a robotics company whose goal is one motion that runs on any robot with grippers. You get a planar side-view scene, five arms with their geometry, and what an inverse kinematics solver found when it retargeted the visitor's drawn path onto each arm.

For each arm that fails, decide whether a different path would let it finish ("path") or whether the arm itself cannot do this task whatever the path ("hardware"). The pick and place points are fixed, so a failure at either of them, an object wider than the gripper, or a target outside the arm's workspace is hardware. Then propose one path that lets as many arms as possible finish.

The page will run your waypoints through the same solver and show which arms actually finish, next to your verdicts. Reason from the geometry given; do not guess.

Answer by calling submit_advice with these fields:

- summary: what limits this motion across the five arms. At most 15 words.
- robots: one entry per failing arm, by its id. note: the cause, citing a number from the input. At most 12 words.
- waypoints: 3 to ${MAX_WAYPOINTS} points in mm as {x, z}, joined by straight lines. The first is exactly x ${PICK[0]}, z ${PICK[1]} and the last exactly x ${PLACE[0]}, z ${PLACE[1]}.

Use only the numbers given. Do not use em dashes; use commas, periods, or parentheses.`;

// Claude answers through a forced tool call, so the fields arrive as a parsed
// object. Parsing JSON out of free text failed on the live preview, as it did
// for the Fireworks demo before the same change.
const ADVICE_TOOL = {
  name: "submit_advice",
  description: "Submit the verdict for each failing arm and one proposed path.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "What limits this motion across the five arms. At most 15 words." },
      robots: {
        type: "array",
        description: "One entry per failing arm.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "The arm's id from the input." },
            verdict: { type: "string", enum: ["path", "hardware"] },
            note: { type: "string", description: "The cause, citing a number from the input. At most 12 words." },
          },
          required: ["id", "verdict", "note"],
        },
      },
      waypoints: {
        type: "array",
        description: `3 to ${MAX_WAYPOINTS} points in mm, from the pick point to the place point.`,
        items: {
          type: "object",
          properties: { x: { type: "number" }, z: { type: "number" } },
          required: ["x", "z"],
        },
      },
    },
    required: ["summary", "robots", "waypoints"],
  },
};

// Per-instance cache, so each path is sent to Claude once per warm function.
const cache = new Map<string, Advice>();

// Any drawn path is a new paid call, so each visitor gets a few per hour.
// Per instance only: a cheap brake on abuse, not a hard cap. Cache hits are free.
const LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;
const asks = new Map<string, number[]>();

function allow(ip: string, now: number): boolean {
  const recent = (asks.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    asks.set(ip, recent);
    return false;
  }
  recent.push(now);
  asks.set(ip, recent);
  if (asks.size > 5000) asks.clear(); // keep the map bounded on a long-lived instance
  return true;
}

export async function POST(request: Request) {
  let body: { path?: unknown; objectWidth?: unknown } = {};
  try {
    body = ((await request.json()) as typeof body | null) ?? {};
  } catch {
    // fall through to the checks below
  }
  if (!isPath(body.path, SAMPLES) || !isWidth(body.objectWidth)) {
    return Response.json({ error: "Unknown path or object width." }, { status: 400 });
  }
  const path = body.path;
  const objectWidth = body.objectWidth;

  const key = adviceKey(path, objectWidth);
  const stored = CACHED_ADVICE[key] ?? cache.get(key);
  if (stored) return Response.json({ key, advice: stored });

  const failing = new Set(ROBOTS.filter((r) => run(r, path, objectWidth).firstFail !== null).map((r) => r.id));

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Claude is offline right now." }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip, Date.now())) {
    return Response.json({ error: "That is enough asks for now. Try again in an hour." }, { status: 429 });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools: [ADVICE_TOOL],
        tool_choice: { type: "tool", name: ADVICE_TOOL.name },
        messages: [
          {
            role: "user",
            content: `${describe(path, objectWidth)}\n\nFailing arms, one robots entry each: ${[...failing].join(", ")}.`,
          },
        ],
      },
      { signal: AbortSignal.timeout(55000) },
    );
    const call = message.content.find((b) => b.type === "tool_use");
    const advice = call && call.type === "tool_use" ? parseAdvice(call.input, failing) : null;
    if (!advice) {
      console.error(
        "dream-labs advise: unusable answer",
        message.stop_reason,
        [...failing].join(","),
        JSON.stringify(message.content).slice(0, 800),
      );
      return Response.json({ error: "Claude returned nothing usable. Try again." }, { status: 502 });
    }
    cache.set(key, advice);
    return Response.json({ key, advice });
  } catch (err) {
    console.error("dream-labs advise:", err);
    return Response.json({ error: "Claude could not be reached. Try again." }, { status: 502 });
  }
}
