import Anthropic from '@anthropic-ai/sdk';
import { FilteredContent, DocumentChunk, ExtractedCompetitorData } from '../types/index';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-6';

const NULL_WARNING_THRESHOLD = 10;
const TOTAL_FIELDS = 14;

const EXTRACTOR_SYSTEM_PROMPT = `You are a Data Extraction Engine for Jeeves. You do not write sentences; you extract facts.

Context: You are analyzing documents about a fintech competitor in the corporate spend / expense management space.

DATA SOURCES priority:
- [NEWS - DATED]: News articles with verified publication dates - highest confidence
- [WEB-DEEP]: Full page content from headless browser rendering
- [WEB-CONTENTS]: Page content from You.com Contents API
- [WEB-BASIC]: Static HTML scrape - lowest confidence
- [LINKEDIN]: Social signals from LinkedIn
NEVER use training knowledge - only extract from the provided source documents.

Task: Extract the following hard data points into a strict JSON format. If a data point is not explicitly found in the provided context, write "NULL". DO NOT GUESS. DO NOT INFER.

REQUIRED FIELDS:
- "competitor_name": string
- "pricing_model": Specific costs (e.g., "MX$ 6,000/mo", "2% per transaction", "Free tier + $15/user/mo")
- "underlying_bank_partner": (e.g., "Column N.A.", "Banco CMF", "Stripe Treasury")
- "settlement_period": (e.g., "Daily", "Monthly", "Prepaid/No Float")
- "key_integrations": Array of specific software names (e.g., ["NetSuite", "Odoo", "QuickBooks"])
- "regulatory_status": (e.g., "SOFOM", "Licensed Bank", "Fintech SPEI")
- "recent_product_updates": Array of specific feature names or changelog entries with dates
- "fundraising": (e.g., "Series B $50M, March 2024" or "NULL")
- "geographic_markets": Array of countries or regions served
- "fx_fees": (e.g., "1.5% on international transactions" or "NULL")
- "credit_model": (e.g., "Prepaid debit", "30-day credit", "Charge card")
- "free_trial": Duration and terms of any free trial or "NULL"
- "recent_promotions": Any active discounts, promotions, or limited-time offers or "NULL"
- "source_urls": Array of URLs or PDF page references this data was drawn from
- "recent_news": Array of dated news items from the past 90 days (e.g., ["2025-03-15: Raised Series C $80M"]) or []
- "linkedin_signals": Array of recent company updates from LinkedIn or []
- "employee_count": Current headcount from LinkedIn or "NULL"
- "hiring_signals": Key roles being actively hired for or []

CRITICAL RULES:
- If you cannot find specific, verifiable evidence for any field, write "NULL" - not a guess, not an inference.
- For array fields with no data, return an empty array [].
- Return ONLY the JSON object. No preamble, no explanation, no markdown fences.`;

const RETRY_SYSTEM_PROMPT = EXTRACTOR_SYSTEM_PROMPT +
  `\n\nIMPORTANT: Your previous response could not be parsed as valid JSON. Return ONLY the raw JSON object, starting with { and ending with }. No text before or after. No markdown. No explanation.`;

function getTierTag(item: FilteredContent): string {
  if (item.tier === 1 || item.sourceType === 'news') return '[NEWS - DATED]';
  if (item.tier === 2) return '[WEB-DEEP]';
  if (item.tier === 3) return '[WEB-CONTENTS]';
  if (item.tier === 4) return '[WEB-BASIC]';
  if (item.sourceType === 'linkedin') return '[LINKEDIN]';
  return '[WEB]';
}

function buildContextString(filteredContent: FilteredContent[], pdfChunks: DocumentChunk[]): string {
  const parts: string[] = [];

  if (filteredContent.length > 0) {
    parts.push('=== INTELLIGENCE DATA (ordered by source priority) ===');
    for (const item of filteredContent) {
      const tierTag = getTierTag(item);
      const dateTag = item.date ? ` [Date: ${item.date}${item.isEstimated ? ' (estimated)' : ''}]` : '';
      parts.push(`${tierTag}${dateTag} Source: ${item.sourceUrl}`);
      parts.push(item.summary ?? '');
      parts.push('');
    }
  }

  if (pdfChunks.length > 0) {
    parts.push('=== INTERNAL PDF GROUND-TRUTH ===');
    for (const chunk of pdfChunks) {
      parts.push(`[Source: ${chunk.metadata.source}, page ~${chunk.metadata.page}]`);
      parts.push(chunk.text);
      parts.push('');
    }
  }

  return parts.join('\n');
}

function countNullFields(data: ExtractedCompetitorData): number {
  let nullCount = 0;
  const stringFields = ['pricing_model', 'underlying_bank_partner', 'settlement_period', 'regulatory_status', 'fundraising', 'fx_fees', 'credit_model', 'free_trial', 'recent_promotions'] as const;
  const arrayFields = ['key_integrations', 'recent_product_updates', 'geographic_markets', 'source_urls'] as const;
  for (const field of stringFields) { if (data[field] === 'NULL' || data[field] === '') nullCount++; }
  for (const field of arrayFields) { if ((data[field] as string[]).length === 0) nullCount++; }
  return nullCount;
}

async function callExtractor(
  context: string,
  competitorName: string,
  systemPrompt: string,
  tokenUsage: { input: number; output: number },
): Promise<ExtractedCompetitorData | null> {
  const userMessage = `Competitor to extract data for: ${competitorName}\n\nINPUT CONTEXT:\n${context.slice(0, 40000)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  tokenUsage.input += response.usage.input_tokens;
  tokenUsage.output += response.usage.output_tokens;

  const raw = (response.content[0].type === 'text' ? response.content[0].text : '')
    .trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  return JSON.parse(raw) as ExtractedCompetitorData;
}

export async function extractStructuredData(
  filteredContent: FilteredContent[],
  pdfChunks: DocumentChunk[],
  competitorName: string,
  tokenUsage: { input: number; output: number },
): Promise<{ data: ExtractedCompetitorData | null; warning: string | null }> {
  const context = buildContextString(filteredContent, pdfChunks);

  if (!context.trim()) {
    return {
      data: null,
      warning: `No data available for ${competitorName}. The scraper may have been blocked or returned no content.`,
    };
  }

  let extracted: ExtractedCompetitorData | null = null;
  try {
    extracted = await callExtractor(context, competitorName, EXTRACTOR_SYSTEM_PROMPT, tokenUsage);
  } catch (err) {
    console.error('[StructuredExtractor] First attempt parse failed:', err);
  }

  if (!extracted) {
    try {
      extracted = await callExtractor(context, competitorName, RETRY_SYSTEM_PROMPT, tokenUsage);
    } catch (err) {
      console.error('[StructuredExtractor] Retry also failed:', err);
      return {
        data: null,
        warning: 'The data extraction stage failed to parse a valid response from the AI model after two attempts.',
      };
    }
  }

  if (!extracted) {
    return { data: null, warning: 'The data extraction stage failed to parse a valid response.' };
  }

  extracted.recent_news = extracted.recent_news ?? [];
  extracted.linkedin_signals = extracted.linkedin_signals ?? [];
  extracted.employee_count = extracted.employee_count ?? 'NULL';
  extracted.hiring_signals = extracted.hiring_signals ?? [];

  const nullCount = countNullFields(extracted);
  const warning = nullCount > NULL_WARNING_THRESHOLD
    ? `Limited verified data found for ${competitorName}. Live scrape retrieved ${TOTAL_FIELDS - nullCount} source(s). Verify key figures against internal PDFs.`
    : null;

  return { data: extracted, warning };
}
