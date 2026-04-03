import Anthropic from '@anthropic-ai/sdk';
import { findCompetitor, COMPETITORS } from '../config/competitors';
import { runIngestionPipeline, runEnhancedIngestion } from './ingestionFilter';
import { extractStructuredData } from './structuredExtractor';
import {
  computeCompetitorDiff,
  synthesizeResponse,
  synthesizeGeneralResponse,
  synthesizeTemporalResponse,
} from './synthesizer';
import {
  getPersonaSelectionPrompt,
  getPersonaAcknowledgment,
  resolvePersona,
  applyPersonaToSession,
} from './personaRouter';
import { detectIntent } from './intentDetector';
import { handleObjection } from './objectionHandler';
import { queryRelevantChunks } from '../tools/vectorStore';
import { getCachedBattlecard } from './battlecardCache';
import {
  ChatRequest,
  ChatResponse,
  FilteredContent,
  PipelineContext,
  PipelineStage,
  SessionState,
  SSECallback,
  Persona,
} from '../types/index';

const TOKEN_BUDGET_LIMIT = 50_000;
const TIER2_TIMEOUT_MS = 45_000;
const TIER3_TIMEOUT_MS = 120_000;

const MODEL = 'claude-opus-4-6';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getStageSlowestReason(stage: PipelineStage, competitorName: string | null): string {
  switch (stage) {
    case 'scraping': return `scraping live data from ${competitorName ?? 'the competitor'}'s website, which is responding slowly`;
    case 'extraction': return 'cross-referencing scraped data against your internal Ground Truth PDFs to verify the numbers';
    case 'synthesis': return `generating your report and verifying all citations`;
    default: return 'processing your query';
  }
}

function getStageFailureReason(stage: PipelineStage, competitorName: string | null): string {
  switch (stage) {
    case 'scraping':
      return `The scraper timed out trying to reach ${competitorName ?? 'the competitor'}'s website - it may be blocking automated requests. Try asking about a different competitor or rephrasing to use cached data.`;
    case 'extraction':
      return 'The data extraction stage failed to parse a valid response from the AI model after two attempts. This sometimes happens with unusually formatted competitor pages.';
    case 'synthesis':
      return 'The synthesis stage exceeded the time limit, likely due to a large volume of source data. Try narrowing your query to a specific feature or time period.';
    default:
      return 'An unknown error occurred during processing.';
  }
}

function checkTokenBudget(tokenUsage: { input: number; output: number }, sseCallback: SSECallback): boolean {
  const total = tokenUsage.input + tokenUsage.output;
  if (total > TOKEN_BUDGET_LIMIT) {
    sseCallback({ type: 'status', message: `⚠️ Token budget warning: this query has used ${total.toLocaleString()} tokens. Context has been truncated to stay within limits.` });
    return false;
  }
  return true;
}

