// Topography computation for the topo layer.
// SPEC section 9 "topo", PHASE-1 step 1.4.
// Pure geometry. d3-contour is imported here, not in the source module.

import { contours } from "d3-contour";
import { fromLocal } from "./geo";
import type { LatLng, LocalPoint, TopoData } from "./types";

/** Candidate contour intervals in metres, tried in this order. */
const CANDIDATE_INTERVALS_M = [1, 2, 5, 10];
/** The line count band the chosen interval aims for. */
const MIN_LINES = 4;
const MAX_LINES = 20;

/** The 21 x 21 grid at 40 m spacing, row major, north to south, west to east. */
export function gridPoints(
  origin: LatLng,
  n: number,
  spacingM: number,
): LatLng[] {
  const half = ((n - 1) / 2) * spacingM;
  const points: LatLng[] = [];
  for (let row = 0; row < n; row++) {
    const y = half - row * spacingM;
    for (let col = 0; col < n; col++) {
      const x = col * spacingM - half;
      points.push(fromLocal(x, y, origin));
    }
  }
  return points;
}

/**
 * Grid index space to local metres. Row 0 is the north edge. d3-contour closes
 * rings on a one cell border outside the sampled grid, so indices are clamped
 * to the sampled extent: no contour coordinate carries data from outside it.
 */
function toLocalFromGrid(
  gx: number,
  gy: number,
  n: number,
  spacingM: number,
): LocalPoint {
  const half = (n - 1) / 2;
  const clamp = (value: number): number =>
    Math.min(n - 1, Math.max(0, value));
  return [(clamp(gx) - half) * spacingM, (half - clamp(gy)) * spacingM];
}

function finiteValues(values: Array<number | null>): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

function thresholdsFor(
  min: number,
  max: number,
  intervalM: number,
): number[] {
  const first = Math.ceil(min / intervalM) * intervalM;
  const last = Math.floor(max / intervalM) * intervalM;
  const out: number[] = [];
  for (let t = first; t <= last + 1e-9; t += intervalM) {
    out.push(Number(t.toFixed(6)));
  }
  return out;
}

function linesAt(
  grid: number[],
  n: number,
  spacingM: number,
  thresholds: number[],
): LocalPoint[][] {
  if (thresholds.length === 0) return [];
  const generated = contours().size([n, n]).thresholds(thresholds)(grid);
  const lines: LocalPoint[][] = [];
  for (const multi of generated) {
    for (const polygon of multi.coordinates) {
      for (const ring of polygon) {
        lines.push(
          ring.map(([gx, gy]) => toLocalFromGrid(gx, gy, n, spacingM)),
        );
      }
    }
  }
  return lines;
}

/**
 * Marching squares through d3-contour with thresholds chosen from 1, 2, 5, 10 m
 * so there are 4 to 20 lines. Coordinates come back in local metres.
 */
