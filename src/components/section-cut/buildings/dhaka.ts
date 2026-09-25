// An interpretation after Louis Kahn's National Parliament House
// (Jatiya Sangsad Bhaban), Dhaka, 1982. Not a measured drawing.
//
// Published figures used: the eight peripheral blocks rise to 110 ft and the
// central octagonal block to 155 ft (parliament.gov.bd via Wikipedia); the
// prayer hall is a cube just under 70 ft (Threepenny Review); facades are cut
// with circles, half circles, triangles and rectangles (WikiArquitectura).
// Plan read from Kahn's office drawing SBA26 "Schematic floor plan, final
// version", scaled so the prayer hall square is 70 ft; section and elevation
// read from the published drawings reproduced by ArchEyes, scaled from the
// 110 ft and 155 ft heights. The two scalings agree within about 4%.
// Estimated: the prayer hall's small rotation, the size and height of each
// opening, and which faces carry which openings (the published elevation does
// not name its facade, so its compositions are placed on the north and south).
import { annulus, circle, rect, ring, rng, seg, bounds, siteAround, type Model, type Pose, type Prism, type Pt } from "../geometry";

const FT = 0.3048;
const H_BLOCK = 110 * FT;      // 33.5 m
const H_CENTRE = 155 * FT;     // 47.2 m
const WALL = 1.2;
const STRIP = 0.9;             // width of the strips a pierced wall is cut into

// An opening in wall-local coordinates: u along the wall, v up from its base.
type Hole =
  | { kind: "circle"; u: number; v: number; r: number }
  | { kind: "tri"; u: number; v: number; w: number; h: number; up: boolean }   // v is the base
  | { kind: "rect"; u: number; v: number; w: number; h: number }
  | { kind: "half"; u: number; v: number; r: number };                       // top half disc, v is the flat side

// The v interval an opening occupies at position u, or null.
function span(h: Hole, u: number): [number, number] | null {
  const d = u - h.u;
  switch (h.kind) {
    case "circle": { if (Math.abs(d) >= h.r) return null; const c = Math.sqrt(h.r * h.r - d * d); return [h.v - c, h.v + c]; }
    case "half": { if (Math.abs(d) >= h.r) return null; return [h.v, h.v + Math.sqrt(h.r * h.r - d * d)]; }
    case "rect": return Math.abs(d) < h.w / 2 ? [h.v, h.v + h.h] : null;
    case "tri": {
      if (Math.abs(d) >= h.w / 2) return null;
      const k = h.h * (1 - Math.abs(d) / (h.w / 2));
      return h.up ? [h.v, h.v + k] : [h.v + h.h - k, h.v + h.h];
    }
  }
}

// Outline of an opening as a polyline in wall-local coordinates.
function outline(h: Hole): [number, number][] {
  const n = 24;
  switch (h.kind) {
    case "circle": return Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return [h.u + h.r * Math.cos(a), h.v + h.r * Math.sin(a)] as [number, number]; });
    case "half": return [...Array.from({ length: n / 2 + 1 }, (_, i) => { const a = (i / (n / 2)) * Math.PI; return [h.u + h.r * Math.cos(a), h.v + h.r * Math.sin(a)] as [number, number]; }), [h.u + h.r, h.v]];
    case "rect": return [[h.u - h.w / 2, h.v], [h.u + h.w / 2, h.v], [h.u + h.w / 2, h.v + h.h], [h.u - h.w / 2, h.v + h.h], [h.u - h.w / 2, h.v]];
    case "tri": return h.up
      ? [[h.u - h.w / 2, h.v], [h.u + h.w / 2, h.v], [h.u, h.v + h.h], [h.u - h.w / 2, h.v]]
      : [[h.u - h.w / 2, h.v + h.h], [h.u + h.w / 2, h.v + h.h], [h.u, h.v], [h.u - h.w / 2, h.v + h.h]];
  }
}

