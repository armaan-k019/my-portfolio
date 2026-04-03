import { ApifyClient } from 'apify-client';
import { LinkedInPost } from '../types/index';

const SCRAPE_TIMEOUT_MS = 45_000;

function parseRelativeDate(relative: string): { date: string; isEstimated: boolean; note: string } {
  const lower = relative.toLowerCase();
  const now = new Date();

  const daysMatch = lower.match(/(\d+)\s*days?\s*ago/);
  if (daysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysMatch[1], 10));
    return { date: d.toISOString().split('T')[0], isEstimated: false, note: '' };
  }

  const weeksMatch = lower.match(/(\d+)\s*weeks?\s*ago/);
  if (weeksMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(weeksMatch[1], 10) * 7);
    return { date: d.toISOString().split('T')[0], isEstimated: true, note: 'Estimated from relative timestamp' };
  }

  const monthsMatch = lower.match(/(\d+)\s*months?\s*ago/);
  if (monthsMatch) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - parseInt(monthsMatch[1], 10));
    return { date: d.toISOString().split('T')[0], isEstimated: true, note: 'Estimated from relative timestamp' };
  }

  if (lower.includes('last week')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { date: d.toISOString().split('T')[0], isEstimated: true, note: 'Estimated from relative timestamp' };
  }

  if (lower.includes('last month')) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return { date: d.toISOString().split('T')[0], isEstimated: true, note: 'Estimated from relative timestamp' };
  }

  return { date: `~${now.toISOString().split('T')[0]}`, isEstimated: true, note: 'Estimated from relative timestamp' };
}

function parseLinkedInDate(rawDate: string): { date: string; isEstimated: boolean; note?: string } {
  if (!rawDate) {
    return { date: `~${new Date().toISOString().split('T')[0]}`, isEstimated: true, note: 'Estimated' };
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
    return { date: rawDate.slice(0, 10), isEstimated: false };
  }
  return parseRelativeDate(rawDate);
}

interface ApifyLinkedInItem {
  date?: string;
  postedAt?: string;
  publishedAt?: string;
  text?: string;
  content?: string;
  description?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  type?: string;
  postType?: string;
}

export async function scrapeLinkedInCompany(
  competitorName: string,
  linkedinUrl?: string,
): Promise<LinkedInPost[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.warn('[LinkedInScraper] APIFY_API_TOKEN not set - skipping LinkedIn scrape');
    return [];
  }

  const client = new ApifyClient({ token });

  const actorInput = linkedinUrl
    ? { startUrls: [{ url: linkedinUrl }], maxPostsPerCompany: 10, maxConcurrency: 1 }
    : { searchKeywords: `${competitorName} company`, maxResults: 5, maxPostsPerCompany: 10 };

  const runPromise = client.actor('apify/linkedin-scraper').call(actorInput, {
    waitSecs: Math.floor(SCRAPE_TIMEOUT_MS / 1000),
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`LinkedIn scrape timeout`)), SCRAPE_TIMEOUT_MS),
  );

  try {
    const run = await Promise.race([runPromise, timeoutPromise]);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const posts: LinkedInPost[] = (items as ApifyLinkedInItem[])
      .slice(0, 10)
      .map((item) => {
        const rawDate = item.date ?? item.postedAt ?? item.publishedAt ?? '';
        const { date, isEstimated, note } = parseLinkedInDate(rawDate);
        const content = (item.text ?? item.content ?? item.description ?? '').slice(0, 500);
        const engagement = (item.likesCount ?? 0) + (item.commentsCount ?? 0) + (item.sharesCount ?? 0);
        return { date, content, engagement, type: item.type ?? item.postType ?? 'post', isEstimated, note };
      })
      .filter((p) => p.content.length > 20)
      .slice(0, 5);

    console.log(`[LinkedInScraper] ${competitorName}: ${posts.length} post(s) retrieved`);
    return posts;
  } catch (err) {
    console.warn(`[LinkedInScraper] Scrape failed for ${competitorName}:`, err);
    return [];
  }
}
