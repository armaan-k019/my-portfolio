// Census geocoder, ACS 5-year, and TIGERweb tract polygon.
// Owner: module E (census). SPEC section 9 "census", PHASE-1 step 1.7.

import {
  RETRY_COUNT,
  RETRY_STATUSES,
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  SOURCE_TIMEOUT_MS,
  TTL_SECONDS,
  UNAVAILABLE_MESSAGES,
  resolveBaseUrl,
  withCode,
} from "../constants";
import { cached } from "../cache";
import {
  SourceError,
  fetchWithPolicy,
  ok,
  partial,
  toSourceError,
  unavailable,
} from "../http";
import { roundKey, toLocal } from "../geo";
import type {
  CensusData,
  CensusDerived,
  CensusTract,
  LayerFetcher,
  LocalPoint,
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

const ACS_FIELDS = Object.keys(ACS_VARIABLES);

// ─── Small helpers ───────────────────────────────────────────────────────────

/** The matching margin of error variable for an estimate variable. */
function marginVariable(estimate: string): string {
  return `${estimate.slice(0, estimate.length - 1)}M`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseJsonBody(text: string, source: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SourceError(
      "parse_error",
      `${source} returned a body that is not JSON.`,
      { source },
    );
  }
}

/** A single ACS cell: the sentinels and anything non numeric become null. */
function acsValue(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (ACS_SENTINELS.includes(value)) return null;
  return value;
}

/** A ratio in percent, rounded to 0.1. Null whenever an input is null. */
function sharePct(
  parts: Array<number | null>,
  total: number | null,
): number | null {
  if (total === null || total <= 0) return null;
  let sum = 0;
  for (const part of parts) {
    if (part === null) return null;
    sum += part;
  }
  return round1((sum / total) * 100);
}

// ─── Geocoder ────────────────────────────────────────────────────────────────

interface GeocoderTractRow {
  GEOID?: unknown;
  STATE?: unknown;
  COUNTY?: unknown;
  TRACT?: unknown;
  NAME?: unknown;
  AREALAND?: unknown;
}

function extractTract(body: unknown): CensusTract | null {
  if (!body || typeof body !== "object") {
    throw new SourceError(
      "parse_error",
      "The Census geocoder returned a body that is not an object.",
      { source: "census_geocoder" },
    );
  }
  const result = (body as { result?: unknown }).result;
  if (!result || typeof result !== "object") return null;
  const geographies = (result as { geographies?: unknown }).geographies;
  if (!geographies || typeof geographies !== "object") return null;
  const rows = (geographies as Record<string, unknown>)["Census Tracts"];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0] as GeocoderTractRow;
  if (typeof row.GEOID !== "string" || row.GEOID.length === 0) return null;
  const areaLand = Number(row.AREALAND);
  return {
    geoid: row.GEOID,
    state: typeof row.STATE === "string" ? row.STATE : row.GEOID.slice(0, 2),
    county: typeof row.COUNTY === "string" ? row.COUNTY : row.GEOID.slice(2, 5),
    tract: typeof row.TRACT === "string" ? row.TRACT : row.GEOID.slice(5),
    name: typeof row.NAME === "string" ? row.NAME : null,
    areaLandM2: Number.isFinite(areaLand) ? areaLand : null,
  };
}

/**
 * The Census geocoder tract lookup, also used by the site route. Cache key
 * `census_geo:<lat,lng at 3 dp>`, TTL TTL_SECONDS.censusGeocoder. Returns null
 * when the point is outside the geocoder's coverage. Throws SourceError on a
 * transport failure; the site route tolerates that and leaves tract null.
 */
export async function lookupTract(
  lat: number,
  lng: number,
  ctx: SourceContext,
): Promise<CensusTract | null> {
  const base = resolveBaseUrl("census_geocoder", ctx);
  const url =
    `${base}?x=${lng.toFixed(6)}&y=${lat.toFixed(6)}` +
    "&benchmark=Public_AR_Current&vintage=Current_Current" +
    "&layers=Census%20Tracts&format=json";

  const result = await cached(
    `census_geo:${roundKey(lat, lng, 3)}`,
    TTL_SECONDS.censusGeocoder,
    async () => {
      const response = await fetchWithPolicy(
        url,
        { method: "GET" },
        {
          timeoutMs: SOURCE_TIMEOUT_MS.census_geocoder,
          retries: RETRY_COUNT,
          retryOn: RETRY_STATUSES,
          source: "census_geocoder",
        },
        ctx,
      );
      const body = parseJsonBody(await response.text(), "census_geocoder");
      // Trim before caching: the tract row only, never the whole envelope.
      return {
        source: "census_geocoder",
        url,
        status: response.status,
        body: extractTract(body),
        cacheable: true,
      };
    },
    ctx,
  );

  const stored = result.entry.body;
  if (!stored || typeof stored !== "object") return null;
  return stored as CensusTract;
}

