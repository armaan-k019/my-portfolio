import Anthropic from '@anthropic-ai/sdk';
import { ExtractedCompetitorData, CompetitorWedge, Persona } from '../types/index';
import { getPersonaLabel } from './personaRouter';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-6';

const JEEVES_ADVANTAGES = {
  CREDIT_FLOAT: '30-day credit float',
  FX_FEES: '0% FX fees on local currency rails in 20+ countries',
  TECH_OWNERSHIP: 'Proprietary tech stack - not a white-label',
  GEOGRAPHIC_REACH: 'Local currency rails in 20+ countries',
  CARD_PRODUCT: 'Corporate cards with instant issuance',
} as const;

const JEEVES_ENTERPRISE_ERPS = ['NetSuite', 'SAP', 'Oracle', 'Workday', 'Microsoft Dynamics'];
const JEEVES_MARKETS = ['Mexico', 'Colombia', 'Brazil', 'Chile', 'Peru', 'Argentina', 'United States', 'Canada', 'UK', 'Europe', 'Spain'];

const BANNED_WORDS = ['Robust', 'Seamless', 'User-friendly', 'Streamline', 'All-in-one', 'State-of-the-art', 'Innovative', 'Cutting-edge', 'Best-in-class'];

function containsBannedWords(text: string): string[] {
  return BANNED_WORDS.filter((word) => text.toLowerCase().includes(word.toLowerCase()));
}

export function computeCompetitorDiff(data: ExtractedCompetitorData): CompetitorWedge[] {
  const wedges: CompetitorWedge[] = [];
  const name = data.competitor_name;

  if (data.credit_model !== 'NULL' && data.credit_model !== '' && /prepaid|debit|no float|no credit/i.test(data.credit_model)) {
    wedges.push({ type: 'CREDIT_MODEL', message: `Target cash-flow-sensitive companies: Jeeves offers ${JEEVES_ADVANTAGES.CREDIT_FLOAT} vs. ${name}'s ${data.credit_model} model.` });
  }

  if (data.fx_fees !== 'NULL' && data.fx_fees !== '') {
    const fxMatch = data.fx_fees.match(/(\d+(?:\.\d+)?)\s*%/);
    if (fxMatch && parseFloat(fxMatch[1]) > 0) {
      wedges.push({ type: 'FX_FEES', message: `Target cross-border operators: Jeeves charges 0% FX vs. ${name}'s ${data.fx_fees} fee.` });
    }
  }

  if (data.geographic_markets.length > 0) {
    const competitorMarkets = data.geographic_markets.map((m) => m.toLowerCase());
    const gaps = JEEVES_MARKETS.filter((m) => !competitorMarkets.some((cm) => cm.includes(m.toLowerCase())));
    if (gaps.length > 0 && gaps.length <= 10) {
      wedges.push({ type: 'GEOGRAPHIC_GAP', message: `Geographic gap: ${name} does not operate in ${gaps.slice(0, 3).join(', ')} - Jeeves does.` });
    }
  }

  if (data.key_integrations.length > 0) {
    const integrationNames = data.key_integrations.map((i) => i.toLowerCase());
    const missingERPs = JEEVES_ENTERPRISE_ERPS.filter((erp) => !integrationNames.some((i) => i.includes(erp.toLowerCase())));
    if (missingERPs.length >= 2) {
      wedges.push({ type: 'INTEGRATION_GAP', message: `Integration gap: ${name} lacks enterprise ERP connectivity (${missingERPs.slice(0, 3).join(', ')}) that Jeeves supports.` });
    }
  }

  if (data.underlying_bank_partner !== 'NULL' && data.underlying_bank_partner !== '') {
    wedges.push({ type: 'INFRASTRUCTURE_RISK', message: `Infrastructure risk: ${name} depends on ${data.underlying_bank_partner} as its banking layer - Jeeves owns its proprietary stack.` });
  }

  return wedges;
}

