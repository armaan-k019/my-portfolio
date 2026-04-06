import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

// ─── Exported types ───────────────────────────────────────────────────────────

export interface UnifiedEvent {
  title: string;
  date: string;          // Human readable "Mon, Apr 7"
  time: string | null;   // "7:00 PM" or null
  location: string | null;
  organization: string;
  type: 'party' | 'social' | 'official' | 'popup' | 'sports' | 'lecture' | 'other';
  description: string;
  url: string;
  onCampus: boolean;
  source: 'involvement' | 'eventbrite' | 'registrar';
}

export type SourceStatus = 'ok' | 'error' | 'skipped';

export interface EventsResponse {
  events: UnifiedEvent[];
  failedSources: string[];
  skippedSources: string[];
  sourceDebug: {
    involvement: { status: SourceStatus; count: number };
    eventbrite:  { status: SourceStatus; count: number };
    registrar:   { status: SourceStatus; count: number };
  };
}

// ─── Caches ───────────────────────────────────────────────────────────────────

const CACHE_30M = 30 * 60 * 1000;
const CACHE_24H = 24 * 60 * 60 * 1000;

let involvementCache: { events: UnifiedEvent[]; status: SourceStatus; timestamp: number } | null = null;
let eventbriteCache:  { events: UnifiedEvent[]; status: SourceStatus; timestamp: number } | null = null;
let registrarCache:   {
  events: UnifiedEvent[];
  status: SourceStatus;
  timestamp:   number;
} | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const client = new Anthropic();

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function todayString(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function classifyType(title: string, desc: string): UnifiedEvent['type'] {
  const t = `${title} ${desc}`.toLowerCase();
  if (/party|social|mixer|gala|reception|networking/i.test(t)) return 'social';
  if (/lecture|seminar|talk|colloquium|symposium|workshop|panel/i.test(t)) return 'lecture';
  if (/game|match|tournament|race|run|sport|athletic/i.test(t)) return 'sports';
  if (/popup|pop-up|fair|market|expo/i.test(t)) return 'popup';
  if (/ceremony|commencement|graduation|official|conference|meeting/i.test(t)) return 'official';
  return 'other';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ─── Source 1: GT Involvement Link (gatech.campuslabs.com) ───────────────────

async function fetchInvolvementEvents(): Promise<{ events: UnifiedEvent[]; status: SourceStatus }> {
  if (involvementCache && Date.now() - involvementCache.timestamp < CACHE_30M) {
    console.log(`[events] Involvement: cache hit (${involvementCache.events.length} events)`);
    return { events: involvementCache.events, status: involvementCache.status };
  }

  // Primary and fallback CampusLabs API endpoints
  const apiUrls = [
    'https://gatech.campuslabs.com/engage/api/events?orderByField=startDateTime&orderByDirection=ascending&status=approved&take=25&skip=0',
    'https://gatech.campuslabs.com/engage/api/discovery/event/search?orderByField=startDateTime&orderByDirection=ascending&status=approved&take=25',
  ];

  for (const url of apiUrls) {
    try {
      console.log(`[events] Involvement: trying ${url}`);
      const res = await fetchWithTimeout(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://gatech.campuslabs.com/engage/events',
        },
      }, 10000);

      console.log(`[events] Involvement: HTTP ${res.status} from ${url}`);
      if (!res.ok) continue;

      const text = await res.text();
      console.log(`[events] Involvement: raw response (first 500 chars): ${text.slice(0, 500)}`);

      let data: { value?: unknown[]; items?: unknown[] };
      try {
        data = JSON.parse(text);
      } catch {
        console.log('[events] Involvement: response is not JSON, skipping');
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: any[] = data.value ?? data.items ?? [];
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`[events] Involvement: empty items array from ${url}`);
        continue;
      }

      const now = Date.now();
      const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events: UnifiedEvent[] = items.flatMap((item: any) => {
        const startsOn: string = item.startsOn ?? item.startDateTime ?? '';
        if (!startsOn) return [];
        const start = new Date(startsOn).getTime();
        if (start < now || start > now + twoWeeksMs) return [];

        const title: string = item.name ?? item.title ?? '';
        const desc: string = item.description ?? item.summary ?? '';
        const org: string = item.organizationName ?? item.organizerName ?? 'GT Involvement';
        const loc: string | null = item.location ?? item.locationName ?? null;
        const id: string | number = item.id ?? '';

        return [{
          title,
          date: formatDate(startsOn),
          time: formatTime(startsOn),
          location: loc,
          organization: org,
          type: classifyType(title, desc),
          description: stripHtml(desc).slice(0, 120),
          url: id ? `https://gatech.campuslabs.com/engage/event/${id}` : 'https://gatech.campuslabs.com/engage/events',
          onCampus: true,
          source: 'involvement' as const,
        }];
      });

      console.log(`[events] Involvement: ${events.length} events from ${url}`);
      involvementCache = { events, status: 'ok', timestamp: Date.now() };
      return { events, status: 'ok' };
    } catch (err) {
      console.error(`[events] Involvement error for ${url}:`, err);
    }
  }

  console.log('[events] Involvement: all endpoints failed');
  involvementCache = { events: [], status: 'error', timestamp: Date.now() };
  return { events: [], status: 'error' };
}