// ─── ACS ─────────────────────────────────────────────────────────────────────

interface AcsTable {
  header: string[];
  row: string[];
}

function acsQuery(tract: CensusTract): string {
  const estimates = ACS_FIELDS.map((field) => ACS_VARIABLES[field]);
  const margins = estimates.map(marginVariable);
  const get = ["NAME", ...estimates, ...margins].join(",");
  return (
    `get=${get}` +
    `&for=tract:${encodeURIComponent(tract.tract)}` +
    `&in=state:${encodeURIComponent(tract.state)}` +
    `%20county:${encodeURIComponent(tract.county)}`
  );
}

function extractAcsTable(body: unknown): AcsTable {
  if (!Array.isArray(body) || body.length < 2) {
    throw new SourceError(
      "parse_error",
      "Census ACS returned no data row for this tract.",
      { source: "census_acs" },
    );
  }
  const header = body[0];
  const row = body[1];
  if (!Array.isArray(header) || !Array.isArray(row)) {
    throw new SourceError(
      "parse_error",
      "Census ACS returned a table that is not an array of rows.",
      { source: "census_acs" },
    );
  }
  return {
    header: header.map((cell) => String(cell)),
    row: row.map((cell) => (cell === null ? "" : String(cell))),
  };
}

// ─── TIGERweb ────────────────────────────────────────────────────────────────

interface TigerPolygon {
  /** Rings as [lng, lat] pairs, exactly as TIGERweb returns them at 4326. */
  rings: number[][][];
}

function extractTigerRings(body: unknown): number[][][] {
  if (!body || typeof body !== "object") {
    throw new SourceError(
      "parse_error",
      "TIGERweb returned a body that is not an object.",
      { source: "tiger" },
    );
  }
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return [];
  const geometry = (features[0] as { geometry?: unknown }).geometry;
  if (!geometry || typeof geometry !== "object") return [];
  const rings = (geometry as { rings?: unknown }).rings;
  if (!Array.isArray(rings)) return [];
  const out: number[][][] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring)) continue;
    const points: number[][] = [];
    for (const point of ring) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      points.push([lng, lat]);
    }
    if (points.length >= 3) out.push(points);
  }
  return out;
}

/**
 * The tract polygon in local metres about the site. A TIGERweb failure leaves
 * geometry null and makes the envelope partial, never unavailable, so this
 * returns null instead of throwing.
 */
async function fetchTractGeometry(
  tract: CensusTract,
  origin: { lat: number; lng: number },
  ctx: SourceContext,
): Promise<{ rings: LocalPoint[][] } | null> {
  const base = resolveBaseUrl("tiger", ctx);
  const where = encodeURIComponent(`GEOID='${tract.geoid}'`);
  const url =
    `${base}?where=${where}&outFields=GEOID,NAME,AREALAND` +
    "&returnGeometry=true&outSR=4326&f=json";

  try {
    const result = await cached(
      `tiger:${tract.geoid}`,
      TTL_SECONDS.tiger,
      async () => {
        const response = await fetchWithPolicy(
          url,
          { method: "GET" },
          {
            timeoutMs: SOURCE_TIMEOUT_MS.tiger,
            retries: RETRY_COUNT,
            retryOn: RETRY_STATUSES,
            source: "tiger",
          },
          ctx,
        );
        const body = parseJsonBody(await response.text(), "tiger");
        // Trim before caching, and cache lng/lat because the local frame
        // depends on the site point while the cache key is the GEOID alone.
        const trimmed: TigerPolygon = { rings: extractTigerRings(body) };
        return {
          source: "tiger",
          url,
          status: response.status,
          body: trimmed,
          cacheable: true,
        };
      },
      ctx,
    );

    const stored = result.entry.body as TigerPolygon | null;
    if (!stored || !Array.isArray(stored.rings) || stored.rings.length === 0) {
      return null;
    }
    const rings = stored.rings.map((ring) =>
      ring.map((point) => {
        const [x, y] = toLocal(point[1], point[0], origin);
        return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as LocalPoint;
      }),
    );
    return { rings };
  } catch {
    return null;
  }
}

// ─── The layer ───────────────────────────────────────────────────────────────

function buildDerived(
  values: Record<string, number | null>,
  areaLandM2: number | null,
): CensusDerived {
  const population = values.population;
  const areaKm2 =
    areaLandM2 !== null && areaLandM2 > 0 ? areaLandM2 / 1_000_000 : null;

  return {
    densityPerKm2:
      population === null || areaKm2 === null
        ? null
        : round1(population / areaKm2),
    renterSharePct: sharePct([values.renterOccupied], values.householdsTotal),
    carFreeCommutePct: sharePct(
      [values.transitToWork, values.walkedToWork, values.bikeToWork],
      values.workersTotal,
    ),
    multifamily5plusSharePct: sharePct(
      [
        values.units5to9,
        values.units10to19,
        values.units20to49,
        values.units50plus,
      ],
      values.unitsTotal,
    ),
  };
}

