// An interpretation after Frank Lloyd Wright's Solomon R. Guggenheim Museum,
// New York, 1959. Not a measured drawing.
//
// Published figures used (NYC LPC designation reports LP-1774 and LP-1775,
// 1990; guggenheim.org; franklloydwright.org; Wikipedia's cited sources):
//   ramp about 1,416 ft (432 m) long at a 5% grade, so about 21.6 m of rise;
//   ramp width 25 ft at the bottom to 32 ft at the top;
//   rotunda about 100 ft across at the bottom and 128 ft at the top
//     (single-sourced, New Republic);
//   a solid parapet about 36 in high on the atrium side;
//   twelve radial webs at 30 degree intervals;
//   a twelve-sided skylight about 95 ft above the floor;
//   the smaller "monitor" rotunda to the north, 48 ft across and 48 ft high.
// Six turns follow from those numbers: at the ramp's mean radius one turn is
// about 72 m, and 432 m / 72 m is six. Estimated from photographs, not
// published: the band and glazing proportions of each turn, the spiral's
// direction, the monitor's distance from the rotunda, the triangular service
// core's size and the height of the connecting base. The 1992 tower is not
// Wright's and is left out.
import { annulus, circle, prismEdges, rect, ring, rng, sector, seg, bounds, siteAround, type Model, type Pose, type Prism, type Vec3 } from "../geometry";

const FT = 0.3048;