export function build(): Model {
  const lines: number[] = [];
  const solids: Prism[] = [];

  // A straight wall from a to b (plan), thickness t to its left, pierced by
  // openings. Solid strips carry the cut; the drawing shows the wall's edges,
  // the openings and the marble bands every third five-foot pour.
  function wall(a: Pt, b: Pt, y0: number, y1: number, holes: Hole[] = [], t = WALL) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz * t, nz = ux * t;
    const at = (u: number, v: number, inset = 0): [number, number, number] =>
      [a[0] + ux * u + nx * inset, v, a[1] + uz * u + nz * inset];
    if (!holes.length) solids.push({ poly: [a, b, [b[0] + nx, b[1] + nz], [a[0] + nx, a[1] + nz]], y0, y1 });
    else {
      for (let u = 0; u < L; u += STRIP) {
        const u1 = Math.min(L, u + STRIP), mid = (u + u1) / 2;
        const poly: Pt[] = [[a[0] + ux * u, a[1] + uz * u], [a[0] + ux * u1, a[1] + uz * u1], [a[0] + ux * u1 + nx, a[1] + uz * u1 + nz], [a[0] + ux * u + nx, a[1] + uz * u + nz]];
        const gaps = holes.map((h) => span(h, mid)).filter((g): g is [number, number] => !!g).sort((p, q) => p[0] - q[0]);
        let v = 0;
        for (const [g0, g1] of gaps) { if (g0 > v) solids.push({ poly, y0: y0 + v, y1: y0 + g0 }); v = Math.max(v, g1); }
        if (y0 + v < y1) solids.push({ poly, y0: y0 + v, y1 });
      }
    }
    for (const inset of [0, 1]) {
      seg(lines, at(0, y0, inset), at(L, y0, inset));
      seg(lines, at(0, y1, inset), at(L, y1, inset));
    }
    seg(lines, at(0, y0), at(0, y1));
    seg(lines, at(L, y0), at(L, y1));
    for (const h of holes) {
      const pts = outline(h);
      for (let i = 0; i + 1 < pts.length; i++) seg(lines, at(pts[i][0], y0 + pts[i][1]), at(pts[i + 1][0], y0 + pts[i + 1][1]));
    }
    for (let v = 3 * 5 * FT; v < y1 - y0 - 0.5; v += 3 * 5 * FT) {
      let u = 0;
      const cuts = holes.map((h) => { const o = outline(h).map((p) => p[0]); return [Math.min(...o), Math.max(...o), h] as const; })
        .filter(([, , h]) => { const s = span(h, h.u); return !!s && v >= s[0] && v <= s[1]; })
        .sort((p, q) => p[0] - q[0]);
      for (const [c0, c1] of cuts) { if (c0 > u) seg(lines, at(u, y0 + v), at(c0, y0 + v)); u = Math.max(u, c1); }
      if (u < L) seg(lines, at(u, y0 + v), at(L, y0 + v));
    }
  }

  // Walls round a closed polygon (counter-clockwise so thickness falls inside).
  function walls(poly: Pt[], y0: number, y1: number, holesFor: (i: number, len: number) => Hole[] = () => []) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      wall(a, b, y0, y1, holesFor(i, Math.hypot(b[0] - a[0], b[1] - a[1])));
    }
  }

  function floors(poly: Pt[], y0: number, y1: number, step: number) {
    for (let y = y0; y < y1 - 1; y += step) {
      solids.push({ poly, y0: y - 0.4, y1: y });
      ring(lines, poly, y);
    }
  }

  const ccw = (p: Pt[]) => {
    let s = 0;
    for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; s += x0 * z1 - x1 * z0; }
    return s > 0 ? p : [...p].reverse();
  };
  const rot = (p: Pt[], cx: number, cz: number, deg: number): Pt[] => {
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    return p.map(([x, z]) => [cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c]);
  };
  // Faces pointing north or south (running east to west) carry the
  // elevation's compositions.
  const facesNS = (poly: Pt[], i: number) => {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    return Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]) * 0.3;
  };

  // Central block: an octagon of 155 ft walls around the ambulatory, a crown
  // of circles above the 110 ft line, and the assembly chamber inside.
  const R_OUT = 35, R_HALL = 24.5, ASSEMBLY_ROOF = 117 * FT;
  const octa = ccw(circle(0, 0, R_OUT, 8, Math.PI / 8));
  walls(octa, 0, H_CENTRE, (i, len) => {
    const holes: Hole[] = [{ kind: "circle", u: len / 2, v: 40, r: 4.2 }];
    if (facesNS(octa, i)) holes.push(
      { kind: "half", u: len / 2, v: 27, r: 5.5 },
      { kind: "rect", u: len / 2, v: 20, w: 9, h: 4 },
      { kind: "tri", u: len / 2, v: 4, w: 11.8, h: 5.4, up: true },
    );
    return holes;
  });
  const hall = ccw(circle(0, 0, R_HALL, 16, Math.PI / 16));
  walls(hall, 0, ASSEMBLY_ROOF);
  // Floors of the rooms round the chamber: a ring between the chamber wall
  // and the octagon, at the published section's storey heights. The chamber
  // itself stays one volume up to its roof.
  const ringIn = R_HALL, ringOut = R_OUT * Math.cos(Math.PI / 8) - WALL;
  for (let y = 5.9; y < 33; y += 5.9) {
    solids.push(...annulus(0, 0, ringIn, ringOut, y - 0.4, y, 16));
    ring(lines, circle(0, 0, ringIn, 32), y);
    ring(lines, circle(0, 0, ringOut, 32), y);
  }
  // Assembly floor and the stepped seating on either side of the well.
  solids.push({ poly: ccw(circle(0, 0, R_HALL - WALL, 16, Math.PI / 16)), y0: 7.1, y1: 7.5 });
  for (let k = 0; k < 8; k++) {
    const r0 = 9 + k * 1.6;
    for (const side of [-1, 1]) {
      const tier = ccw(rect(-14, side * r0, 14, side * (r0 + 1.6)));
      solids.push({ poly: tier, y0: 7.5, y1: 7.5 + (k + 1) * 0.55 });
      ring(lines, tier, 7.5 + (k + 1) * 0.55);
    }
  }
  // Parabolic shell roof over the chamber, drawn as rising rings.
  for (let k = 0; k < 6; k++) {
    const r = R_HALL - k * 4, y = ASSEMBLY_ROOF + (k * k) * 0.25;
    ring(lines, circle(0, 0, r, 16, Math.PI / 16), y);
    solids.push({ poly: ccw(circle(0, 0, r, 16, Math.PI / 16)), y0: y - 0.4, y1: y });
  }

  // The four office blocks on the diagonals: squares turned 45 degrees, each
  // outward face cut with a tall triangle over a slot.
  // Placed so their inner faces sit 41 m from the centre, as read from SBA26,
  // leaving the ambulatory ring between them and the central octagon.
  const OFF = 41, SIDE = 34;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const sq = ccw(rot(rect(-SIDE / 2, -SIDE / 2, SIDE / 2, SIDE / 2), 0, 0, 45).map(([x, z]) => [x + sx * OFF, z + sz * OFF] as Pt));
    walls(sq, 0, H_BLOCK, (i, len) => {
      const a = sq[i], b = sq[(i + 1) % 4];
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const outward = Math.hypot(mx, mz) > Math.hypot(sx * OFF, sz * OFF);
      return outward ? [
        { kind: "tri", u: len / 2, v: 18, w: 5, h: 11, up: true },
        { kind: "rect", u: len / 2, v: 3, w: 2.6, h: 12 },
      ] : [];
    });
    floors(sq, 3.72, H_BLOCK, 3.72);
  }

  // North: garden entrance hall, four great circles in its side walls.
  const garden = ccw(rect(-14, 43, 14, 70));
  walls(garden, 0, H_BLOCK, (i, len) => facesNS(garden, i) ? [] : [
    { kind: "circle", u: len * 0.3, v: 11, r: 5.6 }, { kind: "circle", u: len * 0.7, v: 11, r: 5.6 },
    { kind: "circle", u: len * 0.3, v: 24, r: 5.6 }, { kind: "circle", u: len * 0.7, v: 24, r: 5.6 },
  ]);

  // South: the prayer hall, a 70 ft square turned slightly off the grid, a
  // large circle in its side walls and a light cylinder at each corner.
  const PH = 70 * FT, PHZ = -74.7;
  const prayer = ccw(rot(rect(-PH / 2, PHZ - PH / 2, PH / 2, PHZ + PH / 2), 0, PHZ, 4));
  walls(prayer, 0, H_BLOCK, (i, len) => facesNS(prayer, i) ? [] : [{ kind: "circle", u: len / 2, v: 18, r: 8.8 }]);
  for (const [x, z] of prayer) {
    const cyl = circle(x, z, 6.8, 20);
    walls(ccw(cyl), 0, H_BLOCK);
  }

  // West: the oval block; east: the block closed by two half cylinders.
  const oval: Pt[] = [
    ...circle(-58.5, 8.9, 10.5, 24).filter(([, z]) => z >= 8.9),
    ...circle(-58.5, -8.9, 10.5, 24).filter(([, z]) => z <= -8.9),
  ].sort((p, q) => Math.atan2(p[1], p[0] + 58.5) - Math.atan2(q[1], q[0] + 58.5));
  walls(ccw(oval), 0, H_BLOCK);
  floors(ccw(oval), 3.72, H_BLOCK, 3.72);
  const east = ccw(rect(52, -21.7, 67.3, 15.4));
  walls(east, 0, H_BLOCK);
  floors(east, 3.72, H_BLOCK, 3.72);
  for (const z of [7.4, -13.7]) walls(ccw(circle(52, z, 8, 16)), 0, H_BLOCK);

  // People: members on the assembly floor and the seating tiers, and people
  // walking the ambulatory, the ring between the central octagon and the
  // office blocks.
  const rand = rng(1982);
  const TAU = Math.PI * 2;
  const walkers: ((t: number) => Pose)[] = [];
  for (let i = 0; i < 12; i++) {
    const r = 36.5 + rand() * 3, w = (1 + rand() * 0.3) / r * (rand() < 0.5 ? 1 : -1), ph = rand() * TAU;
    walkers.push((t) => {
      const a = w * t + ph;
      return { p: [r * Math.cos(a), 0, r * Math.sin(a)], dir: a + (w > 0 ? 1 : -1) * Math.PI / 2, phase: t * 5.5 + ph };
    });
  }
  for (let i = 0; i < 4; i++) {
    const x0 = (rand() - 0.5) * 12, span = 3 + rand() * 3, w = 1 / span, ph = rand() * TAU, z = (rand() - 0.5) * 10;
    walkers.push((t) => {
      const u = Math.sin(w * t + ph);
      return { p: [x0 + span * u, 7.5, z], dir: Math.cos(w * t + ph) >= 0 ? 0 : Math.PI, phase: t * 5.5 + ph };
    });
  }
  const standing: Pose[] = [];
  for (let i = 0; i < 4; i++) standing.push({ p: [(rand() - 0.5) * 12, 7.5, (rand() - 0.5) * 12], dir: rand() * TAU });
  for (let i = 0; i < 16; i++) {
    const k = Math.floor(rand() * 8), side = rand() < 0.5 ? -1 : 1;
    standing.push({ p: [(rand() - 0.5) * 20, 7.5 + (k + 1) * 0.55, side * (9.8 + k * 1.6)], dir: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  const bx = bounds([lines]);
  return { lines, solids, site: siteAround(bx, 12, 8), bounds: bx, featured: 2, people: { walkers, standing } };
}
