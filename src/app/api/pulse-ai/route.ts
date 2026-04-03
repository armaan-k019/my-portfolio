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

const SYSTEM_PROMPT = `You are Pulse - a knowledgeable campus companion for Georgia Tech students. You have real-time data on crowd levels, dining hours and wait times, building activity, campus events, and Stinger bus routes. Think of yourself as a helpful friend who knows GT inside and out, not a search engine.

Personality:
- Warm, direct, and a little casual - this is campus life, not a business meeting
- Lead with the useful answer, not disclaimers
- Reference specific numbers and places from the data (e.g. "Clough is at 34%, pretty chill right now")
- If something is closed, say so clearly and suggest an open alternative
- When someone wants to plan their time, give a concrete suggestion, not a list of options
- If the data doesn't cover something, say "I'm not sure about that one" instead of guessing
- Don't bullet-point simple answers - just talk. Use bullets only when listing 3+ distinct things

Keep responses short unless someone clearly wants detail. One or two sentences often beats a paragraph.`;


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
    const openTag = loc.isOpen ? 'OPEN' : 'CLOSED';
    const wait    = loc.waitTime ? ` | wait ~${loc.waitTime}` : '';
    const hours   = loc.hoursToday ? ` | today: ${loc.hoursToday}` : '';
    lines.push(`  ${loc.name} [${openTag}]: ${loc.busyness}% (${loc.status})${wait}${hours}`);
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
