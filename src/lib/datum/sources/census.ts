// STUB: replaced by the Phase 1 module agent for census.
// Owner: module E (census). SPEC section 9 "census", PHASE-1 step 1.7.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "../constants";
import { SourceError, unavailable } from "../http";
import type {
  CensusData,
  CensusTract,
  LayerFetcher,
  SourceContext,
} from "../types";

/** The ACS 5-year vintage in use. OPEN-QUESTIONS item 10. */
export const ACS_VINTAGE = "2023";

/** CensusData field name to ACS estimate variable (SPEC section 9). */
export const ACS_VARIABLES: Record<string, string> = {
  population: "B01003_001E",
  medianAge: "B01002_001E",
  avgHouseholdSize: "B25010_001E",
  householdsTotal: "B25003_001E",
  ownerOccupied: "B25003_002E",
  renterOccupied: "B25003_003E",
  workersTotal: "B08301_001E",
  transitToWork: "B08301_010E",
  walkedToWork: "B08301_019E",
  bikeToWork: "B08301_018E",
  workedFromHome: "B08301_021E",
  unitsTotal: "B25024_001E",
  singleDetached: "B25024_002E",
  units5to9: "B25024_007E",
  units10to19: "B25024_008E",
  units20to49: "B25024_009E",
  units50plus: "B25024_010E",
  medianHouseholdIncome: "B19013_001E",
  medianGrossRent: "B25064_001E",
};

/** Suppressed ACS estimates become null and are listed in partial.missing. */
export const ACS_SENTINELS = [-666666666, -999999999, -222222222];

/**
 * The Census geocoder tract lookup, also used by the site route. Cache key
 * `census_geo:<lat,lng at 3 dp>`, TTL TTL_SECONDS.censusGeocoder. Returns null
 * when the point is outside the geocoder's coverage. Throws SourceError on a
 * transport failure; the site route tolerates that and leaves tract null.
 */
export async function lookupTract(
  _lat: number,
  _lng: number,
  _ctx: SourceContext,
): Promise<CensusTract | null> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "census_geocoder",
  });
}

export const fetchCensus: LayerFetcher<CensusData> = async (_input, ctx) =>
  unavailable(
    "census",
    {
      name: SOURCE_DISPLAY_NAMES.census_acs,
      url: resolveBaseUrl("census_acs", ctx),
      licence: SOURCE_LICENCES.census_acs,
      cached: false,
    },
    "upstream_error",
    "not implemented",
    { now: ctx.now },
  );
