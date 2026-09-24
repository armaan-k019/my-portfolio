// Overpass (OpenStreetMap) source. SPEC section 9 "osm", PHASE-1 step 1.8.
// One query per site, fetched once and shared by the osm and walkshed layers
// through a single cache key. Overpass is unreliable: 406 without a
// User-Agent, intermittent 504 "server is probably too busy", two slots per IP.

import {
  FRAME_SIZE_M,
  SITE_RADIUS_M,
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  SOURCE_TIMEOUT_MS,
  TTL_SECONDS,
  UNAVAILABLE_MESSAGES,
  WALL_CLOCK_CAP_MS,
  resolveBaseUrl,
  withCode,
  type SourceName,
} from "../constants";
import { CACHE_SIZE_WARN_BYTES, cached } from "../cache";
import {
  SourceError,
  fetchWithPolicy,
  ok,
  toSourceError,
  unavailable,
} from "../http";
import { ringAreaM2, roundKey, toLocal } from "../geo";
import type {
  LatLng,
  LayerFetcher,
  LayerInput,
  LocalPoint,
  OsmBuilding,
  OsmData,
  OsmStats,
  OsmStreet,
  OsmTransitStop,
  OsmWater,
  SourceContext,
} from "../types";

/** The trimmed Overpass payload that is stored in api_cache. */
export interface TrimmedElement {
  type: "node" | "way" | "relation";
  id: number;
  tags: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  lat?: number;
  lon?: number;
  members?: Array<{ type: string; ref: number; role: string }>;
}

export interface TrimmedOverpass {
  elements: TrimmedElement[];
}

/** The only tags kept by trimPayload, per SPEC section 9. */
export const KEPT_TAGS: string[] = [
  "building",
  "building:levels",
  "height",
  "name",
  "highway",
  "foot",
  "sidewalk",
  "natural",
  "waterway",
  "railway",
];

/** The single query from SPEC section 9, shared by osm and walkshed. */
export function buildQuery(lat: number, lng: number): string {
  return `[out:json][timeout:45];
(
  way["building"](around:${SITE_RADIUS_M},${lat},${lng});
  relation["building"](around:${SITE_RADIUS_M},${lat},${lng});
  way["natural"="water"](around:${SITE_RADIUS_M},${lat},${lng});
  relation["natural"="water"](around:${SITE_RADIUS_M},${lat},${lng});
  way["waterway"](around:${SITE_RADIUS_M},${lat},${lng});
  way["natural"="coastline"](around:${SITE_RADIUS_M},${lat},${lng});
  way["highway"]["highway"!~"motorway|motorway_link|trunk|trunk_link|proposed|construction|abandoned|raceway"](around:1200,${lat},${lng});
  node["highway"="bus_stop"](around:1200,${lat},${lng});
  node["railway"~"^(station|tram_stop|halt)$"](around:1200,${lat},${lng});
);
out geom;
`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Keep only the tags SPEC section 9 lists, plus geometry and members. */
export function trimPayload(raw: unknown): TrimmedOverpass {
  const body = asRecord(raw);
  if (!body || !Array.isArray(body.elements)) {
    throw new SourceError(
      "parse_error",
      "Overpass returned a body without an elements array.",
    );
  }
  const elements: TrimmedElement[] = [];
  for (const item of body.elements as unknown[]) {
    const element = asRecord(item);
    if (!element) continue;
    const type = element.type;
    if (type !== "node" && type !== "way" && type !== "relation") continue;
    const id = numberOrUndefined(element.id);
    if (id === undefined) continue;

    const tags: Record<string, string> = {};
    const rawTags = asRecord(element.tags);
    if (rawTags) {
      for (const name of KEPT_TAGS) {
        const value = rawTags[name];
        if (typeof value === "string") tags[name] = value;
      }
    }

    const trimmed: TrimmedElement = { type, id, tags };

    if (Array.isArray(element.geometry)) {
      const geometry: Array<{ lat: number; lon: number }> = [];
      for (const point of element.geometry as unknown[]) {
        const p = asRecord(point);
        if (!p) continue;
        const lat = numberOrUndefined(p.lat);
        const lon = numberOrUndefined(p.lon);
        if (lat === undefined || lon === undefined) continue;
        geometry.push({ lat, lon });
      }
      if (geometry.length > 0) trimmed.geometry = geometry;
    }

    const lat = numberOrUndefined(element.lat);
    const lon = numberOrUndefined(element.lon);
    if (lat !== undefined) trimmed.lat = lat;
    if (lon !== undefined) trimmed.lon = lon;

    if (Array.isArray(element.members)) {
      const members: Array<{ type: string; ref: number; role: string }> = [];
      for (const member of element.members as unknown[]) {
        const m = asRecord(member);
        if (!m) continue;
        const ref = numberOrUndefined(m.ref);
        if (ref === undefined || typeof m.type !== "string") continue;
        members.push({
          type: m.type,
          ref,
          role: typeof m.role === "string" ? m.role : "",
        });
        // Relation member geometry is carried on the member in `out geom`.
        if (Array.isArray(m.geometry)) {
          const geometry: Array<{ lat: number; lon: number }> = [];
          for (const point of m.geometry as unknown[]) {
            const p = asRecord(point);
            if (!p) continue;
            const pLat = numberOrUndefined(p.lat);
            const pLon = numberOrUndefined(p.lon);
            if (pLat === undefined || pLon === undefined) continue;
            geometry.push({ lat: pLat, lon: pLon });
          }
          if (geometry.length > 0) {
            (members[members.length - 1] as { geometry?: unknown }).geometry =
              geometry;
          }
        }
      }
      if (members.length > 0) trimmed.members = members;
    }

    elements.push(trimmed);
  }
  return { elements };
}

const FEET_PER_METRE = 3.28084;

/**
 * Parse an OSM `height` tag to metres. Anything ambiguous is null. Levels are
 * never converted to metres: a storey height would be an invented number.
 */
export function parseHeightM(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0) return null;

  const plain = /^(\d+(?:\.\d+)?)$/.exec(text);
  if (plain) return Number(plain[1]);

  const metres = /^(\d+(?:\.\d+)?)\s*m$/i.exec(text);
  if (metres) return Number(metres[1]);

  // Feet and optional inches: 40', 40'6", 40 ft.
  const feet = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/i.exec(
    text,
  );
  if (feet) {
    const totalFeet = Number(feet[1]) + (feet[2] ? Number(feet[2]) / 12 : 0);
    return Math.round((totalFeet / FEET_PER_METRE) * 100) / 100;
  }

  return null;
}

