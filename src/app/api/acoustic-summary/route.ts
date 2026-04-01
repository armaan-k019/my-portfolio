import Anthropic from '@anthropic-ai/sdk';
import type { AcousticMetrics, SurfaceGroup } from '@/types';
import { OCTAVE_BANDS } from '@/lib/acoustics';

export async function POST(request: Request): Promise<Response> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const body = await request.json() as {
      metrics?: unknown;
      shapeDescription?: unknown;
      surfaceGroups?: unknown;
    };
    const metrics = body.metrics as AcousticMetrics | undefined;
    const shapeDescription = body.shapeDescription;
    const surfaceGroups = (body.surfaceGroups ?? []) as SurfaceGroup[];

    if (!metrics || typeof metrics !== 'object') {
      return Response.json({ error: 'metrics object is required' }, { status: 400 });
    }
    if (typeof shapeDescription !== 'string') {
      return Response.json({ error: 'shapeDescription must be a string' }, { status: 400 });
    }

    const bandValues = [
      metrics.octaveBandRT60.hz125, metrics.octaveBandRT60.hz250, metrics.octaveBandRT60.hz500,
      metrics.octaveBandRT60.hz1000, metrics.octaveBandRT60.hz2000, metrics.octaveBandRT60.hz4000,
    ];
    const octaveBandLines = OCTAVE_BANDS.map((band, i) => `  ${band}: ${bandValues[i].toFixed(2)} s`).join('\n');

    const materialLines = surfaceGroups.length > 0
      ? surfaceGroups.map(g => `  ${g.label}: ${g.material}`).join('\n')
      : '  (default: concrete)';

    const userMessage =
      `Room description: ${shapeDescription}\n\n` +
      `Volume: ${metrics.volume.toFixed(1)} m³\n` +
      `Surface Area: ${metrics.surfaceArea.toFixed(1)} m²\n` +
      `RT60 (500 Hz): ${metrics.rt60.toFixed(2)} s\n` +
      `Early Reflections detected: ${metrics.earlyReflections}\n\n` +
      `Octave band RT60:\n${octaveBandLines}\n\n` +
      `Surface materials:\n${materialLines}`;

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 600,
      system:
        'You are an architectural acoustics consultant. Given room metrics including octave band RT60 data ' +
        'and surface materials, provide a concise expert analysis in markdown format. Use ## headings for ' +
        '"Reverberation Character", "Frequency Response", and "Design Recommendations". Keep each section ' +
        '2-3 sentences. Be specific and practical. Reference the actual numbers and materials provided.',
      messages: [{ role: 'user', content: userMessage }],
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
