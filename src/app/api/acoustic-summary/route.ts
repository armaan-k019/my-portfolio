import Anthropic from '@anthropic-ai/sdk';
import type { AcousticMetrics } from '@/types';

const client = new Anthropic();

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { metrics?: unknown; shapeDescription?: unknown };
    const metrics = body.metrics as AcousticMetrics | undefined;
    const shapeDescription = body.shapeDescription;

    if (!metrics || typeof metrics !== 'object') {
      return Response.json({ error: 'metrics object is required' }, { status: 400 });
    }
    if (typeof shapeDescription !== 'string') {
      return Response.json({ error: 'shapeDescription must be a string' }, { status: 400 });
    }

    const userMessage =
      `Room description: ${shapeDescription}\n\n` +
      `Volume: ${metrics.volume.toFixed(1)} m³\n` +
      `Surface Area: ${metrics.surfaceArea.toFixed(1)} m²\n` +
      `RT60: ${metrics.rt60.toFixed(2)} seconds\n` +
      `Early Reflections: ${metrics.earlyReflections} detected`;

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      system:
        'You are an architectural acoustics consultant. Given room metrics, provide a concise ' +
        '3-4 sentence plain-English acoustic analysis. Mention reverberation character, potential ' +
        'echo issues, and one design suggestion. Be specific and practical.',
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return Response.json({ error: 'Unexpected response type from Claude' }, { status: 500 });
    }

    return Response.json({ summary: content.text });
  } catch (err) {
    console.error('acoustic-summary route error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
