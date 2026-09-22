// STUB: replaced by the Phase 1 module agent for usgsSeismic.
// Owner: module C (seismic and soil). SPEC section 9 "seismic", PHASE-1 step 1.5.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "../constants";
import { unavailable } from "../http";
import type { LayerFetcher, SeismicData } from "../types";

export const SITE_CLASSES = ["A", "B", "C", "D", "E"];
export const DEFAULT_SITE_CLASS = "D";
export const RISK_CATEGORY = "II";

/** Anything outside A to E is rejected before the request (PHASE-1 step 1.5). */
export function isValidSiteClass(value: string): boolean {
  return SITE_CLASSES.includes(value.toUpperCase());
}

export const fetchSeismic: LayerFetcher<SeismicData> = async (_input, ctx) =>
  unavailable(
    "seismic",
    {
      name: SOURCE_DISPLAY_NAMES.usgs_seismic,
      url: resolveBaseUrl("usgs_seismic", ctx),
      licence: SOURCE_LICENCES.usgs_seismic,
      cached: false,
    },
    "upstream_error",
    "not implemented",
    { now: ctx.now },
  );
