// Base URLs, timeouts, TTLs, and extents for the Datum data layer.
// Every endpoint here is from SPEC.md section 5 and was verified on 2026-09-21.

import type { SourceContext } from "./types";

/** SPEC section 7 and OPEN-QUESTIONS item 12. Sent on every outbound request. */
export const USER_AGENT =
  "Datum/1.0 (site analysis; portfolio; +https://armaankazi.com/projects/datum)";

export type SourceName =
  | "photon"
  | "nominatim"
  | "overpass"
  | "overpass_mirror"
  | "usgs_epqs"
  | "usgs_3dep"
  | "usgs_seismic"
  | "usda"
  | "fema"
  | "census_geocoder"
  | "census_acs"
  | "tiger"
  | "openmeteo";

export const SOURCE_BASE_URLS: Record<SourceName, string> = {
  photon: "https://photon.komoot.io/api",
  nominatim: "https://nominatim.openstreetmap.org",
  overpass: "https://overpass-api.de/api/interpreter",
  overpass_mirror: "https://overpass.kumi.systems/api/interpreter",
  usgs_epqs: "https://epqs.nationalmap.gov/v1/json",
  usgs_3dep:
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples",
  usgs_seismic:
    "https://earthquake.usgs.gov/ws/building-codes/asce7-22/calculate",
  usda: "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest",
  fema: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer",
  census_geocoder:
    "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
  census_acs: "https://api.census.gov/data/2023/acs/acs5",
  tiger:
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query",
  openmeteo: "https://archive-api.open-meteo.com/v1/archive",
};

/**
 * Short override names used by DATUM_SOURCE_OVERRIDES in PHASE-1-data.md step
 * 1.10. An override on the short name applies to every source it lists, so the
 * forced failure run can knock out elevation or seismic with one entry.
 */
export const SOURCE_OVERRIDE_ALIASES: Record<string, SourceName[]> = {
  usgs_elev: ["usgs_epqs", "usgs_3dep"],
  usgs_seis: ["usgs_seismic"],
  census_geo: ["census_geocoder"],
  // "overpass" is a source name as well as an alias. The direct lookup in
  // resolveBaseUrl answers for the primary host, and this entry carries the
  // same override onto the mirror, so the documented JSON knocks out both.
  overpass: ["overpass", "overpass_mirror"],
};

/** Attribution lines for LayerEnvelope.source.licence. */
export const SOURCE_LICENCES: Record<SourceName, string> = {
  photon: "© OpenStreetMap contributors, ODbL 1.0 (via Photon)",
  nominatim: "© OpenStreetMap contributors, ODbL 1.0 (via Nominatim)",
  overpass: "© OpenStreetMap contributors, ODbL 1.0",
  overpass_mirror: "© OpenStreetMap contributors, ODbL 1.0",
  usgs_epqs: "USGS 3DEP, public domain",
  usgs_3dep: "USGS 3DEP, public domain",
  usgs_seismic: "USGS seismic design web service, public domain",
  usda: "USDA NRCS SSURGO, public domain",
  fema: "FEMA National Flood Hazard Layer, public domain",
  census_geocoder: "US Census Bureau, public domain",
  census_acs: "US Census Bureau ACS 5-year, public domain",
  tiger: "US Census Bureau TIGERweb, public domain",
  openmeteo: "Open-Meteo (ERA5)",
};

/** Human readable source names for LayerEnvelope.source.name. */
export const SOURCE_DISPLAY_NAMES: Record<SourceName, string> = {
  photon: "Photon (Komoot)",
  nominatim: "Nominatim (OpenStreetMap)",
  overpass: "Overpass API (OpenStreetMap)",
  overpass_mirror: "Overpass API mirror (kumi.systems)",
  usgs_epqs: "USGS Elevation Point Query Service",
  usgs_3dep: "USGS 3DEP Elevation",
  usgs_seismic: "USGS ASCE 7-22 seismic design values",
  usda: "USDA Soil Data Access (SSURGO)",
  fema: "FEMA National Flood Hazard Layer",
  census_geocoder: "US Census geocoder",
  census_acs: "US Census ACS 5-year",
  tiger: "US Census TIGERweb",
  openmeteo: "Open-Meteo ERA5 archive",
};

// ─── Timeouts (SPEC section 8 rule 6) ────────────────────────────────────────

export const DEFAULT_TIMEOUT_MS = 12_000;
export const OVERPASS_TIMEOUT_MS = 45_000;
export const ELEVATION_3DEP_TIMEOUT_MS = 20_000;

export const SOURCE_TIMEOUT_MS: Record<SourceName, number> = {
  photon: DEFAULT_TIMEOUT_MS,
  nominatim: DEFAULT_TIMEOUT_MS,
  overpass: OVERPASS_TIMEOUT_MS,
  overpass_mirror: OVERPASS_TIMEOUT_MS,
  usgs_epqs: DEFAULT_TIMEOUT_MS,
  usgs_3dep: ELEVATION_3DEP_TIMEOUT_MS,
  usgs_seismic: DEFAULT_TIMEOUT_MS,
  usda: DEFAULT_TIMEOUT_MS,
  fema: DEFAULT_TIMEOUT_MS,
  census_geocoder: DEFAULT_TIMEOUT_MS,
  census_acs: DEFAULT_TIMEOUT_MS,
  tiger: DEFAULT_TIMEOUT_MS,
  openmeteo: DEFAULT_TIMEOUT_MS,
};

