// One motion, five robots: a drawn end-effector path retargeted onto arms with
// different kinematics by inverse kinematics. Everything is a planar side view
// (x forward, z up, millimeters, table top at z = 0). Pure TypeScript, no LLM.

export type Kind = "planar3" | "planar2" | "scara";

export interface Robot {
  id: string;
  name: string;
  kind: Kind;
  // planar chains: shoulder joint position, link lengths (last one includes the tool)
  shoulder: [number, number];
  links: number[];
  // joint limits on relative joint angles, degrees: [shoulder, elbow, wrist]
  limits: [number, number][];
  // scara: horizontal reach range and vertical stroke of the tool tip
  reach?: [number, number];
  stroke?: [number, number];
  gripperMax: number; // widest object the gripper can close on, mm
}

// KUKA KR 6 R900 sixx in side elevation: A2, A3 and A5 move, A1, A4 and A6
// stay at 0. Verified against KUKA's datasheet: 901 mm maximum reach, axis
// ranges A2 -190..45, A3 -120..156, A5 -120..120. NOT verified: the link
// dimensions (400 mm to A2, 25 mm A1-A2 offset, 455 mm A2-A3, 35 mm and 420 mm
// A3 to wrist). They are consistent with the 901 mm reach (25 + 455 + 421.5)
// but should be checked against the robot model in KUKA|prc.
// The angle mapping below (A2 = -shoulder, A3 = -elbow, A5 = -wrist, with the
// forearm offset folded in) is this demo's planar approximation.
const KUKA_FOREARM = Math.hypot(420, 35);
const KUKA_TOOL = 80 + 150; // flange plus an assumed 150 mm parallel gripper

export const ROBOTS: Robot[] = [
  {
    id: "kuka",
    name: "KUKA KR 6 R900",
    kind: "planar3",
    shoulder: [25, 400],
    links: [455, KUKA_FOREARM, KUKA_TOOL],
    limits: [
      [-45, 190], // -A2
      [-156, 120], // -A3
      [-120, 120], // -A5
    ],
    gripperMax: 80,
  },
  {
    id: "desk",
    name: "Desktop 6-axis",
    kind: "planar3",
    shoulder: [0, 120],
    links: [260, 240, 120],
    limits: [
      [0, 180],
      [-150, 150],
      [-110, 110],
    ],
    gripperMax: 60,
  },
  {
    id: "nowrist",
    name: "No wrist",
    kind: "planar2",
    shoulder: [0, 150],
    links: [330, 380],
    limits: [
      [0, 180],
      [-150, 150],
    ],
    gripperMax: 90,
  },
  {
    id: "scara",
    name: "SCARA",
    kind: "scara",
    shoulder: [0, 0],
    links: [],
    limits: [],
    reach: [180, 650],
    stroke: [20, 320],
    gripperMax: 50,
  },
  {
    id: "short",
    name: "Short reach",
    kind: "planar3",
    shoulder: [0, 100],
    links: [180, 170, 100],
    limits: [
      [0, 180],
      [-150, 150],
      [-120, 120],
    ],
    gripperMax: 110,
  },
];

// ─── Scene ────────────────────────────────────────────────────────────────────

export const OBJECT_HEIGHT = 60;
export const PICK: [number, number] = [430, OBJECT_HEIGHT / 2];
export const SHELF = { x0: 560, x1: 760, z: 280 };
export const PLACE: [number, number] = [660, SHELF.z + OBJECT_HEIGHT / 2];

export const DOWN = -90; // tool pointing straight down, degrees
export const TILT_TOL = 10; // how far from straight down still counts as level

export type Pt = [number, number];

export function defaultPath(): Pt[] {
  const pts: Pt[] = [];
  const lift: Pt = [PICK[0], 230];
  const over: Pt = [PLACE[0], PLACE[1] + 120];
  // pick -> lift -> arc -> over -> place
  for (let i = 0; i <= 10; i++) pts.push([PICK[0], PICK[1] + ((lift[1] - PICK[1]) * i) / 10]);
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const x = lift[0] + (over[0] - lift[0]) * t;
    const z = lift[1] + (over[1] - lift[1]) * t + Math.sin(Math.PI * t) * 90;
    pts.push([x, z]);
  }
  for (let i = 1; i <= 8; i++) pts.push([PLACE[0], over[1] - ((over[1] - PLACE[1]) * i) / 8]);
  return pts;
}

