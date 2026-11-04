// Speculative decoding on toy n-gram models, run in the browser.
//
// Target model: interpolated trigram. Draft model: interpolated bigram (less
// context, so cheaper and worse). Both are trained on one corpus from
// corpus.ts. The sampler is standard speculative sampling (Leviathan et al.
// 2023, Chen et al. 2023): the draft proposes k tokens, the target scores all
// k + 1 positions in one forward pass, each draft token is kept with
// probability min(1, p/q), and the first rejected one is replaced by a sample
// from max(0, p - q). The output follows the target's distribution exactly.
//
// Cost is modeled, not timed: one target forward pass costs 1, one draft pass
// costs DRAFT_COST. Speedup is tokens per round divided by round cost.

import { DOMAINS, type Domain, type DomainId } from "./corpus";

export const DRAFT_COST = 0.1;
export const K_VALUES = [1, 2, 3, 4, 5, 6, 7, 8];
export const TEMPERATURES = [0.3, 0.7, 1.0];
export const ROUNDS = 1200;
export const CHECK_SAMPLES = 20000;
const MIN_REACHED = 40;

const BOS = "<s>";
const EOS = "</s>";

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function tokenize(text: string): string[] {
  return text.match(/\s*(?:[A-Za-z0-9_]+|[^\sA-Za-z0-9_])/g) ?? [];
}

type Counts = Map<number, number>;

function bump(m: Map<string, Counts>, key: string, id: number) {
  let c = m.get(key);
  if (!c) m.set(key, (c = new Map()));
  c.set(id, (c.get(id) ?? 0) + 1);
}

function total(c: Counts) {
  let n = 0;
  for (const v of c.values()) n += v;
  return n;
}

export class Models {
  readonly vocab: string[] = [];
  readonly ids = new Map<string, number>();
  // Corpus positions as [prev2, prev1] contexts, for measuring acceptance on
  // realistic contexts.
  readonly contexts: [number, number][] = [];
  private uni: Float64Array;
  private bi = new Map<string, Counts>();
  private tri = new Map<string, Counts>();
  private cache = new Map<string, Float64Array>();

  constructor(readonly domain: Domain, readonly temperature: number) {
    const unicounts: number[] = [];
    const id = (t: string) => {
      let i = this.ids.get(t);
      if (i === undefined) {
        i = this.vocab.length;
        this.vocab.push(t);
        this.ids.set(t, i);
        unicounts.push(0);
      }
      return i;
    };
    const bos = id(BOS);
    id(EOS);
    for (const doc of domain.docs) {
      const toks = [bos, bos, ...tokenize(doc).map(id), this.ids.get(EOS)!];
      for (let i = 2; i < toks.length; i++) {
        const [a, b, w] = [toks[i - 2], toks[i - 1], toks[i]];
        unicounts[w]++;
        bump(this.bi, `${b}`, w);
        bump(this.tri, `${a},${b}`, w);
        this.contexts.push([a, b]);
      }
    }
    const n = unicounts.reduce((x, y) => x + y, 0);
    this.uni = Float64Array.from(unicounts, (c) => c / n);
  }

  get bos() {
    return this.ids.get(BOS)!;
  }
  get eos() {
    return this.ids.get(EOS)!;
  }

  // Target distribution given the last two tokens.
  target(a: number, b: number): Float64Array {
    return this.dist(`t${a},${b}`, () => {
      const tri = this.tri.get(`${a},${b}`);
      const bi = this.bi.get(`${b}`);
      return this.mix([[0.85, tri], [0.12, bi], [0.025, "uni"]], 0.005);
    });
  }

  // Draft distribution: sees only the last token.
  draft(b: number): Float64Array {
    return this.dist(`d${b}`, () => {
      const bi = this.bi.get(`${b}`);
      return this.mix([[0.93, bi], [0.06, "uni"]], 0.01);
    });
  }

  // Weighted mix of count tables plus a uniform floor. A table missing for
  // this context drops out and the rest are renormalized.
  private mix(parts: [number, Counts | "uni" | undefined][], floor: number): Float64Array {
    const V = this.vocab.length;
    const out = new Float64Array(V);
    let wsum = floor;
    for (const [w, c] of parts) {
      if (c === "uni") {
        for (let i = 0; i < V; i++) out[i] += w * this.uni[i];
        wsum += w;
      } else if (c) {
        const n = total(c);
        for (const [i, k] of c) out[i] += (w * k) / n;
        wsum += w;
      }
    }
    for (let i = 0; i < V; i++) out[i] = (out[i] + floor / V) / wsum;
    out[this.bos] = 0;
    return out;
  }

  private dist(key: string, make: () => Float64Array): Float64Array {
    let d = this.cache.get(key);
    if (!d) {
      d = applyTemperature(make(), this.temperature);
      this.cache.set(key, d);
    }
    return d;
  }
}

