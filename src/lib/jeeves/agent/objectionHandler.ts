import Anthropic from '@anthropic-ai/sdk';
import { ObjectionResponse } from '../types/index';
import { getCachedBattlecard } from './battlecardCache';
import { findCompetitor } from '../config/competitors';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-6';

const BANNED_WORDS = ['Robust', 'Seamless', 'User-friendly', 'Streamline', 'All-in-one', 'State-of-the-art', 'Innovative', 'Cutting-edge', 'Best-in-class'];

const SYSTEM_PROMPT = `You are the Jeeves Objection Handler. A sales rep is facing a customer objection about a competitor. Your job is to provide a specific, factual rebuttal that the rep can use immediately.

### JEEVES ADVANTAGES
- 30-day credit float (vs. pre-funded/debit competitors)
- 0% FX fees on local currency rails in 20+ countries
- Proprietary tech stack - not a white-label wrapper
- Corporate cards with instant issuance
- Enterprise ERP integrations: NetSuite, SAP, Oracle, Workday, Microsoft Dynamics
- Local currency rails in Mexico, Colombia, Brazil, Chile, Peru, Argentina, US, Canada, UK, Europe, Spain

### OUTPUT FORMAT
Return ONLY a valid JSON object (no markdown fences, no preamble):
{
  "objection": "The original objection restated clearly",
  "rebuttal": "2-3 sentences. Must reference a SPECIFIC Jeeves feature or data point. Must cite a source. No generic claims.",
  "jeevesAdvantagesUsed": ["Specific advantage 1", "Specific advantage 2"],
  "followUpQuestions": ["Question 1 to redirect conversation", "Question 2"],
  "sources": ["URL or data source 1", ...]
}

### CRITICAL RULES
- The rebuttal must be 2-3 sentences with SPECIFIC facts - not generic claims.
- BANNED WORDS: ${BANNED_WORDS.join(', ')}. Replace with specific facts.
- followUpQuestions should be designed to redirect the conversation and expose competitor weaknesses.
- If you cannot find specific verifiable evidence, write "Data Not Found". Do not guess.`;

export async function handleObjection(
  customerObjection: string,
  competitorMentioned: string,
  dealContext?: string,
): Promise<ObjectionResponse> {
  const competitor = findCompetitor(competitorMentioned);
  const displayName = competitor?.name ?? competitorMentioned;

  const battlecard = getCachedBattlecard(displayName);
  let battlecardContext = '';
  if (battlecard) {
    battlecardContext = `\n\n=== BATTLECARD DATA FOR ${displayName.toUpperCase()} ===\n` +
      `Company Overview: ${battlecard.sections.companyOverview}\n` +
      `Why We Win: ${battlecard.sections.whyWeWin.join('; ')}\n` +
      `Why We Lose: ${battlecard.sections.whyWeLose.join('; ')}\n` +
      `Pricing: ${battlecard.sections.pricing}\n` +
      `Existing Objection Scripts:\n${battlecard.sections.objectionHandling.map((o) => `  - "${o.objection}" → "${o.response}"`).join('\n')}`;
  }

  const dealContextSection = dealContext ? `\n\nDeal Context: ${dealContext}` : '';
  const userMessage = `Customer Objection: "${customerObjection}"\nCompetitor: ${displayName}${dealContextSection}${battlecardContext}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const raw = (response.content[0].type === 'text' ? response.content[0].text : '')
    .trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  let parsed: ObjectionResponse;
  try {
    parsed = JSON.parse(raw) as ObjectionResponse;
  } catch {
    const retryResponse = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT + '\n\nIMPORTANT: Return ONLY raw JSON. No markdown. Start with { end with }.',
      messages: [{ role: 'user', content: userMessage }],
    });

    const retryRaw = (retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : '')
      .trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    parsed = JSON.parse(retryRaw) as ObjectionResponse;
  }

  return {
    objection: parsed.objection ?? customerObjection,
    rebuttal: parsed.rebuttal ?? 'Data Not Found',
    jeevesAdvantagesUsed: parsed.jeevesAdvantagesUsed ?? [],
    followUpQuestions: parsed.followUpQuestions ?? [],
    sources: parsed.sources ?? [],
  };
}
