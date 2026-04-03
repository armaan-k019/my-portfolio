import Anthropic from '@anthropic-ai/sdk';
import { Battlecard, BattlecardSections, RecentIntelligenceItem } from '../types/index';
import { findCompetitor } from '../config/competitors';
import { queryRelevantChunks } from '../tools/vectorStore';
import { runEnhancedIngestion } from './ingestionFilter';
import { fetchPageContents, searchCompetitorNews } from '../tools/newsSearch';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-6';

const STANDARD_SYSTEM_PROMPT = `You are the Jeeves Battlecard Generator. You produce structured competitive intelligence battlecards for the Jeeves sales and strategy teams.

### JEEVES CONTEXT (OUR ADVANTAGES)
- Capital Model: 30-day credit float (vs. pre-funded/debit competitors).
- Global Rails: Local currency rails in 20+ countries, 0% FX fees.
- Infrastructure: Proprietary tech stack - not a white-label wrapper.
- Card Product: Corporate cards with instant issuance.
- ERP Integrations: NetSuite, SAP, Oracle, Workday, Microsoft Dynamics.
- Markets: Mexico, Colombia, Brazil, Chile, Peru, Argentina, US, Canada, UK, Europe, Spain.

### OUTPUT FORMAT
Return ONLY a valid JSON object with this exact structure (no markdown fences, no preamble):
{
  "companyOverview": "2-3 sentence overview of the competitor",
  "whyWeWin": ["specific advantage [Source: URL]", ...],
  "whyWeLose": ["specific weakness [Source: URL]", ...],
  "keyFeaturesComparison": [
    { "feature": "Feature Name", "jeeves": "Jeeves capability", "competitor": "Competitor capability" },
    ...
  ],
  "pricing": "Specific pricing details with source [Source: URL]",
  "landmines": ["Question to expose competitor weakness 1", ...],
  "objectionHandling": [
    { "objection": "Common objection", "response": "Specific factual rebuttal [Source: URL]" },
    ...
  ],
  "thirdPartyValidation": ["G2 review quote or analyst mention [Source: URL]", ...],
  "relevantCustomers": ["Profile [Source: URL]", ...],
  "recentIntelligence": [
    { "date": "2025-03-20", "summary": "Launched X feature", "sourceUrl": "https://...", "sourceType": "news", "isEstimated": false }
  ],
  "hiringSignals": ["Hiring Senior PM - signals investment in payments", ...],
  "sources": ["URL1", "URL2", ...]
}

### SOURCING RULES
- whyWeLose: minimum 3 points required always.
  Use prefix: "SOURCED - " for points with source URL, "ANALYSIS - " for synthesized points.
  NEVER set whyWeLose to empty - always provide at least 3 points.
- Every factual claim must end with [Source: URL or "Internal Data"].
- BANNED WORDS: "Robust", "Seamless", "User-friendly", "Streamline", "All-in-one", "State-of-the-art", "Innovative", "Cutting-edge", "Best-in-class".
- Include at least 3 items in whyWeWin, landmines, and objectionHandling.
- keyFeaturesComparison must include: Credit Model, FX Fees, Geographic Coverage, ERP Integrations, Card Product, Pricing.
- recentIntelligence: Include up to 3 most recent news or LinkedIn items from the LIVE SCRAPED DATA section ONLY. If none, return [].
- hiringSignals: Extract from LinkedIn job posting signals. If none, return [].`;

const CONTEXTUAL_ADDENDUM = `

### DEAL CONTEXT
You are generating a CONTEXTUAL battlecard tailored to a specific deal situation. Every section must be customized to address the prospect's specific situation, concerns, and competitive dynamics described below.`;

async function scrapeCustomerPage(displayName: string, customerUrl?: string): Promise<string> {
  if (customerUrl) {
    try {
      const text = await fetchPageContents(customerUrl);
      if (text.length >= 200) return text.slice(0, 10000);
    } catch {
      // fall through
    }
  }
  const results = await searchCompetitorNews(displayName, 'customers case studies logos').catch(() => []);
  if (results.length === 0) return '';
  return results.map((r) => `${r.title}\n${r.snippet}`).join('\n\n');
}

