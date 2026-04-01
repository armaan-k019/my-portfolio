import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { description?: unknown };
    const description = body.description;

    if (typeof description !== 'string' || description.trim().length === 0) {
      return Response.json({ error: 'description must be a non-empty string' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system:
        'You are a geometry parser. Convert natural language room descriptions into 3D geometry. ' +
        'Always respond with ONLY a valid JSON object with no extra text, in this exact format: ' +
        '{ "vertices": [{"x":0,"y":0,"z":0},...], "faces": [{"a":0,"b":1,"c":2},...] }. ' +
        'Vertices in meters. Faces must be triangulated and wound counter-clockwise for outward normals. ' +
        'Keep vertex count under 30.',
      messages: [
        {
          role: 'user',
          content: description,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return Response.json({ error: 'Unexpected response type from Claude' }, { status: 500 });
    }

    let parsed: unknown;
    try {
      // Strip any markdown code fences Claude might include despite instructions
      const raw = content.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error('JSON parse error from Claude response:', parseErr, content.text);
      return Response.json({ error: 'Claude returned invalid JSON' }, { status: 400 });
    }

    return Response.json(parsed);
  } catch (err) {
    console.error('parse-shape route error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
