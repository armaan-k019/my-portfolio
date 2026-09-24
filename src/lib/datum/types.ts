// Shared types for the Datum data layer. SPEC.md sections 7, 8, 9, 13.
// Erasable TypeScript only: no enum, no parameter properties, no namespaces.
// Do not use the "@/" alias inside src/lib/datum.

// ─── Layer identity (SPEC section 7) ─────────────────────────────────────────

export type LayerName =
  | "sun"
  | "climate"
  | "topo"
  | "seismic"
  | "soil"
  | "osm"
  | "walkshed"
  | "flood"
  | "census";

export const LAYER_NAMES: LayerName[] = [
  "sun",
  "climate",
  "topo",
  "seismic",
  "soil",
  "osm",
  "walkshed",
  "flood",
  "census",
];

export function isLayerName(value: string): value is LayerName {
  return (LAYER_NAMES as string[]).includes(value);
}

// ─── Envelope (SPEC section 8) ───────────────────────────────────────────────

export type LayerStatus = "ok" | "partial" | "unavailable";

export type UnavailableCode =
  | "timeout"
  | "http_error"
  | "rate_limited"
  | "parse_error"
  | "no_coverage"
  | "missing_key"
  | "upstream_error"
  | "dependency_unavailable";

export interface LayerSource {
  name: string;
  url: string;
  fetchedAt: string;
  cached: boolean;
  licence: string;
}

export interface LayerEnvelope<T> {
  layer: LayerName;
  status: LayerStatus;
  data: T | null;
  source: LayerSource;
  unavailable?: {
    code: UnavailableCode;
    message: string;
    httpStatus?: number;
    retryable: boolean;
  };
  partial?: { missing: string[]; message: string };
  fieldPaths: string[];
}

// ─── Fetcher contract ────────────────────────────────────────────────────────

export interface CacheEntry {
  source: string;
  url: string;
  httpStatus: number;
  body: unknown;
  fetchedAt: string;
}

export interface CacheApi {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void>;
}

export interface LayerInput {
  lat: number;
  lng: number;
  siteId: string;
  params: Record<string, string>;
}

export interface SourceContext {
  fetch: typeof fetch;
  cache: CacheApi;
  overrides: Record<string, string>;
  userAgent: string;
  now: () => Date;
  env: { censusApiKey?: string };
}

export type LayerFetcher<T> = (
  input: LayerInput,
  ctx: SourceContext,
) => Promise<LayerEnvelope<T>>;

// ─── Geometry ────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

/** Local tangent plane metres, east positive, north positive. */
export type LocalPoint = [number, number];

// ─── Site record (SPEC section 13, table `sites`) ─────────────────────────────

export interface SiteRecord {
  id: string;
  site_key: string;
  lat: number;
  lng: number;
  public_lat: number;
  public_lng: number;
  locality: string | null;
  tract_geoid: string | null;
  is_test: boolean;
  created_at: string;
  last_analyzed_at: string;
  analysis_count: number;
  schema_version: number;
}

export type MemoryStatus = "online" | "offline";

// ─── sun (SPEC section 9) ────────────────────────────────────────────────────

export interface SunSample {
  /** Local clock time on the sample date, "HH:MM". */
  timeLocal: string;
  altitudeDeg: number;
  /** Degrees clockwise from true north. */
  azimuthDeg: number;
}

export interface SunDay {
  /** ISO calendar date of the sample day. */
  date: string;
  sunriseLocal: string | null;
  sunsetLocal: string | null;
  sunriseAzimuthDeg: number | null;
  sunsetAzimuthDeg: number | null;
  noonAltitudeDeg: number;
  daylightHours: number | null;
  samples: SunSample[];
}

export interface SunData {
  latitude: number;
  longitude: number;
  /** IANA zone from the Open-Meteo response, or "UTC" when climate is unavailable. */
  timezone: string;
  timezoneSource: "open-meteo" | "utc";
  june: SunDay;
  march: SunDay;
  december: SunDay;
  /** Twelve entries, January first. */
  daylightHoursByMonth: number[];
  /**
   * 1 / tan(summer solstice noon altitude), geometry only, no site obstructions.
   * Null when the sun does not clear the horizon at noon.
   */
  overhangRatioSouthGlazing: number | null;
}

// ─── climate (SPEC section 9) ────────────────────────────────────────────────

export interface WindSector {
  /** Sector centre in degrees clockwise from north, 16 sectors of 22.5 degrees. */
  sectorDeg: number;
  frequencyPct: number;
  /** Frequency percent per speed bin, aligned with WindRose.binEdgesMs. */
  binsPct: number[];
}

/**
 * Every aggregate is null when the hour set holds nothing to aggregate. A
 * period with no usable wind hours reports null, never a zero that would read
 * as calm air (SPEC section 8 rule 1).
 */
export interface WindRose {
  /** Empty when no hour carried both a speed and a direction. */
  sectors: WindSector[];
  /** Upper edges in m/s: 0.5, 2, 4, 6, 8, Infinity. */
  binEdgesMs: number[];
  calmSharePct: number | null;
  prevailingSectorDeg: number | null;
  meanSpeedMs: number | null;
  /** Vector resultant length, 0 to 1. */
  resultantLength: number | null;
}

/** A measure with no hours behind it is null, not zero. */
export interface ClimateMonth {
  /** 1 to 12. */
  month: number;
  meanC: number | null;
  meanDailyMaxC: number | null;
  meanDailyMinC: number | null;
  meanRhPct: number | null;
  meanDailyRadiationKwhM2: number | null;
}