async function postProcessRecentIntelligence(
  items: RecentIntelligenceItem[],
  competitorName: string,
): Promise<RecentIntelligenceItem[]> {
  const now = new Date();
  const filtered: RecentIntelligenceItem[] = [];

  for (const item of items) {
    const rawDate = item.date.replace(/^~/, '');
    const date = new Date(rawDate);
    if (isNaN(date.getTime())) { filtered.push(item); continue; }
    const monthsOld = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
    if (monthsOld > 12) continue;
    if (monthsOld >= 6) {
      filtered.push({ ...item, summary: `${item.summary} ⚠ Older intel (${item.date}) - verify if current` });
    } else {
      filtered.push(item);
    }
  }

  if (filtered.length < 2) {
    const newsResults = await searchCompetitorNews(competitorName, '2026 news announcement update').catch(() => []);
    for (const r of newsResults.slice(0, 3 - filtered.length)) {
      filtered.push({ date: r.publishedDate, summary: `${r.title}: ${r.snippet}`, sourceUrl: r.url, sourceType: 'news', isEstimated: r.isEstimated });
    }
  }

  return filtered;
}

export async function generateStandardBattlecard(competitorName: string): Promise<Battlecard> {
  const competitor = findCompetitor(competitorName);
  const displayName = competitor?.name ?? competitorName;
  const scrapeDate = new Date().toISOString().split('T')[0];

  const liveTokenUsage = { input: 0, output: 0 };
  const liveItems = await runEnhancedIngestion(displayName, liveTokenUsage);
  const liveDataUsed = liveItems.length > 0;

  const liveContext = liveDataUsed
    ? '\n\n=== LIVE SCRAPED DATA (PRIMARY SOURCE - USE THIS FIRST) ===\n' +
      liveItems.map((item) => {
        const typeTag = item.sourceType ? ` [Type: ${item.sourceType}]` : '';
        const dateTag = item.date ? ` [Date: ${item.date}${item.isEstimated ? ' (estimated)' : ''}]` : '';
        const summaryText = item.summary?.trim() || '[No summary extracted - activity detected]';
        return `[${item.category}]${typeTag}${dateTag} ${summaryText} [Source: ${item.sourceUrl}]`;
      }).join('\n')
    : '';

  const pdfChunks = await queryRelevantChunks(`${displayName} pricing features credit model FX fees integrations`);
  const pdfContext = pdfChunks.length > 0
    ? '\n\n=== INTERNAL PDF GROUND-TRUTH ===\n' + pdfChunks.map((c) => `[Source: ${c.metadata.source}, page ~${c.metadata.page}]\n${c.text}`).join('\n\n')
    : '';

  const customerText = await scrapeCustomerPage(displayName, competitor?.customerUrl);
  const customerContext = customerText ? `\n\n=== CUSTOMER / CASE STUDY DATA ===\n${customerText}` : '';

  const trainingFallbackNote = liveDataUsed ? '' : '\n⚠ WARNING: No live scrape data retrieved. Label every uncertain claim with "⚠ Based on training data - no live data retrieved".';
  const recentIntelNote = liveDataUsed
    ? '\nIMPORTANT: Populate recentIntelligence ONLY from items in the LIVE SCRAPED DATA section above. Do not use training knowledge.'
    : '\nIMPORTANT: Set recentIntelligence to [] - no live data was retrieved.';

  const userMessage = `Generate a comprehensive battlecard for competitor: ${displayName}\n\nCompetitor notes: ${competitor?.notes ?? 'N/A'}\nRegion: ${competitor?.region ?? 'Unknown'}${trainingFallbackNote}${recentIntelNote}${liveContext}${pdfContext}${customerContext}`;

  const sections = await callGenerator(STANDARD_SYSTEM_PROMPT, userMessage);
  sections.recentIntelligence = await postProcessRecentIntelligence(sections.recentIntelligence ?? [], displayName);

  const liveSources = [...new Set(liveItems.map((i) => i.sourceUrl).filter(Boolean))];
  const existingSources = new Set(sections.sources);
  for (const url of liveSources) {
    if (!existingSources.has(url)) { sections.sources.push(url); existingSources.add(url); }
  }
  if (competitor?.scrapeUrls) {
    for (const url of competitor.scrapeUrls) {
      if (!existingSources.has(url)) { sections.sources.push(url); existingSources.add(url); }
    }
  }
  if (sections.sources.length === 0) {
    sections.sources.push('No external sources found - based on Claude training data');
  }

  return {
    competitor: displayName,
    type: 'standard',
    lastSynced: new Date().toISOString(),
    dataFreshness: { liveDataUsed, scrapeDate, sources: liveSources },
    sections,
  };
}

