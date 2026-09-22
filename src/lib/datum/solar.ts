// STUB: replaced by the Phase 1 module agent for solar.
// Owner: module A (sun and climate). SPEC section 9 "sun", PHASE-1 step 1.2.
// NOAA solar position equations. No dependency, no network.

import { unavailable } from "./http";
import type { LayerFetcher, SunData, SunDay } from "./types";

/** The sun layer is computed, so it has no external source URL. */
export const SUN_SOURCE = {
  name: "NOAA solar position equations (computed)",
  url: "",
  licence: "Computed from published NOAA equations; no external service",
  cached: false,
};

export interface SolarPosition {
  altitudeDeg: number;
  /** Degrees clockwise from true north. */
  azimuthDeg: number;
}

export function solarPosition(
  _date: Date,
  _lat: number,
  _lng: number,
): SolarPosition {
  throw new Error("not implemented");
}

/** Sunrise, sunset, noon altitude, and samples every 15 minutes. */
export function sunPath(
  _lat: number,
  _lng: number,
  _tzOffsetMinutes: number,
  _date: Date,
): SunDay {
  throw new Error("not implemented");
}

/** The full sun layer for 21 March, 21 June, and 21 December. */
export function sunLayer(
  _lat: number,
  _lng: number,
  _timezone: string,
): SunData {
  throw new Error("not implemented");
}

/**
 * The sun layer is computed, so it is always ok, except that a missing IANA
 * timezone (Open-Meteo unavailable) makes it partial with missing ["timezone"]
 * and times in UTC (OPEN-QUESTIONS item 18).
 */
export const fetchSun: LayerFetcher<SunData> = async (_input, ctx) =>
  unavailable("sun", SUN_SOURCE, "upstream_error", "not implemented", {
    now: ctx.now,
  });