async function handleGeneralChat(
  query: string,
  tokenUsage: { input: number; output: number },
): Promise<string> {
  const systemPrompt = `You are Jeeves, an internal competitive intelligence assistant for Jeeves (the fintech company).

You help Jeeves employees understand:
- What competitors are doing (Brex, Ramp, Clara, Higo, Tribal Credit, etc.)
- How Jeeves compares in pricing, credit models, geography, and tech
- What intelligence you can gather and how to ask for it

If the user is greeting you, introduce yourself briefly.
If they're asking what you can do, explain your three modes:
1. Targeted competitor research (e.g., "What's Brex's pricing?")
2. Temporal summaries (e.g., "What happened with competitors this week?")
3. Market discovery (e.g., "What's new in LatAm corporate cards?")

Keep your response concise and friendly.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: query }],
  });

  tokenUsage.input += response.usage.input_tokens;
  tokenUsage.output += response.usage.output_tokens;

  return response.content[0].type === 'text' ? response.content[0].text : "Hello! I'm Jeeves, your competitive intelligence agent.";
}

async function handleMarketDiscovery(
  query: string,
  tokenUsage: { input: number; output: number },
  sseCallback: SSECallback,
  ctx: PipelineContext,
): Promise<ChatResponse> {
  ctx.stage = 'scraping';

  const competitorsToScrape = COMPETITORS.slice(0, 4);
  const allFilteredContent: { competitorName: string; content: FilteredContent[] }[] = [];

  sseCallback({ type: 'status', message: `Scanning ${competitorsToScrape.length} competitor websites for market signals...` });

  for (const comp of competitorsToScrape) {
    const filtered = await runIngestionPipeline(comp, tokenUsage);
    if (filtered.length > 0) allFilteredContent.push({ competitorName: comp.name, content: filtered });
    checkTokenBudget(tokenUsage, sseCallback);
  }

  ctx.stage = 'synthesis';
  const context = allFilteredContent
    .map(({ competitorName, content }) =>
      `--- ${competitorName} ---\n` + content.map((c) => `[${c.category}] ${c.summary ?? ''} [Source: ${c.sourceUrl}]`).join('\n'),
    )
    .join('\n\n');

  const reply = await synthesizeGeneralResponse(query, context, null, tokenUsage);
  const citations = allFilteredContent.flatMap(({ content }) => content.map((c) => c.sourceUrl).filter(Boolean));

  ctx.stage = 'complete';
  return {
    reply, persona: null, queryType: 'MARKET_DISCOVERY',
    competitorsMentioned: allFilteredContent.map((a) => a.competitorName),
    requiresPersonaSelection: false, citations: [...new Set(citations)], tokenUsage: { ...tokenUsage },
  };
}

function extractAllMentionedCompetitors(query: string): string[] {
  const normalized = query.toLowerCase();
  return COMPETITORS.filter((c) => normalized.includes(c.name.toLowerCase())).map((c) => c.name);
}

async function handleTemporalSummary(
  query: string,
  competitorMentioned: string | null,
  persona: Persona,
  tokenUsage: { input: number; output: number },
  sseCallback: SSECallback,
  ctx: PipelineContext,
): Promise<ChatResponse> {
  ctx.stage = 'scraping';

  const allMentioned = extractAllMentionedCompetitors(query);

  let competitorsToCheck;
  if (allMentioned.length >= 2) {
    competitorsToCheck = allMentioned.map((n) => findCompetitor(n)).filter(Boolean) as typeof COMPETITORS;
  } else if (competitorMentioned) {
    const specific = findCompetitor(competitorMentioned);
    competitorsToCheck = specific ? [specific] : COMPETITORS.filter((c) => c.region === 'Global').slice(0, 3);
  } else {
    competitorsToCheck = COMPETITORS.filter((c) => c.region === 'Global').slice(0, 3);
  }

  const scrapeDate = new Date().toISOString().split('T')[0];
  sseCallback({ type: 'status', message: `Scanning recent activity for: ${competitorsToCheck.map((c) => c.name).join(', ')}...` });

  const scrapeSettled = await Promise.allSettled(
    competitorsToCheck.map(async (comp) => {
      const filtered = await runEnhancedIngestion(comp.name, tokenUsage);
      return { comp, filtered };
    }),
  );

  checkTokenBudget(tokenUsage, sseCallback);

  const allFilteredContent: string[] = [];
  const citations: string[] = [];

  for (const result of scrapeSettled) {
    if (result.status === 'rejected') continue;
    const { comp, filtered } = result.value;
    allFilteredContent.push(`\n### ${comp.name}`);

    if (filtered.length === 0) {
      allFilteredContent.push('⚠ No recent data retrieved for this competitor.');
      continue;
    }

    const sorted = [...filtered].sort((a, b) => {
      const priority: Record<string, number> = { '[PRODUCT_UPDATE]': 0, '[FINANCIAL_HARD]': 1, '[MARKETING_CAMPAIGN]': 2 };
      return (priority[a.category] ?? 3) - (priority[b.category] ?? 3);
    });

    for (const f of sorted) {
      const summaryText = f.summary?.trim() || `[No summary extracted - activity detected at this URL]`;
      const sourceIcon = f.sourceType === 'linkedin' ? '💼' : f.sourceType === 'news' ? '📰' : '🌐';
      const dateLabel = f.date ? (f.isEstimated ? `~${f.date}` : f.date) : 'unknown';
      allFilteredContent.push(`${sourceIcon} [${f.category}] [${dateLabel}] ${summaryText} [Source: ${f.sourceUrl}]`);
      citations.push(f.sourceUrl);
    }
  }

  ctx.stage = 'synthesis';
  const context = allFilteredContent.join('\n');
  const reply = await synthesizeTemporalResponse(query, context, persona, scrapeDate, tokenUsage);

  ctx.stage = 'complete';
  return {
    reply, persona, queryType: 'TEMPORAL_SUMMARY',
    competitorsMentioned: competitorsToCheck.map((c) => c.name),
    requiresPersonaSelection: false, citations: [...new Set(citations)], tokenUsage: { ...tokenUsage },
  };
}

