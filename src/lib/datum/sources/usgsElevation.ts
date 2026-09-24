// USGS elevation: the EPQS point and the 3DEP getSamples grid.
// SPEC section 5 and section 9 "topo", PHASE-1 step 1.4.

import {
  GRID_N,
  GRID_SPACING_M,
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
import { buildTopo, gridPoints } from "../topo";
import type {
  LatLng,
  LayerFetcher,
  SourceContext,
  TopoData,
} from "../types";

/** Below this many parsed samples the grid is not usable at all. */
const MIN_USABLE_SAMPLES = 300;

interface EpqsBody {
  value?: unknown;
}

interface SampleBody {
  locationId?: unknown;
  value?: unknown;
}

interface SamplesBody {
  samples?: unknown;
  error?: unknown;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** The EPQS request URL for a point. */
export function epqsUrl(point: LatLng, ctx: Pick<SourceContext, "overrides">): string {
  const base = resolveBaseUrl("usgs_epqs", ctx);
  return `${base}?x=${point.lng.toFixed(6)}&y=${point.lat.toFixed(6)}&units=Meters&wkid=4326&includeDate=false`;
}

/** The esriGeometryMultipoint body for a list of points, in input order. */
export function multipointGeometry(points: LatLng[]): string {
  return JSON.stringify({
    points: points.map((point) => [
      Number(point.lng.toFixed(7)),
      Number(point.lat.toFixed(7)),
    ]),
    spatialReference: { wkid: 4326 },
  });
}

/** Pure parser for the EPQS body. Throws SourceError on an unusable shape. */
export function parsePointElevation(raw: unknown): number {
  if (!raw || typeof raw !== "object") {
    throw new SourceError(
      "parse_error",
      "USGS EPQS returned a body that is not an object.",
      { source: "usgs_epqs" },
    );
  }
  const value = asNumber((raw as EpqsBody).value);
  if (value === null) {
    throw new SourceError(
      "parse_error",
      "USGS EPQS returned no numeric elevation for this point.",
      { source: "usgs_epqs" },
    );
  }
  return value;
}

/**
 * Pure parser for the 3DEP getSamples body. The result is aligned with the
 * input order through `samples[i].locationId`; a missing sample is null.
 */
export function parseGridSamples(raw: unknown, count: number): Array<number | null> {
  if (!raw || typeof raw !== "object") {
    throw new SourceError(
      "parse_error",
      "USGS 3DEP returned a body that is not an object.",
      { source: "usgs_3dep" },
    );
  }
  const body = raw as SamplesBody;
  if (!Array.isArray(body.samples)) {
    throw new SourceError(
      "parse_error",
      "USGS 3DEP returned no samples array.",
      { source: "usgs_3dep" },
    );
  }
  const values: Array<number | null> = new Array(count).fill(null);
  for (const entry of body.samples) {
    if (!entry || typeof entry !== "object") continue;
    const sample = entry as SampleBody;
    const index = asNumber(sample.locationId);
    if (index === null || !Number.isInteger(index)) continue;
    if (index < 0 || index >= count) continue;
    values[index] = asNumber(sample.value);
  }
  return values;
}

interface PointResult {
  elevationM: number;
  cached: boolean;
  url: string;
}

async function epqs(point: LatLng, ctx: SourceContext): Promise<PointResult> {
  const url = epqsUrl(point, ctx);
  const key = `usgs_epqs:${roundKey(point.lat, point.lng, 3)}`;
  const result = await cached(
    key,
    TTL_SECONDS.usgsElevation,
    async () => {
      const response = await fetchWithPolicy(
        url,
        { method: "GET" },
        {
          timeoutMs: SOURCE_TIMEOUT_MS.usgs_epqs,
          retries: 1,
          retryOn: [502, 503, 504],
          source: "usgs_epqs",
        },
        ctx,
      );
      const body = await response.json();
      // Trim before caching: the parser needs the value and nothing else.
      const elevationM = parsePointElevation(body);
      return {
        source: "usgs_epqs",
        url,
        status: response.status,
        body: { elevationM },
        cacheable: true,
      };
    },
    ctx,
  );
  const stored = result.entry.body as { elevationM?: unknown };
  const elevationM = asNumber(stored.elevationM);
  if (elevationM === null) {
    throw new SourceError(
      "parse_error",
      "The cached USGS EPQS entry holds no numeric elevation.",
      { source: "usgs_epqs" },
    );
  }
  return { elevationM, cached: result.cached, url };
}

interface GridResult {
  values: Array<number | null>;
  cached: boolean;
  url: string;
}

async function grid(points: LatLng[], ctx: SourceContext): Promise<GridResult> {
  const url = resolveBaseUrl("usgs_3dep", ctx);
  // The grid is centred on the site, so the middle point is the cache key.
  const centre = points[Math.floor(points.length / 2)];
  const key = `usgs_3dep:${roundKey(centre.lat, centre.lng, 3)}`;

  const result = await cached(
    key,
    TTL_SECONDS.usgsElevation,
    async () => {
      const form = new URLSearchParams({
        geometry: multipointGeometry(points),
        geometryType: "esriGeometryMultipoint",
        returnFirstValueOnly: "true",
        f: "json",
      });
      const response = await fetchWithPolicy(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        },
        {
          timeoutMs: SOURCE_TIMEOUT_MS.usgs_3dep,
          retries: 1,
          retryOn: [502, 503, 504],
          source: "usgs_3dep",
        },
        ctx,
      );
      const body = await response.json();
      const values = parseGridSamples(body, points.length);
      const present = values.filter((value) => value !== null).length;
      // A grid this sparse is not a usable surface, and it is never cached.
      if (present < MIN_USABLE_SAMPLES) {
        throw new SourceError(
          "parse_error",
          `USGS 3DEP returned ${present} of ${points.length} elevation samples.`,
          { source: "usgs_3dep" },
        );
      }
      return {
        source: "usgs_3dep",
        url,
        status: response.status,
        body: { values },
        cacheable: true,
      };
    },
    ctx,
  );

  const stored = result.entry.body as { values?: unknown };
  if (!Array.isArray(stored.values)) {
    throw new SourceError(
      "parse_error",
      "The cached USGS 3DEP entry holds no sample array.",
      { source: "usgs_3dep" },
    );
  }
  const values = (stored.values as unknown[]).map((value) => asNumber(value));
  return { values, cached: result.cached, url };
}

/** EPQS point elevation in metres. Throws SourceError. */
export async function fetchPointElevation(
  point: LatLng,
  ctx: SourceContext,
): Promise<number> {
  const result = await epqs(point, ctx);
  return result.elevationM;
}

/**
 * 3DEP getSamples for one multipoint. The result is aligned with the input
 * order through `samples[i].locationId`; a missing sample is null.
 */
export async function fetchGridSamples(
  points: LatLng[],
  ctx: SourceContext,
): Promise<Array<number | null>> {
  const result = await grid(points, ctx);
  return result.values;
}

export const fetchTopo: LayerFetcher<TopoData> = async (input, ctx) => {
  const source = {
    name: SOURCE_DISPLAY_NAMES.usgs_3dep,
    url: resolveBaseUrl("usgs_3dep", ctx),
    licence: SOURCE_LICENCES.usgs_3dep,
    cached: false,
  };

  try {
    const origin: LatLng = { lat: input.lat, lng: input.lng };
    const points = gridPoints(origin, GRID_N, GRID_SPACING_M);
    const samples = await grid(points, ctx);
    source.cached = samples.cached;

    const missing: string[] = [];
    const present = samples.values.filter((value) => value !== null).length;
    const messages: string[] = [];
    if (present < points.length) {
      missing.push("grid.values");
      messages.push(
        `USGS 3DEP returned ${present} of ${points.length} elevation samples.`,
      );
    }

    // The point elevation is a second request. Losing it leaves the surface
    // intact, so it is a missing field rather than an unavailable layer.
    let siteElevationM: number | null = null;
    try {
      const point = await epqs(origin, ctx);
      siteElevationM = point.elevationM;
      source.cached = samples.cached && point.cached;
    } catch {
      missing.push("siteElevationM");
      messages.push(
        "The USGS Elevation Point Query Service did not answer for the site point.",
      );
    }

    const data = buildTopo(
      siteElevationM,
      samples.values,
      GRID_SPACING_M,
      GRID_N,
    );

    // A degenerate grid leaves a derived measure with nothing behind it. Those
    // are null in the data and are named here rather than reported as zero.
    const derived: Array<[string, number | null]> = [
      ["reliefM", data.reliefM],
      ["meanSlopePct", data.meanSlopePct],
      ["aspectDeg", data.aspectDeg],
    ];
    for (const [name, value] of derived) {
      if (value === null) missing.push(name);
    }
    if (missing.length > 0 && messages.length === 0) {
      messages.push(
        "Some derived measures have no samples behind them and are null.",
      );
    }

    if (missing.length > 0) {
      return partial("topo", source, data, missing, messages.join(" "), {
        now: ctx.now,
      });
    }
    return ok("topo", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "usgs_3dep");
    return unavailable(
      "topo",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.usgsElevation, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
