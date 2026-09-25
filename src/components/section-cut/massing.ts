// Seeded procedural massing for the hero section cut. Units are metres.
//
// The building is designed to be read in section: the cut runs perpendicular
// to X, so everything interesting varies along X. Two volumes sit either side
// of a core, offset from each other by half a storey in height and half a bay
// in depth. The plan is eight bay-wide zones along X (three in A, the core,
// four in B), and each zone has its own profile: a double-height lobby with
// terraces, an atrium, a cantilevered block, the core and stair, an open
// undercroft, an upper double-height room, a light well and a stepped end.
//
// Solids are axis-aligned boxes so the cut is exact: every box straddling the
// plane contributes one rectangle to the poché. Mullions, stairs and the site
// are line-only and never cut.

export type Vec3 = [number, number, number];
// shaft: draw only the vertical edges (columns, whose caps sit on the slabs).
export interface Box { min: Vec3; max: Vec3; shaft?: boolean }
export interface Massing {
  boxes: Box[];          // structure: slabs, columns, core walls, upstands
  detail: number[];      // flat xyz pairs: mullions, transoms, stairs
  site: number[];        // flat xyz pairs: ground grid, site boundary
  bounds: Box;           // building extent (site excluded)
  featured: number;      // X station that shows the most in one cut
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

// A floor plate for one bay: its Z extent, and any Z ranges left open (voids).
interface Plate { z0: number; z1: number; holes: [number, number][] }
// A bay: X range and a plate per level, null where the level has no floor.
interface Bay { x0: number; x1: number; plates: (Plate | null)[] }
interface Volume { bays: Bay[]; levels: number[]; zGrid: number[] }

const SLAB = 0.35;
const COL = 0.55;
const MUL = 1.8;           // mullion spacing
const UPSTAND = 1.1;

export function massing(seed = 2027): Massing {
  const r = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

  const BX = pick([7.2, 7.8, 8.1]);
  const BZ = pick([6.6, 7.2]);
  const D = 3 * BZ;
  const T = 3.6;                              // typical floor to floor
  const G = 4.5;                              // ground floor to floor
  const NA = 7 + Math.floor(r() * 2);         // volume A plates above ground: 7..8
  const NB = 5;                               // volume B plates above ground
  const CANT = 2.4 + r() * 0.9;               // cantilever depth
  const STEP = 2.4;                           // terrace step per level
  const SHIFT_Y = T / 2;                      // B sits half a storey up
  const SHIFT_Z = BZ / 2;                     // and half a bay back

  const plate = (z0: number, z1: number, ...holes: [number, number][]): Plate => ({ z0, z1, holes });

  // Volume A: levels 0 (ground slab) .. NA+1 (roof).
  const levelsA = [0];
  for (let i = 1; i <= NA + 1; i++) levelsA.push(G + (i - 1) * T);
  const topA = levelsA.length - 1;
  const bayA = (i: number, fn: (lvl: number) => Plate | null): Bay =>
    ({ x0: i * BX, x1: (i + 1) * BX, plates: levelsA.map((_, lvl) => fn(lvl)) });

  const A: Volume = {
    levels: levelsA,
    zGrid: [0, BZ, 2 * BZ, D],
    bays: [
      // Bay 1: double-height lobby at the front, terraces stepping back above.
      bayA(0, (l) => {
        if (l === 1) return plate(0, D, [0, 2 * BZ]);
        const back = Math.max(0, l - (topA - 3)) * STEP;
        return plate(0, D - back);
      }),
      // Bay 2: atrium through the middle bay from level 1 to the top floor,
      // and upper floors cantilevered out at the back.
      bayA(1, (l) => {
        const z0 = l >= 4 ? -CANT : 0;
        return l >= 1 && l < topA ? plate(z0, D, [BZ, 2 * BZ]) : plate(z0, D);
      }),
      // Bay 3: a cantilevered block over the front at mid height, then a
      // setback that leaves the top floor open as a roof terrace.
      bayA(2, (l) => {
        if (l === topA) return null;
        const z1 = l >= 3 && l <= 5 ? D + CANT : D;
        return plate(0, z1);
      }),
    ],
  };

  // Core between the volumes, one bay wide.
  const LINK = BX;
  const xl0 = 3 * BX, xl1 = xl0 + LINK;
  const cz0 = BZ + 0.3, cz1 = 2 * BZ - 0.3;

  // Volume B: shifted up half a storey and back half a bay.
  const xb = xl1;
  const levelsB = [0];
  for (let i = 1; i <= NB + 1; i++) levelsB.push(G + (i - 1) * T + SHIFT_Y);
  const topB = levelsB.length - 1;
  const bz0 = SHIFT_Z, bz1 = SHIFT_Z + D;
  const bayB = (i: number, fn: (lvl: number) => Plate | null): Bay =>
    ({ x0: xb + i * BX, x1: xb + (i + 1) * BX, plates: levelsB.map((_, lvl) => fn(lvl)) });

  const B: Volume = {
    levels: levelsB,
    zGrid: [bz0, bz0 + BZ, bz0 + 2 * BZ, bz1],
    bays: [
      // Raised on pilotis: open at ground, upper floors cantilevered forward.
      bayB(0, (l) => (l === 0 ? plate(bz0, bz1) : plate(bz0, bz1 + CANT))),
      // Scissor section: double-height rooms at two upper levels, open on
      // alternate sides.
      bayB(1, (l) => (l === 2 ? plate(bz0, bz1, [bz0 + BZ, bz1])
        : l === 4 ? plate(bz0, bz1, [bz0, bz1 - BZ])
        : plate(bz0, bz1))),
      // Light well down the back bay from the roof to level 2.
      bayB(2, (l) => (l >= 2 && l < topB ? plate(bz0, bz1, [bz0, bz0 + BZ]) : plate(bz0, bz1))),
      // Stepped end: the roof drops a storey at a time towards the far end.
      bayB(3, (l) => (l > topB - 2 ? null : plate(bz0, bz1 - Math.max(0, l - 1) * STEP * 0.6))),
    ],
  };


  const boxes: Box[] = [];
  const detail: number[] = [];
  const seg = (a: Vec3, b: Vec3) => detail.push(...a, ...b);

  function mullions(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.3) return;
    const n = Math.max(1, Math.round(len / MUL));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      seg([x0 + (x1 - x0) * t, y0, z0 + (z1 - z0) * t], [x0 + (x1 - x0) * t, y1, z0 + (z1 - z0) * t]);
    }
    seg([x0, y0 + 0.9, z0], [x1, y0 + 0.9, z1]);
    seg([x0, y1 - 0.15, z0], [x1, y1 - 0.15, z1]);
  }

  for (const V of [A, B]) {
    const { levels, bays } = V;
    for (let bi = 0; bi < bays.length; bi++) {
      const bay = bays[bi];
      for (let l = 0; l < levels.length; l++) {
        const p = bay.plates[l];
        if (!p) continue;
        const y = levels[l];

        // Slab, split around its voids.
        let z = p.z0;
        for (const [h0, h1] of [...p.holes].sort((a, b) => a[0] - b[0])) {
          if (h0 > z) boxes.push(box(bay.x0, y - SLAB, z, bay.x1, y, h0));
          z = Math.max(z, h1);
        }
        if (z < p.z1) boxes.push(box(bay.x0, y - SLAB, z, bay.x1, y, p.z1));

        // Upstand wherever the plate above does not cover this edge.
        const above = bay.plates[l + 1];
        if (l > 0) {
          if (!above || above.z1 < p.z1 - 0.5) boxes.push(box(bay.x0, y, p.z1 - 0.25, bay.x1, y + UPSTAND, p.z1));
          if (!above || above.z0 > p.z0 + 0.5) boxes.push(box(bay.x0, y, p.z0, bay.x1, y + UPSTAND, p.z0 + 0.25));
        }

        // Facade for the storey above this plate: long faces, then end faces
        // where this bay's profile differs from its neighbour's.
        if (!above || l === levels.length - 1) continue;
        const yTop = levels[l + 1] - SLAB;
        const fz0 = Math.max(p.z0, above.z0), fz1 = Math.min(p.z1, above.z1);
        const recess = l === 0 ? 1.5 : 0.05;
        const open = V === B && bi === 0 && l === 0; // undercroft: no enclosure
        if (!open) {
          mullions(bay.x0, fz0 + recess, bay.x1, fz0 + recess, y, yTop);
          mullions(bay.x0, fz1 - recess, bay.x1, fz1 - recess, y, yTop);
          const prev = bays[bi - 1]?.plates[l], next = bays[bi + 1]?.plates[l];
          if (!prev || prev.z1 < fz1 || prev.z0 > fz0) mullions(bay.x0, fz0, bay.x0, fz1, y, yTop);
          if (!next || next.z1 < fz1 || next.z0 > fz0) mullions(bay.x1, fz0, bay.x1, fz1, y, yTop);
        }
        // Glazed atrium walls around each void that continues upward.
        for (const [h0, h1] of p.holes) {
          if (!above.holes.some(([a0, a1]) => a0 <= h0 && a1 >= h1)) continue;
          mullions(bay.x0, h0, bay.x1, h0, y, yTop);
          mullions(bay.x0, h1, bay.x1, h1, y, yTop);
        }
      }
    }

    // Columns on the grid, running between successive plates that cover the
    // point, so voids become double-height and cantilevers stay column-free.
    const xs = [bays[0].x0, ...bays.map((b) => b.x1)];
    const covers = (x: number, z: number, l: number) =>
      bays.some((b) => {
        const p = b.plates[l];
        return !!p && x >= b.x0 - 0.01 && x <= b.x1 + 0.01 && z >= p.z0 - 0.01 && z <= p.z1 + 0.01
          && !p.holes.some(([h0, h1]) => z > h0 + 0.01 && z < h1 - 0.01);
      });
    for (const x of xs) {
      for (const z of V.zGrid) {
        let from = -1;
        for (let l = 0; l < levels.length; l++) {
          if (!covers(x, z, l)) continue;
          if (from >= 0) boxes.push({ ...box(x - COL / 2, levels[from], z - COL / 2, x + COL / 2, levels[l] - SLAB, z + COL / 2), shaft: true });
          from = l;
        }
      }
    }
  }

  // Core: walls and landings at every A level, stair flights between them,
  // rising above A's roof as an overrun.
  const WALL = 0.3;
  for (let l = 0; l < topA; l++) {
    const y = levelsA[l], yTop = levelsA[l + 1] - SLAB;
    boxes.push(box(xl0, y - SLAB, cz0, xl1, y, cz1));
    boxes.push(box(xl0, y, cz0, xl1, yTop, cz0 + WALL));
    boxes.push(box(xl0, y, cz1 - WALL, xl1, yTop, cz1));
    const mid = (y + yTop) / 2, sx0 = xl0 + 0.6, sx1 = xl1 - 0.6;
    const za = cz0 + 1.2, zb = cz1 - 1.2;
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const a = k / steps, b = (k + 1) / steps;
      const ya = y + (mid - y) * a, yb = y + (mid - y) * b;
      seg([xl0 + 0.3, ya, za + (zb - za) * a * 0.5], [xl1 - 0.3, ya, za + (zb - za) * a * 0.5]);
      seg([xl0 + 0.3, ya, za + (zb - za) * a * 0.5], [xl0 + 0.3, yb, za + (zb - za) * b * 0.5]);
      const yc = mid + (yTop - mid) * a, yd = mid + (yTop - mid) * b;
      const zc = za + (zb - za) * (0.5 + a * 0.5), zd = za + (zb - za) * (0.5 + b * 0.5);
      seg([sx0, yc, zc], [sx1, yc, zc]);
      seg([sx1, yc, zc], [sx1, yd, zd]);
    }
  }
  const coreTop = levelsA[topA] + 3.2;
  boxes.push(box(xl0, levelsA[topA] - SLAB, cz0, xl1, levelsA[topA], cz1));
  boxes.push(box(xl0, levelsA[topA], cz0, xl1, coreTop, cz0 + WALL));
  boxes.push(box(xl0, levelsA[topA], cz1 - WALL, xl1, coreTop, cz1));
  boxes.push(box(xl0, coreTop - SLAB, cz0, xl1, coreTop, cz1));

  // Site: an irregular boundary around the plot and a survey grid.
  const xMax = xb + 4 * BX;
  const zMin = -CANT, zMax = bz1 + CANT;
  const site: number[] = [];
  const m = 9;
  const poly: Vec3[] = [
    [-m - 3 * r(), 0, zMin - m],
    [xMax + m + 4 * r(), 0, zMin - m - 2 * r()],
    [xMax + m, 0, zMax + m + 3 * r()],
    [-m, 0, zMax + m + 5 * r()],
  ];
  for (let i = 0; i < poly.length; i++) site.push(...poly[i], ...poly[(i + 1) % poly.length]);
  const GRID = 6;
  for (let x = -m; x <= xMax + m; x += GRID) site.push(x, 0, zMin - m - 6, x, 0, zMax + m + 6);
  for (let z = zMin - m; z <= zMax + m; z += GRID) site.push(-m - 6, 0, z, xMax + m + 6, 0, z);

  return {
    boxes, detail, site,
    bounds: box(0, 0, zMin, xMax, coreTop, zMax),
    featured: 1.5 * BX,
  };
}

// The 12 edges of a box as flat xyz pairs.
export function boxEdges(b: Box, out: number[]) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  const c: Vec3[] = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const E = b.shaft
    ? [0, 4, 1, 5, 2, 6, 3, 7]
    : [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  for (const i of E) out.push(...c[i]);
}