async function handleTargetedQuery(
  query: string,
  competitorName: string,
  persona: Persona,
  tokenUsage: { input: number; output: number },
  sseCallback: SSECallback,
  ctx: PipelineContext,
): Promise<ChatResponse> {
  const competitor = findCompetitor(competitorName);

  if (!competitor) {
    return {
      reply: `I don't have ${competitorName} in my competitor registry. Known competitors: ${COMPETITORS.map((c) => c.name).join(', ')}.`,
      persona, queryType: 'TARGETED_QUERY', competitorsMentioned: [], requiresPersonaSelection: false,
      citations: [], tokenUsage: { ...tokenUsage },
    };
  }

  ctx.stage = 'scraping';
  sseCallback({ type: 'status', message: `Scraping ${competitor.name}'s website for live data...` });

  const filteredContent = await runIngestionPipeline(competitor, tokenUsage);
  checkTokenBudget(tokenUsage, sseCallback);

  if (filteredContent.length === 0) {
    const cached = getCachedBattlecard(competitor.name);
    if (cached) {
      const cacheDate = new Date(cached.lastSynced).toLocaleDateString();
      sseCallback({ type: 'status', message: `⚠ Live scrape unavailable - generating response from cached battlecard data (${cacheDate})...` });
      ctx.stage = 'synthesis';
      const cachedContext = `⚠ Live scrape unavailable for ${competitor.name} - response based on cached data from ${cacheDate}\n\n${JSON.stringify(cached.sections, null, 2)}`;
      const rawReply = await synthesizeGeneralResponse(query, cachedContext, persona, tokenUsage);
      return {
        reply: rawReply, persona, queryType: 'TARGETED_QUERY',
        competitorsMentioned: [competitor.name], requiresPersonaSelection: false,
        citations: cached.dataFreshness?.sources ?? [], tokenUsage: { ...tokenUsage },
      };
    }
    return {
      reply: `Limited live data found for ${competitor.name}. Try rephrasing your query.`,
      persona, queryType: 'TARGETED_QUERY', competitorsMentioned: [competitor.name],
      requiresPersonaSelection: false, citations: [], tokenUsage: { ...tokenUsage },
    };
  }

  ctx.stage = 'extraction';
  sseCallback({ type: 'status', message: `Extracting structured data and cross-referencing with internal documents...` });

  const pdfChunks = await queryRelevantChunks(`${competitor.name} pricing features credit model`);
  const { data: extractedData, warning } = await extractStructuredData(filteredContent, pdfChunks, competitor.name, tokenUsage);

  checkTokenBudget(tokenUsage, sseCallback);

  if (!extractedData) {
    const cached = getCachedBattlecard(competitor.name);
    if (cached) {
      const cacheDate = new Date(cached.lastSynced).toLocaleDateString();
      sseCallback({ type: 'status', message: `⚠ Data extraction failed - generating response from cached battlecard data (${cacheDate})...` });
      ctx.stage = 'synthesis';
      const cachedContext = `⚠ Live data extraction failed for ${competitor.name} - response based on cached data from ${cacheDate}\n\n${JSON.stringify(cached.sections, null, 2)}`;
      const rawReply = await synthesizeGeneralResponse(query, cachedContext, persona, tokenUsage);
      return {
        reply: rawReply, persona, queryType: 'TARGETED_QUERY',
        competitorsMentioned: [competitor.name], requiresPersonaSelection: false,
        citations: cached.dataFreshness?.sources ?? [], tokenUsage: { ...tokenUsage },
      };
    }
    const failureMsg = warning ?? `Failed to extract structured data for ${competitor.name}.`;
    return {
      reply: `I wasn't able to complete your query. Here's what happened: ${failureMsg}`,
      persona, queryType: 'TARGETED_QUERY', competitorsMentioned: [competitor.name],
      requiresPersonaSelection: false, citations: [], tokenUsage: { ...tokenUsage },
    };
  }

  ctx.stage = 'synthesis';
  sseCallback({ type: 'status', message: `Generating your${persona ? ' ' + persona + '-formatted' : ''} intelligence report...` });

  const wedges = computeCompetitorDiff(extractedData);
  const rawReply = await synthesizeResponse(extractedData, wedges, persona, query, tokenUsage);

  ctx.stage = 'complete';

  const warningPrefix = warning ? `> ⚠️ ${warning}\n\n` : '';
  const ackPrefix = getPersonaAcknowledgment(persona, competitor.name);
  const reply = warningPrefix + ackPrefix + rawReply;

  return {
    reply, persona, queryType: 'TARGETED_QUERY',
    competitorsMentioned: [competitor.name], requiresPersonaSelection: false,
    citations: extractedData.source_urls.filter(Boolean), tokenUsage: { ...tokenUsage },
  };
}

