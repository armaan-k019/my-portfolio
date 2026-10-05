// The Commons: an agent-based model of outbound email when personalization
// gets cheap. Pure TypeScript, no network, no LLM. Every constant below is an
// assumption, not a measurement, and the page says so.

// ─── Seeded random ────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Strategies ───────────────────────────────────────────────────────────────

export type StrategyId = "spray" | "cosmetic" | "targeted" | "both";

export interface Strategy {
  id: StrategyId;
  label: string;
  personal: boolean; // the email looks written for you
  targeted: boolean; // sent only to prospects a signal says need the product
}

export const STRATEGIES: Strategy[] = [
  { id: "spray", label: "Template", personal: false, targeted: false },
  { id: "cosmetic", label: "Personalized", personal: true, targeted: false },
  { id: "targeted", label: "Targeted", personal: false, targeted: true },
  { id: "both", label: "Targeted + personalized", personal: true, targeted: true },
];

export const STRATEGY_INDEX: Record<StrategyId, number> = {
  spray: 0,
  cosmetic: 1,
  targeted: 2,
  both: 3,
};

// ─── Parameters ───────────────────────────────────────────────────────────────

export interface Params {
  seed: number;
  days: number;
  prospects: number;
  sellers: number;
  categories: number;
  /** Dollars per seller per day. */
  budget: number;
  /** Dollars to send one email at all. */
  sendCost: number;
  /** Dollars of research to make one email look personal. The main control. */
  personalCost: number;
  /** Dollars of signal data to target one email. */
  targetCost: number;
  /** Share of a targeted seller's picks that really need the product. */
  signalPrecision: number;
  /** Emails a prospect reads per day, min and max. */
  attentionMin: number;
  attentionMax: number;
  /** Share of prospects who need any given category on a given day. */
  needRate: number;
  /** Average days a need lasts before it moves to another category. */
  needDays: number;
  /** Reply chance when a read email is relevant, before trust. */
  replyBase: number;
  /** Prior belief that a personal-looking email is relevant (0 to 1). */
  trustPrior: number;
  /** Weight of the prior, in emails. */
  trustPriorWeight: number;
  /** Daily retention of evidence about personal emails (0 to 1). */
  memory: number;
  /** Daily chance a seller compares itself with a peer and may switch. */
  adoption: number;
  /** Daily chance a seller tries a random strategy. Keeps all four alive. */
  mutation: number;
  /** Days of history a seller uses to judge a strategy. */
  window: number;
}

export const DEFAULT_PARAMS: Params = {
  seed: 7,
  days: 180,
  prospects: 1200,
  sellers: 48,
  categories: 8,
  budget: 60,
  sendCost: 0.05,
  personalCost: 3,
  targetCost: 3,
  signalPrecision: 0.8,
  attentionMin: 3,
  attentionMax: 8,
  needRate: 0.06,
  needDays: 30,
  replyBase: 0.25,
  trustPrior: 0.7,
  trustPriorWeight: 10,
  memory: 0.97,
  adoption: 0.15,
  mutation: 0.005,
  window: 14,
};

// ─── State ────────────────────────────────────────────────────────────────────

export interface EmailEvent {
  seller: number;
  strategy: number;
  relevant: boolean;
  read: boolean;
  replied: boolean;
  /** The prospect's belief that the email is relevant, when they chose what to read. */
  perceived: number;
}

export interface DaySummary {
  day: number;
  sent: number;
  read: number;
  replies: number;
  /** Mean belief that a personal-looking email is relevant. */
  trust: number;
  /** Count of sellers on each strategy, indexed like STRATEGIES. */
  shares: number[];
  /** Replies per email sent, per strategy (NaN when nobody used it). */
  replyRate: number[];
  /** Replies per dollar, per strategy (NaN when nobody used it). */
  replyPerDollar: number[];
  /** Mean emails received per prospect. */
  inbox: number;
}

export interface Sim {
  params: Params;
  day: number;
  rand: () => number;
  // prospects
  attention: Int32Array;
  need: Int32Array; // category index currently needed, or -1
  trustA: Float64Array; // evidence that personal emails were relevant
  trustB: Float64Array; // evidence that they were not
  trustHistory: Float32Array[]; // per prospect, one value per day
  lastInbox: EmailEvent[][]; // per prospect, the most recent day
  // sellers
  category: Int32Array;
  strategy: Int32Array;
  payoffHistory: Float64Array[]; // per seller, replies per dollar, ring of `window`
  // output
  history: DaySummary[];
}