export const fetchCensus: LayerFetcher<CensusData> = async (input, ctx) => {
  const acsBase = resolveBaseUrl("census_acs", ctx);
  const source = {
    name: SOURCE_DISPLAY_NAMES.census_acs,
    url: acsBase,
    licence: SOURCE_LICENCES.census_acs,
    cached: false,
  };

  const apiKey = ctx.env.censusApiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return unavailable(
      "census",
      source,
      "missing_key",
      UNAVAILABLE_MESSAGES.censusMissingKey,
      { now: ctx.now },
    );
  }

  try {
    const tract = await lookupTract(input.lat, input.lng, ctx);
    if (!tract) {
      return unavailable(
        "census",
        source,
        "no_coverage",
        UNAVAILABLE_MESSAGES.censusNoTract,
        { now: ctx.now },
      );
    }

    const query = acsQuery(tract);
    // The key never enters publicUrl, which is what the envelope and the cache
    // row carry. stripKey in the envelope builder is the second line of defence.
    const publicUrl = `${acsBase}?${query}&key=`;
    const requestUrl = `${acsBase}?${query}&key=${encodeURIComponent(apiKey)}`;
    source.url = publicUrl;

    const result = await cached(
      `census_acs:${tract.geoid}:${ACS_VINTAGE}`,
      TTL_SECONDS.censusAcs,
      async () => {
        const response = await fetchWithPolicy(
          requestUrl,
          { method: "GET" },
          {
            timeoutMs: SOURCE_TIMEOUT_MS.census_acs,
            retries: RETRY_COUNT,
            retryOn: RETRY_STATUSES,
            source: "census_acs",
          },
          ctx,
        );
        // Without a key the ACS endpoint answers HTTP 200 with an HTML
        // "Missing Key" page, so the body is parsed by hand into parse_error.
        const body = parseJsonBody(await response.text(), "census_acs");
        return {
          source: "census_acs",
          url: publicUrl,
          status: response.status,
          body: extractAcsTable(body),
          cacheable: true,
        };
      },
      ctx,
    );

    source.cached = result.cached;
    const stored = result.entry.body as Partial<AcsTable> | null;
    const table = extractAcsTable([stored?.header, stored?.row]);

    const index = new Map<string, number>();
    table.header.forEach((name, position) => index.set(name, position));

    const values: Record<string, number | null> = {};
    const margins: Record<string, number | null> = {};
    const missing: string[] = [];

    for (const field of ACS_FIELDS) {
      const variable = ACS_VARIABLES[field];
      const at = index.get(variable);
      const value = at === undefined ? null : acsValue(table.row[at]);
      values[field] = value;
      if (value === null) missing.push(field);

      const marginAt = index.get(marginVariable(variable));
      margins[field] = marginAt === undefined ? null : acsValue(table.row[marginAt]);
    }

    const geometry = await fetchTractGeometry(
      tract,
      { lat: input.lat, lng: input.lng },
      ctx,
    );
    if (geometry === null) missing.push("geometry");

    const namePosition = index.get("NAME");
    const acsName =
      namePosition === undefined ? null : table.row[namePosition] || null;

    const data: CensusData = {
      tract: { ...tract, name: tract.name ?? acsName },
      vintage: ACS_VINTAGE,
      population: values.population,
      medianAge: values.medianAge,
      avgHouseholdSize: values.avgHouseholdSize,
      householdsTotal: values.householdsTotal,
      ownerOccupied: values.ownerOccupied,
      renterOccupied: values.renterOccupied,
      workersTotal: values.workersTotal,
      transitToWork: values.transitToWork,
      walkedToWork: values.walkedToWork,
      bikeToWork: values.bikeToWork,
      workedFromHome: values.workedFromHome,
      unitsTotal: values.unitsTotal,
      singleDetached: values.singleDetached,
      units5to9: values.units5to9,
      units10to19: values.units10to19,
      units20to49: values.units20to49,
      units50plus: values.units50plus,
      medianHouseholdIncome: values.medianHouseholdIncome,
      medianGrossRent: values.medianGrossRent,
      margins,
      derived: buildDerived(values, tract.areaLandM2),
      geometry,
    };

    if (missing.length > 0) {
      return partial(
        "census",
        source,
        data,
        missing,
        "Census answered but some values are suppressed or unavailable for this tract.",
        { now: ctx.now },
      );
    }
    return ok("census", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "census_acs");
    return unavailable(
      "census",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.censusFailure, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