export async function runPipeline(
  request: ChatRequest,
  session: SessionState,
  sseCallback: SSECallback,
): Promise<ChatResponse> {
  const tokenUsage = { input: 0, output: 0 };
  const ctx: PipelineContext = {
    query: request.message, sessionId: request.sessionId,
    queryType: 'GENERAL_CHAT', competitorMentioned: null, persona: null,
    stage: 'intent_detection', tokenUsage, startTime: Date.now(),
  };

  let tier2Timer: ReturnType<typeof setTimeout> | null = null;
  let isCancelled = false;

  const pipelinePromise = executePipeline(request, session, sseCallback, ctx, tokenUsage);

  const tier3Promise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      isCancelled = true;
      reject(new Error(`TIER3_TIMEOUT:${ctx.stage}:${ctx.competitorMentioned ?? ''}`));
    }, TIER3_TIMEOUT_MS);
  });

  tier2Timer = setTimeout(() => {
    if (isCancelled) return;
    const reason = getStageSlowestReason(ctx.stage, ctx.competitorMentioned);
    const elapsed = Date.now() - ctx.startTime;
    const remaining = TIER3_TIMEOUT_MS - elapsed;
    const etaMinutes = Math.min(2, Math.ceil(remaining / 60000));
    sseCallback({
      type: 'status',
      message: `Sorry, this is taking a little longer than usual - I'm currently ${reason}. Your query should be ready in under ${etaMinutes} minute${etaMinutes !== 1 ? 's' : ''}.`,
    });
  }, TIER2_TIMEOUT_MS);

  try {
    const result = await Promise.race([pipelinePromise, tier3Promise]);
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.startsWith('TIER3_TIMEOUT:')) {
      const [, failedStage, competitorName] = errMsg.split(':');
      const reason = getStageFailureReason(failedStage as PipelineStage, competitorName || null);
      return {
        reply: `I wasn't able to complete your query. Here's what happened: ${reason}`,
        persona: session.persona, queryType: ctx.queryType,
        competitorsMentioned: ctx.competitorMentioned ? [ctx.competitorMentioned] : [],
        requiresPersonaSelection: false, citations: [], tokenUsage: { ...tokenUsage },
      };
    }
    console.error('[Orchestrator] Unexpected pipeline error:', err);
    return {
      reply: "I encountered an unexpected error processing your request. Please try again or rephrase your query.",
      persona: session.persona, queryType: ctx.queryType, competitorsMentioned: [],
      requiresPersonaSelection: false, citations: [], tokenUsage: { ...tokenUsage },
    };
  } finally {
    if (tier2Timer) clearTimeout(tier2Timer);
  }
}

