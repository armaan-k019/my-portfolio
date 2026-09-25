// The shared vocabulary of the hero compositions: ground drawn as contours,
// primary structure as boxes that carry the cut, and a lighter secondary
// system (mullions, joists, balustrades, treads) drawn against it.
import { rng, seg, type Model, type Pose, type Prism, type Vec3 } from "./geometry";

export interface Box { x0: number; x1: number; z0: number; z1: number }

export const inside = (b: Box, x: number, z: number) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
export const smooth = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

// Seeded value noise, three octaves, for irregular ground. The seed is fixed
// per composition: the same ground every time.
export function noise(seed: number) {
  const r = rng(seed), N = 256, perm = Array.from({ length: N }, (_, i) => i), val = Array.from({ length: N }, () => r() * 2 - 1);
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const at = (i: number, j: number) => val[perm[(perm[i & 255] + j) & 255]];
  const v = (x: number, y: number) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - w) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * w;
  };
  return (x: number, y: number) => v(x, y) * 0.6 + v(x * 2.1, y * 2.1) * 0.28 + v(x * 4.3, y * 4.3) * 0.12;
}

export class Drawing {
  lines: number[] = [];
  detail: number[] = [];
  solids: Prism[] = [];
  site: number[] = [];
  walkers: ((t: number) => Pose)[] = [];
  standing: Pose[] = [];

  // A solid box: cut as poché, drawn as its twelve edges.
  block(b: Box, y0: number, y1: number) {
    this.solids.push({ poly: [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]], y0, y1 });
    const c: Vec3[] = [[b.x0, y0, b.z0], [b.x1, y0, b.z0], [b.x1, y0, b.z1], [b.x0, y0, b.z1], [b.x0, y1, b.z0], [b.x1, y1, b.z0], [b.x1, y1, b.z1], [b.x0, y1, b.z1]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(this.lines, c[i], c[j]);
  }