/** One retry with a 1.5 s backoff on timeout and on these statuses. */
export const RETRY_STATUSES: number[] = [502, 503, 504];
export const RETRY_BACKOFF_MS = 1_500;
export const RETRY_COUNT = 1;
/** Total wall clock cap for one layer request (SPEC section 8 rule 6). */
export const WALL_CLOCK_CAP_MS = 55_000;

// ─── Cache TTLs in seconds (SPEC section 13) ─────────────────────────────────

const DAY = 86_400;

export const TTL_SECONDS = {
  photonSuggest: 7 * DAY,
  nominatimSearch: 30 * DAY,
  nominatimReverse: 365 * DAY,
  overpass: 30 * DAY,
  usgsElevation: 365 * DAY,
  usgsSeismic: 365 * DAY,
  usda: 365 * DAY,
  fema: 30 * DAY,
  censusGeocoder: 365 * DAY,
  censusAcs: 365 * DAY,
  tiger: 365 * DAY,
  openMeteo: 365 * DAY,
};

// ─── Extents (SPEC section 3) ────────────────────────────────────────────────

/** Site plan radius in metres; the frame is twice this on a side. */
export const SITE_RADIUS_M = 400;
export const FRAME_SIZE_M = 800;
/** Street network fetch radius for the walk shed. */
export const WALK_RADIUS_M = 1200;
export const WALK_SPEED_M_PER_MIN = 80;
export const WALK_BANDS_MIN = [5, 10, 15];
/** Topography sample grid. */
export const GRID_N = 21;
export const GRID_SPACING_M = 40;
/** Flood polygon cap. */
export const FLOOD_POLYGON_CAP = 200;

/**
 * The longest address string the geocoding routes accept. Longer than any real
 * address, and short enough that an attacker cannot use the query as storage.
 */
export const MAX_GEOCODE_QUERY_LENGTH = 120;

// ─── Rate limit (SPEC section 13, OPEN-QUESTIONS item 15) ────────────────────

export const RATE_LIMIT_PER_DAY = 20;
/** A site analyzed within this window is a free re-open. */
export const RATE_LIMIT_FREE_REOPEN_DAYS = 30;
/**
 * "Layer routes for a site created in the last 24 hours are not separately
 * limited" (SPEC section 13). Past this window a site id is a saved link, and
 * the layer routes peek at the cap before answering.
 */
export const SITE_FREE_LAYER_WINDOW_MS = 86_400_000;
/**
 * How long a rate limit peek is reused for one hashed IP within an instance.
 * The layer routes peek and never increment, so this is the freshness the owner
 * accepted (fourth round) in exchange for taking the read off the warm path.
 */
export const RATE_LIMIT_PEEK_MEMO_MS = 60_000;

// ─── Memory (SPEC section 13, paused database) ───────────────────────────────

export const MEMORY_TIMEOUT_MS = 3_000;
export const MEMORY_OFFLINE_COOLDOWN_MS = 60_000;

/**
 * The base URL for a source, honouring ctx.overrides. Overrides are only ever
 * populated outside production (SPEC section 15).
 */
export function resolveBaseUrl(
  source: SourceName,
  ctx: Pick<SourceContext, "overrides">,
): string {
  // The direct key wins, and returning here is what keeps a name that is both
  // a source and an alias from being matched twice.
  const direct = ctx.overrides[source];
  if (typeof direct === "string" && direct.length > 0) return direct;
  for (const alias of Object.keys(SOURCE_OVERRIDE_ALIASES)) {
    const value = ctx.overrides[alias];
    if (typeof value === "string" && value.length > 0) {
      if (SOURCE_OVERRIDE_ALIASES[alias].includes(source)) return value;
    }
  }
  return SOURCE_BASE_URLS[source];
}

/**
 * The verbatim unavailable messages from SPEC section 8, so screenshots are
 * comparable. `<code>` is replaced with the UnavailableCode by the caller.
 */
export const UNAVAILABLE_MESSAGES = {
  overpass:
    "OpenStreetMap data could not be loaded (Overpass <code>). Buildings, streets, and the walk shed are unavailable. Retry in a minute.",
  femaNoCoverage:
    "FEMA has not published a flood hazard layer for this location. Check the community's status at msc.fema.gov.",
  femaFailure:
    "FEMA flood data could not be reached (<code>). Verify at msc.fema.gov.",
  usgsElevation:
    "USGS 3DEP elevation could not be reached (<code>). Topography is unavailable.",
  usgsSeismic: "USGS seismic design values could not be reached (<code>).",
  usda: "USDA soil survey could not be reached (<code>).",
  usdaNoCoverage: "No SSURGO soil map unit intersects this point.",
  censusMissingKey:
    "Census API key is not configured on the server. Demographics are unavailable.",
  censusNoTract:
    "The Census geocoder returned no tract for this point. Demographics are unavailable.",
  censusFailure: "Census ACS could not be reached (<code>).",
  openMeteo:
    "Open-Meteo climate archive could not be reached (<code>). Wind and climate are unavailable.",
  briefDependency:
    "The brief was written without <layer list>; those sources were unavailable.",
  walkshedNoStart:
    "No walkable street within 150 m of this point in OpenStreetMap.",
};

/** Fill the `<code>` placeholder in an UNAVAILABLE_MESSAGES entry. */
export function withCode(message: string, code: string): string {
  return message.replace("<code>", code);
}
