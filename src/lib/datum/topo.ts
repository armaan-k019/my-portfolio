// STUB: replaced by the Phase 1 module agent for topo.
// Owner: module B (topo). SPEC section 9 "topo", PHASE-1 step 1.4.
// Pure geometry. d3-contour is imported here, not in the source module.

import type { LatLng, LocalPoint, TopoData } from "./types";

/** The 21 x 21 grid at 40 m spacing, row major, north to south, west to east. */
export function gridPoints(
  _origin: LatLng,
  _n: number,
  _spacingM: number,
): LatLng[] {
  throw new Error("not implemented");
}

/**
 * Marching squares through d3-contour with thresholds chosen from 1, 2, 5, 10 m
 * so there are 4 to 20 lines. Coordinates come back in local metres.
 */
export function contourLines(
  _values: Array<number | null>,
  _n: number,
  _spacingM: number,
): { intervalM: number; lines: LocalPoint[][] } {
  throw new Error("not implemented");
}

export function buildTopo(
  _siteElevationM: number | null,
  _values: Array<number | null>,
  _spacingM: number,
  _n: number,
): TopoData {
  throw new Error("not implemented");
}
