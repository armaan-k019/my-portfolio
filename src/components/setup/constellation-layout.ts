import type { SkillGraph } from "@/lib/skills-graph";

// A deterministic 3D layout for the skills graph: each family gets an anchor
// on a sphere, its members settle around that anchor, and a short force
// simulation (repulsion between all nodes, springs along references) spreads
// them so no two overlap. Same data in, same picture out, on every load.

export type Vec3 = [number, number, number];

export interface Layout {
  positions: Map<string, Vec3>;
  familyAnchors: Map<string, Vec3>;
  radius: Map<string, number>;
}

const FAMILY_RADIUS = 6.2;
const ITERATIONS = 420;

// mulberry32: a small seeded generator, so the layout never changes between loads
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Points spread evenly over a sphere (the Fibonacci lattice).
function fibonacciSphere(n: number, r: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = golden * i;
    out.push([Math.cos(theta) * ring * r, y * r * 0.72, Math.sin(theta) * ring * r]);
  }
  return out;
}

export function nodeRadius(lines: number) {
  return 0.16 + Math.sqrt(lines) / 42;
}

export function layoutGraph(graph: SkillGraph): Layout {
  const rand = rng(20261027);
  const anchors = fibonacciSphere(graph.families.length, FAMILY_RADIUS);
  const familyAnchors = new Map(graph.families.map((f, i) => [f.id, anchors[i]] as const));

  const ids = graph.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const p: Vec3[] = graph.nodes.map((n) => {
    const a = familyAnchors.get(n.family)!;
    return [a[0] + (rand() - 0.5) * 2, a[1] + (rand() - 0.5) * 2, a[2] + (rand() - 0.5) * 2];
  });
  const anchorOf = graph.nodes.map((n) => familyAnchors.get(n.family)!);
  const radius = new Map(graph.nodes.map((n) => [n.id, nodeRadius(n.lines)] as const));
  const r = graph.nodes.map((n) => radius.get(n.id)!);
  const links = graph.edges.map((e) => [index.get(e.source)!, index.get(e.target)!] as const);

  for (let it = 0; it < ITERATIONS; it++) {
    const cool = 1 - it / ITERATIONS;
    const f: Vec3[] = p.map(() => [0, 0, 0]);
    // repulsion, stronger when spheres would touch
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const dx = p[i][0] - p[j][0], dy = p[i][1] - p[j][1], dz = p[i][2] - p[j][2];
        const d2 = Math.max(0.01, dx * dx + dy * dy + dz * dz);
        const d = Math.sqrt(d2);
        const min = (r[i] + r[j]) * 2.4;
        const k = 0.9 / d2 + (d < min ? (min - d) * 0.8 : 0);
        f[i][0] += (dx / d) * k; f[i][1] += (dy / d) * k; f[i][2] += (dz / d) * k;
        f[j][0] -= (dx / d) * k; f[j][1] -= (dy / d) * k; f[j][2] -= (dz / d) * k;
      }
    }
    // pull toward the family anchor
    for (let i = 0; i < p.length; i++) {
      for (let a = 0; a < 3; a++) f[i][a] += (anchorOf[i][a] - p[i][a]) * 0.09;
    }
    // springs along references, weak so families stay readable
    for (const [s, t] of links) {
      for (let a = 0; a < 3; a++) {
        const d = (p[t][a] - p[s][a]) * 0.006;
        f[s][a] += d;
        f[t][a] -= d;
      }
    }
    const step = 0.35 * cool + 0.02;
    for (let i = 0; i < p.length; i++) {
      for (let a = 0; a < 3; a++) p[i][a] += Math.max(-0.5, Math.min(0.5, f[i][a] * step));
    }
  }

  return { positions: new Map(ids.map((id, i) => [id, p[i]])), familyAnchors, radius };
}
