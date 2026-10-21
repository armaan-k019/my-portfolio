// Pin-up consensus: several reviewers mark up one plan, and a weighted least
// squares solve over wall positions finds the plan that best satisfies all of
// them at once. Markups that still pull against each other after the solve are
// the real conflicts. Pure TypeScript, no network, no LLM.

// ─── Plan ─────────────────────────────────────────────────────────────────────
// A rectilinear "tartan" plan: rooms span ranges of grid lines. The outer
// lines are fixed (the envelope); interior lines are the walls that can move.

export interface Room {
  id: string;
  name: string;
  x: [number, number]; // indices into xs
  y: [number, number]; // indices into ys
}

export interface Plan {
  xs: number[]; // meters
  ys: number[];
  rooms: Room[];
}

// Sample plan, not a real building: a 24 x 16 m maker studio.
export const PLAN: Plan = {
  xs: [0, 7, 15, 24],
  ys: [0, 6, 16],
  rooms: [
    { id: "lobby", name: "Lobby", x: [0, 1], y: [0, 1] },
    { id: "workshop", name: "Workshop", x: [1, 2], y: [0, 1] },
    { id: "storage", name: "Storage", x: [2, 3], y: [0, 1] },
    { id: "office", name: "Office", x: [0, 1], y: [1, 2] },
    { id: "studio", name: "Studio", x: [1, 3], y: [1, 2] },
  ],
};

export const MIN_ROOM = 2.5; // meters, smallest allowed room dimension

// ─── Markups ──────────────────────────────────────────────────────────────────

export type Markup =
  | { id: number; reviewer: string; kind: "bigger" | "smaller" | "keep"; room: string }
  | { id: number; reviewer: string; kind: "wall"; axis: "x" | "y"; line: number; to: number };

export interface Reviewer {
  id: string;
  name: string;
  color: string;
}

export const REVIEWERS: Reviewer[] = [
  { id: "principal", name: "Principal", color: "#b45309" },
  { id: "client", name: "Client", color: "#2563eb" },
  { id: "structure", name: "Structure", color: "#4d7c0f" },
  { id: "fab", name: "Fabrication", color: "#be185d" },
  { id: "you", name: "You", color: "#1a1a1a" },
];

// Sample markups. Invented for the demo; they stand in for a real pin-up.
export const SAMPLE_MARKUPS: Markup[] = [
  { id: 1, reviewer: "principal", kind: "bigger", room: "studio" },
  { id: 2, reviewer: "principal", kind: "smaller", room: "lobby" },
  { id: 3, reviewer: "client", kind: "bigger", room: "office" },
  { id: 4, reviewer: "client", kind: "keep", room: "studio" },
  { id: 5, reviewer: "structure", kind: "wall", axis: "x", line: 1, to: 7 },
  { id: 6, reviewer: "structure", kind: "wall", axis: "y", line: 1, to: 6 },
  { id: 7, reviewer: "fab", kind: "bigger", room: "workshop" },
  { id: 8, reviewer: "fab", kind: "smaller", room: "storage" },
];

const AREA_FACTOR = { bigger: 1.25, smaller: 0.8, keep: 1 } as const;
const AREA_TOL = 0.1; // 10% of a room's area counts the same as...
const WALL_TOL = 1; // ...1 m of wall position
const ANCHOR = 0.05; // weak pull of every wall toward where it started

// ─── Geometry ─────────────────────────────────────────────────────────────────

// Variables: interior xs, then interior ys.
export function toVars(plan: Plan): number[] {
  return [...plan.xs.slice(1, -1), ...plan.ys.slice(1, -1)];
}

export function fromVars(plan: Plan, v: number[]): Plan {
  const nx = plan.xs.length - 2;
  return {
    ...plan,
    xs: [plan.xs[0], ...v.slice(0, nx), plan.xs.at(-1)!],
    ys: [plan.ys[0], ...v.slice(nx), plan.ys.at(-1)!],
  };
}

export function roomArea(plan: Plan, r: Room) {
  return (plan.xs[r.x[1]] - plan.xs[r.x[0]]) * (plan.ys[r.y[1]] - plan.ys[r.y[0]]);
}

function room(plan: Plan, id: string) {
  const r = plan.rooms.find((q) => q.id === id);
  if (!r) throw new Error(`No room ${id}`);
  return r;
}

// Signed, tolerance-scaled error of one markup on a candidate plan.
export function residual(base: Plan, cand: Plan, m: Markup): number {
  if (m.kind === "wall") {
    const lines = m.axis === "x" ? cand.xs : cand.ys;
    return (lines[m.line] - m.to) / WALL_TOL;
  }
  const r = room(base, m.room);
  const a0 = roomArea(base, r);
  return (roomArea(cand, r) - AREA_FACTOR[m.kind] * a0) / (AREA_TOL * a0);
}

// Keep grid lines ordered with at least MIN_ROOM between neighbors.
function project(plan: Plan, v: number[]): number[] {
  const p = fromVars(plan, v);
  const fix = (ls: number[]) => {
    const out = [...ls];
    for (let i = 1; i < out.length - 1; i++) {
      out[i] = Math.max(out[i], out[i - 1] + MIN_ROOM);
      out[i] = Math.min(out[i], out.at(-1)! - MIN_ROOM * (out.length - 1 - i));
    }
    return out;
  };
  return toVars({ ...p, xs: fix(p.xs), ys: fix(p.ys) });
}

