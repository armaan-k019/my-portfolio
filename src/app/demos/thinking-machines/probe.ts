// A toy model of the last matmul of one decoding step: two vocabulary rows
// dotted with one hidden state, accumulated in float32 the way a split-K
// matmul kernel does it. Everything here runs in the browser and on the server
// with the same inputs, so both sides compute identical numbers.

export const DIM = 4096;
export const MAX_BATCH = 512;
export const REQUESTS = 1000;
// One fixed split count for the batch-invariant kernel, whatever the batch.
export const INVARIANT_SPLITS = 1;

export interface Sample {
  id: string;
  label: string;
  tokens: [string, string];
  seed: number;
  // Target float64 lead of token 0 over token 1. Rounding the nudged weight
  // to float32 means the real gap lands near it, not on it; Sweep.exact has it.
  gap: number;
}

// Made-up weights. The token pair borrows the divergence point from the
// Thinking Machines post ("Feynman was born ... in" Queens vs New York City).
export const SAMPLES: Sample[] = [
  { id: "tie", label: "near tie", tokens: [" Queens", " New"], seed: 8, gap: 0 },
  { id: "lead", label: "clear lead", tokens: [" Queens", " New"], seed: 8, gap: 0.05 },
];

export interface SplitResult {
  splits: number;
  logits: [number, number];
  winner: 0 | 1;
}

export interface Sweep {
  sample: Sample;
  exact: [number, number];
  ulp: number;
  configs: SplitResult[];
  invariant: SplitResult;
  // Batch-size ranges and the split count the default kernel picks for each.
  ranges: { from: number; to: number; splits: number }[];
  tally: [number, number];
  invariantTally: [number, number];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// float32 vectors. Products of two float32 values are exact in float64, so
// fround(acc + h * w) rounds once, like a fused multiply-add.
function buildVectors(sample: Sample) {
  const rand = mulberry32(0x9e3779b9 ^ sample.seed);
  const h = new Float32Array(DIM);
  const w0 = new Float32Array(DIM);
  const w1 = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) {
    h[i] = gaussian(rand);
    w0[i] = gaussian(rand) * 0.02;
    w1[i] = gaussian(rand) * 0.02;
  }
  // Nudge one weight of row 1 so the exact logit gap equals sample.gap.
  const k = DIM - 1;
  for (let pass = 0; pass < 3; pass++) {
    const diff = exactDot(h, w0) - exactDot(h, w1) - sample.gap;
    w1[k] = Math.fround(w1[k] + diff / h[k]);
  }
  return { h, w0, w1 };
}

function exactDot(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Split-K: cut the reduction into `splits` contiguous chunks, accumulate each
// in float32, then add the partial sums in order, also in float32.
export function splitKDot(a: Float32Array, b: Float32Array, splits: number) {
  const chunk = Math.ceil(a.length / splits);
  let total = 0;
  for (let s = 0; s < splits; s++) {
    let acc = 0;
    const end = Math.min(a.length, (s + 1) * chunk);
    for (let i = s * chunk; i < end; i++) acc = Math.fround(acc + a[i] * b[i]);
    total = Math.fround(total + acc);
  }
  return total;
}

// The default kernel's heuristic: with few rows there are few output tiles,
// so it splits the reduction to keep 132 cores busy. More rows, fewer splits.
export function splitsForBatch(batch: number) {
  const tiles = Math.ceil(batch / 16);
  const fill = Math.floor(132 / tiles);
  let p = 1;
  while (p * 2 <= Math.min(fill, 32)) p *= 2;
  return p;
}

function ulpOf(x: number) {
  const f = new Float32Array([Math.abs(x)]);
  const u = new Uint32Array(f.buffer);
  const next = new Float32Array(new Uint32Array([u[0] + 1]).buffer)[0];
  return next - f[0];
}

function run(v: ReturnType<typeof buildVectors>, splits: number): SplitResult {
  const l0 = splitKDot(v.h, v.w0, splits);
  const l1 = splitKDot(v.h, v.w1, splits);
  // Ties go to the lower token id, as argmax does.
  return { splits, logits: [l0, l1], winner: l1 > l0 ? 1 : 0 };
}

// Server load: batch size for each of REQUESTS requests, fixed seed.
export function loadTrace() {
  const rand = mulberry32(2025);
  return Array.from({ length: REQUESTS }, () => 1 + Math.floor(rand() * MAX_BATCH));
}

export function sweep(sample: Sample): Sweep {
  const v = buildVectors(sample);
  const ranges: Sweep["ranges"] = [];
  for (let b = 1; b <= MAX_BATCH; b++) {
    const s = splitsForBatch(b);
    const last = ranges[ranges.length - 1];
    if (last && last.splits === s) last.to = b;
    else ranges.push({ from: b, to: b, splits: s });
  }
  const configs = ranges.map((r) => run(v, r.splits));
  const invariant = run(v, INVARIANT_SPLITS);
  const winnerAt = (b: number) => configs.find((c) => c.splits === splitsForBatch(b))!.winner;
  const tally: [number, number] = [0, 0];
  for (const b of loadTrace()) tally[winnerAt(b)]++;
  const invariantTally: [number, number] = [0, 0];
  invariantTally[invariant.winner] = REQUESTS;
  const exact: [number, number] = [exactDot(v.h, v.w0), exactDot(v.h, v.w1)];
  return { sample, exact, ulp: ulpOf(exact[0]), configs, invariant, ranges, tally, invariantTally };
}

export interface Explanation {
  summary: string;
  why: string;
  fix: string;
}
