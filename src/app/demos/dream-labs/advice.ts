// Claude's side of the Dream Labs demo, and the plain-code check of it.
// Claude reads the inverse kinematics results for a drawn path, says for each
// failing arm whether a different path would fix it or the arm itself is the
// limit, and proposes waypoints. The page runs those waypoints through the
// same solver in robots.ts, so every claim Claude makes is checked by code.

import {
  FAILURE_LABEL,
  OBJECT_HEIGHT,
  PICK,
  PLACE,
  ROBOTS,
  SAMPLES,
  SHELF,
  TILT_TOL,
  resample,
  run,
  type Pt,
  type Robot,
  type Run,
} from "./robots";

export type Verdict = "path" | "hardware";

export interface RobotAdvice {
  id: string;
  verdict: Verdict;
  note: string;
}

export interface Advice {
  summary: string;
  robots: RobotAdvice[];
  waypoints: Pt[];
}

// View bounds the drawn path is clamped to, in millimeters.
export const BOUNDS = { x0: -160, x1: 960, z0: 0, z1: 960 };
export const WIDTHS = { min: 20, max: 120, step: 5 };
export const MAX_WAYPOINTS = 12;
const END_TOL = 5; // mm; Claude's path must start at the pick and end at the place

function geometry(r: Robot): string {
  if (r.kind === "scara") {
    return `SCARA, tool always points straight down; horizontal reach ${r.reach![0]} to ${r.reach![1]} mm, tool tip height ${r.stroke![0]} to ${r.stroke![1]} mm`;
  }
  const joints = r.kind === "planar2" ? "shoulder and elbow, no wrist" : "shoulder, elbow, and wrist";
  const limits = r.limits.map(([a, b]) => `${a} to ${b}`).join("; ");
  return `planar arm (${joints}), shoulder at x ${r.shoulder[0]}, z ${r.shoulder[1]}; links ${r.links.map((l) => Math.round(l)).join(", ")} mm (last includes the gripper); relative joint limits in degrees: ${limits}`;
}

function outcome(result: Run, path: Pt[]): string {
  if (result.firstFail === null) return "completes";
  const [x, z] = path[result.firstFail].map(Math.round);
  const pct = Math.round((result.firstFail / (path.length - 1)) * 100);
  return `fails at ${pct}% of the path (x ${x}, z ${z}): ${FAILURE_LABEL[result.why!]}`;
}

// The text Claude reads. The server recomputes it from the path, so the
// client never supplies the results.
export function describe(path: Pt[], objectWidth: number): string {
  const lines = ROBOTS.map((r) => {
    const result = run(r, path, objectWidth);
    return `- ${r.id} (${r.name}): ${geometry(r)}; gripper opens to ${r.gripperMax} mm. Result: ${outcome(result, path)}.`;
  });
  const sampled = path.filter((_, i) => i % 9 === 0 || i === path.length - 1).map(([x, z]) => `[${Math.round(x)}, ${Math.round(z)}]`);
  return `Scene, side view in mm (x forward, z up): table top at z 0. The object is ${objectWidth} mm wide and ${OBJECT_HEIGHT} mm tall. The gripper holds it at its center: pick at [${PICK.join(", ")}], place at [${PLACE.join(", ")}] on a shelf whose top is at z ${SHELF.z} from x ${SHELF.x0} to ${SHELF.x1}, with a leg at x ${SHELF.x1 - 10}. The tool must point straight down within ${TILT_TOL} degrees the whole way. No link may pass below the table or through the shelf.

The visitor's path, every ninth sample: ${sampled.join(" ")}

Arms:
${lines.join("\n")}`;
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function isPath(v: unknown, length: number): v is Pt[] {
  return (
    Array.isArray(v) &&
    v.length === length &&
    v.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        finite(p[0]) &&
        finite(p[1]) &&
        p[0] >= BOUNDS.x0 &&
        p[0] <= BOUNDS.x1 &&
        p[1] >= BOUNDS.z0 &&
        p[1] <= BOUNDS.z1,
    )
  );
}

export function isWidth(v: unknown): v is number {
  return finite(v) && v >= WIDTHS.min && v <= WIDTHS.max && (v - WIDTHS.min) % WIDTHS.step === 0;
}

// Defensive parse of Claude's JSON. Returns null on anything malformed.
export function parseAdvice(text: string, failing: Set<string>): Advice | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof raw.summary !== "string" || !Array.isArray(raw.robots) || !Array.isArray(raw.waypoints)) return null;
    const robots: RobotAdvice[] = [];
    for (const item of raw.robots as unknown[]) {
      const r = item as Record<string, unknown>;
      if (typeof r.id !== "string" || !failing.has(r.id)) continue;
      if (r.verdict !== "path" && r.verdict !== "hardware") continue;
      if (typeof r.note !== "string") continue;
      robots.push({ id: r.id, verdict: r.verdict, note: r.note.trim() });
    }
    const waypoints = (raw.waypoints as unknown[]).filter(
      (p): p is Pt => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]),
    );
    if (waypoints.length < 2 || waypoints.length > MAX_WAYPOINTS) return null;
    return { summary: raw.summary.trim(), robots, waypoints };
  } catch {
    return null;
  }
}

export interface Check {
  path: Pt[];
  runs: Run[];
  endsOk: boolean; // starts at the pick and ends at the place
  complete: number;
}

// Run Claude's waypoints through the same solver as the visitor's path.
export function checkWaypoints(waypoints: Pt[], objectWidth: number): Check {
  const path = resample(waypoints, SAMPLES);
  const runs = ROBOTS.map((r) => run(r, path, objectWidth));
  const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= END_TOL;
  const endsOk = near(waypoints[0], PICK) && near(waypoints[waypoints.length - 1], PLACE);
  const complete = endsOk ? runs.filter((r) => r.firstFail === null).length : 0;
  return { path, runs, endsOk, complete };
}

// Whether the check bears out Claude's verdict for one arm: a path fix should
// complete on Claude's path, a hardware limit should still fail on it.
export function borneOut(verdict: Verdict, check: Check, index: number): boolean {
  const completes = check.endsOk && check.runs[index].firstFail === null;
  return verdict === "path" ? completes : !completes;
}

// Stable key for a path and width, rounded so tiny float noise does not miss.
export function adviceKey(path: Pt[], objectWidth: number): string {
  let h = 2166136261;
  const s = `${objectWidth}|${path.map(([x, z]) => `${Math.round(x)},${Math.round(z)}`).join(";")}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