function buildSynthesisSystemPrompt(persona: Persona, competitorName: string): string {
  const personaLabel = getPersonaLabel(persona);

  const outputFormatInstruction = (() => {
    switch (persona) {
      case 'sales':
        return `IF persona = "Sales / GTM":
- Output a strict markdown comparison TABLE with columns: Feature | Jeeves | ${competitorName} | Jeeves Advantage
- Include rows for: Pricing, Credit Model, FX Fees, Key Integrations, Geographic Markets, Regulatory Status
- Below the table, add an "Objection Handling" section with 3 specific rebuttals the sales team can use
- Each rebuttal must be actionable and cite a specific data point`;

      case 'product':
        return `IF persona = "Product & Strategy":
- Output a prose/narrative deep-dive structured as:
  1) Operating Model
  2) Tech Stack & Infrastructure
  3) Strategic Threats to Jeeves
  4) Recommended Jeeves Response
- Minimum 400 words, maximum 800 words
- Each section must have specific evidence, not vague assertions`;

      case 'executive':
        return `IF persona = "Executive":
- Output a "Market Pulse" section: 5 bullet points maximum, each one sentence, each citing a source
- Follow with a "Strategic Risk Level" rating: Low / Medium / High
- Include a one-sentence justification for the risk rating
- Every bullet must contain a specific number, date, or named feature - no vague summaries`;

      default:
        return `Output a concise prose summary suitable for any reader, max 300 words, with citations. Focus on the most actionable intelligence first.`;
    }
  })();

  return `You are the Jeeves Strategic Research Agent. Your job is to produce competitive intelligence that Jeeves employees can act on immediately.

### JEEVES CONTEXT (OUR ADVANTAGES)
- Capital Model: 30-day credit float (vs. pre-funded/debit competitors).
- Global Rails: Local currency rails in 20+ countries, 0% FX fees.
- Infrastructure: Proprietary tech stack - not a white-label wrapper.
- Card Product: Corporate cards with instant issuance.

### STRICT NEGATIVE CONSTRAINTS
BANNED WORDS: "Robust", "Seamless", "User-friendly", "Streamline", "All-in-one", "State-of-the-art", "Innovative", "Cutting-edge", "Best-in-class".
- Replace with specific facts.
- Every single claim must end with a citation: [Source: <URL or PDF filename + page number>].
- If no source is available for a claim, do not include that claim.
- If you cannot find specific, verifiable evidence, write "Data Not Found". Do not guess.

### ACTIVE PERSONA: ${personaLabel}

### OUTPUT FORMAT
${outputFormatInstruction}`;
}

