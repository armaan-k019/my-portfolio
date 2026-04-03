import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

interface EventItem {
  title: string;
  location: string;
  date: string;
  time: string;
  description: string;
  url: string;
  onCampus: boolean;
}

// In-memory cache (30 minutes)
let cache: { events: EventItem[]; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

const client = new Anthropic();

function parseRSSItems(xml: string): { title: string; link: string; description: string; pubDate: string }[] {
  const items: { title: string; link: string; description: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const getField = (tag: string): string => {
      const cdataMatch = new RegExp(`<${tag}><\\!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`).exec(item);
      if (cdataMatch) return cdataMatch[1].trim();
      const plainMatch = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(item);
      return plainMatch ? plainMatch[1].trim() : '';
    };
    const link = getField('link') || (/<link>([\s\S]*?)<\/link>/.exec(item))?.[1]?.trim() || '';
    items.push({
      title:       getField('title'),
      link,
      description: getField('description'),
      pubDate:     getField('pubDate'),
    });
  }
  return items;
}


export async function GET(): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ events: [] });
  }

  // Serve from cache if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return Response.json({ events: cache.events });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://calendar.gatech.edu/rss', {
      signal:  controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseGT/1.0)' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[events] RSS fetch failed: ${res.status}`);
      return Response.json({ events: cache?.events ?? [] });
    }

    const xml  = await res.text();
    const all  = parseRSSItems(xml);
    // Take up to 30 items - do NOT filter by pubDate (that's publish date, not event date).
    // Claude will extract actual event dates from the description content and filter for upcoming.
    const items = all.slice(0, 30);

    if (items.length === 0) {
      cache = { events: [], timestamp: Date.now() };
      return Response.json({ events: [] });
    }

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `Today is ${today}. Below are items from the Georgia Tech campus events RSS feed. Each item may have its actual event date embedded in the title, description, or a custom field - the RSS pubDate is the *publish* date, not the event date.

Items:
${items.map((item, i) => `${i + 1}. Title: ${item.title}
   RSS pubDate: ${item.pubDate}
   URL: ${item.link}
   Content: ${item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)}`).join('\n\n')}

Campus locations to recognize: Tech Green, Student Center, Clough Commons / CULC, Klaus, Van Leer, Skiles, Boggs Chemistry, Mason, CRC (Campus Recreation Center), North Ave Dining, West Village Dining, Bobby Dodd Stadium, Ferst Center, Exhibition Hall, Tech Tower, Georgia Tech campus.

Return ONLY a JSON array (no preamble, no markdown fences). Include only events whose actual event date is today or in the future. If you cannot determine the event date, include it. Aim for 5–10 events max.
[{"title":"...","location":"...","date":"...","time":"...","description":"...","url":"...","onCampus":true}]

Rules:
- date: extract the real event date from the content, format as "Mon, Apr 7" - do NOT use pubDate
- time: "2:00 PM", "9:00 AM – 5:00 PM", or "All day"
- description: 1–2 sentence plain text summary of what the event is
- location: normalized campus building name, or "Off Campus" if not at GT
- onCampus: true only if clearly at a GT Atlanta campus location`;

    const message = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    });

    const block = message.content.find(b => b.type === 'text');
    if (!block || block.type !== 'text') {
      cache = { events: [], timestamp: Date.now() };
      return Response.json({ events: [] });
    }

    const raw    = block.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const events = JSON.parse(raw) as EventItem[];
    cache = { events, timestamp: Date.now() };
    return Response.json({ events });
  } catch (err) {
    clearTimeout(timeout);
    console.error('[events] Error:', err);
    return Response.json({ events: cache?.events ?? [] });
  }
}
