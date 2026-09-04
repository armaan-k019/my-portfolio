// Prospect game engine. Pure functions, no React. The page owns state and calls
// into here; the API route reads the same shapes to brief the decision engine.

export const GRID = 8;
export const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const START_BUDGET = 2_000_000;
export const DEPOSIT_COUNT = 2;

export type SurveyKind = "magnetics" | "gravity" | "radiometric" | "geochem" | "drill";
export type Depth = "surface" | "deep";
export type Mode = "learner" | "terranox";

export interface SurveySpec {
  kind: SurveyKind;
  label: string;
  short: string;
  cost: number;
  coverage: "cell" | "block3";
  reads: string;
  signal: string;
  quality: string;
  color: string;
  // What it maps to in a real uranium program.
  real: string;
}

export const SURVEYS: Record<SurveyKind, SurveySpec> = {
  magnetics: {
    kind: "magnetics", label: "Airborne magnetics", short: "MAG", cost: 50_000, coverage: "block3",
    reads: "Structural anomalies across a 3 by 3 block",
    signal: "warm or cold per cell", quality: "Wide net, maps structure not ore", color: "#3b82f6",
    real: "A fixed wing or helicopter magnetometer flown over the whole tenement. It maps basement structure, faults, and basin margins, which is where uranium tends to sit, but it cannot see uranium itself. Cheap per square kilometre and the first thing a real program runs.",
  },
  gravity: {
    kind: "gravity", label: "Ground gravity", short: "GRV", cost: 200_000, coverage: "cell",
    reads: "Density contrast at mid depth",
    signal: "anomaly or none", quality: "Moderate precision, best on buried basins", color: "#a855f7",
    real: "A crew walks a station grid with a gravimeter. Dense basement against lighter sediment shows up as a contrast, which locates the buried channels and unconformities that host deposits. Slow and expensive per station, so it is used to firm up a target, not to find one.",
  },
  radiometric: {
    kind: "radiometric", label: "Radiometric survey", short: "RAD", cost: 150_000, coverage: "cell",
    reads: "Gamma signature from uranium daughters",
    signal: "hit or miss", quality: "Very clean where it works, blind to buried ore", color: "#f59e0b",
    real: "A gamma spectrometer reads potassium, thorium, and uranium channels at the surface. A real uranium signature is close to unambiguous, but gamma travels only centimetres through rock, so a deposit under any cover reads as nothing. Superb for outcropping mineralisation, useless for a buried one.",
  },
  geochem: {
    kind: "geochem", label: "Geochem sampling", short: "GEO", cost: 75_000, coverage: "cell",
    reads: "Trace element halo within 200 m of surface",
    signal: "halo or none", quality: "Moderate, favours near surface targets", color: "#10b981",
    real: "Soil, stream sediment, or vegetation samples assayed for uranium and its pathfinders. Groundwater mobilises uranium, so a halo can sit above and around a deposit that is too deep for gamma. Noisier than radiometrics, but it sees a little further down.",
  },
  drill: {
    kind: "drill", label: "Drill hole", short: "DRL", cost: 250_000, coverage: "cell",
    reads: "Definitive presence or absence, full depth",
    signal: "intercept or barren", quality: "Ground truth", color: "#2d5a27",
    real: "A diamond or RC rig puts a hole through the target. This is the only way to know, and the only result an investor believes. It is also the most expensive single decision in the campaign, which is why everything else exists: to make sure this hole is the right one.",
  },
};

export interface Deposit { cell: string; depth: Depth; }

export interface SurveyResult {
  id: number;
  kind: SurveyKind;
  target: string;          // cell clicked
  cells: string[];         // cells covered
  readings: Record<string, string>; // per cell signal
  cost: number;
}

export interface GameState {
  seed: number;
  deposits: Deposit[];
  budget: number;
  results: SurveyResult[];
  found: string[];
  status: "playing" | "won" | "lost";
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellId(r: number, c: number) { return `${COLS[c]}${r + 1}`; }
export function parseCell(id: string): [number, number] {
  return [Number(id.slice(1)) - 1, COLS.indexOf(id[0] as (typeof COLS)[number])];
}
export function allCells(): string[] {
  const out: string[] = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) out.push(cellId(r, c));
  return out;
}
export function block3(center: string): string[] {
  const [r, c] = parseCell(center);
  const out: string[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < GRID && cc >= 0 && cc < GRID) out.push(cellId(rr, cc));
  }
  return out;
}
export function coverage(kind: SurveyKind, target: string): string[] {
  return SURVEYS[kind].coverage === "block3" ? block3(target) : [target];
}