export async function generateContextualBattlecard(
  competitorName: string,
  dealContext: string,
  prospectDetails: string,
): Promise<Battlecard> {
  const competitor = findCompetitor(competitorName);
  const displayName = competitor?.name ?? competitorName;
  const scrapeDate = new Date().toISOString().split('T')[0];

  const liveTokenUsage = { input: 0, output: 0 };
  const liveItems = await runEnhancedIngestion(displayName, liveTokenUsage);
  const liveDataUsed = liveItems.length > 0;

  const liveContext = liveDataUsed
    ? '\n\n=== LIVE SCRAPED DATA (PRIMARY SOURCE - USE THIS FIRST) ===\n' +
      liveItems.map((item) => {
        const typeTag = item.sourceType ? ` [Type: ${item.sourceType}]` : '';
        const dateTag = item.date ? ` [Date: ${item.date}${item.isEstimated ? ' (estimated)' : ''}]` : '';
        return `[${item.category}]${typeTag}${dateTag} ${item.summary?.trim() || '[Activity detected]'} [Source: ${item.sourceUrl}]`;
      }).join('\n')
    : '';

  const pdfChunks = await queryRelevantChunks(`${displayName} pricing features credit model FX fees integrations`);
  const pdfContext = pdfChunks.length > 0
    ? '\n\n=== INTERNAL PDF GROUND-TRUTH ===\n' + pdfChunks.map((c) => `[Source: ${c.metadata.source}, page ~${c.metadata.page}]\n${c.text}`).join('\n\n')
    : '';

  const customerText = await scrapeCustomerPage(displayName, competitor?.customerUrl);
  const customerContext = customerText ? `\n\n=== CUSTOMER / CASE STUDY DATA ===\n${customerText}` : '';

  const trainingFallbackNote = liveDataUsed ? '' : '\n⚠ WARNING: No live scrape data retrieved.';
  const recentIntelNote = liveDataUsed
    ? '\nIMPORTANT: Populate recentIntelligence ONLY from items in the LIVE SCRAPED DATA section above.'
    : '\nIMPORTANT: Set recentIntelligence to [] - no live data was retrieved.';

  const systemPrompt = STANDARD_SYSTEM_PROMPT + CONTEXTUAL_ADDENDUM;
  const userMessage = `Generate a CONTEXTUAL battlecard for competitor: ${displayName}\n\nCompetitor notes: ${competitor?.notes ?? 'N/A'}\nRegion: ${competitor?.region ?? 'Unknown'}\n\n=== DEAL CONTEXT ===\n${dealContext}\n\n=== PROSPECT DETAILS ===\n${prospectDetails}${trainingFallbackNote}${recentIntelNote}${liveContext}${pdfContext}${customerContext}`;

  const sections = await callGenerator(systemPrompt, userMessage);
  sections.recentIntelligence = await postProcessRecentIntelligence(sections.recentIntelligence ?? [], displayName);

  const liveSources = [...new Set(liveItems.map((i) => i.sourceUrl).filter(Boolean))];
  const existingSources = new Set(sections.sources);
  for (const url of liveSources) {
    if (!existingSources.has(url)) { sections.sources.push(url); existingSources.add(url); }
  }
  if (sections.sources.length === 0) {
    sections.sources.push('No external sources found - based on Claude training data');
  }

  return {
    competitor: displayName,
    type: 'contextual',
    lastSynced: new Date().toISOString(),
    dealContext: `${dealContext} | ${prospectDetails}`,
    dataFreshness: { liveDataUsed, scrapeDate, sources: liveSources },
    sections,
  };
}

async function callGenerator(systemPrompt: string, userMessage: string): Promise<BattlecardSections> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage.slice(0, 40000) }],
  });

  const raw = (response.content[0].type === 'text' ? response.content[0].text : '')
    .trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  let parsed: BattlecardSections;
  try {
    parsed = JSON.parse(raw) as BattlecardSections;
  } catch {
    const retryResponse = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt + '\n\nIMPORTANT: Return ONLY raw JSON. No markdown fences. Start with { end with }.',
      messages: [{ role: 'user', content: userMessage.slice(0, 40000) }],
    });

    const retryRaw = (retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : '')
      .trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    parsed = JSON.parse(retryRaw) as BattlecardSections;
  }

  return {
    companyOverview: parsed.companyOverview ?? 'Data Not Found',
    whyWeWin: parsed.whyWeWin ?? [],
    whyWeLose: parsed.whyWeLose ?? [],
    keyFeaturesComparison: parsed.keyFeaturesComparison ?? [],
    pricing: parsed.pricing ?? 'Data Not Found',
    landmines: parsed.landmines ?? [],
    objectionHandling: parsed.objectionHandling ?? [],
    thirdPartyValidation: parsed.thirdPartyValidation ?? [],
    relevantCustomers: parsed.relevantCustomers ?? [],
    sources: parsed.sources ?? [],
    recentIntelligence: parsed.recentIntelligence ?? [],
    hiringSignals: parsed.hiringSignals ?? [],
  };
}
