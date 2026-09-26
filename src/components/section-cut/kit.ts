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
  birds: ((t: number) => Pose)[] = [];

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
  stand(x: number, y: number, z: number, dir: number, kind?: Pose["kind"], scale?: number) { this.standing.push({ p: [x, y, z], dir, kind, scale }); }

  // A bird on a slow elliptical circuit round (cx, cz) at height y, rising
  // and falling a little; one circuit takes `period` seconds.
  bird(cx: number, y: number, cz: number, rx: number, rz: number, period: number, seed: number) {
    const r = rng(seed), ph = r() * Math.PI * 2, sense = r() < 0.5 ? 1 : -1, bob = 0.8 + r() * 1.6, beat = 1.6 + r();
    this.birds.push((t) => {
      const a = ph + (sense * Math.PI * 2 * t) / period;
      const dx = -rx * Math.sin(a) * sense, dz = rz * Math.cos(a) * sense;
      return { p: [cx + rx * Math.cos(a), y + bob * Math.sin(2 * a), cz + rz * Math.sin(a)], dir: Math.atan2(dz, dx), phase: t * beat + ph };
    });
  }

  // A tree in twelve segments: a trunk of two, three branches, and a loose
  // crown outline of seven points. The crown's plane turns to face the
  // axonometric, near enough to read in elevation too, and wanders a little
  // out of it for body. Height, spread and lean vary, and the crown sits off
  // the trunk's axis.
  tree(x: number, y: number, z: number, seed: number) {
    const r = rng(seed), H = 5 + r() * 6, spread = H * (0.3 + r() * 0.25), th = Math.PI / 4 + (r() - 0.5) * 0.7, la = r() * Math.PI * 2;
    const lean = (r() - 0.5) * 0.14 * H, lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
    const u = [Math.cos(th), Math.sin(th)], w = [-Math.sin(th), Math.cos(th)], phi = r() * Math.PI * 2;
    const fork: Vec3 = [x + lx * 0.5, y + H * 0.5, z + lz * 0.5], top: Vec3 = [x + lx, y + H * 0.72, z + lz];
    const cx = x + lx * 1.2, cy = y + H * 0.68, cz = z + lz * 1.2, ry = H * 0.3;
    const crown: Vec3[] = Array.from({ length: 7 }, (_, k) => {
      const a = (k / 7) * Math.PI * 2 + (r() - 0.5) * 0.5, rad = 0.75 + r() * 0.4, out = spread * 0.12 * Math.sin(2 * a + phi);
      const h = (spread / 2) * rad * Math.cos(a);
      return [cx + u[0] * h + w[0] * out, cy + ry * rad * Math.sin(a), cz + u[1] * h + w[1] * out];
    });
    const toward = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    seg(this.detail, [x, y, z], fork); seg(this.detail, fork, top);
    seg(this.detail, fork, toward(fork, crown[4], 0.8));
    seg(this.detail, top, toward(top, crown[1], 0.75));
    seg(this.detail, top, toward(top, crown[3], 0.7));
    for (let k = 0; k < 7; k++) seg(this.detail, crown[k], crown[(k + 1) % 7]);
  }

  // Trees scattered over a plan area where `ok` allows, at least `gap`
  // metres apart, standing on the ground. Placement is fixed by the seed.
  grove(ground: (x: number, z: number) => number, n: number, area: Box, ok: (x: number, z: number) => boolean, seed: number, gap = 3.5) {
    const r = rng(seed), at: [number, number][] = [];
    for (let tries = 0; at.length < n && tries < n * 60; tries++) {
      const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0);
      if (!ok(x, z) || at.some(([a, b]) => Math.hypot(a - x, b - z) < gap)) continue;
      at.push([x, z]);
      this.tree(x, ground(x, z), z, seed * 97 + at.length);
    }
  }

  // A parked car as a profile mass in fourteen segments: the near side's
  // outline, the far side's glasshouse, and four cross edges. (x, z) is its
  // centre on the ground at y; it points along `dir`.
  car(x: number, y: number, z: number, dir: number) {
    const f = [Math.cos(dir), Math.sin(dir)], s = [-f[1], f[0]];
    const P = (u: number, v: number, side: number): Vec3 => [x + f[0] * u + s[0] * side, y + v, z + f[1] * u + s[1] * side];
    const prof: [number, number][] = [[-2.2, 0.35], [-2.15, 0.85], [-0.7, 0.95], [-0.2, 1.45], [1.4, 1.45], [2.2, 0.9], [2.2, 0.35]];
    for (let k = 0; k < 7; k++) seg(this.detail, P(...prof[k], -0.9), P(...prof[(k + 1) % 7], -0.9));
    for (const k of [2, 3, 4, 5]) seg(this.detail, P(...prof[k], -0.9), P(...prof[k], 0.9));
    for (const k of [2, 3, 4]) seg(this.detail, P(...prof[k], 0.9), P(...prof[k + 1], 0.9));
  }

  model(ground: (x: number, z: number) => number, X: number, Z: number, contour: number, base: number, featured: number, water?: (x: number, z: number) => number): Model {
    let mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const arr of [this.lines, this.site]) for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], arr[i + k]); mx[k] = Math.max(mx[k], arr[i + k]); }
    mn = [mn[0], mn[1], mn[2]]; mx = [mx[0], mx[1], mx[2]];
    return {
      lines: this.lines, detail: this.detail, solids: this.solids, site: this.site,
      bounds: { min: mn, max: mx }, featured, contour,
      ground: { h: ground, z0: 0, z1: Z, base, water },
      people: { walkers: this.walkers, standing: this.standing }, birds: this.birds,
    };
  }
}