// ─── Game creation ────────────────────────────────────────────────────────────

export function newGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  const rnd = mulberry32(seed);
  const cells = allCells();
  const deposits: Deposit[] = [];
  while (deposits.length < DEPOSIT_COUNT) {
    const cell = cells[Math.floor(rnd() * cells.length)];
    if (deposits.some((d) => d.cell === cell || block3(d.cell).includes(cell))) continue;
    deposits.push({ cell, depth: rnd() < 0.5 ? "surface" : "deep" });
  }
  return { seed, deposits, budget: START_BUDGET, results: [], found: [], status: "playing" };
}

// ─── Likelihoods. P(signal | deposit state). These are the geology. ──────────
// Each returns the probability of the "positive" reading.

const LIK = {
  magnetics:   { surface: 0.92, deep: 0.92, none: 0.08 },
  gravity:     { surface: 0.60, deep: 0.85, none: 0.20 },
  radiometric: { surface: 0.95, deep: 0.05, none: 0.03 },
  geochem:     { surface: 0.80, deep: 0.50, none: 0.20 },
} as const;

const POS: Record<Exclude<SurveyKind, "drill">, [string, string]> = {
  magnetics: ["warm", "cold"],
  gravity: ["anomaly", "none"],
  radiometric: ["hit", "miss"],
  geochem: ["halo", "none"],
};

const KIND_SALT: Record<SurveyKind, number> = { magnetics: 1, gravity: 2, radiometric: 3, geochem: 4, drill: 5 };

export function priorReading(state: GameState, kind: SurveyKind, cell: string): string | undefined {
  for (const r of state.results) if (r.kind === kind && r.readings[cell] !== undefined) return r.readings[cell];
  return undefined;
}

export function alreadyRun(state: GameState, kind: SurveyKind, target: string) {
  return state.results.some((r) => r.kind === kind && r.target === target);
}

// ─── Running a survey ─────────────────────────────────────────────────────────

export function runSurvey(state: GameState, kind: SurveyKind, target: string): GameState {
  const spec = SURVEYS[kind];
  if (state.status !== "playing" || state.budget < spec.cost) return state;
  if (alreadyRun(state, kind, target)) return state;
  const cells = coverage(kind, target);
  // A reading belongs to (survey kind, cell, seed). Flying the same ground
  // twice returns the same signal, which is why overlapping blocks add no
  // information about cells already read. The ground does not change.
  const readings: Record<string, string> = {};
  for (const cell of cells) {
    const prior = priorReading(state, kind, cell);
    if (prior !== undefined) { readings[cell] = prior; continue; }
    const dep = state.deposits.find((d) => d.cell === cell);
    if (kind === "drill") {
      readings[cell] = dep ? "intercept" : "barren";
      continue;
    }
    const [r, c] = parseCell(cell);
    const rnd = mulberry32(state.seed * 7919 + KIND_SALT[kind] * 104729 + r * 8 + c + 17);
    const p = dep ? LIK[kind][dep.depth] : LIK[kind].none;
    readings[cell] = rnd() < p ? POS[kind][0] : POS[kind][1];
  }
  const result: SurveyResult = { id: state.results.length + 1, kind, target, cells, readings, cost: spec.cost };
  const found = kind === "drill" && readings[target] === "intercept" && !state.found.includes(target)
    ? [...state.found, target] : state.found;
  const budget = state.budget - spec.cost;
  let status: GameState["status"] = "playing";
  if (found.length === DEPOSIT_COUNT) status = "won";
  else if (budget < Math.min(...Object.values(SURVEYS).map((s) => s.cost))) status = "lost";
  return { ...state, budget, results: [...state.results, result], found, status };
}

// ─── Belief. P(deposit in cell | all readings). Bayesian, independent cells. ─

const PRIOR = DEPOSIT_COUNT / (GRID * GRID);