/** Parse `building:levels` as an integer only. */
export function parseLevels(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

interface Attempt {
  source: SourceName;
}

/**
 * Mirror order from SPEC section 8 rule 6: overpass-api.de twice, then
 * overpass.kumi.systems once, each with its own 45 s timeout.
 */
const ATTEMPT_ORDER: Attempt[] = [
  { source: "overpass" },
  { source: "overpass" },
  { source: "overpass_mirror" },
];

/**
 * The wall clock the three mirror attempts share. Without it each attempt would
 * start its own 55 s cap and three timeouts would run for 135 s, well past the
 * 60 s route budget.
 */
let budgetMs = WALL_CLOCK_CAP_MS;

/** How much of the shared budget must remain for another attempt to be worth it. */
const MIN_ATTEMPT_BUDGET_MS = 2_000;

/** Test seam. Not used in production code paths. */
export function setOverpassBudgetMsForTests(ms: number): void {
  budgetMs = ms;
}

/** Test seam. Restores the 55 s cap. */
export function resetOverpassBudgetForTests(): void {
  budgetMs = WALL_CLOCK_CAP_MS;
}

/** The URL that goes in the envelope and the cache row. */
export function overpassUrl(ctx: Pick<SourceContext, "overrides">): string {
  return resolveBaseUrl("overpass", ctx);
}

async function requestOverpass(
  query: string,
  ctx: SourceContext,
): Promise<{ body: unknown; url: string; status: number }> {
  let lastError: SourceError | null = null;
  // One deadline for all three attempts, computed once before the loop.
  const deadline = Date.now() + budgetMs;
  for (const attempt of ATTEMPT_ORDER) {
    if (deadline - Date.now() < MIN_ATTEMPT_BUDGET_MS) {
      throw (
        lastError ??
        new SourceError(
          "timeout",
          "Overpass exhausted the shared request budget.",
          { source: attempt.source },
        )
      );
    }
    const url = resolveBaseUrl(attempt.source, ctx);
    try {
      const response = await fetchWithPolicy(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({ data: query }).toString(),
        },
        {
          timeoutMs: SOURCE_TIMEOUT_MS[attempt.source],
          // Every attempt shares the deadline, so the per attempt timeout is
          // whatever is left of it.
          deadlineMs: deadline,
          // fetchWithPolicy retries inside one mirror; the mirror order is the
          // outer loop, so each attempt is a single request.
          retries: 0,
          retryOn: [],
          source: attempt.source,
        },
        ctx,
      );
      const body = await response.json();
      return { body, url, status: response.status };
    } catch (raw) {
      const error = toSourceError(raw, attempt.source);
      // A 406 means the User-Agent did not arrive. Another mirror will not fix
      // it, so it is not retried.
      if (error.httpStatus === 406) throw error;
      lastError = error;
    }
  }
  throw (
    lastError ??
    new SourceError("upstream_error", "Overpass made no attempt.", {
      source: "overpass",
    })
  );
}

