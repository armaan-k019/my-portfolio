// ============================================================
// Jeeves Competitive Intelligence Agent - Shared Types
// ============================================================

export type QueryType =
  | 'TARGETED_QUERY'
  | 'TEMPORAL_SUMMARY'
  | 'MARKET_DISCOVERY'
  | 'GENERAL_CHAT'
  | 'OBJECTION_HANDLING';

export type Persona = 'sales' | 'product' | 'executive' | null;

export type PipelineStage =
  | 'intent_detection'
  | 'scraping'
  | 'extraction'
  | 'synthesis'
  | 'complete';

export type FilterCategory =
  | '[PRODUCT_UPDATE]'
  | '[FINANCIAL_HARD]'
  | '[MARKETING_CAMPAIGN]'
  | '[NOISE]';

export interface IntentClassification {
  queryType: QueryType;
  competitorMentioned: string | null;
  requiresPersona: boolean;
}

export interface SessionState {
  persona: Persona;
  pendingQuery: string | null;
  createdAt: number;
  lastActivity: number;
}

export interface ScrapedChunk {
  url: string;
  text: string;
  scrapedAt: string;
}

export interface FilteredContent {
  category: FilterCategory;
  summary: string | null;
  sourceUrl: string;
  sourceType?: 'website' | 'news' | 'linkedin';
  date?: string;
  isEstimated?: boolean;
  tier?: number;
}

export interface ExtractedCompetitorData {
  competitor_name: string;
  pricing_model: string;
  underlying_bank_partner: string;
  settlement_period: string;
  key_integrations: string[];
  regulatory_status: string;
  recent_product_updates: string[];
  fundraising: string;
  geographic_markets: string[];
  fx_fees: string;
  credit_model: string;
  free_trial: string;
  recent_promotions: string;
  source_urls: string[];
  recent_news?: string[];
  linkedin_signals?: string[];
  employee_count?: string;
  hiring_signals?: string[];
}

export interface CompetitorWedge {
  type: string;
  message: string;
}

export interface Competitor {
  name: string;
  region: 'LatAm' | 'Global' | 'Both';
  scrapeUrls: string[];
  notes?: string;
  linkedinUrl?: string;
  customerUrl?: string;
}

export interface DocumentChunk {
  id: string;
  text: string;
  metadata: {
    source: string;
    page: number;
    chunkIndex: number;
  };
}

export interface PipelineContext {
  query: string;
  sessionId: string;
  queryType: QueryType;
  competitorMentioned: string | null;
  persona: Persona;
  stage: PipelineStage;
  tokenUsage: { input: number; output: number };
  startTime: number;
}

export interface ChatRequest {
  message: string;
  sessionId: string;
  personaOverride?: Persona;
}

export interface ChatResponse {
  reply: string;
  persona: Persona;
  queryType: QueryType;
  competitorsMentioned: string[];
  requiresPersonaSelection: boolean;
  citations: string[];
  tokenUsage: { input: number; output: number };
}

export type SSEEventType =
  | 'status'
  | 'persona_request'
  | 'reply_chunk'
  | 'reply_complete'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  message?: string;
  data?: Partial<ChatResponse>;
}

export type SSECallback = (event: SSEEvent) => void;

export interface BattlecardFeatureComparison {
  feature: string;
  jeeves: string;
  competitor: string;
}

export interface BattlecardObjectionScript {
  objection: string;
  response: string;
}

export interface RecentIntelligenceItem {
  date: string;
  summary: string;
  sourceUrl: string;
  sourceType: 'news' | 'linkedin' | 'website';
  isEstimated: boolean;
}

export interface BattlecardSections {
  companyOverview: string;
  whyWeWin: string[];
  whyWeLose: string[];
  keyFeaturesComparison: BattlecardFeatureComparison[];
  pricing: string;
  landmines: string[];
  objectionHandling: BattlecardObjectionScript[];
  thirdPartyValidation: string[];
  relevantCustomers: string[];
  sources: string[];
  recentIntelligence?: RecentIntelligenceItem[];
  hiringSignals?: string[];
}

export interface BattlecardDataFreshness {
  liveDataUsed: boolean;
  scrapeDate: string;
  sources: string[];
}

export interface Battlecard {
  competitor: string;
  type: 'standard' | 'contextual';
  lastSynced: string;
  dealContext?: string;
  sections: BattlecardSections;
  dataFreshness?: BattlecardDataFreshness;
}

export interface BattlecardCacheEntry {
  data: Battlecard;
  generatedAt: number;
  competitor: string;
}

export interface ObjectionResponse {
  objection: string;
  rebuttal: string;
  jeevesAdvantagesUsed: string[];
  followUpQuestions: string[];
  sources: string[];
}

export interface NewsResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate: string;
  isEstimated: boolean;
  source: string;
}

export interface LinkedInPost {
  date: string;
  content: string;
  engagement: number;
  type: string;
  isEstimated: boolean;
  note?: string;
}