function applyTemperature(p: Float64Array, T: number): Float64Array {
  if (T === 1) return p;
  const out = new Float64Array(p.length);
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    out[i] = p[i] > 0 ? Math.pow(p[i], 1 / T) : 0;
    s += out[i];
  }
  for (let i = 0; i < p.length; i++) out[i] /= s;
  return out;
}

function sample(p: Float64Array, r: number): number {
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += p[i];
    if (r < acc) return i;
  }
  // Rounding left a sliver at the end: return the last nonzero entry.
  for (let i = p.length - 1; i >= 0; i--) if (p[i] > 0) return i;
  return 0;
}

export type TokenKind = "accepted" | "resampled" | "bonus";

export interface OutToken {
  id: number;
  kind: TokenKind;
}

export interface Round {
  drafted: number[];
  out: OutToken[];
  // Context and token at the first rejection, if any.
  rejected?: { prev: number; drafted: number; got: number };
}

// One speculative round from context (a, b).
export function specRound(m: Models, a: number, b: number, k: number, r: () => number): Round {
  const drafted: number[] = [];
  const qs: Float64Array[] = [];
  let [x, y] = [a, b];
  for (let i = 0; i < k; i++) {
    const q = m.draft(y);
    const t = sample(q, r());
    drafted.push(t);
    qs.push(q);
    [x, y] = [y, t];
    if (t === m.eos) break;
  }
  // The target scores every drafted position (one batched forward pass).
  const out: OutToken[] = [];
  [x, y] = [a, b];
  for (let i = 0; i < drafted.length; i++) {
    const p = m.target(x, y);
    const t = drafted[i];
    const q = qs[i];
    if (r() < Math.min(1, p[t] / q[t])) {
      out.push({ id: t, kind: "accepted" });
      [x, y] = [y, t];
      if (t === m.eos) return { drafted, out };
      continue;
    }
    const res = new Float64Array(p.length);
    let s = 0;
    for (let j = 0; j < p.length; j++) {
      res[j] = Math.max(0, p[j] - q[j]);
      s += res[j];
    }
    const got = s > 0 ? sample(res.map((v) => v / s), r()) : sample(p, r());
    out.push({ id: got, kind: "resampled" });
    return { drafted, out, rejected: { prev: y, drafted: t, got } };
  }
  out.push({ id: sample(m.target(x, y), r()), kind: "bonus" });
  return { drafted, out };
}

export interface KStat {
  k: number;
  tokensPerRound: number;
  speedup: number;
  theory: number;
}

export interface Measurement {
  domain: DomainId;
  temperature: number;
  // Mean over corpus contexts of sum(min(p, q)), the chance one draft token
  // is accepted.
  alpha: number;
  // Acceptance rate at each draft position, measured with k = 8, for the
  // positions reached at least MIN_REACHED times.
  byPosition: number[];
  stats: KStat[];
  best: number;
  hotspots: { prev: string; drafted: string; got: string; count: number }[];
}

export function speedup(tokensPerRound: number, k: number) {
  return tokensPerRound / (k * DRAFT_COST + 1);
}

// Expected tokens per round if each draft token is accepted independently
// with probability alpha.
export function theoryTokens(alpha: number, k: number) {
  if (alpha >= 1) return k + 1;
  return (1 - Math.pow(alpha, k + 1)) / (1 - alpha);
}

const modelCache = new Map<string, Models>();

export function models(domain: DomainId, temperature: number): Models {
  const key = `${domain}@${temperature}`;
  let m = modelCache.get(key);
  if (!m) {
    m = new Models(DOMAINS.find((d) => d.id === domain)!, temperature);
    modelCache.set(key, m);
  }
  return m;
}

const measureCache = new Map<string, Measurement>();

