import Anthropic from '@anthropic-ai/sdk';
import { Competitor, ScrapedChunk, FilteredContent } from '../types/index';
import { scrapeCompetitor, scrapeWithHeadlessBrowser } from '../tools/scraper';
import { searchCompetitorNews, fetchPageContents } from '../tools/newsSearch';
import { scrapeLinkedInCompany } from '../tools/linkedinScraper';
import { findCompetitor } from '../config/competitors';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-6';

const FILTER_SYSTEM_PROMPT = `You are the Chief Intelligence Filter for Jeeves. Your job is to analyze raw text scraped from competitor websites and news feeds.

Your Goal: Classify the input text into one of the following buckets. If the text is "Low Signal" (marketing fluff, generic blog posts, SEO spam), discard it immediately.

BUCKETS:
1. [PRODUCT_UPDATE]: specific feature launches, API documentation changes, changelogs.
2. [FINANCIAL_HARD]: pricing changes, fundraising announcements (Series A/B/C), specific fee structures.
3. [MARKETING_CAMPAIGN]: major positioning shifts or new slogans.
4. [NOISE]: generic "Top 10" lists, SEO articles, career pages, or vague "thought leadership."

INSTRUCTIONS:
- Return ONLY a valid JSON object with two keys: "category" and "summary".
- If category is [NOISE], set summary to null.
- Extract specific entities (dates, dollar amounts, feature names) in the summary.
- DO NOT use the words: "Robust", "Seamless", "User-friendly", "Streamline", "All-in-one", "State-of-the-art".
- If you cannot determine the category with confidence, default to [NOISE].
- Content mentioning free trials, promotional pricing, discounts, or onboarding offers should be classified as [FINANCIAL_HARD].`;

async function filterChunk(
  chunk: ScrapedChunk,
  tokenUsage: { input: number; output: number },
): Promise<FilteredContent | null> {
  const userMessage = `INPUT TEXT (from ${chunk.url}):\n\n${chunk.text.slice(0, 8000)}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: FILTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    tokenUsage.input += response.usage.input_tokens;
    tokenUsage.output += response.usage.output_tokens;

    const raw = (response.content[0].type === 'text' ? response.content[0].text : '')
      .trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(raw) as { category: string; summary: string | null };

    if (parsed.category === '[NOISE]') {
      console.log(`[IngestionFilter] DISCARDED [NOISE] from ${chunk.url}`);
      return null;
    }

    return {
      category: parsed.category as FilteredContent['category'],
      summary: parsed.summary,
      sourceUrl: chunk.url,
    };
  } catch (err) {
    console.error(`[IngestionFilter] Filter failed for ${chunk.url}:`, err);
    return null;
  }
}

export async function runIngestionPipeline(
  competitor: Competitor,
  tokenUsage: { input: number; output: number },
): Promise<FilteredContent[]> {
  let rawChunks: ScrapedChunk[] = [];

  try {
    rawChunks = await scrapeCompetitor(competitor);
  } catch (err) {
    console.error(`[IngestionFilter] Scrape failed for ${competitor.name}:`, err);
    return [];
  }

  if (rawChunks.length === 0) return [];

  const CONCURRENT_FILTERS = 3;
  const results: FilteredContent[] = [];

  for (let i = 0; i < rawChunks.length; i += CONCURRENT_FILTERS) {
    const batch = rawChunks.slice(i, i + CONCURRENT_FILTERS);
    const batchResults = await Promise.all(batch.map((chunk) => filterChunk(chunk, tokenUsage)));
    results.push(...batchResults.filter((r): r is FilteredContent => r !== null));
  }

  return results;
}

// ─── Enhanced Ingestion ────────────────────────────────────────────────────────

interface EnhancedChunk extends ScrapedChunk {
  sourceType: 'website' | 'news' | 'linkedin';
  date?: string;
  isEstimated?: boolean;
  tier: number;
}

const TIER_BUDGETS: Record<number, number> = { 0: 2000, 1: 3000, 2: 8000, 3: 4000, 4: 2000 };
const GRAND_TOTAL_BUDGET = 15000;

async function filterEnhancedChunk(
  chunk: EnhancedChunk,
  tokenUsage: { input: number; output: number },
): Promise<FilteredContent | null> {
  const userMessage = `INPUT TEXT (from ${chunk.url}):\n\n${chunk.text.slice(0, 8000)}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: FILTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    tokenUsage.input += response.usage.input_tokens;
    tokenUsage.output += response.usage.output_tokens;

    const raw = (response.content[0].type === 'text' ? response.content[0].text : '')
      .trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(raw) as { category: string; summary: string | null };

    if (parsed.category === '[NOISE]') return null;

    return {
      category: parsed.category as FilteredContent['category'],
      summary: parsed.summary,
      sourceUrl: chunk.url,
      sourceType: chunk.sourceType,
      date: chunk.date,
      isEstimated: chunk.isEstimated,
      tier: chunk.tier,
    };
  } catch (err) {
    console.error(`[EnhancedIngestion] Filter failed for ${chunk.url}:`, err);
    return null;
  }
}

async function fetchMultiplePageContents(urls: string[]): Promise<EnhancedChunk[]> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('URL fetch timeout')), 25000),
      );
      const text = await Promise.race([fetchPageContents(url), timeoutPromise]);
      return { url, text };
    }),
  );

  const chunks: EnhancedChunk[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { url, text } = result.value;
    if (!text || text.length < 100) continue;
    chunks.push({ url, text: text.slice(0, 50000), scrapedAt: new Date().toISOString(), sourceType: 'website', tier: 3 });
  }
  return chunks;
}

