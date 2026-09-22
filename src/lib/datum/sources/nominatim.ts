// STUB: replaced by the Phase 1 module agent for nominatim.
// Owner: module G (geocoding). SPEC section 7 "geocode", PHASE-1 step 1.9.
// Policy: at most one request per second, descriptive User-Agent, no autocomplete.

import { SourceError } from "../http";
import type { GeocodeResult, SourceContext } from "../types";

/**
 * One search per submit. Cache key `nominatim:<normalized query>`, TTL
 * TTL_SECONDS.nominatimSearch. Null means not found. Throws SourceError.
 */
export async function geocode(
  _query: string,
  _ctx: SourceContext,
): Promise<GeocodeResult | null> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "nominatim",
  });
}

/**
 * The coarse locality label from reverse at zoom 10, for example
 * "Atlanta, Georgia". Cache key `nominatim_reverse:<lat,lng at 3 dp>`, TTL
 * TTL_SECONDS.nominatimReverse. Throws SourceError; the site route tolerates
 * that and leaves locality null.
 */
export async function reverseLocality(
  _lat: number,
  _lng: number,
  _ctx: SourceContext,
): Promise<string | null> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "nominatim",
  });
}