/**
 * The one Overpass fetch per site, shared by the osm and walkshed layers
 * through the cache. Cache key `overpass:<lat,lng at 3 dp>`, TTL
 * TTL_SECONDS.overpass. Throws SourceError.
 */
export async function fetchOsmPayload(
  input: LayerInput,
  ctx: SourceContext,
): Promise<{
  payload: TrimmedOverpass;
  url: string;
  cached: boolean;
  sizeWarning: { bytes: number; thresholdBytes: number } | null;
}> {
  const key = `overpass:${roundKey(input.lat, input.lng, 3)}`;
  const query = buildQuery(input.lat, input.lng);

  const result = await cached(
    key,
    TTL_SECONDS.overpass,
    async () => {
      const { body, url, status } = await requestOverpass(query, ctx);
      // Trim before caching: the 1.2 km Atlanta street set is 3.3 MB raw.
      const trimmed = trimPayload(body);
      return {
        source: "overpass",
        url,
        status,
        body: trimmed,
        cacheable: true,
      };
    },
    ctx,
  );

  const body = result.entry.body;
  const payload =
    body && typeof body === "object" && Array.isArray((body as TrimmedOverpass).elements)
      ? (body as TrimmedOverpass)
      : null;
  if (!payload) {
    throw new SourceError("parse_error", "The cached Overpass payload is not usable.", {
      source: "overpass",
    });
  }
  return {
    payload,
    url: result.entry.url,
    cached: result.cached,
    sizeWarning: result.sizeWarning
      ? {
          bytes: result.entry.bodyBytes ?? 0,
          thresholdBytes: CACHE_SIZE_WARN_BYTES,
        }
      : null,
  };
}

// ─── osm layer ───────────────────────────────────────────────────────────────

function ringFrom(
  geometry: Array<{ lat: number; lon: number }> | undefined,
  origin: LatLng,
): LocalPoint[] {
  if (!geometry) return [];
  return geometry.map((p) => toLocal(p.lat, p.lon, origin));
}

function isClosed(ring: LocalPoint[]): boolean {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return Math.abs(first[0] - last[0]) < 0.01 && Math.abs(first[1] - last[1]) < 0.01;
}

function memberGeometry(
  member: { type: string; role: string } & { geometry?: unknown },
): Array<{ lat: number; lon: number }> | undefined {
  const geometry = (member as { geometry?: unknown }).geometry;
  if (!Array.isArray(geometry)) return undefined;
  return geometry as Array<{ lat: number; lon: number }>;
}

/**
 * Sutherland-Hodgman clip of a ring to the square frame. A building that runs
 * past the frame contributes only the part that is drawn, so the coverage
 * ratio cannot exceed 1 through geometry that is off the sheet. The same
 * approach is used for flood polygons in sources/fema.ts; each module keeps its
 * own copy rather than importing across sources.
 */
function clipRingToFrame(ring: LocalPoint[], halfSizeM: number): LocalPoint[] {
  if (ring.length < 3) return [];
  // Each edge keeps the half plane on the inside of the frame.
  const edges: Array<[(point: LocalPoint) => number]> = [
    [(point) => halfSizeM - point[0]],
    [(point) => point[0] + halfSizeM],
    [(point) => halfSizeM - point[1]],
    [(point) => point[1] + halfSizeM],
  ];

  let output: LocalPoint[] = ring.map((point) => [point[0], point[1]]);
  for (const [distance] of edges) {
    const inputRing = output;
    if (inputRing.length === 0) return [];
    output = [];
    let previous = inputRing[inputRing.length - 1];
    for (const current of inputRing) {
      const currentDistance = distance(current);
      const previousDistance = distance(previous);
      const cross = (): LocalPoint => {
        const t = previousDistance / (previousDistance - currentDistance);
        return [
          previous[0] + t * (current[0] - previous[0]),
          previous[1] + t * (current[1] - previous[1]),
        ];
      };
      if (currentDistance >= 0) {
        if (previousDistance < 0) output.push(cross());
        output.push(current);
      } else if (previousDistance >= 0) {
        output.push(cross());
      }
      previous = current;
    }
  }
  return output.length < 3 ? [] : output;
}

