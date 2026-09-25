// A generated work, not a real place: a landscape and an orthogonal
// structure surveyed into it. The seed is the day, so the form changes daily
// while the language holds.
//
// The landscape is a height field with a valley along X, a ridge across from
// it and a scarp (the steep face) on the slope between them, plus seeded
// noise. It is drawn only as contours at a fixed interval.
//
// The structure is strictly orthogonal and snapped to a 1.5 m survey grid:
// terraces cut into the slope at contour levels, retaining walls where the
// ground stands above a terrace, ramps along X between terraces, a platform
// cantilevered over the valley and one shaft rising from inside the hill
// into open air. Where the structure cuts in, the ground is excavated, so the
// contours and the section show the cut.
import { rng, seg, bounds, type Model, type Pose, type Prism, type Vec3 } from "./geometry";

export const CONTOUR = 1;          // contour interval, metres
const L = 84, D = 60;              // site extent along X and Z
const G = 1.5;                     // survey grid
const SLAB = 0.4, WALL = 0.4, RAMP = 0.3;
const CELL = 1.2;                  // contour sampling grid

const snap = (v: number) => Math.round(v / G) * G;
const smooth = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

// Seeded value noise, three octaves.
function noise(seed: number) {
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

interface Box { x0: number; x1: number; z0: number; z1: number }
interface Terrace extends Box { e: number }

export function build(seed: number): Model {
  const r = rng(seed * 7919 + 13);
  const between = (a: number, b: number) => a + r() * (b - a);
  const nz = noise(seed);

  // The landscape's parameters, all drawn from the seed.
  const flip = r() < 0.5;                               // which side the ridge is on
  const zv0 = between(14, 22), mv = between(3, 8), lv = between(40, 90), pv = r() * 6.28;
  const zr0 = between(46, 54), mr = between(2, 6), lr = between(30, 70), pr = r() * 6.28;
  const R0 = between(13, 20), Rv = between(2, 5);
  const ts = between(0.25, 0.5), sh = between(0.3, 0.55); // scarp position and its share of the rise
  const tilt = between(-0.06, 0.06);
  const zv = (x: number) => zv0 + mv * Math.sin((x / lv) * 6.28 + pv);
  const zr = (x: number) => zr0 + mr * Math.sin((x / lr) * 6.28 + pr);

  function natural(x: number, zIn: number) {
    const z = flip ? D - zIn : zIn;
    const v = tilt * x, a = zv(x), b = zr(x), R = R0 + Rv * Math.sin(x / 17 + pr);
    let h: number;
    if (z <= a) h = v + 4 * smooth(0, 1, (a - z) / Math.max(1, a));
    else if (z >= b) h = v + R - (z - b) * 0.5;
    else {
      const t = (z - a) / (b - a);
      h = v + R * (sh * smooth(ts - 0.04, ts + 0.04, t) + (1 - sh) * smooth(ts + 0.04, 1, t) + 0.08 * smooth(0, ts - 0.04, t));
    }
    h -= 1.6 * Math.exp(-(((z - a) / 3) ** 2));        // the valley's trough
    return h + 1.3 * nz(x / 14, z / 14);
  }
  // Z of the slope at fraction t from valley to ridge, in model coordinates.
  const zAt = (x: number, t: number) => { const z = zv(x) + (zr(x) - zv(x)) * t; return flip ? D - z : z; };

  // Terraces in bays along X. Each bay stacks one to three terraces up the
  // slope, each at its own contour level; the lowest of each bay forms the
  // chain the ramps join.
  const terraces: Terrace[] = [];
  const chain: Terrace[] = [];
  let x = snap(between(2, 5)), t = between(0.12, 0.25);
  while (x < L - 8) {
    const w = snap(between(9, 16)), x1 = Math.min(L - 2, x + w);
    t = Math.min(0.5, Math.max(0.08, t + between(-0.1, 0.12)));
    const tiers = 1 + Math.floor(r() * 3);
    // Uphill is towards the ridge: stack each tier past the one below it.
    const up = zAt(x + w / 2, 1) > zAt(x + w / 2, 0) ? 1 : -1;
    let edge = zAt(x + w / 2, t);
    for (let k = 0; k < tiers; k++) {
      const d = snap(between(6, 10));
      const z0 = up > 0 ? snap(edge) : snap(edge) - d, z1 = z0 + d;
      if (z0 < 1 || z1 > D - 1) break;
      const e = Math.round(natural(x + w / 2, (z0 + z1) / 2) / CONTOUR) * CONTOUR;
      const tr = { x0: x, x1, z0, z1, e };
      terraces.push(tr);
      if (k === 0) chain.push(tr);
      edge = (up > 0 ? z1 : z0) + up * snap(between(1.5, 4.5));
    }
    x = x1 + snap(between(3, 7));
  }

  // Ramps between neighbouring bays whose lowest terraces overlap in Z, at
  // 1:6 across the gap.
  const ramps: (Box & { e0: number; e1: number })[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i], b = chain[i + 1];
    const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
    if (z1 - z0 < 3) continue;
    const zm = snap((z0 + z1) / 2);
    ramps.push({ x0: a.x1, x1: b.x0, z0: zm - 1.2, z1: zm + 1.2, e0: a.e, e1: b.e });
  }

  // The cantilever: the terrace nearest the valley reaches out over it.
  const low = chain.reduce((p, q) => (Math.abs(zAt((q.x0 + q.x1) / 2, 0) - (q.z0 + q.z1) / 2) < Math.abs(zAt((p.x0 + p.x1) / 2, 0) - (p.z0 + p.z1) / 2) ? q : p));
  const toValley = zAt((low.x0 + low.x1) / 2, 0) < (low.z0 + low.z1) / 2 ? -1 : 1;
  const reach = snap(between(6, 10));
  const cant: Box = toValley < 0
    ? { x0: low.x0 + G, x1: low.x1 - G, z0: low.z0 - reach, z1: low.z0 }
    : { x0: low.x0 + G, x1: low.x1 - G, z0: low.z1, z1: low.z1 + reach };

  // The shaft: in a middle terrace's uphill edge, rising from inside the hill.
  const mid = chain[Math.floor(chain.length / 2)];
  const uphill = toValley < 0 ? 1 : -1;
  const S = 4.5, sx0 = snap(between(mid.x0 + 1, mid.x1 - S - 1));
  const sz0 = uphill > 0 ? mid.z1 - G : mid.z0 + G - S;
  const shaft: Box = { x0: sx0, x1: sx0 + S, z0: sz0, z1: sz0 + S };
  const shaftBase = mid.e - 7;
  let hillTop = -Infinity;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) hillTop = Math.max(hillTop, natural(shaft.x0 + (S * i) / 4, shaft.z0 + (S * j) / 4));
  const shaftTop = Math.max(hillTop, mid.e) + 9;

  const inside = (b: Box, x: number, z: number) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  const rampY = (rp: (typeof ramps)[number], x: number) => rp.e0 + ((x - rp.x0) / (rp.x1 - rp.x0)) * (rp.e1 - rp.e0);
  // The ground after the structure is surveyed into it.
  function ground(x: number, z: number) {
    let h = natural(x, z);
    if (inside(shaft, x, z)) return shaftBase;
    for (const tr of terraces) if (inside(tr, x, z)) h = Math.min(h, tr.e - SLAB);
    for (const rp of ramps) if (inside(rp, x, z)) h = Math.min(h, rampY(rp, x) - RAMP);
    return h;
  }

  const lines: number[] = [];
  const solids: Prism[] = [];
  const rect = (b: Box) => [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]] as [number, number][];
  function block(b: Box, y0: number, y1: number) {
    solids.push({ poly: rect(b), y0, y1 });
    const c: Vec3[] = [[b.x0, y0, b.z0], [b.x1, y0, b.z0], [b.x1, y0, b.z1], [b.x0, y0, b.z1], [b.x0, y1, b.z0], [b.x1, y1, b.z0], [b.x1, y1, b.z1], [b.x0, y1, b.z1]];
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(lines, c[i], c[j]);
  }

  // Terraces and their retaining walls, on each edge where the ground
  // outside stands above the platform.
  for (const tr of terraces) {
    block(tr, tr.e - SLAB, tr.e);
    const edges: [Box, (s: number) => [number, number]][] = [
      [{ x0: tr.x0, x1: tr.x1, z0: tr.z0, z1: tr.z0 + WALL }, (s) => [tr.x0 + s * (tr.x1 - tr.x0), tr.z0 - 0.8]],
      [{ x0: tr.x0, x1: tr.x1, z0: tr.z1 - WALL, z1: tr.z1 }, (s) => [tr.x0 + s * (tr.x1 - tr.x0), tr.z1 + 0.8]],
      [{ x0: tr.x0, x1: tr.x0 + WALL, z0: tr.z0, z1: tr.z1 }, (s) => [tr.x0 - 0.8, tr.z0 + s * (tr.z1 - tr.z0)]],
      [{ x0: tr.x1 - WALL, x1: tr.x1, z0: tr.z0, z1: tr.z1 }, (s) => [tr.x1 + 0.8, tr.z0 + s * (tr.z1 - tr.z0)]],
    ];
    for (const [b, along] of edges) {
      let top = -Infinity;
      for (let i = 0; i <= 8; i++) { const [px, pz] = along(i / 8); top = Math.max(top, natural(px, pz)); }
      if (top > tr.e + 0.3) block(b, tr.e, snap(top + 0.3));
    }
  }

  // Ramps, as short level prisms so the cut shows their rise, drawn as true
  // sloped lines.
  for (const rp of ramps) {
    const n = Math.max(2, Math.ceil((rp.x1 - rp.x0) / 0.5));
    for (let i = 0; i < n; i++) {
      const xa = rp.x0 + ((rp.x1 - rp.x0) * i) / n, xb = rp.x0 + ((rp.x1 - rp.x0) * (i + 1)) / n, y = rampY(rp, (xa + xb) / 2);
      solids.push({ poly: [[xa, rp.z0], [xb, rp.z0], [xb, rp.z1], [xa, rp.z1]], y0: y - RAMP, y1: y });
    }
    for (const z of [rp.z0, rp.z1]) {
      seg(lines, [rp.x0, rp.e0, z], [rp.x1, rp.e1, z]);
      seg(lines, [rp.x0, rp.e0 - RAMP, z], [rp.x1, rp.e1 - RAMP, z]);
    }
    seg(lines, [rp.x0, rp.e0, rp.z0], [rp.x0, rp.e0, rp.z1]);
    seg(lines, [rp.x1, rp.e1, rp.z0], [rp.x1, rp.e1, rp.z1]);
  }

  // The cantilever and its upstand at the free edge.
  block(cant, low.e - 0.3, low.e);
  const free: Box = toValley < 0 ? { ...cant, z1: cant.z0 + 0.25 } : { ...cant, z0: cant.z1 - 0.25 };
  block(free, low.e, low.e + 1.1);

  // The shaft: four walls from its base to its top, with landings.
  block({ ...shaft, z1: shaft.z0 + 0.3 }, shaftBase, shaftTop);
  block({ ...shaft, z0: shaft.z1 - 0.3 }, shaftBase, shaftTop);
  block({ ...shaft, x1: shaft.x0 + 0.3 }, shaftBase, shaftTop);
  block({ ...shaft, x0: shaft.x1 - 0.3 }, shaftBase, shaftTop);
  for (let y = shaftBase; y < shaftTop - 1; y += 4.5) block({ x0: shaft.x0 + 0.3, x1: shaft.x1 - 0.3, z0: shaft.z0 + 0.3, z1: shaft.z1 - 0.3 }, y, y + 0.3);

  // Contours of the surveyed ground, by marching squares.
  const site: number[] = [];
  const nx = Math.round(L / CELL), nzc = Math.round(D / CELL);
  const H: number[][] = [];
  for (let i = 0; i <= nx; i++) { H.push([]); for (let j = 0; j <= nzc; j++) H[i].push(ground(i * CELL, j * CELL)); }
  let lo = Infinity, hi = -Infinity;
  for (const row of H) for (const v of row) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let lev = Math.ceil(lo / CONTOUR) * CONTOUR; lev <= hi; lev += CONTOUR) {
    for (let i = 0; i < nx; i++) for (let j = 0; j < nzc; j++) {
      const c = [H[i][j], H[i + 1][j], H[i + 1][j + 1], H[i][j + 1]];
      const p = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const hits: Vec3[] = [];
      for (let k = 0; k < 4; k++) {
        const a = c[k], b = c[(k + 1) % 4];
        if ((a < lev) !== (b < lev)) {
          const f = (lev - a) / (b - a), [ia, ja] = p[k], [ib, jb] = p[(k + 1) % 4];
          hits.push([(ia + f * (ib - ia)) * CELL, lev, (ja + f * (jb - ja)) * CELL]);
        }
      }
      if (hits.length >= 2) seg(site, hits[0], hits[1]);
      if (hits.length === 4) seg(site, hits[2], hits[3]);
    }
  }
  // Survey marks: a small cross on the ground every 12 m.
  for (let gx = 6; gx < L; gx += 12) for (let gz = 6; gz < D; gz += 12) {
    const y = ground(gx, gz) + 0.02;
    seg(site, [gx - 0.6, y, gz], [gx + 0.6, y, gz]);
    seg(site, [gx, y, gz - 0.6], [gx, y, gz + 0.6]);
  }

  // People on the terraces and ramps, and walking the valley floor.
  const pr2 = rng(seed * 31 + 7);
  const TAU = Math.PI * 2;
  const walkers: ((t: number) => Pose)[] = [];
  const standing: Pose[] = [];
  for (const tr of terraces) {
    for (let k = 0; k < 3; k++) {
      const alongX = pr2() < 0.5, ph = pr2() * TAU;
      const x0 = between(tr.x0 + 1, tr.x1 - 1), z0 = between(tr.z0 + 1, tr.z1 - 1);
      const span = alongX ? Math.min(x0 - tr.x0, tr.x1 - x0) - 0.8 : Math.min(z0 - tr.z0, tr.z1 - z0) - 0.8;
      if (span < 0.6) continue;
      const w = 1.1 / span;
      walkers.push((t) => {
        const u = span * Math.sin(w * t + ph), back = Math.cos(w * t + ph) < 0;
        return { p: alongX ? [x0 + u, tr.e, z0] : [x0, tr.e, z0 + u], dir: (alongX ? 0 : Math.PI / 2) + (back ? Math.PI : 0), phase: t * 5.5 + ph };
      });
    }
    standing.push({ p: [between(tr.x0 + 1, tr.x1 - 1), tr.e, between(tr.z0 + 1, tr.z1 - 1)], dir: pr2() * TAU });
  }
  for (const rp of ramps) {
    const ph = pr2() * TAU, zc = (rp.z0 + rp.z1) / 2, run = rp.x1 - rp.x0, w = 1.1 / run;
    walkers.push((t) => {
      const u = 0.5 + 0.45 * Math.sin(w * 2 * t + ph), x = rp.x0 + u * run;
      return { p: [x, rampY(rp, x), zc], dir: Math.cos(w * 2 * t + ph) >= 0 ? 0 : Math.PI, phase: t * 5.5 + ph };
    });
  }
  for (let k = 0; k < 8; k++) {
    const x0 = between(6, L - 6), span = between(4, 9), w = 1.1 / span, ph = pr2() * TAU;
    walkers.push((t) => {
      const xx = x0 + span * Math.sin(w * t + ph), z = zAt(xx, 0);
      return { p: [xx, ground(xx, z), z], dir: Math.cos(w * t + ph) >= 0 ? 0 : Math.PI, phase: t * 5.5 + ph };
    });
  }
  for (let k = 0; k < 3; k++) {
    const xx = between(cant.x0 + 0.8, cant.x1 - 0.8), z = toValley < 0 ? cant.z0 + 0.8 : cant.z1 - 0.8;
    standing.push({ p: [xx, low.e, z], dir: toValley < 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  const bx = bounds([lines, site]);
  return {
    lines, solids, site, bounds: bx,
    featured: L * 0.2,
    ground: { h: ground, z0: 0, z1: D, base: Math.floor(lo) - 2 },
    people: { walkers, standing },
  };
}