export function costPerEmail(p: Params, s: Strategy): number {
  return p.sendCost + (s.personal ? p.personalCost : 0) + (s.targeted ? p.targetCost : 0);
}

export function trustOf(sim: Sim, i: number): number {
  return sim.trustA[i] / (sim.trustA[i] + sim.trustB[i]);
}

export function createSim(params: Params): Sim {
  const rand = mulberry32(params.seed);
  const n = params.prospects;
  const attention = new Int32Array(n);
  const need = new Int32Array(n);
  const trustA = new Float64Array(n);
  const trustB = new Float64Array(n);
  const trustHistory: Float32Array[] = [];
  const lastInbox: EmailEvent[][] = [];
  for (let i = 0; i < n; i++) {
    attention[i] =
      params.attentionMin + Math.floor(rand() * (params.attentionMax - params.attentionMin + 1));
    need[i] = rand() < params.needRate * params.categories ? Math.floor(rand() * params.categories) : -1;
    trustA[i] = params.trustPrior * params.trustPriorWeight;
    trustB[i] = (1 - params.trustPrior) * params.trustPriorWeight;
    trustHistory.push(new Float32Array(params.days));
    lastInbox.push([]);
  }
  const m = params.sellers;
  const category = new Int32Array(m);
  const strategy = new Int32Array(m);
  const payoffHistory: Float64Array[] = [];
  for (let j = 0; j < m; j++) {
    category[j] = j % params.categories;
    // Everyone starts evenly split, so no strategy is favored by the setup.
    strategy[j] = j % STRATEGIES.length;
    payoffHistory.push(new Float64Array(params.window).fill(NaN));
  }
  return {
    params,
    day: 0,
    rand,
    attention,
    need,
    trustA,
    trustB,
    trustHistory,
    lastInbox,
    category,
    strategy,
    payoffHistory,
    history: [],
  };
}

function meanFinite(xs: Float64Array): number {
  let s = 0;
  let c = 0;
  for (const x of xs) {
    if (Number.isFinite(x)) {
      s += x;
      c++;
    }
  }
  return c === 0 ? NaN : s / c;
}

