import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a procedural 3D geometry engine. Given a famous structure or building type, return a JSON object describing how to build a simplified but recognizable 3D model using basic geometric primitives (boxes, cylinders, cones, spheres, tapered boxes).

The model is built on a base grid of 10x10 units. Return parameters for a 'components' array where each component is a primitive:

{
  type: 'box' | 'cylinder' | 'cone' | 'sphere' | 'tapered_box' | 'arch',
  position: { x, y, z },
  scale: { x, y, z },
  rotation: { x, y, z } (radians),
  color: hex string,
  opacity: 0.0-1.0,
  wireframe: boolean
}

Also return:
{
  name: string (display name),
  description: string (1 sentence architectural description),
  cameraPosition: { x, y, z },
  components: [...]
}

Guidelines:
- Be concise. Use 10-15 components maximum. Do not add comments or explanations — only the JSON object.
- Build recognizable silhouettes - accuracy of form matters more than detail
- Y axis is up. Place the base of the structure at y=0
- Scale components so the tallest point is between y=4 and y=12
- Use historically accurate proportions where possible
- Colors should be stone/material appropriate:
  ancient structures: warm grays and tans
  metal structures: dark gray with blue tint
  gothic: cool gray stone
  asian architecture: dark wood + curved red/green roof tiles
- Set wireframe: true for structural/lattice elements (like Eiffel Tower's frame)
- Respond ONLY with valid JSON`;

const FALLBACK_STRUCTURE = {
  name: "Simple Structure",
  description: "A basic geometric form.",
  cameraPosition: { x: 5, y: 5, z: 5 },
  components: [
    { type: "box",  position: { x: 0, y: 0.5,  z: 0 }, scale: { x: 4,   y: 1,   z: 4   }, rotation: { x: 0, y: 0, z: 0 }, color: "#8B7355", opacity: 1, wireframe: false },
    { type: "box",  position: { x: 0, y: 1.75, z: 0 }, scale: { x: 3,   y: 1.5, z: 3   }, rotation: { x: 0, y: 0, z: 0 }, color: "#9B8365", opacity: 1, wireframe: false },
    { type: "box",  position: { x: 0, y: 3.25, z: 0 }, scale: { x: 2,   y: 1.5, z: 2   }, rotation: { x: 0, y: 0, z: 0 }, color: "#AB9375", opacity: 1, wireframe: false },
    { type: "cone", position: { x: 0, y: 5,    z: 0 }, scale: { x: 1.5, y: 2,   z: 1.5 }, rotation: { x: 0, y: 0, z: 0 }, color: "#BB9355", opacity: 1, wireframe: false },
  ],
};

function repairJSON(raw: string): string {
  let openBraces = 0;
  let openBrackets = 0;
  let lastValidPos = 0;

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") openBraces++;
    if (raw[i] === "}") {
      openBraces--;
      if (openBraces === 0) lastValidPos = i;
    }
    if (raw[i] === "[") openBrackets++;
    if (raw[i] === "]") openBrackets--;
  }

  let repaired = raw.slice(0, lastValidPos + 1);
  if (openBrackets > 0) repaired += "]";
  if (openBraces > 0) repaired += "}";
  return repaired;
}

export async function POST(request: Request) {
  const body = await request.json() as { name: string };
  const { name } = body;
  if (!name?.trim()) return Response.json({ error: "No structure name provided" }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let message: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Generate a 3D model for: ${name}` }],
      }, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return Response.json({ error: "No response from Claude" }, { status: 500 });

    let raw = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    try {
      const data = JSON.parse(raw);
      return Response.json(data);
    } catch {
      // Attempt repair on truncated JSON
      try {
        const data = JSON.parse(repairJSON(raw));
        return Response.json(data);
      } catch {
        // Return fallback with a soft warning
        return Response.json({
          ...FALLBACK_STRUCTURE,
          _warning: `Could not fully generate ${name} — showing simplified form. Try again for a different result.`,
        });
      }
    }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted") || err.message.includes("timeout"));
    const msg = isTimeout
      ? "Generation timed out — try a simpler structure name"
      : err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
