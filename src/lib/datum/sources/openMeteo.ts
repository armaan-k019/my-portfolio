// Open-Meteo ERA5 archive. SPEC section 9 "climate", PHASE-1 step 1.3.
// The sun layer reads the IANA timezone from the same cached response, so the
// two layers share one request (contract section 4).

import {
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
import { roundKey } from "../geo";
import { buildClimate } from "../climate";
import type {
  ClimateData,
  LayerFetcher,
  LayerInput,
  SourceContext,
} from "../types";

/** One hourly sample from the ERA5 archive, already converted to SI. */
export interface ArchiveHour {
  time: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  shortwaveWM2: number | null;
}

export interface ArchiveResponse {
  timezone: string;
  period: { start: string; end: string; years: number };
  hours: ArchiveHour[];
  url: string;
  cached: boolean;
}

/** The five hourly variables from SPEC section 5, in request order. */
export const ARCHIVE_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "shortwave_radiation",
];

/** Three calendar years ending at the last complete year on the request date. */
export const ARCHIVE_YEARS = 3;

/** The trimmed payload that goes into api_cache. */
interface TrimmedArchive {
  timezone: string;
  units: { windSpeed: string | null };
  hourly: Record<string, unknown[]>;
}

export interface ArchivePeriod {
  start: string;
  end: string;
  years: number;
}

/** The 3 year window ending at the last complete calendar year. */
export function archivePeriod(now: Date): ArchivePeriod {
  const lastComplete = now.getUTCFullYear() - 1;
  const firstYear = lastComplete - (ARCHIVE_YEARS - 1);
  return {
    start: `${firstYear}-01-01`,
    end: `${lastComplete}-12-31`,
    years: ARCHIVE_YEARS,
  };
}

export function archiveUrl(
  base: string,
  lat: number,
  lng: number,
  period: ArchivePeriod,
): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(6),
    longitude: lng.toFixed(6),
    start_date: period.start,
    end_date: period.end,
    hourly: ARCHIVE_VARIABLES.join(","),
    timezone: "auto",
  });
  return `${base}?${params.toString()}`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Wind speed arrives in km/h by default; convert only when it says so. */
function toMetresPerSecond(value: number | null, unit: string | null): number | null {
  if (value === null) return null;
  if (unit === "km/h") return value / 3.6;
  if (unit === "mp/h") return value * 0.44704;
  if (unit === "kn") return value * 0.514444;
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SourceError(
      "parse_error",
      "Open-Meteo returned a body that is not an object.",
      { source: "openmeteo" },
    );
  }
  return value as Record<string, unknown>;
}

/** Keep only the timezone, the wind speed unit, and the six hourly arrays. */
export function trimArchive(raw: unknown): TrimmedArchive {
  const body = asRecord(raw);
  const hourly = asRecord(body.hourly);
  const units = body.hourly_units ? asRecord(body.hourly_units) : {};

  const timezone = typeof body.timezone === "string" ? body.timezone : null;
  if (timezone === null) {
    throw new SourceError(
      "parse_error",
      "Open-Meteo returned no timezone.",
      { source: "openmeteo" },
    );
  }

  const kept: Record<string, unknown[]> = {};
  for (const name of ["time", ...ARCHIVE_VARIABLES]) {
    const column = hourly[name];
    if (!Array.isArray(column)) {
      throw new SourceError(
        "parse_error",
        `Open-Meteo returned no hourly ${name} column.`,
        { source: "openmeteo" },
      );
    }
    kept[name] = column;
  }

  const windUnit = units.wind_speed_10m;
  return {
    timezone,
    units: { windSpeed: typeof windUnit === "string" ? windUnit : null },
    hourly: kept,
  };
}