export interface ClimateData {
  wind: { annual: WindRose; summer: WindRose; winter: WindRose };
  monthly: ClimateMonth[];
  degreeDays: { baseC: number; hdd: number | null; cdd: number | null };
  /** Simple comfort band, not ASHRAE 55: 18 to 26 C and RH under 70 percent. */
  comfortShare: { pct: number | null; definition: string };
  period: { start: string; end: string; years: number };
  timezone: string;
}

// ─── topo (SPEC section 9) ───────────────────────────────────────────────────

export interface TopoData {
  siteElevationM: number | null;
  /** Row major, north to south, west to east. Null where a sample is missing. */
  grid: { spacingM: number; n: number; values: Array<number | null> };
  /** Polylines in local metres. */
  contours: { intervalM: number; lines: LocalPoint[][] };
  sections: { ew: Array<number | null>; ns: Array<number | null> };
  /** Null when no sample is present. */
  reliefM: number | null;
  /** Null when no cell has all four neighbours. */
  meanSlopePct: number | null;
  /**
   * Downhill aspect of the best fit plane, degrees clockwise from north. Null
   * when the plane cannot be fitted or the surface is flat, which has no aspect.
   */
  aspectDeg: number | null;
}

// ─── seismic (SPEC section 9) ────────────────────────────────────────────────

export interface SeismicData {
  ss: number | null;
  s1: number | null;
  sms: number | null;
  sm1: number | null;
  sds: number | null;
  sd1: number | null;
  sdc: string | null;
  pgam: number | null;
  tl: number | null;
  assumptions: {
    reference: string;
    riskCategory: string;
    siteClass: string;
    siteClassIsDefault: boolean;
  };
}

// ─── soil (SPEC section 9) ───────────────────────────────────────────────────

export interface SoilComponent {
  name: string;
  percent: number | null;
  hydrologicGroup: string | null;
  drainageClass: string | null;
  taxOrder: string | null;
  slopePct: number | null;
  hydric: string | null;
}

export interface SoilData {
  mapUnitName: string;
  mukey: string;
  components: SoilComponent[];
}

// ─── osm (SPEC section 9) ────────────────────────────────────────────────────

export interface OsmBuilding {
  id: number;
  ring: LocalPoint[];
  heightM: number | null;
  levels: number | null;
  name: string | null;
}

export interface OsmWater {
  ring: LocalPoint[] | null;
  line: LocalPoint[] | null;
}

export interface OsmStreet {
  id: number;
  highway: string;
  line: LocalPoint[];
  foot: boolean;
}

export interface OsmTransitStop {
  id: number;
  kind: "bus" | "rail";
  x: number;
  y: number;
  name: string | null;
}

export interface OsmStats {
  buildingCount: number;
  withHeight: number;
  withLevels: number;
  relationCount: number;
  /** Footprint area inside the 800 m frame over the frame area. */
  coverageRatio: number;
}

export interface OsmData {
  buildings: OsmBuilding[];
  water: OsmWater[];
  streets: OsmStreet[];
  transitStops: OsmTransitStop[];
  stats: OsmStats;
}

// ─── walkshed (SPEC section 9) ───────────────────────────────────────────────

export interface WalkshedBands {
  5: LocalPoint[][];
  10: LocalPoint[][];
  15: LocalPoint[][];
}

export interface WalkshedNumbers {
  5: number;
  10: number;
  15: number;
}

export interface WalkshedData {
  bands: WalkshedBands;
  reachKm: WalkshedNumbers;
  transitWithin: WalkshedNumbers;
  startNodeOffsetM: number;
  walkingSpeedMPerMin: number;
}

// ─── flood (SPEC section 9) ──────────────────────────────────────────────────

export type FloodClass = "sfha" | "moderate" | "minimal" | "undetermined" | "other";

export interface FloodAtPoint {
  zone: string | null;
  subtype: string | null;
  sfha: boolean;
  /** STATIC_BFE of -9999 is stored as null. */
  staticBfeFt: number | null;
  class: FloodClass;
}

export interface FloodPolygon {
  zone: string | null;
  subtype: string | null;
  sfha: boolean;
  class: FloodClass;
  /** Rings in local metres, clipped to the 800 m frame. */
  rings: LocalPoint[][];
}

export interface FloodData {
  atPoint: FloodAtPoint | null;
  polygons: FloodPolygon[];
  coverage: boolean;
}

// ─── census (SPEC section 9) ─────────────────────────────────────────────────

export interface CensusTract {
  geoid: string;
  state: string;
  county: string;
  tract: string;
  name: string | null;
  areaLandM2: number | null;
}

export interface CensusDerived {
  densityPerKm2: number | null;
  renterSharePct: number | null;
  carFreeCommutePct: number | null;
  multifamily5plusSharePct: number | null;
}

export interface CensusData {
  tract: CensusTract;
  vintage: string;
  population: number | null;
  medianAge: number | null;
  avgHouseholdSize: number | null;
  householdsTotal: number | null;
  ownerOccupied: number | null;
  renterOccupied: number | null;
  workersTotal: number | null;
  transitToWork: number | null;
  walkedToWork: number | null;
  bikeToWork: number | null;
  workedFromHome: number | null;
  unitsTotal: number | null;
  singleDetached: number | null;
  units5to9: number | null;
  units10to19: number | null;
  units20to49: number | null;
  units50plus: number | null;
  medianHouseholdIncome: number | null;
  medianGrossRent: number | null;
  /** ACS margins of error keyed by the same field names as above. */
  margins: Record<string, number | null>;
  derived: CensusDerived;
  /** TIGERweb tract polygon in local metres, null when it could not be fetched. */
  geometry: { rings: LocalPoint[][] } | null;
}

// ─── Geocoding (not a layer, used by the suggest, geocode, and site routes) ───

export interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  locality: string | null;
}
