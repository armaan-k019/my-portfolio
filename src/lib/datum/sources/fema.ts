// FEMA National Flood Hazard Layer. SPEC section 9 "flood", PHASE-1 step 1.6.
// Owner: module D (flood).
//
// Request order: layer 0 at the point first, because an empty feature list
// there means the community has no published NFHL and there is nothing to ask
// layer 28 for. Only when layer 0 answers do we ask layer 28 at the point and
// layer 28 over the 800 m envelope with geometry.
//
// Two rules that are not optional (PROGRESS.md Phase 0 finding): the envelope
// request sends geometryPrecision=6, and every ring is clipped to the 800 m
// frame before the payload is cached. Unclipped, Miami returns about 17 MB for
// 43 features whose rings run far outside the frame.

import {
  FLOOD_POLYGON_CAP,
  SITE_RADIUS_M,
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
import { bboxAround, roundKey, toLocal } from "../geo";
import type {
  FloodAtPoint,
  FloodClass,
  FloodData,
  FloodPolygon,
  LatLng,
  LayerFetcher,
  LocalPoint,
} from "../types";

// ─── Classification ──────────────────────────────────────────────────────────

const NO_STATIC_BFE = -9999;

function upper(value: string | null): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Classification is by fields, never by guess (SPEC section 9). SFHA_TF wins,
 * then the two zone X subtypes, then zone D. Anything else is reported as
 * "other" with the raw zone and subtype and no risk label.
 */
export function classifyZone(
  zone: string | null,
  subtype: string | null,
  sfhaTf: string | null,
): FloodClass {
  if (upper(sfhaTf) === "T") return "sfha";
  const zoneCode = upper(zone);
  const subtypeCode = upper(subtype);
  if (zoneCode === "X") {
    if (subtypeCode.includes("0.2 PCT")) return "moderate";
    if (subtypeCode.includes("MINIMAL")) return "minimal";
  }
  if (zoneCode === "D") return "undetermined";
  return "other";
}

// ─── Ring clipping ───────────────────────────────────────────────────────────

// Sutherland-Hodgman against the square frame. Edge order: left, right,
// bottom, top. A ring that misses the frame entirely clips to nothing.
const EDGES = [0, 1, 2, 3];

function insideEdge(point: LocalPoint, edge: number, half: number): boolean {
  if (edge === 0) return point[0] >= -half;
  if (edge === 1) return point[0] <= half;
  if (edge === 2) return point[1] >= -half;
  return point[1] <= half;
}

function crossEdge(
  from: LocalPoint,
  to: LocalPoint,
  edge: number,
  half: number,
): LocalPoint {
  const vertical = edge === 0 || edge === 1;
  const limit = edge === 0 || edge === 2 ? -half : half;
  const a = vertical ? from[0] : from[1];
  const b = vertical ? to[0] : to[1];
  const span = b - a;
  const t = span === 0 ? 0 : (limit - a) / span;
  const x = vertical ? limit : from[0] + (to[0] - from[0]) * t;
  const y = vertical ? from[1] + (to[1] - from[1]) * t : limit;
  return [x, y];
}

/**
 * Clip a ring to the square frame of half width halfSizeM, centred on the
 * site. Pure. Runs before the payload is cached.
 */
export function clipRingToFrame(
  ring: LocalPoint[],
  halfSizeM: number,
): LocalPoint[] {
  if (ring.length < 3) return [];
  let output: LocalPoint[] = ring.map((point) => [point[0], point[1]]);
  for (const edge of EDGES) {
    const input = output;
    if (input.length === 0) return [];
    output = [];
    let previous = input[input.length - 1];
    for (const current of input) {
      const currentIn = insideEdge(current, edge, halfSizeM);
      const previousIn = insideEdge(previous, edge, halfSizeM);
      if (currentIn) {
        if (!previousIn) output.push(crossEdge(previous, current, edge, halfSizeM));
        output.push(current);
      } else if (previousIn) {
        output.push(crossEdge(previous, current, edge, halfSizeM));
      }
      previous = current;
    }
  }
  return output.length < 3 ? [] : output;
}

// ─── The trimmed payload that is cached ──────────────────────────────────────

interface TrimmedPoint {
  zone: string | null;
  subtype: string | null;
  sfhaTf: string | null;
  staticBfe: number | null;
}

interface TrimmedPolygon {
  zone: string | null;
  subtype: string | null;
  sfhaTf: string | null;
  /** Local metres, already clipped to the 800 m frame. */
  rings: LocalPoint[][];
}

interface TrimmedFlood {
  coverage: boolean;
  atPoint: TrimmedPoint | null;
  polygons: TrimmedPolygon[];
}

// ─── ArcGIS response reading ─────────────────────────────────────────────────

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
  geometry?: { rings?: unknown };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  error?: { code?: unknown; message?: unknown };
}

