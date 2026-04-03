import { ApifyClient } from 'apify-client';
import { Competitor, ScrapedChunk } from '../types/index';

const SCRAPE_TIMEOUT_MS = 45_000;

function buildPageFunction(): string {
  return `
async function pageFunction(context) {
  const { $, request, log } = context;
  $('script, style, nav, footer, header, .cookie-banner, .modal').remove();
  const mainSelectors = ['main', 'article', '.content', '.pricing', '.features', '#main', 'body'];
  let text = '';
  for (const sel of mainSelectors) {
    const el = $(sel).first();
    if (el.length && el.text().trim().length > 100) {
      text = el.text();
      break;
    }
  }
  if (!text) text = $('body').text();
  text = text.replace(/\\s+/g, ' ').trim();
  const tables = [];
  $('table').each((i, table) => {
    const rows = [];
    $(table).find('tr').each((j, tr) => {
      const cells = $(tr).find('td, th').map((k, cell) => $(cell).text().trim()).get();
      if (cells.some(c => c.length > 0)) rows.push(cells.join(' | '));
    });
    if (rows.length > 0) tables.push(rows.join('\\n'));
  });
  const tableText = tables.length > 0 ? '\\n\\n[TABLES]\\n' + tables.join('\\n---\\n') : '';
  return {
    url: request.url,
    text: (text + tableText).slice(0, 50000),
    scrapedAt: new Date().toISOString(),
  };
}
`;
}

function buildHeadlessPageFunction(): string {
  return `
async function pageFunction(context) {
  const { request, log } = context;
  const $ = context.jQuery;
  $('nav, footer, header, .cookie-banner, .popup, [class*="cookie"], [class*="banner"], [class*="modal"], script, style').remove();
  const text = $('main, article, .content, .pricing, .features, [class*="pricing"], [class*="feature"], body')
    .first()
    .text()
    .replace(/\\s+/g, ' ')
    .trim()
    .substring(0, 5000);
  return {
    url: request.url,
    text,
    title: $('title').text(),
    scrapedAt: new Date().toISOString(),
  };
}
`;
}

const HEADLESS_TIMEOUT_MS = 90_000;

export async function scrapeWithHeadlessBrowser(
  competitorName: string,
  urls: string[],
): Promise<ScrapedChunk[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.warn('[HeadlessScraper] APIFY_API_TOKEN not set - skipping headless scrape');
    return [];
  }
  if (urls.length === 0) return [];

  const client = new ApifyClient({ token });
  const startUrls = urls.map((url) => ({ url }));

  console.log(`[HeadlessScraper] ${competitorName}: run started, ${startUrls.length} URL(s)`);

  try {
    const runPromise = client.actor('apify/web-scraper').call(
      {
        startUrls,
        pageFunction: buildHeadlessPageFunction(),
        runMode: 'DEVELOPMENT',
        proxyConfiguration: { useApifyProxy: true },
        maxConcurrency: 3,
        navigationTimeoutSecs: 30,
        maxRequestRetries: 2,
      },
      { waitSecs: Math.floor(HEADLESS_TIMEOUT_MS / 1000) },
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Headless scrape timeout after ${HEADLESS_TIMEOUT_MS / 1000}s`)),
        HEADLESS_TIMEOUT_MS,
      ),
    );

    const run = await Promise.race([runPromise, timeoutPromise]);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return items
      .filter((item) => item.text && String(item.text).trim().length > 50)
      .map((item) => ({
        url: String(item.url ?? ''),
        text: String(item.text ?? ''),
        scrapedAt: String(item.scrapedAt ?? new Date().toISOString()),
      }));
  } catch (err) {
    console.warn(`[HeadlessScraper] ${competitorName}: failed -`, err);
    return [];
  }
}

export async function scrapeCompetitor(competitor: Competitor): Promise<ScrapedChunk[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_API_TOKEN is not set in environment variables.');
  }

  const client = new ApifyClient({ token });
  const startUrls = competitor.scrapeUrls.map((url) => ({ url }));

  console.log(`[Scraper] Starting run for ${competitor.name} - ${startUrls.length} URL(s)`);

  const runPromise = client.actor('apify/cheerio-scraper').call(
    {
      startUrls,
      pageFunction: buildPageFunction(),
      maxPagesPerCrawl: competitor.scrapeUrls.length + 2,
      maxConcurrency: 3,
      proxyConfiguration: { useApifyProxy: true },
      maxRequestRetries: 1,
      navigationTimeoutSecs: 30,
    },
    { waitSecs: Math.floor(SCRAPE_TIMEOUT_MS / 1000) },
  );

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Scrape timeout after ${SCRAPE_TIMEOUT_MS / 1000}s`)),
      SCRAPE_TIMEOUT_MS,
    ),
  );

  const run = await Promise.race([runPromise, timeoutPromise]);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  const chunks: ScrapedChunk[] = items
    .filter((item) => item.text && String(item.text).trim().length > 50)
    .map((item) => ({
      url: String(item.url ?? ''),
      text: String(item.text ?? ''),
      scrapedAt: String(item.scrapedAt ?? new Date().toISOString()),
    }));

  console.log(`[Scraper] ${competitor.name}: retrieved ${chunks.length} non-empty chunk(s)`);
  return chunks;
}
