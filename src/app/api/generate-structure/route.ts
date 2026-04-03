import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a procedural 3D room/space geometry engine for acoustic analysis software. Given a famous structure or building type, return a JSON object describing the INTERIOR of that structure as a hollow shell — walls, floor, ceiling, and major interior architectural features only.

The goal is to simulate what it sounds like INSIDE the structure, not to show what it looks like from outside.

Rules:
- All surfaces face INWARD (the space is experienced from inside)
- No solid filled volumes — everything is a thin shell or surface
- No decorative colors — use only these neutral material colors:
    Walls/stone: #C8C0B0
    Floor: #A89880
    Ceiling: #D0C8BC
    Wood: #8B7355
    Metal: #909090
    Glass: #B0C0C8 with opacity: 0.3
- wireframe: false for all surfaces
- opacity: 1.0 for solid surfaces, 0.15-0.3 for transparent surfaces (glass)
- Build the interior as flat box planes, arches, columns, and vaults — not as a solid exterior form
- Scale so the interior space is 8-20 units wide and 4-12 units tall
- Camera should be positioned INSIDE the space looking toward the center: cameraPosition should be near a wall or corner, not outside the structure
- Y axis is up, floor at y=0
- Be concise. Use 8-20 components maximum. Do not add comments or explanations — only the JSON object.

Examples of what to build:
  Pagoda → multi-level wooden interior with low beamed ceilings, columns, and tiered floor levels
  Cathedral → tall nave with stone walls, ribbed vaulted ceiling, side aisles, large window openings
  Castle → great hall with thick stone walls, fireplace alcove, small windows
  Colosseum → curved arena seating bowl interior with tiered levels
  Pyramid → single chamber interior with sloped ceiling walls converging to a point

Return format:
{
  name: string,
  description: string (1 sentence describing the acoustic character of this space — e.g. 'Highly reverberant stone interior with long decay times'),
  cameraPosition: { x, y, z },
  components: [
    {
      type: 'box' | 'cylinder' | 'cone' | 'sphere' | 'tapered_box' | 'arch',
      position: { x, y, z },
      scale: { x, y, z },
      rotation: { x, y, z },
      color: hex string,
      opacity: number,
      wireframe: boolean
    }
  ]
}

Respond ONLY with valid JSON.`;

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