async function executePipeline(
  request: ChatRequest,
  session: SessionState,
  sseCallback: SSECallback,
  ctx: PipelineContext,
  tokenUsage: { input: number; output: number },
): Promise<ChatResponse> {
  session.lastActivity = Date.now();

  if (request.personaOverride) {
    applyPersonaToSession(session, request.personaOverride);
    const queryToRun = session.pendingQuery ?? request.message;
    session.pendingQuery = null;
    return executePipeline({ ...request, message: queryToRun, personaOverride: undefined }, session, sseCallback, ctx, tokenUsage);
  }

  ctx.stage = 'intent_detection';
  const intent = await detectIntent(request.message, tokenUsage);
  ctx.queryType = intent.queryType;
  ctx.competitorMentioned = intent.competitorMentioned;

  // OBJECTION_HANDLING
  if (intent.queryType === 'OBJECTION_HANDLING') {
    ctx.stage = 'synthesis';
    sseCallback({ type: 'status', message: 'Generating objection rebuttal...' });
    const competitorName = intent.competitorMentioned ?? 'Unknown';
    try {
      const objResponse = await handleObjection(request.message, competitorName);
      const reply =
        `**Objection:** "${objResponse.objection}"\n\n` +
        `**Rebuttal:** ${objResponse.rebuttal}\n\n` +
        `**Jeeves Advantages Used:**\n${objResponse.jeevesAdvantagesUsed.map((a) => `- ${a}`).join('\n')}\n\n` +
        `**Follow-Up Questions to Ask:**\n${objResponse.followUpQuestions.map((q) => `- ${q}`).join('\n')}` +
        (objResponse.sources.length > 0 ? `\n\n**Sources:**\n${objResponse.sources.map((s) => `- ${s}`).join('\n')}` : '');
      return {
        reply, persona: session.persona, queryType: 'OBJECTION_HANDLING',
        competitorsMentioned: competitorName !== 'Unknown' ? [competitorName] : [],
        requiresPersonaSelection: false, citations: objResponse.sources, tokenUsage: { ...tokenUsage },
      };
    } catch (err) {
      console.error('[Orchestrator] Objection handler failed:', err);
      return {
        reply: 'I encountered an error generating the objection rebuttal. Please try again.',
        persona: session.persona, queryType: 'OBJECTION_HANDLING', competitorsMentioned: [],
        requiresPersonaSelection: false, citations: [], tokenUsage: { ...tokenUsage },
      };
    }
  }

  // GENERAL_CHAT
  if (intent.queryType === 'GENERAL_CHAT') {
    const reply = await handleGeneralChat(request.message, tokenUsage);
    return {
      reply, persona: session.persona, queryType: 'GENERAL_CHAT', competitorsMentioned: [],
      requiresPersonaSelection: false, citations: [], tokenUsage: { ...tokenUsage },
    };
  }

  // Persona check
  const effectivePersona = resolvePersona(request.personaOverride, session);
  const requiresPersonaPrompt = intent.requiresPersona && !effectivePersona;

  if (requiresPersonaPrompt) {
    session.pendingQuery = request.message;
    return {
      reply: getPersonaSelectionPrompt(),
      persona: null, queryType: intent.queryType,
      competitorsMentioned: intent.competitorMentioned ? [intent.competitorMentioned] : [],
      requiresPersonaSelection: true, citations: [], tokenUsage: { ...tokenUsage },
    };
  }

  ctx.persona = effectivePersona;

  switch (intent.queryType) {
    case 'TARGETED_QUERY': {
      const competitorName = intent.competitorMentioned ?? '';
      if (!competitorName) return handleMarketDiscovery(request.message, tokenUsage, sseCallback, ctx);
      return handleTargetedQuery(request.message, competitorName, effectivePersona, tokenUsage, sseCallback, ctx);
    }
    case 'TEMPORAL_SUMMARY':
      return handleTemporalSummary(request.message, intent.competitorMentioned, effectivePersona, tokenUsage, sseCallback, ctx);
    case 'MARKET_DISCOVERY':
      return handleMarketDiscovery(request.message, tokenUsage, sseCallback, ctx);
    default: {
      const reply = await handleGeneralChat(request.message, tokenUsage);
      return {
        reply, persona: session.persona, queryType: 'GENERAL_CHAT', competitorsMentioned: [],
        requiresPersonaSelection: false, citations: [], tokenUsage: { ...tokenUsage },
      };
    }
  }
}