// ─── Source 2: Eventbrite API ────────────────────────────────────────────────

async function fetchEventbriteEvents(): Promise<{ events: UnifiedEvent[]; status: SourceStatus }> {
  if (eventbriteCache && Date.now() - eventbriteCache.timestamp < CACHE_30M) {
    console.log(`[events] Eventbrite: cache hit (${eventbriteCache.events.length} events)`);
    return { events: eventbriteCache.events, status: eventbriteCache.status };
  }

  if (!process.env.EVENTBRITE_API_KEY) {
    console.log('[events] Eventbrite: no API key, skipping');
    eventbriteCache = { events: [], status: 'skipped', timestamp: Date.now() };
    return { events: [], status: 'skipped' };
  }

  try {
    const now = new Date();
    const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      q: 'Georgia Tech',
      'location.address': 'Atlanta, GA',
      'location.within': '2mi',
      'start_date.range_start': now.toISOString(),
      'start_date.range_end': twoWeeks.toISOString(),
      expand: 'venue,organizer',
      sort_by: 'date',
    });

    const res = await fetchWithTimeout(
      `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.EVENTBRITE_API_KEY}`,
          'Accept': 'application/json',
        },
      },
      10000
    );

    console.log(`[events] Eventbrite: HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as { events?: any[] };
    const rawEvents = data.events ?? [];

    const events: UnifiedEvent[] = rawEvents.map((e: {
      name?: { text?: string };
      start?: { local?: string };
      venue?: { name?: string; address?: { localized_address_display?: string } };
      organizer?: { name?: string };
      description?: { text?: string };
      url?: string;
    }) => {
      const title = e.name?.text ?? '';
      const desc = e.description?.text ?? '';
      const startLocal = e.start?.local ?? '';
      const startDate = startLocal ? new Date(startLocal) : null;
      const locationName: string | null =
        e.venue?.name ??
        e.venue?.address?.localized_address_display ??
        null;

      return {
        title,
        date: startDate ? formatDate(startDate.toISOString()) : '',
        time: startDate ? formatTime(startDate.toISOString()) : null,
        location: locationName,
        organization: e.organizer?.name ?? 'Eventbrite',
        type: classifyType(title, desc),
        description: desc.slice(0, 100),
        url: e.url ?? '',
        onCampus: /georgia\s*tech|north\s*ave|ferst|bobby\s*dodd/i.test(locationName ?? ''),
        source: 'eventbrite' as const,
      };
    });

    console.log(`[events] Eventbrite: ${events.length} events`);
    eventbriteCache = { events, status: 'ok', timestamp: Date.now() };
    return { events, status: 'ok' };
  } catch (err) {
    console.error('[events] Eventbrite error:', err);
    eventbriteCache = { events: [], status: 'error', timestamp: Date.now() };
    return { events: [], status: 'error' };
  }
}

// ─── Source 3: GT Registrar ───────────────────────────────────────────────────

// Hardcoded fallback for Spring 2025 when live fetch fails
const REGISTRAR_FALLBACK_EVENTS: UnifiedEvent[] = [
  {
    title: 'Final Exams Begin',
    date: 'Mon, Apr 28',
    time: null,
    location: null,
    organization: 'GT Registrar',
    type: 'official',
    description: 'Final exam period begins for Spring 2025.',
    url: 'https://registrar.gatech.edu/calendar',
    onCampus: true,
    source: 'registrar',
  },
  {
    title: 'Final Exams End',
    date: 'Sat, May 3',
    time: null,
    location: null,
    organization: 'GT Registrar',
    type: 'official',
    description: 'Final exam period ends for Spring 2025.',
    url: 'https://registrar.gatech.edu/calendar',
    onCampus: true,
    source: 'registrar',
  },
  {
    title: 'Spring Commencement',
    date: 'Fri, May 9',
    time: null,
    location: 'Bobby Dodd Stadium',
    organization: 'GT Registrar',
    type: 'official',
    description: 'Spring 2025 commencement ceremony.',
    url: 'https://registrar.gatech.edu/calendar',
    onCampus: true,
    source: 'registrar',
  },
];

async function fetchRegistrarEvents(): Promise<{
  events: UnifiedEvent[];
  status: SourceStatus;
}> {
  const fallback = {
    events: REGISTRAR_FALLBACK_EVENTS,
    status: 'ok' as SourceStatus,
  };

  if (registrarCache && Date.now() - registrarCache.timestamp < CACHE_24H) {
    console.log(`[events] Registrar: cache hit (${registrarCache.events.length} events)`);
    return { ...registrarCache, status: registrarCache.status };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    registrarCache = { ...fallback, timestamp: Date.now() };
    return fallback;
  }

  // Try multiple URLs in order
  const calUrls = [
    'https://registrar.gatech.edu/calendar',
    'https://registrar.gatech.edu/info/calendar',
  ];

  let calText = '';
  for (const url of calUrls) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PulseGT/1.0)', 'Accept': 'text/html' },
      }, 12000);
      console.log(`[events] Registrar calendar: HTTP ${res.status} from ${url}`);
      if (res.ok) {
        const html = await res.text();
        console.log(`[events] Registrar calendar HTML (first 500 chars): ${html.slice(0, 500)}`);
        calText = stripHtml(html).slice(0, 3000);
        if (calText.length > 200) break;
      }
    } catch (err) {
      console.error(`[events] Registrar calendar fetch error for ${url}:`, err);
    }
  }

  if (!calText) {
    console.warn('[events] Registrar: all pages failed, using hardcoded fallback');
    registrarCache = { ...fallback, timestamp: Date.now() };
    return fallback;
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Today is ${todayString()}. Extract Georgia Tech academic calendar events from the following page.

ACADEMIC CALENDAR PAGE:
${calText || '(unavailable)'}

Return ONLY this JSON object (no preamble, no code fences):
{
  "events": [
    {"title":"Spring Break","date":"Mon, Mar 10","time":null,"location":null,"organization":"GT Registrar","type":"official","description":"Spring break begins — no classes.","url":"https://registrar.gatech.edu/calendar","onCampus":false,"source":"registrar"}
  ]
}

Rules:
- events: academic calendar dates within the next 60 days (breaks, graduation, registration deadlines, commencement)
- If the page was unavailable, return an empty events array`,
      }],
    });

    const block = msg.content.find(b => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('no text block');
    const raw = block.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(raw) as { events: UnifiedEvent[] };

    const result = {
      events: (parsed.events ?? []).length > 0 ? parsed.events : REGISTRAR_FALLBACK_EVENTS,
      status: 'ok' as SourceStatus,
    };

    console.log(`[events] Registrar: ${result.events.length} events`);
    registrarCache = { ...result, timestamp: Date.now() };
    return result;
  } catch (err) {
    console.error('[events] Registrar Claude error:', err);
    // Fall back to hardcoded data so registrar always has something
    registrarCache = { ...fallback, timestamp: Date.now() };
    return fallback;
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicate(events: UnifiedEvent[]): UnifiedEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  console.log('[events] GET called');

  const [invRes, ebRes, regRes] = await Promise.allSettled([
    fetchInvolvementEvents(),
    fetchEventbriteEvents(),
    fetchRegistrarEvents(),
  ]);

  const failedSources:  string[] = [];
  const skippedSources: string[] = [];

  const invResult = invRes.status === 'fulfilled'
    ? invRes.value
    : (failedSources.push('involvement'), { events: [] as UnifiedEvent[], status: 'error' as SourceStatus });

  const ebResult = ebRes.status === 'fulfilled'
    ? ebRes.value
    : (failedSources.push('eventbrite'), { events: [] as UnifiedEvent[], status: 'error' as SourceStatus });

  const regResult = regRes.status === 'fulfilled'
    ? regRes.value
    : (failedSources.push('registrar'), { events: [] as UnifiedEvent[], status: 'error' as SourceStatus });

  if (invResult.status === 'skipped') skippedSources.push('involvement');
  else if (invResult.status === 'error') { if (!failedSources.includes('involvement')) failedSources.push('involvement'); }

  if (ebResult.status === 'skipped') skippedSources.push('eventbrite');
  else if (ebResult.status === 'error') { if (!failedSources.includes('eventbrite')) failedSources.push('eventbrite'); }

  if (regResult.status === 'skipped') skippedSources.push('registrar');
  else if (regResult.status === 'error') { if (!failedSources.includes('registrar')) failedSources.push('registrar'); }

  const allEvents = deduplicate([...invResult.events, ...ebResult.events, ...regResult.events]);

  console.log(`[events] Total: ${allEvents.length} events | inv:${invResult.status}(${invResult.events.length}) eb:${ebResult.status}(${ebResult.events.length}) reg:${regResult.status}(${regResult.events.length})`);

  return Response.json({
    events:          allEvents,
    failedSources,
    skippedSources,
    sourceDebug: {
      involvement: { status: invResult.status, count: invResult.events.length },
      eventbrite:  { status: ebResult.status,  count: ebResult.events.length  },
      registrar:   { status: regResult.status,  count: regResult.events.length  },
    },
  } as EventsResponse);
}
