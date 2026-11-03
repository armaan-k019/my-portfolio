// A scripted grasp policy run across randomized tabletop scenes. Pure
// TypeScript, no physics engine: each check below is a closed-form test
// (reach, perception error, grasp width, clearance, friction). The page and
// the API route both import it, so the server recomputes the same episodes
// from a seed instead of trusting episode logs sent by the browser.

export const EPISODES = 48;
export const DEFAULT_SEED = 7;

// Arm geometry, meters. The gripper always points straight down.
export const SHOULDER_Y = 0.12;
export const L1 = 0.32;
export const L2 = 0.28;
export const GRIP_LEN = 0.1;
export const MAX_OPEN = 0.085;
export const WRIST_LIMIT = Math.PI / 4;
export const BIN = { x: -0.05, z: 0.34 };

const PREGRASP = 0.12;
const FINGER_CLEARANCE = 0.012;
const FINGERTIP_OVER_TABLE = 0.015;
const GRIP_FORCE = 8;
const LIFT_ACCEL = 2;
const DISTRACTOR_R = 0.03;

export type Symptom = "ik_fail" | "too_wide" | "contact" | "empty_close" | "slip";

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  ik_fail: "IK failed",
  too_wide: "jaw too narrow",
  contact: "contact on descent",
  empty_close: "closed on nothing",
  slip: "dropped in lift",
};

export interface Scene {
  id: string;
  x: number;
  z: number;
  w: number; // along the object's local x
  d: number; // along the object's local z
  h: number;
  yaw: number;
  mass: number;
  friction: number;
  light: number; // 0.3 to 1
  distractor: { x: number; z: number } | null;
}

export interface Episode {
  scene: Scene;
  ok: boolean;
  symptom: Symptom | null;
  log: string; // what the policy's own logger would record, symptom only
  est: { x: number; z: number };
  perceptionErr: number;
  occluded: boolean;
  wristYaw: number;
  graspWidth: number;
  gripRatio: number; // grip force needed over grip force available
}

export interface FailureMode {
  name: string;
  cause: string;
  fix: string;
  episodes: string[];
}

export interface Grouping {
  summary: string;
  modes: FailureMode[];
}

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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Horizontal reach at a given wrist height, from the two-link arm.
export function reachable(r: number, wristY: number): boolean {
  const dz = wristY - SHOULDER_Y;
  return Math.hypot(r, dz) <= L1 + L2 - 0.002;
}

export function makeScenes(seed: number): Scene[] {
  const rand = rng(seed);
  return Array.from({ length: EPISODES }, (_, i) => {
    const r = lerp(0.2, 0.63, rand());
    const ang = lerp(-1.1, 1.1, rand());
    const x = r * Math.cos(ang);
    const z = r * Math.sin(ang);
    const flat = rand() < 0.15;
    const w = lerp(0.03, 0.13, rand());
    const d = lerp(0.03, 0.06, rand());
    const h = flat ? lerp(0.008, 0.018, rand()) : lerp(0.04, 0.12, rand());
    let distractor: Scene["distractor"] = null;
    if (rand() < 0.45) {
      const dr = lerp(0.065, 0.13, rand());
      const da = rand() * Math.PI * 2;
      distractor = { x: x + dr * Math.cos(da), z: z + dr * Math.sin(da) };
    }
    return {
      id: `e${String(i + 1).padStart(2, "0")}`,
      x,
      z,
      w,
      d,
      h,
      yaw: rand() * Math.PI,
      mass: lerp(0.08, 1.1, rand()),
      friction: lerp(0.2, 0.9, rand()),
      light: lerp(0.3, 1, rand()),
      distractor,
    };
  });
}

// The camera sits at the base. A distractor nearer the base and within about
// 7 degrees of the object's bearing blocks part of the view.
function isOccluded(s: Scene): boolean {
  if (!s.distractor) return false;
  const r = Math.hypot(s.x, s.z);
  const dr = Math.hypot(s.distractor.x, s.distractor.z);
  const diff = Math.abs(Math.atan2(s.z, s.x) - Math.atan2(s.distractor.z, s.distractor.x));
  return dr < r && diff < 0.12;
}

const wrapHalfPi = (a: number) => {
  let v = a % Math.PI;
  if (v > Math.PI / 2) v -= Math.PI;
  if (v < -Math.PI / 2) v += Math.PI;
  return v;
};