/** Pure: turn the trimmed payload into the osm layer data. */
export function buildOsm(payload: TrimmedOverpass, origin: LatLng): OsmData {
  const buildings: OsmBuilding[] = [];
  // One key per drawn ring, naming the OSM feature the ring came from. A
  // multipolygon contributes several rings and is still one building.
  const featureKeys: string[] = [];
  const water: OsmWater[] = [];
  const streets: OsmStreet[] = [];
  const transitStops: OsmTransitStop[] = [];
  let relationCount = 0;

  for (const element of payload.elements) {
    const tags = element.tags;

    if (element.type === "node") {
      const lat = element.lat;
      const lon = element.lon;
      if (lat === undefined || lon === undefined) continue;
      const kind: "bus" | "rail" | null =
        tags.highway === "bus_stop"
          ? "bus"
          : typeof tags.railway === "string" &&
              ["station", "tram_stop", "halt"].includes(tags.railway)
            ? "rail"
            : null;
      if (!kind) continue;
      const [x, y] = toLocal(lat, lon, origin);
      transitStops.push({
        id: element.id,
        kind,
        x,
        y,
        name: typeof tags.name === "string" ? tags.name : null,
      });
      continue;
    }

    if (element.type === "relation") {
      if (typeof tags.building !== "string" && tags.natural !== "water") continue;
      relationCount += 1;
      // Outer member ways become rings. Inner members are ignored in v1.
      for (const member of element.members ?? []) {
        if (member.type !== "way") continue;
        if (member.role !== "outer" && member.role !== "") continue;
        const ring = ringFrom(memberGeometry(member), origin);
        if (ring.length < 3) continue;
        if (typeof tags.building === "string") {
          buildings.push({
            id: member.ref,
            ring,
            heightM: parseHeightM(tags.height),
            levels: parseLevels(tags["building:levels"]),
            name: typeof tags.name === "string" ? tags.name : null,
          });
          featureKeys.push(`r${element.id}`);
        } else {
          water.push({ ring, line: null });
        }
      }
      continue;
    }

    // Ways.
    const line = ringFrom(element.geometry, origin);
    if (line.length < 2) continue;

    if (typeof tags.building === "string") {
      if (line.length < 3) continue;
      buildings.push({
        id: element.id,
        ring: line,
        heightM: parseHeightM(tags.height),
        levels: parseLevels(tags["building:levels"]),
        name: typeof tags.name === "string" ? tags.name : null,
      });
      featureKeys.push(`w${element.id}`);
      continue;
    }

    if (tags.natural === "water") {
      water.push(
        isClosed(line) ? { ring: line, line: null } : { ring: null, line },
      );
      continue;
    }

    if (typeof tags.waterway === "string" || tags.natural === "coastline") {
      water.push({ ring: null, line });
      continue;
    }

    if (typeof tags.highway === "string") {
      streets.push({
        id: element.id,
        highway: tags.highway,
        line,
        foot: tags.foot !== "no",
      });
    }
  }

  const half = FRAME_SIZE_M / 2;
  let footprintArea = 0;
  // Counted over features, not rings: a multipolygon with six outer rings is
  // one building with a height, not six.
  const seen = new Set<string>();
  let withHeight = 0;
  let withLevels = 0;
  buildings.forEach((building, index) => {
    const key = featureKeys[index];
    if (!seen.has(key)) {
      seen.add(key);
      if (building.heightM !== null) withHeight += 1;
      if (building.levels !== null) withLevels += 1;
    }
    // Every ring contributes the part of its footprint that is on the sheet.
    const clipped = clipRingToFrame(building.ring, half);
    if (clipped.length >= 3) footprintArea += ringAreaM2(clipped);
  });

  const stats: OsmStats = {
    buildingCount: seen.size,
    ringCount: buildings.length,
    withHeight,
    withLevels,
    relationCount,
    coverageRatio:
      Math.round((footprintArea / (FRAME_SIZE_M * FRAME_SIZE_M)) * 10000) / 10000,
  };

  return { buildings, water, streets, transitStops, stats };
}

export const fetchOsm: LayerFetcher<OsmData> = async (input, ctx) => {
  const source = {
    name: SOURCE_DISPLAY_NAMES.overpass,
    url: overpassUrl(ctx),
    licence: SOURCE_LICENCES.overpass,
    cached: false,
  };

  try {
    const {
      payload,
      url,
      cached: fromCache,
      sizeWarning,
    } = await fetchOsmPayload(input, ctx);
    source.url = url;
    source.cached = fromCache;
    const data = buildOsm(payload, { lat: input.lat, lng: input.lng });
    if (sizeWarning) data.stats.sizeWarning = sizeWarning;
    return ok("osm", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "overpass");
    return unavailable(
      "osm",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.overpass, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