// ─── Solve ────────────────────────────────────────────────────────────────────

export interface Solution {
  plan: Plan;
  satisfied: Map<number, number>; // markup id -> 0..1
}

function weightedResiduals(base: Plan, v: number[], markups: Markup[], weights: Map<string, number>) {
  const cand = fromVars(base, v);
  const v0 = toVars(base);
  return [
    ...markups.map((m) => Math.sqrt(weights.get(m.reviewer) ?? 1) * residual(base, cand, m)),
    ...v.map((x, k) => ANCHOR * (x - v0[k])),
  ];
}

function jacobian(f: (v: number[]) => number[], v: number[]) {
  const f0 = f(v);
  const h = 1e-4;
  const cols = v.map((_, k) => {
    const vp = [...v];
    vp[k] += h;
    return f(vp).map((y, i) => (y - f0[i]) / h);
  });
  return { f0, J: f0.map((_, i) => cols.map((c) => c[i])) };
}

// Solve the normal equations (J^T J + damping) dv = -J^T r by Gaussian elimination.
function lmStep(J: number[][], r: number[], lambda: number) {
  const n = J[0].length;
  const A = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => J.reduce((s, row) => s + row[i] * row[j], 0) + (i === j ? lambda : 0)),
  );
  const b = Array.from({ length: n }, (_, i) => -J.reduce((s, row, k) => s + row[i] * r[k], 0));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let q = c + 1; q < n; q++) if (Math.abs(A[q][c]) > Math.abs(A[p][c])) p = q;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let q = c + 1; q < n; q++) {
      const f = A[q][c] / A[c][c];
      for (let j = c; j < n; j++) A[q][j] -= f * A[c][j];
      b[q] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

const sq = (r: number[]) => r.reduce((s, x) => s + x * x, 0);

export function solve(base: Plan, markups: Markup[], weights: Map<string, number>): Solution {
  const f = (v: number[]) => weightedResiduals(base, v, markups, weights);
  let v = toVars(base);
  let lambda = 1e-2;
  for (let iter = 0; iter < 60; iter++) {
    const { f0, J } = jacobian(f, v);
    const next = project(base, v.map((x, k) => x + lmStep(J, f0, lambda)[k]));
    if (sq(f(next)) < sq(f0)) {
      const moved = Math.hypot(...next.map((x, k) => x - v[k]));
      v = next;
      lambda = Math.max(1e-6, lambda / 3);
      if (moved < 1e-5) break;
    } else {
      lambda *= 4;
      if (lambda > 1e6) break;
    }
  }
  const plan = fromVars(base, v);
  const satisfied = new Map<number, number>();
  for (const m of markups) {
    const before = Math.abs(residual(base, base, m));
    const after = Math.abs(residual(base, plan, m));
    satisfied.set(m.id, before < 0.05 ? Math.max(0, 1 - after) : Math.max(0, Math.min(1, 1 - after / before)));
  }
  return { plan, satisfied };
}

// ─── Conflicts ────────────────────────────────────────────────────────────────
// Two markups conflict when the wall moves each wants point in opposite
// directions at the original plan and neither is fully met after the solve.

export interface Conflict {
  a: Markup;
  b: Markup;
  severity: number;
}

export function conflicts(base: Plan, markups: Markup[], sol: Solution, weights: Map<string, number>): Conflict[] {
  const v0 = toVars(base);
  const dirs = markups.map((m) => {
    const { f0, J } = jacobian((v) => [residual(base, fromVars(base, v), m)], v0);
    const r = f0[0];
    // Descent direction for this markup alone; a "keep" at its target has none,
    // so use its gradient: any move along it breaks the keep.
    return Math.abs(r) > 0.05 ? J[0].map((g) => -r * g) : J[0];
  });
  const out: Conflict[] = [];
  for (let i = 0; i < markups.length; i++) {
    for (let j = i + 1; j < markups.length; j++) {
      const a = markups[i];
      const b = markups[j];
      if (a.reviewer === b.reviewer) continue;
      const na = Math.hypot(...dirs[i]);
      const nb = Math.hypot(...dirs[j]);
      if (na < 1e-9 || nb < 1e-9) continue;
      const cos = dirs[i].reduce((s, x, k) => s + x * dirs[j][k], 0) / (na * nb);
      const keepInvolved = a.kind === "keep" || b.kind === "keep" || a.kind === "wall" || b.kind === "wall";
      const opposed = keepInvolved ? Math.abs(cos) : -cos;
      if (opposed < 0.3) continue;
      const unmet = 2 - (sol.satisfied.get(a.id) ?? 1) - (sol.satisfied.get(b.id) ?? 1);
      if (unmet < 0.1) continue;
      const w = (weights.get(a.reviewer) ?? 1) * (weights.get(b.reviewer) ?? 1);
      out.push({ a, b, severity: w * opposed * unmet });
    }
  }
  return out.sort((p, q) => q.severity - p.severity);
}
