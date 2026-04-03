import Anthropic from '@anthropic-ai/sdk';
import type { ShapeArchetype, ShapeParams } from '@/types';

const client = new Anthropic();

const VALID_ARCHETYPES: ShapeArchetype[] = ['orthogonal', 'pitched', 'cylinder', 'barrel_vault', 'dome', 'sloped_auditorium', 'pyramid', 'wedge'];

function clamp(val: unknown, min: number, max: number, def: number): number {
  const n = typeof val === 'number' ? val : def;
  if (!isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function validateShapeParams(raw: unknown): ShapeParams {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Response is not an object');
  }
  const obj = raw as Record<string, unknown>;

  const archetype = obj.archetype as ShapeArchetype;
  if (!VALID_ARCHETYPES.includes(archetype)) {
    throw new Error(`Invalid archetype: ${String(obj.archetype)}`);
  }

  if (typeof obj.dimensions !== 'object' || obj.dimensions === null) {
    throw new Error('Missing dimensions object');
  }
  const d = obj.dimensions as Record<string, unknown>;

  return {
    archetype,
    dimensions: {
      length:       d.length       !== undefined ? clamp(d.length,       2, 200, 10) : undefined,
      width:        d.width        !== undefined ? clamp(d.width,        2, 200, 8)  : undefined,
      height:       d.height       !== undefined ? clamp(d.height,       1, 60,  4)  : undefined,
      radius:       d.radius       !== undefined ? clamp(d.radius,       1, 100, 5)  : undefined,
      peak_height:  d.peak_height  !== undefined ? clamp(d.peak_height,  0, 60,  2)  : undefined,
      front_height: d.front_height !== undefined ? clamp(d.front_height, 0, 60,  3)  : undefined,
      rear_height:  d.rear_height  !== undefined ? clamp(d.rear_height,  1, 60,  7)  : undefined,
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { description?: unknown };
    const description = body.description;

    if (typeof description !== 'string' || description.trim().length === 0) {
      return Response.json({ error: 'description must be a non-empty string' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 256,
      system: `You are an architectural space classifier. Parse natural language room descriptions and output ONLY a JSON object with the room archetype and key dimensions.

Archetypes:
- "orthogonal": rectangular box room (any rectangular space)
- "pitched": rectangular floor plan with peaked/gabled ridge roof
- "cylinder": circular floor plan with flat ceiling (round room, rotunda)
- "barrel_vault": rectangular floor plan with semicircular arched vault ceiling
- "dome": circular floor plan with hemispherical domed ceiling
- "sloped_auditorium": rectangular floor plan, front wall shorter than rear (tiered seating, lecture hall, theater)
- "pyramid": square/rectangular base converging to a single apex (pyramidal room, atrium)
- "wedge": triangular cross-section with a sloped ceiling from low front to high rear (recording booth, home theater, ramp)

Output format - respond with ONLY this JSON, no other text or markdown:
{
  "archetype": "<orthogonal|pitched|cylinder|barrel_vault|dome|sloped_auditorium|pyramid|wedge>",
  "dimensions": {
    "length": <meters, for orthogonal/pitched/barrel_vault/sloped_auditorium/pyramid/wedge>,
    "width": <meters, for orthogonal/pitched/barrel_vault/sloped_auditorium/pyramid/wedge>,
    "height": <meters, wall/eave height or apex height for pyramid>,
    "radius": <meters, for cylinder/dome only>,
    "peak_height": <meters above eave, for pitched/barrel_vault only>,
    "front_height": <meters, front wall height for sloped_auditorium/wedge>,
    "rear_height": <meters, rear wall height for sloped_auditorium/wedge>
  }
}

Rules:
- Include only dimension fields relevant to the archetype
- Omit radius for non-circular archetypes; omit length/width for cylinder/dome
- All numbers in meters, range 2–200 m
- For pitched: height = eave height, peak_height = ridge rise above eave
- For barrel_vault: peak_height = arch rise above spring line (≈ width/2 for semicircle)
- For dome: radius covers both plan radius and dome radius; height = drum wall height (0 if none)
- For sloped_auditorium: front_height = stage/front wall height, rear_height = back wall height
- For wedge: front_height = low end height (can be 0), rear_height = tall end height
- For pyramid: use length, width, height (apex height)
- Default to orthogonal if unclear`,
      messages: [{ role: 'user', content: description }],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return Response.json({ error: 'Unexpected response type from Claude' }, { status: 500 });
    }

    let rawParsed: unknown;
    try {
      const text = content.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      rawParsed = JSON.parse(text);
    } catch {
      console.error('[parse-shape] JSON parse error:', content.text);
      return Response.json({ error: 'Claude returned invalid JSON. Try rephrasing your description.' }, { status: 422 });
    }

    let params: ShapeParams;
    try {
      params = validateShapeParams(rawParsed);
    } catch (err) {
      console.error('[parse-shape] Validation error:', err);
      return Response.json({ error: `Could not interpret room description: ${err instanceof Error ? err.message : String(err)}` }, { status: 422 });
    }

    return Response.json(params);
  } catch (err) {
    console.error('[parse-shape] Unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