function asResponse(raw: unknown, label: string): ArcGisResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SourceError(
      "parse_error",
      `FEMA ${label} returned a body that is not an object.`,
      { source: "fema" },
    );
  }
  const body = raw as ArcGisResponse;
  if (body.error) {
    const status =
      typeof body.error.code === "number" ? body.error.code : undefined;
    const message =
      typeof body.error.message === "string"
        ? body.error.message
        : `FEMA ${label} returned an error object.`;
    throw new SourceError("http_error", message, {
      httpStatus: status,
      source: "fema",
    });
  }
  if (!Array.isArray(body.features)) {
    throw new SourceError(
      "parse_error",
      `FEMA ${label} returned no features array.`,
      { source: "fema" },
    );
  }
  return body;
}

/** ArcGIS echoes the requested field names; read them case insensitively. */
function attr(
  attributes: Record<string, unknown> | undefined,
  name: string,
): string | null {
  if (!attributes) return null;
  for (const key of Object.keys(attributes)) {
    if (key.toUpperCase() === name) {
      const value = attributes[key];
      if (value === null || value === undefined) return null;
      return String(value);
    }
  }
  return null;
}

function staticBfeOf(attributes: Record<string, unknown> | undefined): number | null {
  const raw = attr(attributes, "STATIC_BFE");
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value === NO_STATIC_BFE) return null;
  return value;
}

function trimPoint(feature: ArcGisFeature): TrimmedPoint {
  return {
    zone: attr(feature.attributes, "FLD_ZONE"),
    subtype: attr(feature.attributes, "ZONE_SUBTY"),
    sfhaTf: attr(feature.attributes, "SFHA_TF"),
    staticBfe: staticBfeOf(feature.attributes),
  };
}

