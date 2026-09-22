// STUB: replaced by the Phase 1 module agent for walkshed.
// Owner: module F (osm and walk shed). SPEC section 9 "walkshed",
// PHASE-1 step 1.8. Reads the same Overpass payload as the osm layer.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "./constants";
import { unavailable } from "./http";
import type { TrimmedOverpass } from "./sources/overpass";
import type { LatLng, LayerFetcher, WalkshedData } from "./types";

export interface WalkGraph {
  /** Node key "x,y" at 1 cm rounding to the node index. */
  nodeIndex: Map<string, number>;
  nodes: Array<[number, number]>;
  /** Adjacency: node index to [neighbour index, length in metres]. */
  edges: Array<Array<[number, number]>>;
}

export function buildGraph(
  _payload: TrimmedOverpass,
  _origin: LatLng,
): WalkGraph {
  throw new Error("not implemented");
}

/** Dijkstra to 1200 m at 80 m per minute, banded 5, 10, 15 minutes. */
export function buildWalkshed(
  _payload: TrimmedOverpass,
  _origin: LatLng,
): WalkshedData {
  throw new Error("not implemented");
}

export const fetchWalkshed: LayerFetcher<WalkshedData> = async (_input, ctx) =>
  unavailable(
    "walkshed",
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
