// ─── Calibration utilities ────────────────────────────────────────────────────
// Saves personal ASL landmark vectors per letter to localStorage.
// Normalization: translate to wrist origin, scale by wrist→MCP9 distance, XY only.
// This makes vectors position- and scale-invariant; Z ignored (handpose depth is noisy).

export const CALIBRATION_KEY     = "asl_flow_calibration";
export const SEP_VECS_KEY        = "asl_flow_sep_vecs";
export const CUSTOM_GESTURES_KEY = "asl_flow_custom_gestures";
export const PHRASE_LIBRARY_KEY  = "asl_flow_phrase_library";

/** Distance cutoff for phrase library matches - more eager than letter calibration. */
export const PHRASE_THRESHOLD = 0.18;
export const CALIB_THRESHOLD     = 0.15; // Euclidean distance cutoff for personal match

// kept for backwards compat; prefer samplesNeeded(letter)
export const SNAPSHOTS_NEEDED = 5;

export const SAMPLES_DEFAULT  = 5;
export const SAMPLES_CONFUSED = 8;

// Letters available for calibration (no J or Z - require motion)
export const CALIB_LETTERS = [
  "A","B","C","D","E","F","G","H","I","K","L","M",
  "N","O","P","Q","R","S","T","U","V","W","X","Y",
] as const;

export type CalibLetter = typeof CALIB_LETTERS[number];

// Pairs of letters that look similar and need disambiguation
export const CONFUSION_PAIRS: [string, string][] = [
  ["A", "S"], ["A", "E"], ["S", "E"],
  ["M", "N"], ["G", "H"], ["D", "F"],
  ["U", "V"], ["K", "P"],
];

export interface CalibrationEntry {
  letter: string;
  normalized: number[];   // 42 values: (x, y) × 21 landmarks
  timestamp: number;
}

export type CalibrationMap = Record<string, CalibrationEntry>;

export interface SeparationVector {
  letterA: string;
  letterB: string;
  vector: number[];  // centroid_A - centroid_B
}

export interface CustomGesture {
  id: string;
  name: string;    // display label
  output: string;  // text emitted when matched
  normalized: number[];
  timestamp: number;
}

export interface PhraseEntry {
  id: string;
  name: string;          // user-facing label, e.g. "Thumbs up"
  phrase: string;        // text to output, e.g. "Sounds good!"
  landmarks: number[];   // 42-dim normalized flat vector (same layout as CalibrationEntry)
  createdAt: string;     // ISO date string
  timesTriggered: number;
}

export interface DisambiguationResult {
  letter: string;
  distance: number;
  disambiguated: boolean;
  candidates?: [string, string];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Recent samples weighted higher: last sample is worth ~2× first sample.
const WEIGHTS_5 = [0.15, 0.17, 0.18, 0.22, 0.28];
const WEIGHTS_8 = [0.07, 0.09, 0.10, 0.12, 0.13, 0.15, 0.16, 0.18];

/** How many calibration samples a letter should collect. */
export function samplesNeeded(letter: string): number {
  const confused = CONFUSION_PAIRS.some(([a, b]) => a === letter || b === letter);
  return confused ? SAMPLES_CONFUSED : SAMPLES_DEFAULT;
}

/** All letters that can be confused with the given letter. */
export function confusionPartners(letter: string): string[] {
  const result: string[] = [];
  for (const [a, b] of CONFUSION_PAIRS) {
    if (a === letter) result.push(b);
    if (b === letter) result.push(a);
  }
  return result;
}

/** Normalize raw handpose landmarks to a position- and scale-invariant 42-dim vector. */
export function normalizeLandmarks(raw: [number, number, number][]): number[] {
  const [wx, wy] = raw[0];
  const [mx, my] = raw[9];
  const scale = Math.sqrt((mx - wx) ** 2 + (my - wy) ** 2) || 1;
  const flat: number[] = [];
  for (const [x, y] of raw) {
    flat.push((x - wx) / scale, (y - wy) / scale);
  }
  return flat;
}

/** Euclidean distance between two equal-length vectors. */
export function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Uniform average of multiple vectors. */
export function averageVectors(vecs: number[][]): number[] {
  const len = vecs[0].length;
  const n   = vecs.length;
  const avg = new Array<number>(len).fill(0);
  for (const v of vecs) for (let i = 0; i < len; i++) avg[i] += v[i] / n;
  return avg;
}

/**
 * Weighted average with recent samples weighted higher.
 * Supports 5- or 8-sample arrays; falls back to uniform for other counts.
 */
export function weightedAverageVectors(vecs: number[][]): number[] {
  const n       = vecs.length;
  const weights = n === 5 ? WEIGHTS_5 : n === 8 ? WEIGHTS_8 : null;
  if (!weights) return averageVectors(vecs);
  const len = vecs[0].length;
  const avg = new Array<number>(len).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < len; j++) avg[j] += vecs[i][j] * weights[i];
  }
  return avg;
}

// ── Calibration storage ───────────────────────────────────────────────────────

export function loadCalibration(): CalibrationMap {
  try {
    const s = localStorage.getItem(CALIBRATION_KEY);
    return s ? (JSON.parse(s) as CalibrationMap) : {};
  } catch { return {}; }
}

