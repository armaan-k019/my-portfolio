import Anthropic from '@anthropic-ai/sdk';
import { IntentClassification, QueryType } from '../types/index';
import { getCompetitorNames } from '../config/competitors';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-6';

const COMPETITOR_LIST = getCompetitorNames().join(', ');

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for the Jeeves Competitive Intelligence Agent.

Your job: analyze the user's message and classify it. Return ONLY a valid JSON object - no preamble, no explanation.

KNOWN COMPETITORS: ${COMPETITOR_LIST}

QUERY TYPES:
- "TARGETED_QUERY": asks about a specific competitor, feature, pricing, or person at a competitor
- "TEMPORAL_SUMMARY": asks about recent events, "today's updates", "this week", or time-bounded competitor activity
- "MARKET_DISCOVERY": broad market questions - "what's new in corporate cards?", "anything relevant to our product?", "what are trends in LatAm fintech?"
- "GENERAL_CHAT": greetings, meta questions about the agent itself, clarifications unrelated to competitor research
- "OBJECTION_HANDLING": the user is sharing a customer objection or prospect concern that needs a rebuttal

RULES:
- Set "requiresPersona" to true ONLY for TARGETED_QUERY or TEMPORAL_SUMMARY
- Set "requiresPersona" to false for MARKET_DISCOVERY, GENERAL_CHAT, and OBJECTION_HANDLING
- For "competitorMentioned", extract the exact competitor name from the known list if present, otherwise null
- If you cannot determine with confidence, default to "GENERAL_CHAT"

Return this exact JSON shape:
{
  "queryType": "TARGETED_QUERY" | "TEMPORAL_SUMMARY" | "MARKET_DISCOVERY" | "GENERAL_CHAT" | "OBJECTION_HANDLING",
  "competitorMentioned": "<name from known list>" | null,
  "requiresPersona": true | false
}`;

export async function detectIntent(
  query: string,
  tokenUsage: { input: number; output: number },
): Promise<IntentClassification> {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: INTENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: query }],
    });

    tokenUsage.input += response.usage.input_tokens;
    tokenUsage.output += response.usage.output_tokens;

    const raw = (response.content[0].type === 'text' ? response.content[0].text : '').trim();
    if (!raw) return fallbackClassification();

    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(jsonStr) as {
      queryType: QueryType;
      competitorMentioned: string | null;
      requiresPersona: boolean;
    };

    const validTypes: QueryType[] = [
      'TARGETED_QUERY', 'TEMPORAL_SUMMARY', 'MARKET_DISCOVERY', 'GENERAL_CHAT', 'OBJECTION_HANDLING',
    ];
    if (!validTypes.includes(parsed.queryType)) return fallbackClassification();

    return {
      queryType: parsed.queryType,
      competitorMentioned: parsed.competitorMentioned ?? null,
      requiresPersona: Boolean(parsed.requiresPersona),
    };
  } catch (err) {
    console.error('[IntentDetector] Classification failed, using fallback:', err);
    return fallbackClassification();
  }
}

function fallbackClassification(): IntentClassification {
  return { queryType: 'GENERAL_CHAT', competitorMentioned: null, requiresPersona: false };
}
