// An interpretation after Jorn Utzon's Sydney Opera House, 1973: the four
// main shells over the Concert Hall only. Not a measured drawing.
//
// The rule is Utzon's spherical solution as published by Ove Arup and
// Partners (The Arup Journal, October 1973, pp. 10 to 12): every shell
// surface is part of a sphere of radius 75 m; each half shell is a spherical
// triangle bounded by two great circles through a pole and, at the ridge, by
// a small circle 0.6 m from the hall axis plane; ribs are great circles
// through the pole 3.65 degrees apart, springing 6.9 m of arc from the pole
// and built from 4.6 m segments. The two halves mirror about the axis plane.
//
// Placement is fitted to Arup's longitudinal section through the major hall
// (same issue, Fig. 5), scaled from its 356 ft dimension and its levels: the
// podium at +42 ft and shell apexes at 143.30, 175.00, 221.30 and 132.70 ft,
// which the scaled drawing reproduces within half a foot. Each ridge in that
// section is a 75 m sphere's small circle; its centre and the sphere's offset
// from the axis are solved from the ridge points together with the shell's
// pedestal, under one assumption: all four pedestals sit 16.8 m either side
// of the axis (the value the two best conditioned shells give). With that,
// every ridge fits its sphere within 0.4 m.
//
// Left out because no published drawing defines them well enough: the Opera
// Theatre and restaurant shells, the side and louvre shells, the podium and
// the glass walls. Y is measured from the podium deck.
import { rng, seg, bounds, siteAround, type Model, type Pose, type Vec3 } from "../geometry";

const R = 75;
const SPRING = 6.9;                 // arc from pole to springing point
const RIB = (3.65 * Math.PI) / 180; // rib spacing at the pole
const SEGMENT = 4.6;                // precast rib segment length
const RIDGE = 0.6;                  // ridge plane offset from the axis
const THICK = 1.2;                  // drawn shell depth for the section
const PEDESTAL = 16.8;              // assumed pedestal offset (see above)

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V): V => mul(a, 1 / Math.hypot(...a));
// Rotate v about unit axis k by angle a (Rodrigues).
const rotate = (v: V, k: V, a: number): V =>
  add(add(mul(v, Math.cos(a)), mul(cross(k, v), Math.sin(a))), mul(k, dot(k, v) * (1 - Math.cos(a))));

// Fitted per shell, north (A4) to south (A1), in metres along the axis from
// the north end of the Fig. 5 dimension line: sphere centre in the axis
// plane (cx, cy) and its distance d from the ridge plane; the two ridge ends
// and the pedestal as read from the section.
const SHELLS = [
  { name: "A4", cx: 10.65, cy: -24.15, d: 50.35, ends: [[2.5, 31.02], [29.55, 28.3]], ped: [22.2, 8.45] },
  { name: "A3", cx: 23.86, cy: -9.47, d: 56.1, ends: [[25.73, 40.43], [50.13, 33.08]], ped: [39.47, 2.94] },
  { name: "A2", cx: 38.2, cy: 3.12, d: 54.7, ends: [[43.37, 54.39], [85.04, 23.52]], ped: [62.62, 1.84] },
  { name: "A1", cx: 111.35, cy: -22.14, d: 55.0, ends: [[86.14, 22.05], [122.16, 27.56]], ped: [107.46, 1.1] },
];