export function saveCalibration(map: CalibrationMap): void {
  try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function clearCalibration(): void {
  try { localStorage.removeItem(CALIBRATION_KEY); } catch { /* ignore */ }
}

// ── Separation vector storage ─────────────────────────────────────────────────

export function loadSeparationVectors(): SeparationVector[] {
  try {
    const s = localStorage.getItem(SEP_VECS_KEY);
    return s ? (JSON.parse(s) as SeparationVector[]) : [];
  } catch { return []; }
}

export function saveSeparationVectors(vecs: SeparationVector[]): void {
  try { localStorage.setItem(SEP_VECS_KEY, JSON.stringify(vecs)); } catch { /* ignore */ }
}

export function clearSeparationVectors(): void {
  try { localStorage.removeItem(SEP_VECS_KEY); } catch { /* ignore */ }
}

// ── Custom gesture storage ────────────────────────────────────────────────────

export function loadCustomGestures(): CustomGesture[] {
  try {
    const s = localStorage.getItem(CUSTOM_GESTURES_KEY);
    return s ? (JSON.parse(s) as CustomGesture[]) : [];
  } catch { return []; }
}

export function saveCustomGestures(gestures: CustomGesture[]): void {
  try { localStorage.setItem(CUSTOM_GESTURES_KEY, JSON.stringify(gestures)); } catch { /* ignore */ }
}

export function clearCustomGestures(): void {
  try { localStorage.removeItem(CUSTOM_GESTURES_KEY); } catch { /* ignore */ }
}

// ── Phrase library storage ────────────────────────────────────────────────────

export function loadPhraseLibrary(): PhraseEntry[] {
  try {
    const s = localStorage.getItem(PHRASE_LIBRARY_KEY);
    return s ? (JSON.parse(s) as PhraseEntry[]) : [];
  } catch { return []; }
}

export function savePhraseLibrary(entries: PhraseEntry[]): void {
  try { localStorage.setItem(PHRASE_LIBRARY_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

/** Match against phrase library - highest detection priority. */
export function matchPhrase(
  normalized: number[],
  library: PhraseEntry[],
): { entry: PhraseEntry; distance: number } | null {
  let best: PhraseEntry | null = null;
  let bestDist = Infinity;
  for (const entry of library) {
    const d = euclidean(normalized, entry.landmarks);
    if (d < bestDist) { bestDist = d; best = entry; }
  }
  if (best && bestDist < PHRASE_THRESHOLD) return { entry: best, distance: bestDist };
  return null;
}

// ── Detection ─────────────────────────────────────────────────────────────────

/** Match against custom gestures (highest priority). */
export function matchCustom(
  normalized: number[],
  gestures: CustomGesture[],
): { gesture: CustomGesture; distance: number } | null {
  let best: CustomGesture | null = null;
  let bestDist = Infinity;
  for (const g of gestures) {
    const d = euclidean(normalized, g.normalized);
    if (d < bestDist) { bestDist = d; best = g; }
  }
  if (best && bestDist < CALIB_THRESHOLD) return { gesture: best, distance: bestDist };
  return null;
}

/**
 * Find the best-matching personal sign for the given normalized vector.
 * Returns { letter, distance } if a match is found under CALIB_THRESHOLD,
 * otherwise returns null (caller should fall back to fingerpose).
 */
export function matchPersonal(
  normalized: number[],
  map: CalibrationMap,
): { letter: string; distance: number } | null {
  let bestLetter = "";
  let bestDist   = Infinity;
  for (const [letter, entry] of Object.entries(map)) {
    const d = euclidean(normalized, entry.normalized);
    if (d < bestDist) { bestDist = d; bestLetter = letter; }
  }
  if (bestLetter && bestDist < CALIB_THRESHOLD) return { letter: bestLetter, distance: bestDist };
  return null;
}

/**
 * Like matchPersonal, but uses separation vectors to break ties when two
 * candidates are within 15% of each other in distance.
 */
export function matchPersonalWithDisambiguation(
  normalized: number[],
  map: CalibrationMap,
  sepVecs: SeparationVector[],
): DisambiguationResult | null {
  const entries = Object.entries(map);
  if (entries.length === 0) return null;

  const scored = entries
    .map(([letter, entry]) => ({ letter, distance: euclidean(normalized, entry.normalized) }))
    .sort((a, b) => a.distance - b.distance);

  const best = scored[0];
  if (best.distance >= CALIB_THRESHOLD) return null;

  if (scored.length >= 2) {
    const second = scored[1];
    const margin = (second.distance - best.distance) / best.distance;

    if (margin < 0.15 && second.distance < CALIB_THRESHOLD) {
      const sepVec = sepVecs.find(
        sv =>
          (sv.letterA === best.letter && sv.letterB === second.letter) ||
          (sv.letterA === second.letter && sv.letterB === best.letter),
      );

      if (sepVec) {
        const centA = map[sepVec.letterA]?.normalized;
        const centB = map[sepVec.letterB]?.normalized;
        if (centA && centB) {
          // Project onto the A→B axis; winner is whichever centroid is closest
          let dotInput = 0, dotA = 0, dotB = 0;
          for (let i = 0; i < normalized.length; i++) {
            dotInput += normalized[i] * sepVec.vector[i];
            dotA     += centA[i]      * sepVec.vector[i];
            dotB     += centB[i]      * sepVec.vector[i];
          }
          const winner =
            Math.abs(dotInput - dotA) < Math.abs(dotInput - dotB)
              ? sepVec.letterA
              : sepVec.letterB;
          return {
            letter: winner,
            distance: best.distance,
            disambiguated: true,
            candidates: [sepVec.letterA, sepVec.letterB],
          };
        }
      }
    }
  }

  return { letter: best.letter, distance: best.distance, disambiguated: false };
}
