// Shared geometry for the hero section cut. Units are metres; Y is up and the
// cutting plane is perpendicular to X.
//
// A building is two separate things: the lines that draw it, and the solids
// the cut is computed from. Solids are vertical prisms, a polygon in plan (XZ)
// extruded between two heights, so the section of any prism by a plane
// x = s is exact: the plane crosses the polygon in one or more Z intervals,
// and each interval becomes a rectangle in the cut face.

export type Vec3 = [number, number, number];
export type Pt = [number, number];                 // plan point: [x, z]
export interface Prism { poly: Pt[]; y0: number; y1: number }
export interface Box { min: Vec3; max: Vec3 }

// A person: where they stand, the direction they face (radians in plan,
// from +X towards +Z) and, for walkers, the stride phase.
export interface Pose { p: Vec3; dir: number; phase?: number }

export interface Model {
  lines: number[];       // flat xyz pairs, drawn and depth-graded
  solids: Prism[];       // cut only, never drawn directly
  site: number[];        // flat xyz pairs, drawn as hairline construction
  // A ground surface the cut sections: height at (x, z), its extent across
  // the cut, and the datum the earth is hatched down to.
  ground?: { h: (x: number, z: number) => number; z0: number; z1: number; base: number };
  people?: { walkers: ((t: number) => Pose)[]; standing: Pose[] };
  bounds: Box;           // building extent (site excluded)
  featured: number;      // X station shown before the pointer moves
}


// Line helpers ---------------------------------------------------------------

export function seg(out: number[], a: Vec3, b: Vec3) {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
}

// A closed plan polygon at height y.
export function ring(out: number[], poly: Pt[], y: number) {
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    out.push(x0, y, z0, x1, y, z1);
  }
}

// A prism's edges: both rings plus the verticals at every `every`th vertex.
export function prismEdges(out: number[], p: Prism, every = 1) {
  ring(out, p.poly, p.y0);
  ring(out, p.poly, p.y1);
  for (let i = 0; i < p.poly.length; i += every) {
    const [x, z] = p.poly[i];
    out.push(x, p.y0, z, x, p.y1, z);
  }
}

// Plan shapes ----------------------------------------------------------------

export const rect = (x0: number, z0: number, x1: number, z1: number): Pt[] =>
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

export function circle(cx: number, cz: number, r: number, n: number, rot = 0): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as Pt;
  });
}

// An annular sector between angles a0 and a1 (radians), as a simple polygon.
export function sector(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, steps = 2): Pt[] {
  const outer: Pt[] = [], inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    outer.push([cx + r1 * Math.cos(a), cz + r1 * Math.sin(a)]);
    inner.push([cx + r0 * Math.cos(a), cz + r0 * Math.sin(a)]);
  }
  return [...outer, ...inner.reverse()];
}

// A full ring of wall or slab as sectors (a ring with a hole is not a simple
// polygon, so it is cut into pieces).
export function annulus(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, pieces = 16): Prism[] {
  return Array.from({ length: pieces }, (_, i) => ({
    poly: sector(cx, cz, r0, r1, (i / pieces) * Math.PI * 2, ((i + 1) / pieces) * Math.PI * 2, 2),
    y0, y1,
  }));
}

// Section ----------------------------------------------------------------

// Z intervals where the plane x = s is inside the polygon (even-odd rule).
export function crossings(poly: Pt[], s: number): number[] {
  const zs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    if ((x0 <= s && x1 > s) || (x1 <= s && x0 > s)) zs.push(z0 + ((s - x0) / (x1 - x0)) * (z1 - z0));
  }
  return zs.sort((a, b) => a - b);
}

export function bounds(points: number[][]): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const arr of points)
    for (let i = 0; i < arr.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], arr[i + k]);
        max[k] = Math.max(max[k], arr[i + k]);
      }
  return { min, max };
}

// A survey grid and an irregular boundary around the building.
export function siteAround(b: Box, margin = 9, grid = 6): number[] {
  const out: number[] = [];
  const x0 = b.min[0] - margin, x1 = b.max[0] + margin, z0 = b.min[2] - margin, z1 = b.max[2] + margin;
  for (let x = x0; x <= x1; x += grid) out.push(x, 0, z0 - 6, x, 0, z1 + 6);
  for (let z = z0; z <= z1; z += grid) out.push(x0 - 6, 0, z, x1 + 6, 0, z);
  return out;
}

// Seeded random numbers, so every visitor sees the same people.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A figure 1.75 m tall in eight segments: head (3), torso, two arms, two
// legs. A walking figure swings its legs and arms with the stride phase.
export function figure(out: number[], { p, dir, phase }: Pose) {
  const f: Vec3 = [Math.cos(dir), 0, Math.sin(dir)], s: Vec3 = [-f[2], 0, f[0]];
  const at = (fw: number, up: number, side: number): Vec3 =>
    [p[0] + f[0] * fw + s[0] * side, p[1] + up, p[2] + f[2] * fw + s[2] * side];
  const swing = phase === undefined ? 0 : Math.sin(phase) * 0.3;
  const stance = phase === undefined ? 0.13 : 0.08;
  const hip = at(0, 0.95, 0), neck = at(0, 1.45, 0), shoulder = at(0, 1.4, 0);
  seg(out, hip, neck);
  seg(out, hip, at(swing, 0, stance));
  seg(out, hip, at(-swing, 0, -stance));
  seg(out, shoulder, at(-swing * 0.8, 0.85, 0.2));
  seg(out, shoulder, at(swing * 0.8, 0.85, -0.2));
  const h0 = at(0, 1.5, -0.1), h1 = at(0, 1.5, 0.1), h2 = at(0, 1.75, 0);
  seg(out, h0, h1); seg(out, h1, h2); seg(out, h2, h0);
}
