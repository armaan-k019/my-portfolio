// A small sparse autoencoder, trained full batch with Adam in plain
// TypeScript. Float64 math and a seeded generator, with no exp or log,
// so a given seed gives the same features in every browser. Kept free of
// imports so scripts/goodfire-cache.mjs can load it under Node too.

export interface SaeConfig {
  features: number;
  l1: number;
  steps: number;
  seed: number;
  lr: number;
}

export interface SaeStats {
  step: number;
  mse: number;
  explained: number; // fraction of variance the reconstruction keeps
  l0: number; // mean active features per sentence
}

export interface Sae {
  k: number;
  d: number;
  mean: Float64Array; // d, subtracted before encoding
  We: Float64Array; // k by d
  be: Float64Array; // k
  Wd: Float64Array; // d by k, columns kept at unit norm
  bd: Float64Array; // d
}

export const DEFAULT_CONFIG: SaeConfig = { features: 32, l1: 0.1, steps: 300, seed: 1, lr: 0.01 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeColumns(Wd: Float64Array, d: number, k: number) {
  for (let j = 0; j < k; j++) {
    let s = 0;
    for (let i = 0; i < d; i++) s += Wd[i * k + j] * Wd[i * k + j];
    const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
    for (let i = 0; i < d; i++) Wd[i * k + j] *= inv;
  }
}

class Adam {
  private m: Float64Array;
  private v: Float64Array;
  private b1t = 1;
  private b2t = 1;
  private lr: number;
  constructor(size: number, lr: number) {
    this.lr = lr;
    this.m = new Float64Array(size);
    this.v = new Float64Array(size);
  }
  tick() {
    this.b1t *= 0.9;
    this.b2t *= 0.999;
  }
  apply(p: Float64Array, g: Float64Array) {
    const c1 = 1 / (1 - this.b1t);
    const c2 = 1 / (1 - this.b2t);
    for (let i = 0; i < p.length; i++) {
      this.m[i] = 0.9 * this.m[i] + 0.1 * g[i];
      this.v[i] = 0.999 * this.v[i] + 0.001 * g[i] * g[i];
      p[i] -= (this.lr * this.m[i] * c1) / (Math.sqrt(this.v[i] * c2) + 1e-8);
    }
  }
}

// Steps the model in chunks so the page can draw progress between them.
export class SaeTrainer {
  readonly sae: Sae;
  step = 0;
  private X: Float64Array; // centered training rows, n by d
  private n: number;
  private opt: { We: Adam; be: Adam; Wd: Adam; bd: Adam };
  private totalVar: number;
  private cfg: SaeConfig;

  constructor(data: Float64Array, n: number, d: number, cfg: SaeConfig) {
    this.cfg = cfg;
    const k = cfg.features;
    const rand = mulberry32(cfg.seed);
    const mean = new Float64Array(d);
    for (let r = 0; r < n; r++) for (let i = 0; i < d; i++) mean[i] += data[r * d + i] / n;
    this.X = new Float64Array(n * d);
    let total = 0;
    for (let r = 0; r < n; r++)
      for (let i = 0; i < d; i++) {
        const x = data[r * d + i] - mean[i];
        this.X[r * d + i] = x;
        total += x * x;
      }
    this.totalVar = total / n;
    this.n = n;

    const Wd = new Float64Array(d * k);
    for (let i = 0; i < Wd.length; i++) Wd[i] = rand() * 2 - 1;
    normalizeColumns(Wd, d, k);
    const We = new Float64Array(k * d);
    for (let j = 0; j < k; j++) for (let i = 0; i < d; i++) We[j * d + i] = Wd[i * k + j];
    this.sae = { k, d, mean, We, be: new Float64Array(k), Wd, bd: new Float64Array(d) };
    this.opt = {
      We: new Adam(k * d, cfg.lr),
      be: new Adam(k, cfg.lr),
      Wd: new Adam(d * k, cfg.lr),
      bd: new Adam(d, cfg.lr),
    };
  }

  get done() {
    return this.step >= this.cfg.steps;
  }

  run(count: number): SaeStats {
    let stats: SaeStats = { step: this.step, mse: 0, explained: 0, l0: 0 };
    for (let s = 0; s < count && !this.done; s++) stats = this.once();
    return stats;
  }

  private once(): SaeStats {
    const { k, d, We, be, Wd, bd } = this.sae;
    const { X, n } = this;
    const lam = this.cfg.l1;
    const gWe = new Float64Array(k * d);
    const gbe = new Float64Array(k);
    const gWd = new Float64Array(d * k);
    const gbd = new Float64Array(d);
    const f = new Float64Array(k);
    const r = new Float64Array(d);
    const active: number[] = [];
    let mse = 0;
    let l0 = 0;
    const scale = 2 / n;

    for (let row = 0; row < n; row++) {
      const off = row * d;
      active.length = 0;
      for (let j = 0; j < k; j++) {
        let pre = be[j];
        const w = j * d;
        for (let i = 0; i < d; i++) pre += We[w + i] * X[off + i];
        f[j] = pre > 0 ? pre : 0;
        if (pre > 0) active.push(j);
      }
      l0 += active.length;
      for (let i = 0; i < d; i++) {
        let y = bd[i];
        for (const j of active) y += Wd[i * k + j] * f[j];
        r[i] = y - X[off + i];
        mse += r[i] * r[i];
        gbd[i] += scale * r[i];
      }
      for (const j of active) {
        let df = lam / n;
        for (let i = 0; i < d; i++) {
          gWd[i * k + j] += scale * r[i] * f[j];
          df += scale * r[i] * Wd[i * k + j];
        }
        gbe[j] += df;
        const w = j * d;
        for (let i = 0; i < d; i++) gWe[w + i] += df * X[off + i];
      }
    }

    for (const o of Object.values(this.opt)) o.tick();
    this.opt.We.apply(We, gWe);
    this.opt.be.apply(be, gbe);
    this.opt.Wd.apply(Wd, gWd);
    this.opt.bd.apply(bd, gbd);
    normalizeColumns(Wd, d, k);
    this.step++;
    mse /= n;
    return { step: this.step, mse, explained: 1 - mse / this.totalVar, l0: l0 / n };
  }
}

// Feature activations for one uncentered embedding.
export function encode(sae: Sae, x: Float64Array, offset = 0): Float64Array {
  const { k, d, mean, We, be } = sae;
  const out = new Float64Array(k);
  for (let j = 0; j < k; j++) {
    let pre = be[j];
    for (let i = 0; i < d; i++) pre += We[j * d + i] * (x[offset + i] - mean[i]);
    out[j] = pre > 0 ? pre : 0;
  }
  return out;
}

// Dequantize the int8 vectors written by scripts/goodfire-embed.py.
export function decodeVectors(b64: string, scale: number, decode: (s: string) => Uint8Array): Float64Array {
  const bytes = decode(b64);
  const out = new Float64Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i] > 127 ? bytes[i] - 256 : bytes[i];
    out[i] = v * scale;
  }
  return out;
}
