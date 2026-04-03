import { NewsResult } from '../types/index';

const YOU_SEARCH_URL = process.env.YOU_SEARCH_URL ?? 'https://api.ydc-index.io/search';
const YOU_CONTENTS_URL = process.env.YOU_CONTENTS_URL ?? 'https://api.ydc-index.io/v1/contents';
const API_KEY = process.env.YOU_API_KEY ?? '';

const CURRENT_YEAR = new Date().getFullYear();
const TODAY = new Date().toISOString().split('T')[0];

const LATAM_COMPETITORS = ['Clara', 'Higo', 'Konfío', 'Konfio', 'Belvo', 'Tribal Credit', 'Mendel'];

function isLatAmCompetitor(name: string): boolean {
  return LATAM_COMPETITORS.some((n) => name.toLowerCase().includes(n.toLowerCase()));
}

function ageInMonths(dateStr: string): number {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return NaN;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function extractDateFromText(text: string): { date: string; isEstimated: boolean } {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return { date: isoMatch[1], isEstimated: false };

  const monthYearMatch = text.match(
    /\b((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(?:\d{1,2},?\s+)?\d{4})\b/i,
  );
  if (monthYearMatch) return { date: monthYearMatch[1], isEstimated: true };

  const quarterMatch = text.match(/\b(Q[1-4]\s*\d{4}|\d{4}\s*Q[1-4])\b/i);
  if (quarterMatch) return { date: quarterMatch[1], isEstimated: true };

  const yearMatch = text.match(/\b(202[3-9]|20[3-9]\d)\b/);
  if (yearMatch) return { date: yearMatch[1], isEstimated: true };

  return { date: `Retrieved ${TODAY}`, isEstimated: true };
}

interface YouHit {
  title?: string;
  url?: string;
  description?: string;
  snippet?: string;
  published_date?: string;
  source?: string;
}

interface YouSearchResponse {
  hits?: YouHit[];
  results?: YouHit[];
}

async function callYouSearch(query: string, maxResults = 10): Promise<YouHit[]> {
  const url = new URL(YOU_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('num_web_results', String(maxResults));
  url.searchParams.set('recency_days', '365');

  const response = await fetch(url.toString(), {
    headers: {
      'X-API-Key': API_KEY,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`You.com API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as YouSearchResponse;
  return data.hits ?? data.results ?? [];
}

function normalizeHit(hit: YouHit): NewsResult {
  const snippet = hit.description ?? hit.snippet ?? '';
  let publishedDate: string;
  let isEstimated: boolean;

  if (hit.published_date) {
    publishedDate = hit.published_date;
    isEstimated = false;
  } else {
    const extracted = extractDateFromText(snippet + ' ' + (hit.title ?? ''));
    publishedDate = extracted.date;
    isEstimated = extracted.isEstimated;
  }

  const age = ageInMonths(publishedDate);
  const olderIntelSuffix = (!isNaN(age) && age >= 6) ? ' ⚠ Older intel - verify if still current' : '';

  let sourceHost = 'unknown';
  try {
    sourceHost = new URL(hit.url ?? 'https://unknown').hostname;
  } catch {
    // leave as 'unknown'
  }

  return {
    title: hit.title ?? 'Untitled',
    url: hit.url ?? '',
    snippet: snippet + olderIntelSuffix,
    publishedDate,
    isEstimated,
    source: hit.source ?? sourceHost,
  };
}

function dateSortScore(result: NewsResult): number {
  const yearMatch = result.publishedDate.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : 0;
  if (year >= 2026 && !result.isEstimated) return 0;
  if (year === 2025 && !result.isEstimated) return 1;
  if (result.isEstimated) return 2;
  return 3;
}

export async function searchCompetitorNews(
  competitorName: string,
  query?: string,
): Promise<NewsResult[]> {
  if (!API_KEY) {
    console.warn('[NewsSearch] YOU_API_KEY not set - skipping news search');
    return [];
  }

  const primaryQuery = query
    ? `${competitorName} ${CURRENT_YEAR} ${query}`
    : `${competitorName} ${CURRENT_YEAR} corporate card fintech update`;
  const newsQuery = `${competitorName} ${CURRENT_YEAR} announcement pricing product launch`;

  const searchCalls: Promise<PromiseSettledResult<YouHit[]>>[] = [
    Promise.allSettled([callYouSearch(primaryQuery, 15)]).then((r) => r[0]),
    Promise.allSettled([callYouSearch(newsQuery, 15)]).then((r) => r[0]),
  ];

  if (isLatAmCompetitor(competitorName)) {
    const spanishQuery = `${competitorName} ${CURRENT_YEAR} actualización producto fintech`;
    searchCalls.push(
      Promise.allSettled([callYouSearch(spanishQuery, 15)]).then((r) => r[0]),
    );
  }

  try {
    const settled = await Promise.allSettled(
      searchCalls.map((p) => p.then((r) => (r.status === 'fulfilled' ? r.value : []))),
    );

    const combined: YouHit[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') combined.push(...result.value);
    }

    const seen = new Set<string>();
    const deduped = combined.filter((h) => {
      if (!h.url || seen.has(h.url)) return false;
      seen.add(h.url);
      return true;
    });

    const results = deduped
      .map(normalizeHit)
      .filter((r) => {
        const age = ageInMonths(r.publishedDate);
        if (!isNaN(age) && age >= 12) return false;
        const yearMatch = r.publishedDate.match(/\b(20\d{2})\b/);
        if (yearMatch && parseInt(yearMatch[1]) < 2025) return false;
        return true;
      })
      .slice(0, 15);

    if (results.length < 3) {
      const fallbackHits = await callYouSearch(`${competitorName} fintech latest news`, 10).catch(() => []);
      const seenUrls = new Set(results.map((r) => r.url));
      const fallbackResults = fallbackHits
        .filter((h) => h.url && !seenUrls.has(h.url))
        .map(normalizeHit)
        .map((r) => ({ ...r, snippet: `${r.snippet} ~ Older intel - date unverified` }))
        .slice(0, 3 - results.length);
      results.push(...fallbackResults);
    }

    results.sort((a, b) => dateSortScore(a) - dateSortScore(b));
    const topResults = results.slice(0, 10);

    console.log(`[NewsSearch] ${competitorName}: ${topResults.length} result(s) retrieved`);
    return topResults;
  } catch (err) {
    console.warn(`[NewsSearch] Failed for ${competitorName}:`, err);
    return [];
  }
}

export async function fetchPageContents(url: string): Promise<string> {
  if (!API_KEY) return '';

  try {
    const endpoint = new URL(YOU_CONTENTS_URL);
    endpoint.searchParams.set('url', url);

    const response = await fetch(endpoint.toString(), {
      headers: {
        'X-API-Key': API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`[NewsSearch] fetchPageContents ${response.status} for ${url}`);
      return '';
    }

    const data = await response.json() as { content?: string; text?: string; markdown?: string };
    return data.content ?? data.text ?? data.markdown ?? '';
  } catch (err) {
    console.warn(`[NewsSearch] fetchPageContents failed for ${url}:`, err);
    return '';
  }
}