// Resample a polyline to n points evenly spaced by arc length.
export function resample(path: Pt[], n: number): Pt[] {
  if (path.length < 2) return path;
  const d = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = d.at(-1)!;
  if (total === 0) return Array.from({ length: n }, () => path[0]);
  const out: Pt[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (j < path.length - 1 && d[j] < s) j++;
    const f = (s - d[j - 1]) / Math.max(1e-9, d[j] - d[j - 1]);
    out.push([path[j - 1][0] + (path[j][0] - path[j - 1][0]) * f, path[j - 1][1] + (path[j][1] - path[j - 1][1]) * f]);
  }
  return out;
}

// ─── Kinematics ───────────────────────────────────────────────────────────────

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export type Failure = "reach" | "limit" | "tilt" | "table" | "grip";

export const FAILURE_LABEL: Record<Failure, string> = {
  reach: "out of reach",
  limit: "joint limit",
  tilt: "can't keep it level",
  table: "hits table or shelf",
  grip: "object too wide",
};

export interface Pose {
  joints: number[]; // relative joint angles, degrees (scara: [r, z])
  points: Pt[]; // joint positions from base to tool tip, for drawing
  tool: number; // tool angle, degrees
}

export type Step = { ok: true; pose: Pose } | { ok: false; why: Failure; pose: Pose | null };

function fk(robot: Robot, joints: number[]): Pose {
  if (robot.kind === "scara") {
    const [r, z] = joints;
    return { joints, points: [[0, 0], [0, z + 60], [r, z + 60], [r, z]], tool: DOWN };
  }
  const pts: Pt[] = [[robot.shoulder[0], 0], robot.shoulder];
  let a = 0;
  let [x, z] = robot.shoulder;
  robot.links.forEach((L, i) => {
    a += joints[i];
    x += L * Math.cos(rad(a));
    z += L * Math.sin(rad(a));
    pts.push([x, z]);
  });
  return { joints, points: pts, tool: a };
}

function within(robot: Robot, joints: number[]) {
  return joints.every((q, i) => q >= robot.limits[i][0] - 1e-6 && q <= robot.limits[i][1] + 1e-6);
}

// Both elbow solutions of a 2-link arm reaching (x, z) from the origin.
function twoLink(L1: number, L2: number, x: number, z: number): [number, number][] | null {
  const c = (x * x + z * z - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  if (c < -1 - 1e-9 || c > 1 + 1e-9) return null;
  const cc = Math.max(-1, Math.min(1, c));
  return [1, -1].map((s) => {
    const q2 = s * Math.acos(cc);
    const q1 = Math.atan2(z, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
    return [wrap(deg(q1)), deg(q2)] as [number, number];
  });
}

const dist = (a: number[], b: number[] | null) => (b ? a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) : 0);

// Shelf board (z from SHELF.z - 10 to SHELF.z) and its leg, as boxes.
const OBSTACLES: [number, number, number, number][] = [
  [SHELF.x0, SHELF.x1, SHELF.z - 10, SHELF.z],
  [SHELF.x1 - 14, SHELF.x1 - 6, 0, SHELF.z],
];

function hitsObstacle([ax, az]: Pt, [bx, bz]: Pt) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8));
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const z = az + ((bz - az) * i) / n;
    if (z < -1) return true;
    if (OBSTACLES.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) return true;
  }
  return false;
}

function aboveTable(pose: Pose) {
  // No link may pass below the table top or through the shelf.
  const pts = pose.points;
  for (let i = 1; i < pts.length - 1; i++) if (hitsObstacle(pts[i], pts[i + 1])) return false;
  return true;
}

// Best effort for an unreachable target: point the whole chain at it, or clamp
// the SCARA to its travel. Only used for drawing a failed step.
function stretch(robot: Robot, [tx, tz]: Pt): Pose {
  if (robot.kind === "scara") {
    const [rMin, rMax] = robot.reach!;
    const [zMin, zMax] = robot.stroke!;
    return fk(robot, [Math.max(rMin, Math.min(rMax, tx)), Math.max(zMin, Math.min(zMax, tz))]);
  }
  const a = deg(Math.atan2(tz - robot.shoulder[1], tx - robot.shoulder[0]));
  return fk(robot, robot.links.map((_, i) => (i === 0 ? a : 0)));
}