export function build(): Model {
  const lines: number[] = [];
  const outer: number[] = [], inner: number[] = [];

  for (const sh of SHELLS) {
    for (const side of [1, -1]) {
      const C: V = [sh.cx, sh.cy, side * (RIDGE - sh.d)];
      const onSphere = (p: V): V => add(C, mul(unit(sub(p, C)), R));
      const r = Math.sqrt(R * R - sh.d * sh.d);
      // Ridge ends, projected onto the ridge's small circle.
      const ridgeEnd = ([x, y]: number[]): V => {
        const a = Math.atan2(y - sh.cy, x - sh.cx);
        return [sh.cx + r * Math.cos(a), sh.cy + r * Math.sin(a), side * RIDGE];
      };
      const T1 = ridgeEnd(sh.ends[0]), T2 = ridgeEnd(sh.ends[1]);
      const S = onSphere([sh.ped[0], sh.ped[1], side * PEDESTAL]);
      // The pole lies 6.9 m of arc beyond the springing point, on the great
      // circle from the ridge's middle through the pedestal.
      const mid = ridgeEnd([(sh.ends[0][0] + sh.ends[1][0]) / 2, (sh.ends[0][1] + sh.ends[1][1]) / 2]);
      const axis = unit(cross(sub(mid, C), sub(S, C)));
      const P = add(C, rotate(sub(S, C), axis, SPRING / R));
      const n = unit(sub(P, C));
      const tangentTo = (T: V) => { const v = sub(T, C); return unit(sub(v, mul(n, dot(v, n)))); };
      const u1 = tangentTo(T1), u2 = tangentTo(T2);
      const spread = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
      const turn = unit(cross(u1, u2));
      const ribs = Math.max(2, Math.round(spread / RIB) + 1);

      // Each rib from the springing point to where it meets the ridge plane.
      const grid: V[][] = [], gridIn: V[][] = [];
      let steps = 0;
      const ribEnds: number[] = [];
      for (let i = 0; i < ribs; i++) {
        const u = rotate(u1, turn, (spread * i) / (ribs - 1));
        const A = R * n[2], B = R * u[2], K = side * RIDGE - C[2];
        const base = Math.atan2(B, A), w = Math.acos(Math.max(-1, Math.min(1, K / Math.hypot(A, B))));
        const cands = [base - w, base + w, base - w + 2 * Math.PI, base + w + 2 * Math.PI].filter((f) => f > SPRING / R + 1e-3);
        const end = Math.min(...cands);
        ribEnds.push(end);
        steps = Math.max(steps, Math.ceil(((end - SPRING / R) * R) / SEGMENT));
      }
      for (let i = 0; i < ribs; i++) {
        const u = rotate(u1, turn, (spread * i) / (ribs - 1));
        const row: V[] = [], rowIn: V[] = [];
        for (let j = 0; j <= steps; j++) {
          const f = SPRING / R + ((ribEnds[i] - SPRING / R) * j) / steps;
          const dir = add(mul(n, Math.cos(f)), mul(u, Math.sin(f)));
          row.push(add(C, mul(dir, R)));
          rowIn.push(add(C, mul(dir, R - THICK)));
        }
        grid.push(row); gridIn.push(rowIn);
      }

      // Ribs and segment joints on the outer surface and on the soffit, and
      // the rib depth where each rib meets the ridge.
      for (const g of [grid, gridIn]) {
        for (let i = 0; i < ribs; i++) {
          for (let j = 0; j < steps; j++) seg(lines, g[i][j] as Vec3, g[i][j + 1] as Vec3);
          if (i + 1 < ribs) for (let j = 1; j <= steps; j++) seg(lines, g[i][j] as Vec3, g[i + 1][j] as Vec3);
        }
      }
      for (let i = 0; i < ribs; i++) seg(lines, grid[i][steps] as Vec3, gridIn[i][steps] as Vec3);
      for (let i = 0; i + 1 < ribs; i++) {
        for (let j = 0; j < steps; j++) {
          const q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
          const qi = [gridIn[i][j], gridIn[i + 1][j], gridIn[i + 1][j + 1], gridIn[i][j + 1]];
          for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
            outer.push(...q[a], ...q[b], ...q[c]);
            inner.push(...qi[a], ...qi[b], ...qi[c]);
          }
        }
      }
    }
  }

  // People on the podium deck (+42 ft, the model's datum): an audience
  // gathered under the shells and people walking the deck alongside them.
  // The podium steps and the hall's interior floors are not modelled, so no
  // one is placed on them.
  const rand = rng(1973);
  const TAU = Math.PI * 2;
  const walkers: ((t: number) => Pose)[] = [];
  for (let i = 0; i < 18; i++) {
    const inside = i < 8;
    const z = inside ? (rand() - 0.5) * 18 : (rand() < 0.5 ? -1 : 1) * (21 + rand() * 6);
    const x0 = 20 + rand() * 90, span = 4 + rand() * 8, w = 1.1 / span, ph = rand() * TAU;
    walkers.push((t) => {
      const u = Math.sin(w * t + ph);
      return { p: [x0 + span * u, 0, z], dir: Math.cos(w * t + ph) >= 0 ? 0 : Math.PI, phase: t * 5.5 + ph };
    });
  }
  const standing: Pose[] = [];
  for (let i = 0; i < 18; i++) standing.push({ p: [35 + rand() * 60, 0, (rand() - 0.5) * 22], dir: (rand() - 0.5) * 0.8 });

  const bx = bounds([lines]);
  bx.min[1] = 0;
  return { lines, solids: [], shells: { outer, inner }, site: siteAround(bx, 10, 6), bounds: bx, featured: 12, people: { walkers, standing } };
}
