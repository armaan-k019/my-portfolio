// Taste model: Bayesian Bradley-Terry over hand-built image features.
// P(a beats b) = sigmoid(w . (x_a - x_b)), prior w ~ N(0, PRIOR_VAR * I),
// posterior by Laplace approximation (Newton's method on the log posterior).
// Pure TypeScript, no network, no LLM.

import { D } from "./features";

export const PRIOR_VAR = 1;

export interface Choice {
  winner: number;
  loser: number;
}

export interface Posterior {
  mean: number[];
  cov: number[][]; // D x D
}

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

export function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k] * b[k];
  return s;
}

function sub(a: number[], b: number[]) {
  return a.map((v, k) => v - b[k]);
}

// Inverse of a symmetric positive definite matrix by Gauss-Jordan elimination.
export function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const piv = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function quad(cov: number[][], d: number[]) {
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let r = 0;
    for (let j = 0; j < d.length; j++) r += cov[i][j] * d[j];
    s += d[i] * r;
  }
  return s;
}

export function prior(): Posterior {
  return {
    mean: new Array(D).fill(0),
    cov: Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => (i === j ? PRIOR_VAR : 0))),
  };
}

export function fit(x: number[][], choices: Choice[], start?: number[]): Posterior {
  if (choices.length === 0) return prior();
  const diffs = choices.map((c) => sub(x[c.winner], x[c.loser]));
  let w = start ? [...start] : new Array(D).fill(0);
  let negH: number[][] = [];
  for (let iter = 0; iter < 25; iter++) {
    const g = w.map((v) => -v / PRIOR_VAR);
    negH = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => (i === j ? 1 / PRIOR_VAR : 0)));
    for (const d of diffs) {
      const p = sigmoid(dot(w, d));
      const r = 1 - p;
      const s = p * (1 - p);
      for (let i = 0; i < D; i++) {
        g[i] += r * d[i];
        for (let j = 0; j < D; j++) negH[i][j] += s * d[i] * d[j];
      }
    }
    const step = invert(negH).map((row) => dot(row, g));
    w = w.map((v, k) => v + step[k]);
    if (Math.hypot(...step) < 1e-6) break;
  }
  return { mean: w, cov: invert(negH) };
}

// Predicted P(a beats b), integrating over posterior uncertainty (probit approximation).
export function predict(post: Posterior, x: number[][], a: number, b: number) {
  const d = sub(x[a], x[b]);
  const s2 = quad(post.cov, d);
  return sigmoid(dot(post.mean, d) / Math.sqrt(1 + (Math.PI * s2) / 8));
}

function entropy(p: number) {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  return -(q * Math.log2(q) + (1 - q) * Math.log2(1 - q));
}

// Expected information gain about w from asking pair (a, b) (BALD, probit form,
// Houlsby et al. 2011): H[mean prediction] - E_w[H[prediction | w]].
export function infoGain(post: Posterior, x: number[][], a: number, b: number) {
  const d = sub(x[a], x[b]);
  const mu = dot(post.mean, d);
  const s2 = quad(post.cov, d);
  const C = Math.sqrt((Math.PI * Math.LN2) / 2);
  const expected = (C / Math.sqrt(s2 + C * C)) * Math.exp(-(mu * mu) / (2 * (s2 + C * C)));
  return entropy(sigmoid(mu / Math.sqrt(1 + (Math.PI * s2) / 8))) - expected;
}

export function pairKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// The unasked pair with the highest expected information gain.
export function nextPair(post: Posterior, x: number[][], asked: Set<string>): [number, number] {
  let best: [number, number] = [0, 1];
  let bestScore = -Infinity;
  for (let a = 0; a < x.length; a++) {
    for (let b = a + 1; b < x.length; b++) {
      if (asked.has(pairKey(a, b))) continue;
      const s = infoGain(post, x, a, b);
      if (s > bestScore) {
        bestScore = s;
        best = [a, b];
      }
    }
  }
  return best;
}

export function randomPair(n: number, asked: Set<string>, rand: () => number): [number, number] {
  for (let tries = 0; tries < 10000; tries++) {
    const a = Math.floor(rand() * n);
    const b = Math.floor(rand() * n);
    if (a !== b && !asked.has(pairKey(a, b))) return [a, b];
  }
  return [0, 1];
}

export function scores(w: number[], x: number[][]) {
  return x.map((xi) => dot(w, xi));
}

// Kendall rank correlation between two score vectors (ties count as neither).
export function kendallTau(s: number[], t: number[]) {
  let conc = 0;
  let disc = 0;
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const v = Math.sign(s[i] - s[j]) * Math.sign(t[i] - t[j]);
      if (v > 0) conc++;
      else if (v < 0) disc++;
    }
  }
  const total = conc + disc;
  return total === 0 ? 0 : (conc - disc) / total;
}

// ─── Simulated tasters ───────────────────────────────────────────────────────
// A hidden taste vector answers pairs with logistic noise. Compares how fast
// active and random pair selection recover the hidden ranking.

export const SIM_NOISE = 1.5; // hidden taste scale; higher = more decisive taster

export interface SimCurve {
  active: number[]; // mean Kendall tau to the hidden ranking after t answers
  random: number[];
}

export function simulate(x: number[][], rounds: number, tasters: number, seed: number): SimCurve {
  const rand = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const active = new Array(rounds + 1).fill(0);
  const random = new Array(rounds + 1).fill(0);

  for (let t = 0; t < tasters; t++) {
    const hidden = Array.from({ length: D }, () => gauss() * SIM_NOISE);
    const truth = scores(hidden, x);
    for (const mode of ["active", "random"] as const) {
      const out = mode === "active" ? active : random;
      const choices: Choice[] = [];
      const asked = new Set<string>();
      let post = prior();
      out[0] += 0;
      for (let r = 1; r <= rounds; r++) {
        const [a, b] = mode === "active" ? nextPair(post, x, asked) : randomPair(x.length, asked, rand);
        asked.add(pairKey(a, b));
        const aWins = rand() < sigmoid(truth[a] - truth[b]);
        choices.push(aWins ? { winner: a, loser: b } : { winner: b, loser: a });
        post = fit(x, choices, post.mean);
        out[r] += kendallTau(scores(post.mean, x), truth) / tasters;
      }
    }
  }
  return { active, random };
}

// First round at which a curve reaches the target, or null.
export function roundsTo(curve: number[], target: number) {
  const i = curve.findIndex((v, r) => r > 0 && v >= target);
  return i === -1 ? null : i;
}
