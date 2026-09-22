// STUB: replaced by the Phase 1 module agent for usdaSoil.
// Owner: module C (seismic and soil). SPEC section 9 "soil", PHASE-1 step 1.5.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "../constants";
import { unavailable } from "../http";
import type { LayerFetcher, SoilData } from "../types";

/**
 * The SDA query from SPEC section 9. Coordinates are formatted to 6 decimals
 * and nothing else variable enters the SQL string.
 */
export function soilQuery(_lat: number, _lng: number): string {
  throw new Error("not implemented");
}

export const fetchSoil: LayerFetcher<SoilData> = async (_input, ctx) =>
  unavailable(
    "soil",
    {
      name: SOURCE_DISPLAY_NAMES.usda,
      url: resolveBaseUrl("usda", ctx),
      licence: SOURCE_LICENCES.usda,
      cached: false,
    },
    "upstream_error",
    "not implemented",
    { now: ctx.now },
  );