// Solve one target. prev keeps the arm on the same branch as the last step.
export function solve(robot: Robot, target: Pt, prev: number[] | null): Step {
  const [tx, tz] = target;

  if (robot.kind === "scara") {
    const r = tx;
    const [rMin, rMax] = robot.reach!;
    const [zMin, zMax] = robot.stroke!;
    if (r < rMin || r > rMax || tz < zMin || tz > zMax) return { ok: false, why: "reach", pose: stretch(robot, target) };
    const pose = fk(robot, [r, tz]);
    if (!aboveTable(pose)) return { ok: false, why: "table", pose };
    return { ok: true, pose };
  }

  const [sx, sz] = robot.shoulder;
  if (robot.kind === "planar2") {
    const sols = twoLink(robot.links[0], robot.links[1], tx - sx, tz - sz);
    if (!sols) return { ok: false, why: "reach", pose: stretch(robot, target) };
    const legal = sols.filter((q) => within(robot, q)).sort((a, b) => dist(a, prev) - dist(b, prev));
    if (!legal.length) return { ok: false, why: "limit", pose: fk(robot, sols[0]) };
    const pose = fk(robot, legal[0]);
    if (!aboveTable(pose)) return { ok: false, why: "table", pose };
    if (Math.abs(wrap(pose.tool - DOWN)) > TILT_TOL) return { ok: false, why: "tilt", pose };
    return { ok: true, pose };
  }

  // planar3: try tool angles nearest straight down first, out to 45 degrees.
  const [L1, L2, L3] = robot.links;
  let anyReach = false;
  let worst: Failure = "reach";
  let fallback: Pose | null = null;
  const tilts = [0];
  for (let t = 2; t <= 45; t += 2) tilts.push(t, -t);
  for (const t of tilts) {
    const phi = DOWN + t;
    const wx = tx - L3 * Math.cos(rad(phi)) - sx;
    const wz = tz - L3 * Math.sin(rad(phi)) - sz;
    const sols = twoLink(L1, L2, wx, wz);
    if (!sols) continue;
    anyReach = true;
    const cands = sols
      .map(([q1, q2]) => [q1, q2, wrap(phi - q1 - q2)])
      .sort((a, b) => dist(a, prev) - dist(b, prev));
    for (const q of cands) {
      const pose = fk(robot, q);
      if (!within(robot, q)) {
        fallback ??= pose;
        worst = worst === "reach" ? "limit" : worst;
        continue;
      }
      if (!aboveTable(pose)) {
        fallback ??= pose;
        worst = "table";
        continue;
      }
      if (Math.abs(t) > TILT_TOL) return { ok: false, why: "tilt", pose };
      return { ok: true, pose };
    }
  }
  return { ok: false, why: anyReach ? worst : "reach", pose: fallback ?? stretch(robot, target) };
}

export interface Run {
  steps: Step[];
  firstFail: number | null; // index of the first failed step
  why: Failure | null;
}

export function run(robot: Robot, path: Pt[], objectWidth: number): Run {
  const steps: Step[] = [];
  let prev: number[] | null = null;
  for (const p of path) {
    const s = solve(robot, p, prev);
    steps.push(s);
    if (s.ok) prev = s.pose.joints;
  }
  if (objectWidth > robot.gripperMax && steps.length) {
    const s0 = steps[0];
    steps[0] = { ok: false, why: "grip", pose: s0.pose };
  }
  const firstFail = steps.findIndex((s) => !s.ok);
  return { steps, firstFail: firstFail === -1 ? null : firstFail, why: firstFail === -1 ? null : (steps[firstFail] as { why: Failure }).why };
}

// ─── KRL export ───────────────────────────────────────────────────────────────
// Axis-specific PTP moves for the KUKA, the same language KUKA|prc compiles
// Grasshopper toolpaths into. Only the solved prefix of the path is exported.

const HOME = "{A1 0,A2 -90,A3 90,A4 0,A5 0,A6 0}";

export function toKrl(r: Run, every = 6): string {
  const okSteps = r.steps.slice(0, r.firstFail ?? r.steps.length).filter((s): s is Extract<Step, { ok: true }> => s.ok);
  const picked = okSteps.filter((_, i) => i % every === 0 || i === okSteps.length - 1);
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  const moves = picked.map((s) => {
    const [q1, q2, q3] = s.pose.joints;
    return `PTP {A1 0,A2 ${f(-q1)},A3 ${f(-q2)},A4 0,A5 ${f(-q3)},A6 0} C_PTP`;
  });
  return [
    "DEF dream_retarget( )",
    "; Generated at armaankazi.com/demos/dream-labs from a planar model of a KR 6 R900.",
    "; A1, A4 and A6 are held at 0. Link lengths are unverified: simulate in KUKA|prc first.",
    r.firstFail === null ? "; Full path solved." : `; Path cut at step ${r.firstFail}: ${FAILURE_LABEL[r.why!]}.`,
    "BAS (#INITMOV,0)",
    "BAS (#VEL_PTP,20)",
    `PTP ${HOME}`,
    ...moves,
    `PTP ${HOME}`,
    "END",
    "",
  ].join("\n");
}
