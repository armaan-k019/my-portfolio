// An interpretation after Toyo Ito's Sendai Mediatheque, 2001. Not a
// measured drawing.
//
// Sources: Mutsuro Sasaki's structure page for the project (U-Tokyo Virtual
// Architecture exhibition, 1997, design stage) and the Sendai Mediatheque's
// own site. From them:
//   a 50 m square beamless steel plate, 400 mm deep, carried by 13 tubes;
//   the tubes' positions and sizes, measured from Sasaki's labelled framing
//   plan (fig. 05_10) against its 50,000 dimension line (about 0.5 m); the
//   diameters are the slab openings at that level;
//   floor levels from his framing elevation (fig. 05_15): 7,600, 4,400,
//   6,000, 4,200, 5,500 and 4,700 between 1F, 2F, 3F, 5F, 6F, 7F and RF;
//   the four corner tubes TA1 to TA4 are single-layer truss hyperbolic
//   paraboloid shells of straight pipes (drawn as crossing twisted pipes);
//   the nine others are parallel bundles with a hoop at mid height; each
//   storey of a tube has ring beams top and bottom; pipes are 139.8 to
//   240 mm across.
// Assumed or left out: pipe counts are not published (20 for the corner
// tubes and 12 for the others, as drawn on the published 4F plan); the twist
// of the corner tubes is not dimensioned (two pipe spacings per storey);
// the tubes' lean and per-floor change of diameter are not published, so
// the tubes are drawn straight; the 4F mezzanine's extent, the penthouse and
// the basements are left out; the skin is drawn as the 50 m box only.
import { circle, rng, ring, seg, siteAround, type Model, type Pose, type Prism, type Vec3 } from "../geometry";

const SIDE = 50;
const SLAB = 0.4;
const LEVELS = [0, 7.6, 12.0, 18.0, 22.2, 27.7, 32.4]; // 1F, 2F, 3F, 5F, 6F, 7F, RF

// [label, x, z, opening diameter] from the framing plan (x across, z down it).
const TUBES: [string, number, number, number][] = [
  ["TA1", 6.2, 6.3, 7.2], ["TB1", 20.7, 5.7, 4.4], ["TC1", 33.5, 4.9, 2.3], ["TA2", 43.7, 5.5, 5.0],
  ["TC2", 3.8, 25.4, 2.3], ["TC3", 20.0, 25.3, 2.1], ["TC4", 31.6, 24.9, 2.1], ["TC5", 44.9, 25.7, 2.2],
  ["TA3", 5.3, 43.6, 5.9], ["TB2", 14.8, 45.7, 3.9], ["TB3", 20.9, 42.4, 3.4], ["TC6", 32.3, 45.2, 2.1], ["TA4", 43.6, 43.8, 5.0],
];