export function build(): Model {
  const lines: number[] = [];
  const solids: Prism[] = [];

  const TURNS = 6;
  const RISE = 432 * 0.05;                 // 21.6 m
  const TURN_H = RISE / TURNS;              // 3.6 m
  const WALL_TOP = RISE + TURN_H;           // top of the outer wall
  const R_BASE = (100 * FT) / 2, R_TOP = (128 * FT) / 2;
  const W_BASE = 25 * FT, W_TOP = 32 * FT;
  const SLAB = 0.45, PARAPET = 3 * FT, BAND = 2.6, SKIN = 0.3; // parapet is 36 in
  const rOut = (y: number) => R_BASE + ((R_TOP - R_BASE) * y) / WALL_TOP;
  const width = (y: number) => W_BASE + ((W_TOP - W_BASE) * Math.min(y, RISE)) / RISE;
  const rIn = (y: number) => rOut(y) - width(y);

  // The ramp: 24 stepped sectors per turn, each carrying its slab, the
  // parapet on the atrium side and the concrete band on the outside.
  const STEP = 24;
  const dA = (Math.PI * 2) / STEP;
  for (let i = 0; i < TURNS * STEP; i++) {
    const a0 = i * dA, a1 = a0 + dA, y = (i / STEP) * TURN_H;
    const ro = rOut(y), ri = rIn(y);
    solids.push({ poly: sector(0, 0, ri, ro - SKIN, a0, a1), y0: y - SLAB, y1: y });
    solids.push({ poly: sector(0, 0, ri, ri + 0.25, a0, a1), y0: y, y1: y + PARAPET });
    solids.push({ poly: sector(0, 0, ro - SKIN, ro, a0, a1), y0: Math.max(0, y - SLAB), y1: y + BAND });
  }

  // Spiral edges, sampled four times per sector.
  const spiral = (r: (y: number) => number, dy: number) => {
    const n = TURNS * STEP * 4;
    for (let k = 0; k < n; k++) {
      const t0 = k / (STEP * 4), t1 = (k + 1) / (STEP * 4);
      const y0 = t0 * TURN_H, y1 = t1 * TURN_H;
      const a0 = t0 * Math.PI * 2, a1 = t1 * Math.PI * 2;
      seg(lines, [r(y0) * Math.cos(a0), y0 + dy, r(y0) * Math.sin(a0)], [r(y1) * Math.cos(a1), y1 + dy, r(y1) * Math.sin(a1)]);
    }
  };
  spiral(rIn, 0);                // ramp edge
  spiral(rIn, -SLAB);            // slab soffit at the atrium
  spiral(rIn, PARAPET);          // parapet top
  spiral(rOut, BAND);            // top of each concrete band
  spiral(rOut, -SLAB);           // bottom of each band

  // Twelve radial webs at 30 degrees on every turn, and the glazing ribbon
  // mullions between one band and the next.
  for (let turn = 0; turn < TURNS; turn++) {
    for (let w = 0; w < 12; w++) {
      const a = (w / 12) * Math.PI * 2, y = (turn + w / 12) * TURN_H;
      const c = Math.cos(a), s = Math.sin(a);
      seg(lines, [rIn(y) * c, y, rIn(y) * s], [rOut(y) * c, y, rOut(y) * s]);
      seg(lines, [rOut(y) * c, y - SLAB, rOut(y) * s], [rOut(y) * c, y + BAND, rOut(y) * s]);
    }
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2, y = (turn + k / 48) * TURN_H;
      const r = rOut(y);
      seg(lines, [r * Math.cos(a), y + BAND, r * Math.sin(a)], [r * Math.cos(a), y + TURN_H - SLAB, r * Math.sin(a)]);
    }
  }

  // Ground floor, the roof ring over the last turn and the skylight: a
  // twelve-sided lantern whose twelve ribs pair into six spokes at the summit.
  const floor: Prism = { poly: circle(0, 0, R_BASE, 48), y0: -0.4, y1: 0 };
  solids.push(floor);
  ring(lines, floor.poly, 0);
  const riTop = rIn(RISE), roTop = rOut(WALL_TOP);
  solids.push(...annulus(0, 0, riTop, roTop, WALL_TOP - 0.5, WALL_TOP, 24));
  ring(lines, circle(0, 0, roTop, 64), WALL_TOP);
  ring(lines, circle(0, 0, riTop, 48), WALL_TOP);
  const SKY = 95 * FT;
  // Twelve ribs rise from the eave and join in pairs into six hairpin
  // spokes that meet a small ring at the summit (LPC 1775).
  const eave = circle(0, 0, riTop, 12), crown = circle(0, 0, 1.6, 6, Math.PI / 12);
  ring(lines, eave, WALL_TOP + 0.6);
  ring(lines, crown, SKY);
  for (let i = 0; i < 12; i++) {
    const top = crown[Math.floor(i / 2)];
    seg(lines, [eave[i][0], WALL_TOP + 0.6, eave[i][1]], [top[0], SKY, top[1]]);
    seg(lines, [eave[i][0], WALL_TOP, eave[i][1]], [eave[i][0], WALL_TOP + 0.6, eave[i][1]]);
  }

  // Triangular service core against the rotunda on the north-east.
  const core: Prism = { poly: [[12.5, 7.2], [18.5, 4.5], [15.5, 12.8]], y0: 0, y1: WALL_TOP + 2 };
  solids.push(core);
  prismEdges(lines, core);

  // The monitor: a 48 ft drum to the north with floors round a circular
  // atrium and a hexagonal dome.
  const MR = (48 * FT) / 2, MH = 48 * FT, M_ATRIUM = 3.4, MX = R_BASE + MR + 4;
  solids.push(...annulus(MX, 0, MR - SKIN, MR, 0, MH, 24));
  for (let f = 0; f <= 4; f++) {
    const y = (f / 4) * MH;
    ring(lines, circle(MX, 0, MR, 40), y);
    if (f < 4) {
      solids.push(...annulus(MX, 0, M_ATRIUM, MR - SKIN, y - 0.35, y, 12));
      ring(lines, circle(MX, 0, M_ATRIUM, 24), y);
    }
  }
  for (const [x, z] of circle(MX, 0, MR, 16)) seg(lines, [x, 0, z], [x, MH, z]);
  const hex = circle(MX, 0, MR - 0.6, 6);
  ring(lines, hex, MH + 0.4);
  for (const [x, z] of hex) seg(lines, [x, MH + 0.4, z], [MX, MH + 3, 0]);

  // The low base joining the two drums along Fifth Avenue (the west, -Z).
  const base: Prism = { poly: rect(R_BASE - 3, -10, MX - MR + 2, 4), y0: 0, y1: 4.2 };
  solids.push(base, { poly: base.poly, y0: -0.4, y1: 0 });
  prismEdges(lines, base);
  for (let x = R_BASE; x < MX - MR; x += 1.8) seg(lines, [x, 0.9, -10], [x, 3.6, -10] as Vec3);

  // People: visitors pace stretches of the ramp at mid-width and stand at the
  // outer wall where the work hangs; a few cross the rotunda floor.
  const rand = rng(1959);
  const TAU = Math.PI * 2;
  const onRamp = (a: number, rr: (y: number) => number): Vec3 => {
    const y = (a / TAU) * TURN_H, r = rr(y);
    return [r * Math.cos(a), y, r * Math.sin(a)];
  };
  const mid = (y: number) => (rIn(y) + 0.4 + rOut(y) - SKIN) / 2;
  const walkers: ((t: number) => Pose)[] = [];
  for (let i = 0; i < 16; i++) {
    const a0 = rand() * TURNS * TAU * 0.96, span = 0.25 + rand() * 0.35, speed = 0.9 + rand() * 0.4, ph = rand() * TAU;
    const w = speed / (mid(0) * span);
    walkers.push((t) => {
      const a = a0 + span * Math.sin(w * t + ph);
      const back = Math.cos(w * t + ph) < 0 ? Math.PI : 0;
      return { p: onRamp(a, mid), dir: a + Math.PI / 2 + back, phase: t * 5.5 + ph };
    });
  }
  for (let i = 0; i < 6; i++) {
    const r = 2 + rand() * 3.5, w = (0.8 + rand() * 0.4) / r, ph = rand() * TAU;
    walkers.push((t) => {
      const a = w * t + ph;
      return { p: [r * Math.cos(a), 0, r * Math.sin(a)], dir: a + Math.PI / 2, phase: t * 5.5 + ph };
    });
  }
  const standing: Pose[] = [];
  for (let i = 0; i < 12; i++) {
    const a = rand() * TURNS * TAU * 0.96;
    standing.push({ p: onRamp(a, (y) => rOut(y) - SKIN - 1.3), dir: a });
  }
  for (let i = 0; i < 4; i++) {
    const a = rand() * TAU, r = rand() * (rIn(0) - 1.5);
    standing.push({ p: [r * Math.cos(a), 0, r * Math.sin(a)], dir: rand() * TAU });
  }

  const bx = bounds([lines]);
  return { lines, solids, site: siteAround(bx), bounds: bx, featured: 3, people: { walkers, standing } };
}