export function measure(domain: DomainId, temperature: number): Measurement {
  const key = `${domain}@${temperature}`;
  const hit = measureCache.get(key);
  if (hit) return hit;
  const m = models(domain, temperature);

  let alpha = 0;
  for (const [a, b] of m.contexts) {
    const p = m.target(a, b);
    const q = m.draft(b);
    let s = 0;
    for (let i = 0; i < p.length; i++) s += Math.min(p[i], q[i]);
    alpha += s;
  }
  alpha /= m.contexts.length;

  const stats: KStat[] = [];
  const reached = new Array(8).fill(0);
  const kept = new Array(8).fill(0);
  const rej = new Map<string, { prev: number; drafted: number; got: number; count: number }>();
  for (const k of K_VALUES) {
    const r = rng(1000 + k);
    let tokens = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const [a, b] = m.contexts[Math.floor(r() * m.contexts.length)];
      const round = specRound(m, a, b, k, r);
      tokens += round.out.length;
      if (k === 8) {
        const accepted = round.out.filter((t) => t.kind === "accepted").length;
        for (let j = 0; j < round.drafted.length; j++) {
          if (j > accepted) break;
          reached[j]++;
          if (j < accepted) kept[j]++;
        }
        if (round.rejected) {
          const { prev, drafted, got } = round.rejected;
          const rk = `${prev},${drafted},${got}`;
          const e = rej.get(rk) ?? { prev, drafted, got, count: 0 };
          e.count++;
          rej.set(rk, e);
        }
      }
    }
    const tpr = tokens / ROUNDS;
    stats.push({ k, tokensPerRound: tpr, speedup: speedup(tpr, k), theory: speedup(theoryTokens(alpha, k), k) });
  }
  const best = stats.reduce((x, y) => (y.speedup > x.speedup ? y : x)).k;
  // Deep positions are reached rarely; report only those with enough rounds.
  const byPosition: number[] = [];
  for (let i = 0; i < 8 && reached[i] >= MIN_REACHED; i++) byPosition.push(kept[i] / reached[i]);
  const hotspots = [...rej.values()]
    .sort((x, y) => y.count - x.count)
    .slice(0, 5)
    .map((h) => ({ prev: m.vocab[h.prev], drafted: m.vocab[h.drafted], got: m.vocab[h.got], count: h.count }));

  const out = { domain, temperature, alpha, byPosition, stats, best, hotspots };
  measureCache.set(key, out);
  return out;
}

export interface Generation {
  prompt: string;
  rounds: Round[];
  tokens: number;
  targetCalls: number;
  draftCalls: number;
}

// Generate at least maxTokens tokens from the domain prompt, starting a new
// document after each end token.
export function generate(domain: DomainId, temperature: number, k: number, seed: number, maxTokens = 90): Generation {
  const m = models(domain, temperature);
  const d = DOMAINS.find((x) => x.id === domain)!;
  const r = rng(seed);
  const ctx = [m.bos, m.bos, ...tokenize(d.prompt).map((t) => m.ids.get(t) ?? m.bos)];
  const rounds: Round[] = [];
  let tokens = 0;
  let draftCalls = 0;
  while (tokens < maxTokens) {
    const round = specRound(m, ctx[ctx.length - 2], ctx[ctx.length - 1], k, r);
    rounds.push(round);
    draftCalls += round.drafted.length;
    tokens += round.out.length;
    for (const t of round.out) ctx.push(t.id);
    // A finished document starts a new one, as a server would start the next request.
    if (round.out[round.out.length - 1].id === m.eos) ctx.push(m.bos, m.bos);
  }
  return { prompt: d.prompt, rounds, tokens, targetCalls: rounds.length, draftCalls };
}

export interface Check {
  specVsPlain: number;
  plainVsPlain: number;
}

// Sample the first two tokens after the prompt CHECK_SAMPLES times with
// speculative decoding and twice with plain target sampling, and report total
// variation distance. Plain vs plain is the sampling-noise floor.
export function distributionCheck(domain: DomainId, temperature: number, k: number): Check {
  const m = models(domain, temperature);
  const d = DOMAINS.find((x) => x.id === domain)!;
  const ctx = [m.bos, m.bos, ...tokenize(d.prompt).map((t) => m.ids.get(t) ?? m.bos)];
  const [a0, b0] = ctx.slice(-2);

  const plain = (seed: number) => {
    const r = rng(seed);
    const counts = new Map<string, number>();
    for (let i = 0; i < CHECK_SAMPLES; i++) {
      const t1 = sample(m.target(a0, b0), r());
      const t2 = sample(m.target(b0, t1), r());
      const key = `${t1},${t2}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const spec = (seed: number) => {
    const r = rng(seed);
    const counts = new Map<string, number>();
    for (let i = 0; i < CHECK_SAMPLES; i++) {
      const got: number[] = [];
      let [a, b] = [a0, b0];
      while (got.length < 2) {
        for (const t of specRound(m, a, b, k, r).out) {
          got.push(t.id);
          [a, b] = [b, t.id];
        }
      }
      const key = `${got[0]},${got[1]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };
  const tv = (x: Map<string, number>, y: Map<string, number>) => {
    const keys = new Set([...x.keys(), ...y.keys()]);
    let s = 0;
    for (const key of keys) s += Math.abs((x.get(key) ?? 0) - (y.get(key) ?? 0));
    return s / (2 * CHECK_SAMPLES);
  };
  const p1 = plain(11);
  return { specVsPlain: tv(spec(12 + k), p1), plainVsPlain: tv(plain(13), p1) };
}

export interface ClaudePick {
  k: number;
  summary: string;
  failures: string;
  fix: string;
}