  // A slab over a box with rectangular openings, split into strips so the
  // cut opens exactly where the openings are.
  slab(b: Box, y: number, t: number, holes: Box[] = []) {
    const xs = [...new Set([b.x0, b.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((v) => v >= b.x0 && v <= b.x1).sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1], mid = (xa + xb) / 2;
      const gaps = holes.filter((h) => mid > h.x0 && mid < h.x1).map((h) => [h.z0, h.z1]).sort((p, q) => p[0] - q[0]);
      let z = b.z0;
      for (const [g0, g1] of gaps) { if (g0 > z) this.solids.push({ poly: [[xa, z], [xb, z], [xb, g0], [xa, g0]], y0: y - t, y1: y }); z = Math.max(z, g1); }
      if (z < b.z1) this.solids.push({ poly: [[xa, z], [xb, z], [xb, b.z1], [xa, b.z1]], y0: y - t, y1: y });
    }
    const outline = (x0: number, z0: number, x1: number, z1: number, yy: number) => {
      seg(this.lines, [x0, yy, z0], [x1, yy, z0]); seg(this.lines, [x1, yy, z0], [x1, yy, z1]);
      seg(this.lines, [x1, yy, z1], [x0, yy, z1]); seg(this.lines, [x0, yy, z1], [x0, yy, z0]);
    };
    outline(b.x0, b.z0, b.x1, b.z1, y); outline(b.x0, b.z0, b.x1, b.z1, y - t);
    for (const h of holes) outline(h.x0, h.z0, h.x1, h.z1, y);
  }

  // Vertical mullions along a straight run, with head and sill lines.
  mullions(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, every = 1.5) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / every));
    for (let k = 0; k <= n; k++) { const f = k / n; seg(this.detail, [x0 + f * (x1 - x0), y0, z0 + f * (z1 - z0)], [x0 + f * (x1 - x0), y1, z0 + f * (z1 - z0)]); }
    seg(this.detail, [x0, y1, z0], [x1, y1, z1]);
  }

  // A balustrade: posts and a top rail, 1.1 m high.
  balustrade(x0: number, z0: number, x1: number, z1: number, y: number, every = 1.2) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / every));
    for (let k = 0; k <= n; k++) { const f = k / n; seg(this.detail, [x0 + f * (x1 - x0), y, z0 + f * (z1 - z0)], [x0 + f * (x1 - x0), y + 1.1, z0 + f * (z1 - z0)]); }
    seg(this.detail, [x0, y + 1.1, z0], [x1, y + 1.1, z1]);
  }

  // Joists under a slab, running along Z at a spacing along X.
  joists(b: Box, y: number, every = 1.2, depth = 0.5) {
    for (let x = b.x0 + every / 2; x < b.x1; x += every) seg(this.detail, [x, y - depth, b.z0], [x, y - depth, b.z1]);
  }

  // A straight flight along X from (x0, y0) to (x1, y1): each tread a thin
  // solid so the cut steps, treads and nosings drawn as detail.
  stair(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, riser = 0.18) {
    const n = Math.max(2, Math.round(Math.abs(y1 - y0) / riser));
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n, y = y0 + ((y1 - y0) * (i + 1)) / n;
      this.solids.push({ poly: [[Math.min(xa, xb), z0], [Math.max(xa, xb), z0], [Math.max(xa, xb), z1], [Math.min(xa, xb), z1]], y0: y - 0.2, y1: y });
      seg(this.detail, [xa, y, z0], [xa, y, z1]);
    }
    for (const z of [z0, z1]) seg(this.lines, [x0, y0, z], [x1, y1, z]);
  }

  // A ramp along X, as short level strips so the cut shows its rise.
  ramp(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, t = 0.3) {
    const n = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 0.5));
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n, y = y0 + ((y1 - y0) * (i + 0.5)) / n;
      this.solids.push({ poly: [[Math.min(xa, xb), z0], [Math.max(xa, xb), z0], [Math.max(xa, xb), z1], [Math.min(xa, xb), z1]], y0: y - t, y1: y });
    }
    for (const z of [z0, z1]) { seg(this.lines, [x0, y0, z], [x1, y1, z]); seg(this.lines, [x0, y0 - t, z], [x1, y1 - t, z]); }
  }

  // Contours of the ground by marching squares, every `interval` metres.
  contours(ground: (x: number, z: number) => number, X: number, Z: number, interval: number, cell = 1.2) {
    const nx = Math.round(X / cell), nz = Math.round(Z / cell);
    const H: number[][] = [];
    for (let i = 0; i <= nx; i++) { H.push([]); for (let j = 0; j <= nz; j++) H[i].push(ground(i * cell, j * cell)); }
    let lo = Infinity, hi = -Infinity;
    for (const row of H) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let lev = Math.ceil(lo / interval) * interval; lev <= hi; lev += interval) {
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const c = [H[i][j], H[i + 1][j], H[i + 1][j + 1], H[i][j + 1]], p = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const hits: Vec3[] = [];
        for (let k = 0; k < 4; k++) {
          const a = c[k], b = c[(k + 1) % 4];
          if ((a < lev) !== (b < lev)) { const f = (lev - a) / (b - a), [ia, ja] = p[k], [ib, jb] = p[(k + 1) % 4]; hits.push([(ia + f * (ib - ia)) * cell, lev, (ja + f * (jb - ja)) * cell]); }
        }
        if (hits.length >= 2) seg(this.site, hits[0], hits[1]);
        if (hits.length === 4) seg(this.site, hits[2], hits[3]);
      }
    }
    return lo;
  }

  // People: back and forth along a straight path, or standing.
  walk(x0: number, z0: number, x1: number, z1: number, y: (x: number, z: number) => number, seed: number) {
    const r = rng(seed), ph = r() * Math.PI * 2, len = Math.hypot(x1 - x0, z1 - z0), w = 1.1 / Math.max(1, len / 2), dir = Math.atan2(z1 - z0, x1 - x0);
    this.walkers.push((t) => {
      const u = 0.5 + 0.5 * Math.sin(w * t + ph), x = x0 + u * (x1 - x0), z = z0 + u * (z1 - z0);
      return { p: [x, y(x, z), z], dir: dir + (Math.cos(w * t + ph) >= 0 ? 0 : Math.PI), phase: t * 5.5 + ph };
    });
  }
  stand(x: number, y: number, z: number, dir: number) { this.standing.push({ p: [x, y, z], dir }); }

  model(ground: (x: number, z: number) => number, X: number, Z: number, contour: number, base: number, featured: number): Model {
    let mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const arr of [this.lines, this.site]) for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], arr[i + k]); mx[k] = Math.max(mx[k], arr[i + k]); }
    mn = [mn[0], mn[1], mn[2]]; mx = [mx[0], mx[1], mx[2]];
    return {
      lines: this.lines, detail: this.detail, solids: this.solids, site: this.site,
      bounds: { min: mn, max: mx }, featured, contour,
      ground: { h: ground, z0: 0, z1: Z, base },
      people: { walkers: this.walkers, standing: this.standing },
    };
  }
}