/** Turn the trimmed payload into hourly rows in SI units. */
export function parseArchive(
  trimmed: TrimmedArchive,
  period: ArchivePeriod,
  url: string,
  isCached: boolean,
): ArchiveResponse {
  const times = trimmed.hourly.time;
  if (times.length === 0) {
    throw new SourceError(
      "parse_error",
      "Open-Meteo returned no hourly rows.",
      { source: "openmeteo" },
    );
  }

  const hours: ArchiveHour[] = [];
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    if (typeof time !== "string") continue;
    hours.push({
      time,
      temperatureC: numberOrNull(trimmed.hourly.temperature_2m[i]),
      relativeHumidityPct: numberOrNull(
        trimmed.hourly.relative_humidity_2m[i],
      ),
      windSpeedMs: toMetresPerSecond(
        numberOrNull(trimmed.hourly.wind_speed_10m[i]),
        trimmed.units.windSpeed,
      ),
      windDirectionDeg: numberOrNull(trimmed.hourly.wind_direction_10m[i]),
      shortwaveWM2: numberOrNull(trimmed.hourly.shortwave_radiation[i]),
    });
  }

  return {
    timezone: trimmed.timezone,
    period,
    hours,
    url,
    cached: isCached,
  };
}

/**
 * The shared archive fetch. Cache key `openmeteo:<lat,lng at 1 dp>:<period>`,
 * TTL TTL_SECONDS.openMeteo. Throws SourceError; the layer fetchers catch.
 */
export async function fetchArchive(
  input: LayerInput,
  ctx: SourceContext,
): Promise<ArchiveResponse> {
  const base = resolveBaseUrl("openmeteo", ctx);
  const period = archivePeriod(ctx.now());
  const url = archiveUrl(base, input.lat, input.lng, period);
  const key = `openmeteo:${roundKey(input.lat, input.lng, 1)}:${period.start}_${period.end}`;

  const result = await cached(
    key,
    TTL_SECONDS.openMeteo,
    async () => {
      const response = await fetchWithPolicy(
        url,
        { method: "GET" },
        {
          timeoutMs: SOURCE_TIMEOUT_MS.openmeteo,
          retries: 1,
          retryOn: [502, 503, 504],
          source: "openmeteo",
        },
        ctx,
      );
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new SourceError(
          "parse_error",
          "Open-Meteo returned a body that is not JSON.",
          { source: "openmeteo" },
        );
      }
      return {
        source: "openmeteo",
        url,
        status: response.status,
        body: trimArchive(body),
        cacheable: true,
      };
    },
    ctx,
  );

  return parseArchive(
    result.entry.body as TrimmedArchive,
    period,
    url,
    result.cached,
  );
}

/** Hourly columns that contain at least one null, reported in partial.missing. */
function missingColumns(archive: ArchiveResponse): string[] {
  const names: Array<[string, (hour: ArchiveHour) => number | null]> = [
    ["temperature_2m", (hour) => hour.temperatureC],
    ["relative_humidity_2m", (hour) => hour.relativeHumidityPct],
    ["wind_speed_10m", (hour) => hour.windSpeedMs],
    ["wind_direction_10m", (hour) => hour.windDirectionDeg],
    ["shortwave_radiation", (hour) => hour.shortwaveWM2],
  ];
  return names
    .filter(([, read]) => archive.hours.some((hour) => read(hour) === null))
    .map(([name]) => name);
}

export const fetchClimate: LayerFetcher<ClimateData> = async (input, ctx) => {
  const source = {
    name: SOURCE_DISPLAY_NAMES.openmeteo,
    url: archiveUrl(
      resolveBaseUrl("openmeteo", ctx),
      input.lat,
      input.lng,
      archivePeriod(ctx.now()),
    ),
    licence: SOURCE_LICENCES.openmeteo,
    cached: false,
  };

  try {
    const archive = await fetchArchive(input, ctx);
    source.url = archive.url;
    source.cached = archive.cached;

    const { data, missing: emptyMeasures } = buildClimate(archive);
    // The columns that carry a null hour, plus the aggregates those nulls left
    // empty. Both are absences, and both are named in partial.missing.
    const missing = [...missingColumns(archive), ...emptyMeasures];
    if (missing.length > 0) {
      return partial(
        "climate",
        source,
        data,
        missing,
        "The Open-Meteo archive left some values empty. The normals are computed from the hours that are present, and a measure with no hours behind it is null.",
        { now: ctx.now },
      );
    }
    return ok("climate", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "openmeteo");
    return unavailable(
      "climate",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.openMeteo, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
