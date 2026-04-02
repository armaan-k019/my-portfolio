import Anthropic from '@anthropic-ai/sdk';
import type { PulseData } from '../pulse/route';

const client = new Anthropic();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  question: string;
  history?: ChatMessage[];
  data: PulseData;
}

const SYSTEM_PROMPT = `You are Pulse, an AI campus assistant for Georgia Tech. You have real-time data about campus crowd levels, dining wait times, bus locations, and building activity. Answer questions helpfully and specifically — always reference actual numbers and times from the data you're given. Be concise and friendly. When optimizing someone's day, give a specific time-blocked schedule.

Current Georgia Tech campus data will be provided in each message. Use it to give accurate, current answers. If buses are available, mention specific routes. If a place is very busy, suggest alternatives or better times.`;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as RequestBody;
    const { question, history = [], data } = body;

    if (!question?.trim()) {
      return Response.json({ error: 'Question is required.' }, { status: 400 });
    }

    // Build a concise snapshot of campus data for context
    const snapshot = buildSnapshot(data);

    // Keep last 5 exchanges (10 messages) for context
    const recentHistory = history.slice(-10);

    const messages: Anthropic.MessageParam[] = [
      ...recentHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      {
        role: 'user',
        content: `Current campus data:\n${snapshot}\n\nQuestion: ${question}`,
      },
    ];

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return Response.json({ answer: text });
  } catch (err) {
    console.error('[pulse-ai] error:', err);
    return Response.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

function buildSnapshot(data: PulseData): string {
  const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  const day  = new Date(data.timestamp).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });

  const lines: string[] = [
    `Time: ${day}, ${time} (ET)`,
    `Weather: ${data.weather ? `${data.weather.temp}°F, ${data.weather.description}, wind ${data.weather.windspeed} mph` : 'unavailable'}`,
    '',
    'LOCATION BUSYNESS (0=empty, 100=packed):',
  ];

  for (const loc of data.locations) {
    const wait = loc.waitTime ? ` | Wait: ${loc.waitTime}` : '';
    lines.push(`  ${loc.name}: ${loc.busyness}% (${loc.status})${wait}`);
    if (loc.subScores) {
      for (const s of loc.subScores) {
        lines.push(`    - ${s.label}: ${s.score}%`);
      }
    }
  }

  lines.push('');
  if (data.buses.length > 0) {
    lines.push(`STINGER BUSES: ${data.buses.length} active`);
    const routes = [...new Set(data.buses.map(b => b.routeName))];
    lines.push(`  Active routes: ${routes.join(', ')}`);
  } else {
    lines.push('STINGER BUSES: No live data available');
  }

  return lines.join('\n');
}