export async function synthesizeResponse(
  data: ExtractedCompetitorData,
  wedges: CompetitorWedge[],
  persona: Persona,
  query: string,
  tokenUsage: { input: number; output: number },
): Promise<string> {
  const wedgesText = wedges.length > 0
    ? wedges.map((w) => `- [${w.type}] ${w.message}`).join('\n')
    : 'No significant competitive wedges identified from available data.';

  const systemPrompt = buildSynthesisSystemPrompt(persona, data.competitor_name);
  const userMessage = `### COMPETITOR DATA\n${JSON.stringify(data, null, 2)}\n\n### IDENTIFIED COMPETITIVE WEDGES\n${wedgesText}\n\n### USER QUERY\n${query}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  tokenUsage.input += response.usage.input_tokens;
  tokenUsage.output += response.usage.output_tokens;

  let output = response.content[0].type === 'text' ? response.content[0].text : '';

  const violations = containsBannedWords(output);
  if (violations.length > 0) {
    console.warn(`[Synthesizer] Banned word(s) detected: ${violations.join(', ')}. Re-prompting...`);

    const retryResponse = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: output },
        {
          role: 'user',
          content: `Your response contains the following banned words: ${violations.join(', ')}. Rewrite the entire response replacing each banned word with a specific fact. Return the complete rewritten response.`,
        },
      ],
    });

    tokenUsage.input += retryResponse.usage.input_tokens;
    tokenUsage.output += retryResponse.usage.output_tokens;

    const retryContent = retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : '';
    if (retryContent?.trim()) output = retryContent;
  }

  return output;
}

export async function synthesizeTemporalResponse(
  query: string,
  context: string,
  persona: Persona,
  scrapeDate: string,
  tokenUsage: { input: number; output: number },
): Promise<string> {
  const hasContent = context.trim().length > 0;

  const systemPrompt = `You are the Jeeves Strategic Research Agent answering a temporal/recent-activity query.

### WHAT THE CONTEXT IS
The CONTEXT section contains pre-extracted intelligence items. Each line follows the format:
  <icon> [CATEGORY] [date] <summary text> [Source: URL]

Where icon is: 📰 = news article, 💼 = LinkedIn post, 🌐 = website scrape.
These lines ARE the verified findings - reformat and present ALL of them.

### OUTPUT RULES
- Write one bullet per context item. Do NOT merge, skip, or omit any item.
- Preserve the source icon from the context line.
- Format each bullet: - <icon> **[DATE label]** <summary> [Source: URL]
- Group items under a markdown header for each competitor: ### CompetitorName
- Within each competitor, apply a RECENCY sub-grouping:
  #### This month  ← items dated within the last 30 days of ${scrapeDate}
  #### Last 1–3 months  ← items from 1–3 months ago
  #### Older  ← items older than 3 months (only show if no newer items exist)
- BANNED WORDS: "Robust", "Seamless", "User-friendly", "Streamline", "All-in-one", "State-of-the-art", "Innovative", "Cutting-edge", "Best-in-class".

### JEEVES CONTEXT
- 30-day credit float, 0% FX fees, proprietary tech stack, corporate cards with instant issuance, 20+ country coverage.`;

  const userContent = hasContent
    ? `CONTEXT:\n${context.slice(0, 12000)}\n\nQUERY: ${query}`
    : `No scraped data was retrieved for this query. Inform the user that the scraper returned no results and suggest they try again or check a specific competitor by name.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  tokenUsage.input += response.usage.input_tokens;
  tokenUsage.output += response.usage.output_tokens;

  return response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate a response.';
}

export async function synthesizeGeneralResponse(
  query: string,
  context: string,
  persona: Persona,
  tokenUsage: { input: number; output: number },
): Promise<string> {
  const isTemporal = query.toLowerCase().match(/recent|this week|today|latest|last \d|yesterday|changelog|update/);

  const temporalInstructions = isTemporal ? `

### TEMPORAL QUERY INSTRUCTIONS
This is a temporal/recent-activity query. You MUST:
- Prioritize changelog entries, blog posts, and product update data from the context
- Sort all findings chronologically, most recent first
- Each finding MUST include a specific date if available
- Format output as: "Here's what changed at [Competitor] recently:" followed by dated bullet points
` : '';

  const systemPrompt = `You are the Jeeves Strategic Research Agent. Answer competitive intelligence questions for Jeeves employees.

### JEEVES CONTEXT
- 30-day credit float, 0% FX fees, proprietary tech stack, corporate cards with instant issuance.
- Operates in 20+ countries with local currency rails.

### CONSTRAINTS
- Every factual claim must cite a source: [Source: URL or document].
- If information is not available, say "Data Not Found" - do not guess.
- BANNED WORDS: "Robust", "Seamless", "User-friendly", "Streamline", "All-in-one", "State-of-the-art", "Innovative", "Cutting-edge", "Best-in-class".
- Max 300 words for general responses.${temporalInstructions}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: context ? `Context:\n${context.slice(0, 8000)}\n\nQuery: ${query}` : query,
    }],
  });

  tokenUsage.input += response.usage.input_tokens;
  tokenUsage.output += response.usage.output_tokens;

  return response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate a response.';
}