/** Advance one day. Returns false once the run is over. */
export function step(sim: Sim): boolean {
  const p = sim.params;
  if (sim.day >= p.days) return false;
  const rand = sim.rand;
  const n = p.prospects;
  const K = STRATEGIES.length;

  // 1. Needs drift. A need ends with chance 1/needDays; a free prospect
  //    picks up a new one at the rate that keeps the share near needRate * K.
  const startRate = (p.needRate * p.categories) / p.needDays / Math.max(1e-9, 1 - p.needRate * p.categories);
  const byCategory: number[][] = Array.from({ length: p.categories }, () => []);
  for (let i = 0; i < n; i++) {
    if (sim.need[i] >= 0) {
      if (rand() < 1 / p.needDays) sim.need[i] = -1;
    } else if (rand() < startRate) {
      sim.need[i] = Math.floor(rand() * p.categories);
    }
    if (sim.need[i] >= 0) byCategory[sim.need[i]].push(i);
  }

  // 2. Sellers send. Volume is budget divided by cost per email.
  const inbox: EmailEvent[][] = Array.from({ length: n }, () => []);
  const sentBy = new Int32Array(p.sellers);
  for (let j = 0; j < p.sellers; j++) {
    const s = STRATEGIES[sim.strategy[j]];
    const volume = Math.floor(p.budget / costPerEmail(p, s));
    sentBy[j] = volume;
    const pool = byCategory[sim.category[j]];
    for (let e = 0; e < volume; e++) {
      let to: number;
      if (s.targeted && pool.length > 0 && rand() < p.signalPrecision) {
        to = pool[Math.floor(rand() * pool.length)];
      } else {
        to = Math.floor(rand() * n);
      }
      inbox[to].push({
        seller: j,
        strategy: sim.strategy[j],
        relevant: sim.need[to] === sim.category[j],
        read: false,
        replied: false,
        perceived: 0,
      });
    }
  }

  // 3. Prospects read what looks most relevant, up to their attention, and
  //    reply only when the product is something they need right now.
  const repliesBy = new Float64Array(p.sellers);
  let totalSent = 0;
  let totalRead = 0;
  let totalReplies = 0;
  let inboxSum = 0;
  const basePerceived = p.needRate; // a template carries no signal beyond the base rate
  for (let i = 0; i < n; i++) {
    const mail = inbox[i];
    inboxSum += mail.length;
    totalSent += mail.length;
    const trust = trustOf(sim, i);
    for (const e of mail) {
      e.perceived = STRATEGIES[e.strategy].personal ? trust : basePerceived;
    }
    // Read the higher perceived group first (personal-looking or template),
    // picking at random within a group. Partial Fisher-Yates per group.
    const personalFirst = trust >= basePerceived;
    const first: number[] = [];
    const second: number[] = [];
    for (let k = 0; k < mail.length; k++) {
      (STRATEGIES[mail[k].strategy].personal === personalFirst ? first : second).push(k);
    }
    const reads = Math.min(sim.attention[i], mail.length);
    const picks: number[] = [];
    for (const group of [first, second]) {
      for (let g = 0; g < group.length && picks.length < reads; g++) {
        const swap = g + Math.floor(rand() * (group.length - g));
        const t = group[g];
        group[g] = group[swap];
        group[swap] = t;
        picks.push(group[g]);
      }
    }
    for (const k of picks) {
      const e = mail[k];
      e.read = true;
      totalRead++;
      if (e.relevant && rand() < p.replyBase * (0.5 + e.perceived)) {
        e.replied = true;
        totalReplies++;
        repliesBy[e.seller]++;
      }
      // Reading a personal-looking email is evidence about what such emails mean.
      if (STRATEGIES[e.strategy].personal) {
        if (e.relevant) sim.trustA[i] += 1;
        else sim.trustB[i] += 1;
      }
    }
    // Evidence fades toward the prior.
    const a0 = p.trustPrior * p.trustPriorWeight;
    const b0 = (1 - p.trustPrior) * p.trustPriorWeight;
    sim.trustA[i] = a0 + (sim.trustA[i] - a0) * p.memory;
    sim.trustB[i] = b0 + (sim.trustB[i] - b0) * p.memory;
    sim.trustHistory[i][sim.day] = trustOf(sim, i);
    sim.lastInbox[i] = mail;
  }

  // 4. Score the day per seller and per strategy.
  const sentByStrategy = new Float64Array(K);
  const repliesByStrategy = new Float64Array(K);
  const spendByStrategy = new Float64Array(K);
  const w = sim.day % p.window;
  for (let j = 0; j < p.sellers; j++) {
    const s = sim.strategy[j];
    const spend = sentBy[j] * costPerEmail(p, STRATEGIES[s]);
    sentByStrategy[s] += sentBy[j];
    repliesByStrategy[s] += repliesBy[j];
    spendByStrategy[s] += spend;
    sim.payoffHistory[j][w] = spend > 0 ? repliesBy[j] / spend : 0;
  }

  // 5. Imitation. A seller compares its recent replies per dollar with a random
  //    peer's and switches to the peer's strategy with a chance that grows with
  //    the gap. A small mutation rate keeps every strategy in play.
  const next = Int32Array.from(sim.strategy);
  for (let j = 0; j < p.sellers; j++) {
    if (rand() < p.mutation) {
      next[j] = Math.floor(rand() * K);
      sim.payoffHistory[j].fill(NaN);
      continue;
    }
    if (rand() >= p.adoption) continue;
    const peer = Math.floor(rand() * p.sellers);
    if (peer === j || sim.strategy[peer] === sim.strategy[j]) continue;
    const mine = meanFinite(sim.payoffHistory[j]);
    const theirs = meanFinite(sim.payoffHistory[peer]);
    if (!Number.isFinite(mine) || !Number.isFinite(theirs)) continue;
    const gap = (theirs - mine) / Math.max(theirs, mine, 1e-9);
    if (gap > 0 && rand() < gap) {
      next[j] = sim.strategy[peer];
      sim.payoffHistory[j].fill(NaN);
    }
  }
  const shares = new Array(K).fill(0);
  for (let j = 0; j < p.sellers; j++) shares[sim.strategy[j]]++;
  sim.strategy = next;

  let trustSum = 0;
  for (let i = 0; i < n; i++) trustSum += trustOf(sim, i);

  sim.history.push({
    day: sim.day,
    sent: totalSent,
    read: totalRead,
    replies: totalReplies,
    trust: trustSum / n,
    shares,
    replyRate: Array.from(sentByStrategy, (s, k) => (s > 0 ? repliesByStrategy[k] / s : NaN)),
    replyPerDollar: Array.from(spendByStrategy, (s, k) => (s > 0 ? repliesByStrategy[k] / s : NaN)),
    inbox: inboxSum / n,
  });
  sim.day++;
  return true;
}

export function runAll(params: Params): Sim {
  const sim = createSim(params);
  while (step(sim)) {
    /* advance */
  }
  return sim;
}