function ringsOf(feature: ArcGisFeature, origin: LatLng): LocalPoint[][] {
  const raw = feature.geometry?.rings;
  if (!Array.isArray(raw)) return [];
  const out: LocalPoint[][] = [];
  for (const ring of raw) {
    if (!Array.isArray(ring)) continue;
    const local: LocalPoint[] = [];
    for (const vertex of ring) {
      if (!Array.isArray(vertex) || vertex.length < 2) continue;
      const lng = Number(vertex[0]);
      const lat = Number(vertex[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      local.push(toLocal(lat, lng, origin));
    }
    const clipped = clipRingToFrame(local, SITE_RADIUS_M);
    if (clipped.length >= 3) out.push(clipped);
  }
  return out;
}

// ─── Request URLs ────────────────────────────────────────────────────────────

const POINT_FIELDS = "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE";

function pointUrl(
  base: string,
  layer: number,
  point: LatLng,
  outFields: string,
): string {
  const geometry = `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
  return (
    `${base}/${layer}/query?geometry=${geometry}` +
    "&geometryType=esriGeometryPoint&inSR=4326" +
    "&spatialRel=esriSpatialRelIntersects" +
    `&outFields=${outFields}&returnGeometry=false&f=json`
  );
}

function envelopeUrl(base: string, point: LatLng): string {
  const box = bboxAround(point, SITE_RADIUS_M);
  const geometry = [
    box.minLng.toFixed(6),
    box.minLat.toFixed(6),
    box.maxLng.toFixed(6),
    box.maxLat.toFixed(6),
  ].join(",");
  return (
    `${base}/28/query?geometry=${geometry}` +
    "&geometryType=esriGeometryEnvelope&inSR=4326" +
    "&spatialRel=esriSpatialRelIntersects" +
    `&outFields=${POINT_FIELDS}` +
    "&returnGeometry=true&outSR=4326&geometryPrecision=6&f=json"
  );
}

async function queryFema(
  url: string,
  label: string,
  ctx: Parameters<LayerFetcher<FloodData>>[1],
): Promise<ArcGisResponse> {
  const response = await fetchWithPolicy(
    url,
    { method: "GET" },
    {
      timeoutMs: SOURCE_TIMEOUT_MS.fema,
      retries: 1,
      retryOn: [502, 503, 504],
      source: "fema",
    },
    ctx,
  );
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new SourceError(
      "parse_error",
      `FEMA ${label} returned a body that is not JSON.`,
      { source: "fema" },
    );
  }
  return asResponse(raw, label);
}

// ─── The layer fetcher ───────────────────────────────────────────────────────

export const fetchFlood: LayerFetcher<FloodData> = async (input, ctx) => {
  const base = resolveBaseUrl("fema", ctx);
  const origin: LatLng = { lat: input.lat, lng: input.lng };
  const coverageUrl = pointUrl(base, 0, origin, "STUDY_ID");
  const key = `fema:${roundKey(input.lat, input.lng, 3)}`;

  const source = {
    name: SOURCE_DISPLAY_NAMES.fema,
    url: coverageUrl,
    licence: SOURCE_LICENCES.fema,
    cached: false,
  };

  try {
    const result = await cached(
      key,
      TTL_SECONDS.fema,
      async () => {
        const coverage = await queryFema(coverageUrl, "layer 0", ctx);
        const coverageFeatures = coverage.features as ArcGisFeature[];
        if (coverageFeatures.length === 0) {
          // No NFHL here. That is a real answer, it is cached, and no second
          // request is made.
          const body: TrimmedFlood = {
            coverage: false,
            atPoint: null,
            polygons: [],
          };
          return {
            source: "fema",
            url: coverageUrl,
            status: 200,
            body,
            cacheable: true,
          };
        }

        const zonesUrl = pointUrl(base, 28, origin, POINT_FIELDS);
        const zones = await queryFema(zonesUrl, "layer 28 point", ctx);
        const zoneFeatures = zones.features as ArcGisFeature[];

        const areaUrl = envelopeUrl(base, origin);
        const area = await queryFema(areaUrl, "layer 28 envelope", ctx);
        const areaFeatures = area.features as ArcGisFeature[];

        const polygons: TrimmedPolygon[] = [];
        for (const feature of areaFeatures) {
          if (polygons.length >= FLOOD_POLYGON_CAP) break;
          // Clipping happens here, before the payload is cached.
          const rings = ringsOf(feature, origin);
          if (rings.length === 0) continue;
          polygons.push({
            zone: attr(feature.attributes, "FLD_ZONE"),
            subtype: attr(feature.attributes, "ZONE_SUBTY"),
            sfhaTf: attr(feature.attributes, "SFHA_TF"),
            rings,
          });
        }

        const body: TrimmedFlood = {
          coverage: true,
          atPoint: zoneFeatures.length > 0 ? trimPoint(zoneFeatures[0]) : null,
          polygons,
        };
        return {
          source: "fema",
          url: areaUrl,
          status: 200,
          body,
          cacheable: true,
        };
      },
      ctx,
    );

    source.cached = result.cached;
    source.url = result.entry.url;

    const payload = result.entry.body as TrimmedFlood;

    if (!payload.coverage) {
      return unavailable(
        "flood",
        source,
        "no_coverage",
        UNAVAILABLE_MESSAGES.femaNoCoverage,
        { now: ctx.now },
      );
    }

    const atPoint: FloodAtPoint | null = payload.atPoint
      ? {
          zone: payload.atPoint.zone,
          subtype: payload.atPoint.subtype,
          sfha: upper(payload.atPoint.sfhaTf) === "T",
          staticBfeFt: payload.atPoint.staticBfe,
          class: classifyZone(
            payload.atPoint.zone,
            payload.atPoint.subtype,
            payload.atPoint.sfhaTf,
          ),
        }
      : null;

    const polygons: FloodPolygon[] = payload.polygons.map((polygon) => ({
      zone: polygon.zone,
      subtype: polygon.subtype,
      sfha: upper(polygon.sfhaTf) === "T",
      class: classifyZone(polygon.zone, polygon.subtype, polygon.sfhaTf),
      rings: polygon.rings,
    }));

    const data: FloodData = { atPoint, polygons, coverage: true };

    if (atPoint === null) {
      return partial(
        "flood",
        source,
        data,
        ["atPoint"],
        "FEMA publishes a flood hazard layer here but no zone polygon covers the point itself.",
        { now: ctx.now },
      );
    }
    return ok("flood", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "fema");
    return unavailable(
      "flood",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.femaFailure, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
