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
- Use 8-25 components for complexity
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

export async function POST(request: Request) {
  const body = await request.json() as { name: string };
  const { name } = body;
  if (!name?.trim()) return Response.json({ error: "No structure name provided" }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Generate a 3D model for: ${name}` }],
    }, { signal: AbortSignal.timeout(15000) });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return Response.json({ error: "No response from Claude" }, { status: 500 });

    let raw = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    const data = JSON.parse(raw);
    return Response.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Failed: ${msg}` }, { status: 500 });
  }
}