export function belief(state: GameState): Record<string, number> {
  const prior = PRIOR;
  const out: Record<string, number> = {};
  for (const cell of allCells()) {
    let logOdds = Math.log(prior / (1 - prior));
    let decided: number | null = null;
    const seen = new Set<SurveyKind>();
    for (const res of state.results) {
      const reading = res.readings[cell];
      if (reading === undefined || seen.has(res.kind)) continue;
      seen.add(res.kind);
      if (res.kind === "drill") { decided = reading === "intercept" ? 1 : 0; continue; }
      const kind = res.kind as Exclude<SurveyKind, "drill">;
      const positive = reading === POS[kind][0];
      // Marginalise depth 50/50 for the deposit hypothesis.
      const pDep = 0.5 * LIK[kind].surface + 0.5 * LIK[kind].deep;
      const pNone = LIK[kind].none;
      const lr = positive ? pDep / pNone : (1 - pDep) / (1 - pNone);
      logOdds += Math.log(lr);
    }
    out[cell] = decided !== null ? decided : 1 / (1 + Math.exp(-logOdds));
  }
  return out;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Surveys are ranked by prospectivity weighted information gain per dollar: a
// bit learned about a cell you might drill is worth more than a bit about one
// you never would. The hole is a separate decision made on expected value: it
// is drilled when prospectivity clears cost over discovery value. A one step
// value of information cannot rank surveys here, since no single reading can
// carry a cell from the prior across break even; information on this block
// pays only in sequence, which is the point of the game.

function entropy(p: number) {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

export interface Candidate {
  kind: SurveyKind;
  target: string;
  cost: number;
  prospectivity: number;  // belief on the target cell
  infoGainBits: number;   // weighted expected entropy reduction across covered cells
  gainPerDollar: number;  // bits per $100k
  hitEV: number;          // for a hole: prospectivity x discovery value, less cost
}

export function candidates(state: GameState, allowed: SurveyKind[]): Candidate[] {
  const b = belief(state);
  const out: Candidate[] = [];
  const drilled = new Set(state.results.filter((r) => r.kind === "drill").map((r) => r.target));
  for (const kind of allowed) {
    const spec = SURVEYS[kind];
    if (spec.cost > state.budget) continue;
    for (const target of allCells()) {
      if (drilled.has(target)) continue;
      if (alreadyRun(state, kind, target)) continue;
      const cells = coverage(kind, target);
      let bits = 0;
      if (kind === "drill") {
        bits = entropy(b[target]);
      } else {
        const k = kind as Exclude<SurveyKind, "drill">;
        const pDep = 0.5 * LIK[k].surface + 0.5 * LIK[k].deep;
        const pNone = LIK[k].none;
        for (const cell of cells) {
          const p = b[cell];
          if (p === 0 || p === 1) continue;
          if (priorReading(state, kind, cell) !== undefined) continue;
          const pPos = p * pDep + (1 - p) * pNone;
          const postPos = (p * pDep) / pPos;
          const postNeg = (p * (1 - pDep)) / (1 - pPos);
          const w = Math.pow(p / PRIOR, PROSPECTIVITY_WEIGHT);
          bits += w * (entropy(p) - (pPos * entropy(postPos) + (1 - pPos) * entropy(postNeg)));
        }
      }
      out.push({
        kind, target, cost: spec.cost, prospectivity: b[target], infoGainBits: bits,
        gainPerDollar: (bits / spec.cost) * 100_000,
        hitEV: kind === "drill" ? b[target] * DISCOVERY_VALUE - spec.cost : 0,
      });
    }
  }
  return out.sort((x, y) => y.gainPerDollar - x.gainPerDollar);
}

export function bestMove(state: GameState, allowed: SurveyKind[]): Candidate | null {
  const list = candidates(state, allowed);
  if (!list.length) return null;
  const holes = list.filter((c) => c.kind === "drill").sort((x, y) => y.prospectivity - x.prospectivity);
  const surveys = list.filter((c) => c.kind !== "drill" && c.infoGainBits > 1e-4);
  // 1. A hole that is positive expected value is the move.
  if (holes.length && holes[0].hitEV > 0) return holes[0];
  // 2. Otherwise buy the best information available.
  if (surveys.length) return surveys[0];
  // 3. Nothing left to learn: the most prospective hole, since a campaign that
  //    stops with money in the bank has also lost.
  return holes[0] ?? list[0];
}

// What a discovery is worth to the campaign, in dollars. A hole is drilled
// when prospectivity clears drill cost over this value. Set by simulation.
export const DISCOVERY_VALUE = 1_136_364;
export const DRILL_THRESHOLD = SURVEYS.drill.cost / DISCOVERY_VALUE;
// Exponent on (prospectivity / prior) when weighting a cell's information gain.
export const PROSPECTIVITY_WEIGHT = 1;

// ─── Engine trajectory on the same seed, for the post mortem. ────────────────

export function engineTrajectory(seed: number, allowed: SurveyKind[]): GameState {
  let s = newGame(seed);
  let guard = 0;
  while (s.status === "playing" && guard++ < 40) {
    const m = bestMove(s, allowed);
    if (!m) break;
    s = runSurvey(s, m.kind, m.target);
  }
  // Out of affordable moves with a deposit still in the ground counts as a loss.
  return s.status === "playing" ? { ...s, status: "lost" } : s;
}

export function fmtMoney(n: number) {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}k`;
}