export function runPolicy(s: Scene, seed: number): Episode {
  const rand = rng(seed * 1000 + Number(s.id.slice(1)));
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
  const occluded = isOccluded(s);
  const sigma = 0.004 / s.light + (occluded ? 0.016 : 0);
  const est = { x: s.x + gauss() * sigma, z: s.z + gauss() * sigma };
  const perceptionErr = Math.hypot(est.x - s.x, est.z - s.z);

  // Close across the object's short side. The jaws close along the gripper's
  // local z; base yaw is atan2(-z, x), so the jaw axis yaw equals base yaw.
  const baseYaw = Math.atan2(-est.z, est.x);
  const shortAxisYaw = s.w < s.d ? s.yaw : s.yaw + Math.PI / 2;
  const wanted = wrapHalfPi(shortAxisYaw - baseYaw - Math.PI / 2);
  const wristYaw = Math.max(-WRIST_LIMIT, Math.min(WRIST_LIMIT, wanted));
  const miss = Math.abs(wanted - wristYaw);
  const short = Math.min(s.w, s.d);
  const long = Math.max(s.w, s.d);
  const graspWidth = short * Math.abs(Math.cos(miss)) + long * Math.abs(Math.sin(miss));

  const contactMu = s.h < FINGERTIP_OVER_TABLE + 0.006 ? s.friction * 0.35 : s.friction;
  const gripRatio = (s.mass * (9.81 + LIFT_ACCEL)) / (2 * contactMu * GRIP_FORCE);

  const base = { scene: s, est, perceptionErr, occluded, wristYaw, graspWidth, gripRatio };
  const r = Math.hypot(est.x, est.z);
  const cm = (v: number) => (v * 100).toFixed(1);

  if (!reachable(r, s.h + GRIP_LEN + PREGRASP)) {
    return { ...base, ok: false, symptom: "ik_fail", log: `no IK solution for pregrasp at ${cm(r)} cm` };
  }
  if (graspWidth > MAX_OPEN) {
    return { ...base, ok: false, symptom: "too_wide", log: `jaw span ${cm(graspWidth)} cm needed, max ${cm(MAX_OPEN)} cm` };
  }
  if (s.distractor) {
    const gap = Math.hypot(s.distractor.x - est.x, s.distractor.z - est.z);
    if (gap < MAX_OPEN / 2 + FINGER_CLEARANCE + DISTRACTOR_R) {
      return { ...base, ok: false, symptom: "contact", log: `wrist force spike on descent, ${cm(gap)} cm from target` };
    }
  }
  if (perceptionErr > (MAX_OPEN - graspWidth) / 2) {
    return { ...base, ok: false, symptom: "empty_close", log: "jaws closed fully, no object between fingers" };
  }
  if (gripRatio > 1) {
    return { ...base, ok: false, symptom: "slip", log: "object lost contact during lift" };
  }
  return { ...base, ok: true, symptom: null, log: "placed in bin" };
}

export function runAll(seed: number): Episode[] {
  return makeScenes(seed).map((s) => runPolicy(s, seed));
}

// The fallback grouping, shown before Claude answers or if it cannot: one
// mode per logged symptom. It cannot tell two causes of one symptom apart.
export function groupBySymptom(episodes: Episode[]): Grouping {
  const failed = episodes.filter((e) => !e.ok);
  const order: Symptom[] = ["empty_close", "slip", "contact", "too_wide", "ik_fail"];
  const modes = order
    .map((sym) => ({
      name: SYMPTOM_LABEL[sym],
      cause: "Grouped by logged symptom only.",
      fix: "",
      episodes: failed.filter((e) => e.symptom === sym).map((e) => e.scene.id),
    }))
    .filter((m) => m.episodes.length > 0);
  return { summary: "", modes };
}

// One line per failed episode: scene parameters plus the policy's log line.
// This is everything Claude sees.
export function renderFailures(episodes: Episode[]): string {
  const rows = episodes
    .filter((e) => !e.ok)
    .map((e) => {
      const s = e.scene;
      const dist = s.distractor ? `${(Math.hypot(s.distractor.x - s.x, s.distractor.z - s.z) * 100).toFixed(0)}cm away` : "none";
      return [
        s.id,
        `reach ${(Math.hypot(s.x, s.z) * 100).toFixed(0)}cm`,
        `size ${(s.w * 100).toFixed(1)}x${(s.d * 100).toFixed(1)}x${(s.h * 100).toFixed(1)}cm`,
        `mass ${(s.mass * 1000).toFixed(0)}g`,
        `friction ${s.friction.toFixed(2)}`,
        `light ${(s.light * 100).toFixed(0)}%`,
        `other object ${dist}${e.occluded ? ", between camera and target" : ""}`,
        `pose error ${(e.perceptionErr * 100).toFixed(1)}cm`,
        `wrist ${((e.wristYaw * 180) / Math.PI).toFixed(0)}deg`,
        `log: ${e.log}`,
      ].join(" | ");
    });
  const ok = episodes.filter((e) => e.ok).length;
  return `${episodes.length} episodes, ${ok} succeeded. Failed episodes:\n${rows.join("\n")}`;
}
