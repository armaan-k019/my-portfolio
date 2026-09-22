// STUB: replaced by the Phase 1 module agent for overpass.
// Owner: module F (osm and walk shed). SPEC section 9 "osm", PHASE-1 step 1.8.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "../constants";
import { SourceError, unavailable } from "../http";
import type {
  LayerFetcher,
  LayerInput,
  OsmData,
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

/** The single query from SPEC section 9, shared by osm and walkshed. */
export function buildQuery(_lat: number, _lng: number): string {
  throw new Error("not implemented");
}

/** Keep only the tags SPEC section 9 lists, plus geometry and members. */
export function trimPayload(_raw: unknown): TrimmedOverpass {
  throw new Error("not implemented");
}

/** Parse an OSM `height` tag to metres. Anything ambiguous is null. */
export function parseHeightM(_value: string | undefined): number | null {
  throw new Error("not implemented");
}

/**
 * The one Overpass fetch per site, shared by the osm and walkshed layers
 * through the cache. Cache key `overpass:<lat,lng at 3 dp>`, TTL
 * TTL_SECONDS.overpass. Mirror order: overpass-api.de twice, then
 * overpass.kumi.systems once. Throws SourceError.
 */
export async function fetchOsmPayload(
  _input: LayerInput,
  _ctx: SourceContext,
): Promise<{ payload: TrimmedOverpass; url: string; cached: boolean }> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "overpass",
  });
}

export const fetchOsm: LayerFetcher<OsmData> = async (_input, ctx) =>
  unavailable(
    "osm",
    {
      name: SOURCE_DISPLAY_NAMES.overpass,
      url: resolveBaseUrl("overpass", ctx),
      licence: SOURCE_LICENCES.overpass,
      cached: false,
    },
    "upstream_error",
    "not implemented",
    { now: ctx.now },
  );
