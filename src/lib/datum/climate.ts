// STUB: replaced by the Phase 1 module agent for climate.
// Owner: module A (sun and climate). SPEC section 9 "climate", PHASE-1 step 1.3.
// Pure functions over an ArchiveResponse. No fetching here.

import type { ArchiveHour, ArchiveResponse } from "./sources/openMeteo";
import type { ClimateData, ClimateMonth, WindRose } from "./types";

/** Sixteen sectors, the speed bins from SPEC section 9, calm under 0.5 m/s. */
export function buildWindRose(_hours: ArchiveHour[]): WindRose {
  throw new Error("not implemented");
}

/** Twelve entries, January first. */
export function buildMonthlyNormals(_hours: ArchiveHour[]): ClimateMonth[] {
  throw new Error("not implemented");
}

/** HDD and CDD base 18.3 C per year, averaged over the period. */
export function buildDegreeDays(
  _hours: ArchiveHour[],
): { baseC: number; hdd: number; cdd: number } {
  throw new Error("not implemented");
}

/** Percent of hours at 18 to 26 C with RH under 70 percent. */
export function buildComfortShare(
  _hours: ArchiveHour[],
): { pct: number; definition: string } {
  throw new Error("not implemented");
}

export function buildClimate(_archive: ArchiveResponse): ClimateData {
  throw new Error("not implemented");
}
