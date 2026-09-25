// Seeded procedural massing for the hero section cut. Units are metres.
// Solids are axis-aligned boxes so a cut perpendicular to X is exact: every
// box straddling the plane contributes one rectangle to the poché. Everything
// else (mullions, stairs, site) is line-only and never cut.

export type Vec3 = [number, number, number];
export interface Box { min: Vec3; max: Vec3 }
export interface Massing {
  boxes: Box[];          // structure: slabs, columns, core walls, parapets
  detail: number[];      // flat xyz pairs: mullions, transoms, stairs
  site: number[];        // flat xyz pairs: ground grid, site boundary
  bounds: Box;           // building extent (site excluded)
  core: number;          // X station through the middle of the core
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

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
  max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
});

export function massing(seed = 2027): Massing {
  const r = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

  const BAY_X = pick([7.8, 8.1, 8.4]);
  const BAY_Z = pick([6.9, 7.2]);
  const NX = pick([5, 6]);
  const NZ = 3;
  const FLOORS = 6 + Math.floor(r() * 4);        // 6..9 plates above ground
  const G = 5.1;                                  // ground floor to floor
  const T = 3.6;                                  // typical floor to floor
  const SLAB = 0.35;
  const COL = 0.6;
  const EDGE = 0.9;                               // slab edge beyond column line
  const SETBACK_AT = FLOORS - 1 - Math.floor(r() * 2); // top 1..2 floors step back
  const W = NX * BAY_X;
  const D = NZ * BAY_Z;

  // Core occupies one bay square, off centre so the section changes as it moves.
  const coreI = 1 + Math.floor(r() * (NX - 3));
  const cx0 = coreI * BAY_X + 0.6, cx1 = cx0 + BAY_X - 1.2;
  const cz0 = BAY_Z + 0.6, cz1 = cz0 + BAY_Z - 1.2;
  const WALL = 0.3;

  const boxes: Box[] = [];
  const detail: number[] = [];
  const seg = (a: Vec3, b: Vec3) => detail.push(...a, ...b);

  // Floor levels: index 0 is ground slab on grade, then FLOORS plates, then roof.
  const levels: number[] = [0];
  for (let i = 1; i <= FLOORS + 1; i++) levels.push(G + (i - 1) * T);

  // Footprint per level: the setback drops the last X bay.
  const extentX = (lvl: number) => (lvl > SETBACK_AT ? W - BAY_X : W);

  for (let lvl = 0; lvl < levels.length; lvl++) {
    const y = levels[lvl];
    const xMax = extentX(lvl);
    const e = lvl === 0 ? 0 : EDGE;
    boxes.push(box(-e, y - SLAB, -e, xMax + e, y, D + e));

    const isRoof = lvl === levels.length - 1;
    if (isRoof) {
      // Parapet upstands and a plant enclosure on the roof.
      const p = 1.1, t = 0.25;
      boxes.push(box(-e, y, -e, xMax + e, y + p, -e + t));
      boxes.push(box(-e, y, D + e - t, xMax + e, y + p, D + e));
      boxes.push(box(-e, y, -e, -e + t, y + p, D + e));
      boxes.push(box(xMax + e - t, y, -e, xMax + e, y + p, D + e));
      boxes.push(box(cx0 - 1.5, y, cz0 - 1.2, cx1 + 1.5, y + 3.2, cz1 + 1.2));
      break;
    }

    const yTop = levels[lvl + 1] - SLAB;
    // Columns on the grid, skipping those inside the core.
    for (let i = 0; i <= NX; i++) {
      const x = i * BAY_X;
      if (x > xMax + 0.01) continue;
      for (let j = 0; j <= NZ; j++) {
        const z = j * BAY_Z;
        if (x > cx0 - 1 && x < cx1 + 1 && z > cz0 - 1 && z < cz1 + 1) continue;
        boxes.push(box(x - COL / 2, y, z - COL / 2, x + COL / 2, yTop, z + COL / 2));
      }
    }

    // Core walls, one set per storey so they meet the slabs rather than cross them.
    boxes.push(box(cx0, y, cz0, cx1, yTop, cz0 + WALL));
    boxes.push(box(cx0, y, cz1 - WALL, cx1, yTop, cz1));
    boxes.push(box(cx0, y, cz0, cx0 + WALL, yTop, cz1));
    boxes.push(box(cx1 - WALL, y, cz0, cx1, yTop, cz1));

    // Stair flights inside the core: two runs per storey.
    const sx0 = cx0 + 0.6, sx1 = cx1 - 0.6, mid = (y + yTop) / 2;
    const sz = cz0 + 1.4, sz2 = cz1 - 1.4;
    const steps = 9;
    for (let k = 0; k < steps; k++) {
      const a = k / steps, b = (k + 1) / steps;
      seg([sx0 + (sx1 - sx0) * a, y + (mid - y) * a, sz], [sx0 + (sx1 - sx0) * b, y + (mid - y) * a, sz]);
      seg([sx0 + (sx1 - sx0) * b, y + (mid - y) * a, sz], [sx0 + (sx1 - sx0) * b, y + (mid - y) * b, sz]);
      seg([sx1 - (sx1 - sx0) * a, mid + (yTop - mid) * a, sz2], [sx1 - (sx1 - sx0) * b, mid + (yTop - mid) * a, sz2]);
      seg([sx1 - (sx1 - sx0) * b, mid + (yTop - mid) * a, sz2], [sx1 - (sx1 - sx0) * b, mid + (yTop - mid) * b, sz2]);
    }

    // Facade: the curtain wall sits on the slab edge; the ground floor is
    // recessed one metre and a half behind the column line on the long faces.
    const inset = lvl === 0 ? 1.5 : -e + 0.05;
    const fx0 = inset, fx1 = xMax - inset, fz0 = inset, fz1 = D - inset;
    const MUL = 1.5;
    const sill = lvl === 0 ? y : y + 0.9;
    const faces: [Vec3, Vec3][] = [
      [[fx0, 0, fz0], [fx1, 0, fz0]],
      [[fx1, 0, fz0], [fx1, 0, fz1]],
      [[fx1, 0, fz1], [fx0, 0, fz1]],
      [[fx0, 0, fz1], [fx0, 0, fz0]],
    ];
    for (const [a, b] of faces) {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(1, Math.round(len / MUL));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
        seg([x, y, z], [x, yTop, z]);
      }
      seg([a[0], sill, a[2]], [b[0], sill, b[2]]);
      seg([a[0], yTop - 0.15, a[2]], [b[0], yTop - 0.15, b[2]]);
    }
  }

  // Site: an irregular boundary around the plot and a survey grid.
  const site: number[] = [];
  const m = 9;
  const poly: Vec3[] = [
    [-m - 3 * r(), 0, -m],
    [W + m + 4 * r(), 0, -m - 2 * r()],
    [W + m, 0, D + m + 3 * r()],
    [-m, 0, D + m + 5 * r()],
  ];
  for (let i = 0; i < poly.length; i++) site.push(...poly[i], ...poly[(i + 1) % poly.length]);
  const GRID = 6;
  for (let x = -m; x <= W + m; x += GRID) site.push(x, 0, -m - 6, x, 0, D + m + 6);
  for (let z = -m; z <= D + m; z += GRID) site.push(-m - 6, 0, z, W + m + 6, 0, z);

  const top = levels[levels.length - 1] + 3.2;
  return { boxes, detail, site, bounds: box(-EDGE, 0, -EDGE, W + EDGE, top, D + EDGE), core: (cx0 + cx1) / 2 };
}

// The 12 edges of a box as flat xyz pairs.
export function boxEdges(b: Box, out: number[]) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  const c: Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const E = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  for (const i of E) out.push(...c[i]);
}