export function build(): Model {
  const lines: number[] = [];
  const solids: Prism[] = [];
  const rods: number[] = [], radius: number[] = [];
  const rod = (a: Vec3, b: Vec3, r: number) => { rods.push(...a, ...b); radius.push(r); seg(lines, a, b); };

  // Slabs: strips across the plan, each interrupted where it meets a tube
  // opening, so the cut shows the plate stopping at every tube.
  const STRIP = 0.5;
  for (const y of LEVELS) {
    for (let x = 0; x < SIDE; x += STRIP) {
      const mid = x + STRIP / 2;
      const gaps = TUBES.map(([, tx, tz, d]) => {
        const r = d / 2, dx = mid - tx;
        if (Math.abs(dx) >= r) return null;
        const h = Math.sqrt(r * r - dx * dx);
        return [tz - h, tz + h] as [number, number];
      }).filter((g): g is [number, number] => !!g).sort((p, q) => p[0] - q[0]);
      let z = 0;
      for (const [g0, g1] of gaps) {
        if (g0 > z) solids.push({ poly: [[x, z], [x + STRIP, z], [x + STRIP, g0], [x, g0]], y0: y - SLAB, y1: y });
        z = Math.max(z, g1);
      }
      if (z < SIDE) solids.push({ poly: [[x, z], [x + STRIP, z], [x + STRIP, SIDE], [x, SIDE]], y0: y - SLAB, y1: y });
    }
    ring(lines, [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE]], y);
    ring(lines, [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE]], y - SLAB);
  }
  // The skin: the box's vertical edges.
  for (const [x, z] of [[0, 0], [SIDE, 0], [SIDE, SIDE], [0, SIDE]]) seg(lines, [x, 0, z], [x, LEVELS[LEVELS.length - 1], z]);

  // Tubes, storey by storey between ring beams.
  for (const [label, tx, tz, d] of TUBES) {
    const big = label.startsWith("TA");
    const n = big ? 20 : 12, r = d / 2, pipe = big ? 0.12 : 0.08;
    const at = (a: number, y: number): Vec3 => [tx + r * Math.cos(a), y, tz + r * Math.sin(a)];
    for (let s = 0; s + 1 < LEVELS.length; s++) {
      const y0 = LEVELS[s], y1 = LEVELS[s + 1] - SLAB;
      ring(lines, circle(tx, tz, r, n), y0);
      ring(lines, circle(tx, tz, r, n), y1);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (big) {
          // Crossing twisted pipes: alternate pipes turn opposite ways.
          const twist = ((i % 2 ? 1 : -1) * 2 * Math.PI * 2) / n;
          rod(at(a, y0), at(a + twist, y1), pipe);
        } else {
          rod(at(a, y0), at(a, y1), pipe);
        }
      }
      if (!big) ring(lines, circle(tx, tz, r, n), (y0 + y1) / 2);
    }
  }

  // People: walking the floor plates clear of the tubes, and standing round
  // the tube bases on the ground floor.
  const rand = rng(2001);
  const TAU = Math.PI * 2;
  const clear = (x: number, z: number) =>
    x > 1 && x < SIDE - 1 && z > 1 && z < SIDE - 1 && TUBES.every(([, tx, tz, dd]) => Math.hypot(x - tx, z - tz) > dd / 2 + 1);
  const walkers: ((t: number) => Pose)[] = [];
  for (let tries = 0; walkers.length < 20 && tries < 2000; tries++) {
    const y = LEVELS[Math.floor(rand() * (LEVELS.length - 1))];
    const x0 = 2 + rand() * (SIDE - 4), z0 = 2 + rand() * (SIDE - 4), a = rand() * TAU, span = 3 + rand() * 5;
    const dx = Math.cos(a) * span, dz = Math.sin(a) * span;
    if (![-1, -0.5, 0, 0.5, 1].every((u) => clear(x0 + dx * u, z0 + dz * u))) continue;
    const w = 1.1 / span, ph = rand() * TAU;
    walkers.push((t) => {
      const u = Math.sin(w * t + ph);
      return { p: [x0 + dx * u, y, z0 + dz * u], dir: a + (Math.cos(w * t + ph) >= 0 ? 0 : Math.PI), phase: t * 5.5 + ph };
    });
  }
  const standing: Pose[] = [];
  for (let i = 0; i < 16; i++) {
    const [, tx, tz, dd] = TUBES[i % TUBES.length], a = rand() * TAU, rr = dd / 2 + 1.2;
    if (clear(tx + rr * Math.cos(a), tz + rr * Math.sin(a))) standing.push({ p: [tx + rr * Math.cos(a), 0, tz + rr * Math.sin(a)], dir: a + Math.PI });
  }

  const top = LEVELS[LEVELS.length - 1];
  const bx = { min: [0, 0, 0] as Vec3, max: [SIDE, top, SIDE] as Vec3 };
  return { lines, solids, rods: { segs: rods, radius }, site: siteAround(bx, 10, 6), bounds: bx, featured: 21, people: { walkers, standing } };
}