function deduplicateByUrl(items: EnhancedChunk[]): EnhancedChunk[] {
  const byUrl = new Map<string, EnhancedChunk>();
  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing || item.tier < existing.tier) byUrl.set(item.url, item);
  }
  return Array.from(byUrl.values());
}

async function scrapeCompetitorCheerio(competitor: Competitor): Promise<EnhancedChunk[]> {
  try {
    const chunks = await scrapeCompetitor(competitor);
    return chunks.map((c) => ({ ...c, sourceType: 'website' as const, tier: 4 }));
  } catch (err) {
    console.warn(`[Tier4-Cheerio] scrape failed for ${competitor.name}:`, err);
    return [];
  }
}

function applyContentBudget(chunks: EnhancedChunk[], competitorName: string): EnhancedChunk[] {
  const byTier = new Map<number, EnhancedChunk[]>();
  for (const chunk of chunks) {
    const t = chunk.tier;
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(chunk);
  }

  const tierCapped: EnhancedChunk[] = [];
  for (const [tier, tierChunks] of byTier) {
    const budget = TIER_BUDGETS[tier] ?? 2000;
    let tierTotal = 0;
    for (const chunk of tierChunks) {
      if (tierTotal >= budget) break;
      const remaining = budget - tierTotal;
      tierCapped.push({ ...chunk, text: chunk.text.slice(0, remaining) });
      tierTotal += Math.min(chunk.text.length, remaining);
    }
  }

  let grandTotal = 0;
  const finalCapped: EnhancedChunk[] = [];
  for (const chunk of tierCapped) {
    if (grandTotal >= GRAND_TOTAL_BUDGET) break;
    const remaining = GRAND_TOTAL_BUDGET - grandTotal;
    finalCapped.push({ ...chunk, text: chunk.text.slice(0, remaining) });
    grandTotal += Math.min(chunk.text.length, remaining);
  }

  console.log(`[TokenBudget] ${competitorName}: ${finalCapped.reduce((s, c) => s + c.text.length, 0)} chars total`);
  return finalCapped;
}

export async function runEnhancedIngestion(
  competitorName: string,
  tokenUsage: { input: number; output: number },
): Promise<FilteredContent[]> {
  const competitor = findCompetitor(competitorName);
  if (!competitor) {
    console.warn(`[EnhancedIngestion] "${competitorName}" not found in registry`);
    return [];
  }

  // TIER 1: News search
  const newsResults = await searchCompetitorNews(competitor.name).catch(() => []);
  const newsChunks: EnhancedChunk[] = newsResults.map((item) => ({
    url: item.url,
    text: `${item.title}\n\n${item.snippet}`,
    scrapedAt: new Date().toISOString(),
    sourceType: 'news' as const,
    date: item.publishedDate,
    isEstimated: item.isEstimated,
    tier: 1,
  }));

  // TIER 2+3: Headless + Contents API in parallel
  const [headlessResult, contentsResult] = await Promise.allSettled([
    scrapeWithHeadlessBrowser(competitor.name, competitor.scrapeUrls),
    fetchMultiplePageContents(competitor.scrapeUrls),
  ]);

  const headlessData: EnhancedChunk[] =
    headlessResult.status === 'fulfilled'
      ? headlessResult.value.map((c) => ({ ...c, sourceType: 'website' as const, tier: 2 as const }))
      : [];

  const contentsData: EnhancedChunk[] = contentsResult.status === 'fulfilled' ? contentsResult.value : [];

  // TIER 4: Cheerio if deep content is insufficient
  const deepContentLength = [...headlessData, ...contentsData].reduce((sum, c) => sum + c.text.length, 0);
  let cheerioData: EnhancedChunk[] = [];
  if (deepContentLength < 200) {
    cheerioData = await scrapeCompetitorCheerio(competitor);
  }

  // LinkedIn (parallel)
  const linkedinPosts = await scrapeLinkedInCompany(competitor.name, competitor.linkedinUrl).catch(() => []);
  const linkedinChunks: EnhancedChunk[] = linkedinPosts.map((post) => ({
    url: competitor.linkedinUrl ?? 'https://www.linkedin.com',
    text: post.content,
    scrapedAt: new Date().toISOString(),
    sourceType: 'linkedin' as const,
    date: post.date,
    isEstimated: post.isEstimated,
    tier: 0,
  }));

  const deduped = deduplicateByUrl([...headlessData, ...contentsData, ...cheerioData]);
  const merged: EnhancedChunk[] = [...newsChunks, ...deduped, ...linkedinChunks];

  if (merged.length === 0) return [];

  const budgeted = applyContentBudget(merged, competitor.name);

  const CONCURRENT_FILTERS = 3;
  const results: FilteredContent[] = [];

  for (let i = 0; i < budgeted.length; i += CONCURRENT_FILTERS) {
    const batch = budgeted.slice(i, i + CONCURRENT_FILTERS);
    const batchResults = await Promise.all(batch.map((chunk) => filterEnhancedChunk(chunk, tokenUsage)));
    results.push(...batchResults.filter((r): r is FilteredContent => r !== null));
  }

  return results;
}