export function contourLines(
  values: Array<number | null>,
  n: number,
  spacingM: number,
): { intervalM: number; lines: LocalPoint[][] } {
  const present = finiteValues(values);
  const fallbackInterval =
    CANDIDATE_INTERVALS_M[CANDIDATE_INTERVALS_M.length - 1];
  if (present.length === 0) return { intervalM: fallbackInterval, lines: [] };

  const min = Math.min(...present);
  const max = Math.max(...present);
  const grid = values.map((value) =>
    typeof value === "number" && Number.isFinite(value) ? value : NaN,
  );

  const attempts = CANDIDATE_INTERVALS_M.map((intervalM) => ({
    intervalM,
    lines: linesAt(grid, n, spacingM, thresholdsFor(min, max, intervalM)),
  }));

  const inBand = attempts.find(
    (attempt) =>
      attempt.lines.length >= MIN_LINES && attempt.lines.length <= MAX_LINES,
  );
  if (inBand) return inBand;

  // Nothing landed in the band: take the attempt closest to it.
  let best = attempts[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const attempt of attempts) {
    const count = attempt.lines.length;
    const distance =
      count < MIN_LINES ? MIN_LINES - count : count - MAX_LINES;
    if (distance < bestDistance) {
      best = attempt;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Mean slope percent from central differences over the sampled cells. Null when
 * no cell has all four neighbours, which is not a flat site but an unknown one.
 */
function meanSlopePct(
  values: Array<number | null>,
  n: number,
  spacingM: number,
): number | null {
  const at = (row: number, col: number): number | null => {
    if (row < 0 || row >= n || col < 0 || col >= n) return null;
    const value = values[row * n + col];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  let sum = 0;
  let count = 0;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const west = at(row, col - 1);
      const east = at(row, col + 1);
      const north = at(row - 1, col);
      const south = at(row + 1, col);
      if (west === null || east === null || north === null || south === null) {
        continue;
      }
      const dzdx = (east - west) / (2 * spacingM);
      // Row index grows southward, so north minus south is the northward rise.
      const dzdy = (north - south) / (2 * spacingM);
      sum += Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100;
      count += 1;
    }
  }
  if (count === 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

/**
 * Downhill aspect of the least squares plane, degrees clockwise from north.
 * Null when fewer than three samples are present, when the normal equations are
 * singular, or when the plane is level: a level plane has no downhill direction.
 */
function planeAspectDeg(
  values: Array<number | null>,
  n: number,
  spacingM: number,
): number | null {
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sxz = 0;
  let syz = 0;
  let count = 0;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const value = values[row * n + col];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const [x, y] = toLocalFromGrid(col, row, n, spacingM);
      sxx += x * x;
      sxy += x * y;
      syy += y * y;
      sx += x;
      sy += y;
      sz += value;
      sxz += x * value;
      syz += y * value;
      count += 1;
    }
  }
  if (count < 3) return null;

  // Solve the 3 x 3 normal equations for z = a x + b y + c by Cramer's rule.
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, count],
  ];
  const rhs = [sxz, syz, sz];
  const det3 = (rows: number[][]): number =>
    rows[0][0] * (rows[1][1] * rows[2][2] - rows[1][2] * rows[2][1]) -
    rows[0][1] * (rows[1][0] * rows[2][2] - rows[1][2] * rows[2][0]) +
    rows[0][2] * (rows[1][0] * rows[2][1] - rows[1][1] * rows[2][0]);
  const base = det3(m);
  if (Math.abs(base) < 1e-9) return null;
  const replace = (column: number): number[][] =>
    m.map((row, index) =>
      row.map((cell, c) => (c === column ? rhs[index] : cell)),
    );
  const a = det3(replace(0)) / base;
  const b = det3(replace(1)) / base;
  if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return null;

  // Downhill points opposite the gradient: east component -a, north component -b.
  const deg = (Math.atan2(-a, -b) * 180) / Math.PI;
  return Math.round(((deg + 360) % 360) * 10) / 10;
}

export function buildTopo(
  siteElevationM: number | null,
  values: Array<number | null>,
  spacingM: number,
  n: number,
): TopoData {
  const present = finiteValues(values);
  // No sample means no measured range, which is null rather than flat ground.
  const reliefM =
    present.length === 0
      ? null
      : Math.round((Math.max(...present) - Math.min(...present)) * 10) / 10;

  const middle = Math.floor(n / 2);
  const ew: Array<number | null> = [];
  const ns: Array<number | null> = [];
  for (let index = 0; index < n; index++) {
    const west = values[middle * n + index];
    const north = values[index * n + middle];
    ew.push(typeof west === "number" && Number.isFinite(west) ? west : null);
    ns.push(typeof north === "number" && Number.isFinite(north) ? north : null);
  }

  return {
    siteElevationM,
    grid: { spacingM, n, values },
    contours: contourLines(values, n, spacingM),
    sections: { ew, ns },
    reliefM,
    meanSlopePct: meanSlopePct(values, n, spacingM),
    aspectDeg: planeAspectDeg(values, n, spacingM),
  };
}
