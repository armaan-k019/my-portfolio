// The computed walk shed. SPEC section 9 "walkshed", PHASE-1 step 1.8.
// Reads the same Overpass payload as the osm layer, through the same cache key,
// so the two layers cost one upstream request between them.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  UNAVAILABLE_MESSAGES,
  WALK_BANDS_MIN,
  WALK_RADIUS_M,
  WALK_SPEED_M_PER_MIN,
  withCode,
} from "./constants";
import { haversineM, toLocal } from "./geo";
import { toSourceError, ok, unavailable } from "./http";
import {
  fetchOsmPayload,
  overpassUrl,
  type TrimmedOverpass,
} from "./sources/overpass";
import type {
  LatLng,
  LayerFetcher,
  LocalPoint,
  WalkshedBands,
  WalkshedData,
  WalkshedNumbers,
} from "./types";

export interface WalkGraph {
  /** Node key "x,y" at 1 cm rounding to the node index. */
  nodeIndex: Map<string, number>;
  nodes: Array<[number, number]>;
  /** Adjacency: node index to [neighbour index, length in metres]. */
  edges: Array<Array<[number, number]>>;
}

/** Highway values the walk shed traverses, per SPEC section 9. */
export const WALKABLE_HIGHWAYS: string[] = [
  "footway",
  "path",
  "steps",
  "pedestrian",
  "living_street",
  "residential",
  "tertiary",
  "secondary",
  "primary",
  "unclassified",
  "track",
  "cycleway",
];

/** The furthest a stop may sit from a reached node to count as reached. */
export const TRANSIT_SNAP_M = 150;
/** The furthest the site may sit from the start node. */
export const START_SNAP_M = 150;

export function isWalkable(tags: Record<string, string>): boolean {
  const highway = tags.highway;
  if (typeof highway !== "string") return false;
  if (!WALKABLE_HIGHWAYS.includes(highway)) return false;
  if (tags.foot === "no") return false;
  return true;
}

function nodeKey(point: LocalPoint): string {
  return `${Math.round(point[0] * 100)},${Math.round(point[1] * 100)}`;
}

/** Pure. Nodes deduped at 1 cm, edges per consecutive coordinate pair. */
export function buildGraph(payload: TrimmedOverpass, origin: LatLng): WalkGraph {
  const nodeIndex = new Map<string, number>();
  const nodes: Array<[number, number]> = [];
  const edges: Array<Array<[number, number]>> = [];

  const indexOf = (point: LocalPoint): number => {
    const key = nodeKey(point);
    const existing = nodeIndex.get(key);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    nodeIndex.set(key, index);
    nodes.push([point[0], point[1]]);
    edges.push([]);
    return index;
  };

  for (const element of payload.elements) {
    if (element.type !== "way") continue;
    if (!isWalkable(element.tags)) continue;
    const geometry = element.geometry;
    if (!geometry || geometry.length < 2) continue;

    let previousIndex: number | null = null;
    let previousLatLng: LatLng | null = null;
    for (const point of geometry) {
      const local = toLocal(point.lat, point.lon, origin);
      const index = indexOf(local);
      if (previousIndex !== null && previousLatLng !== null && previousIndex !== index) {
        const length = haversineM(previousLatLng, { lat: point.lat, lng: point.lon });
        edges[previousIndex].push([index, length]);
        edges[index].push([previousIndex, length]);
      }
      previousIndex = index;
      previousLatLng = { lat: point.lat, lng: point.lon };
    }
  }

  return { nodeIndex, nodes, edges };
}

function nearestNode(
  graph: WalkGraph,
  x: number,
  y: number,
  withinM: number,
): { index: number; distanceM: number } | null {
  let best: { index: number; distanceM: number } | null = null;
  for (let i = 0; i < graph.nodes.length; i++) {
    const [nx, ny] = graph.nodes[i];
    const distanceM = Math.hypot(nx - x, ny - y);
    if (distanceM > withinM) continue;
    if (!best || distanceM < best.distanceM) best = { index: i, distanceM };
  }
  return best;
}

/** Dijkstra with a binary heap over the adjacency list. */
function dijkstra(graph: WalkGraph, start: number, maxM: number): number[] {
  const dist = new Array<number>(graph.nodes.length).fill(Infinity);
  dist[start] = 0;
  // [distance, node] pairs, smallest distance first.
  const heap: Array<[number, number]> = [[0, start]];

  const push = (item: [number, number]): void => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      const swap = heap[parent];
      heap[parent] = heap[i];
      heap[i] = swap;
      i = parent;
    }
  };

  const pop = (): [number, number] | undefined => {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i) break;
        const swap = heap[smallest];
        heap[smallest] = heap[i];
        heap[i] = swap;
        i = smallest;
      }
    }
    return top;
  };

  for (;;) {
    const top = pop();
    if (!top) break;
    const [d, node] = top;
    if (d > dist[node]) continue;
    if (d > maxM) continue;
    for (const [neighbour, length] of graph.edges[node]) {
      const next = d + length;
      if (next > maxM) continue;
      if (next < dist[neighbour]) {
        dist[neighbour] = next;
        push([next, neighbour]);
      }
    }
  }

  return dist;
}

function bandOf(distanceM: number): 5 | 10 | 15 | null {
  const minutes = distanceM / WALK_SPEED_M_PER_MIN;
  for (const band of WALK_BANDS_MIN) {
    if (minutes <= band) return band as 5 | 10 | 15;
  }
  return null;
}

/** Pure. Dijkstra to 1200 m at 80 m per minute, banded 5, 10, 15 minutes. */
export function buildWalkshed(
  payload: TrimmedOverpass,
  origin: LatLng,
): WalkshedData | null {
  const graph = buildGraph(payload, origin);
  const start = nearestNode(graph, 0, 0, START_SNAP_M);
  if (!start) return null;

  const dist = dijkstra(graph, start.index, WALK_RADIUS_M);

  const bands: WalkshedBands = { 5: [], 10: [], 15: [] };
  const bandLengthM: Record<5 | 10 | 15, number> = { 5: 0, 10: 0, 15: 0 };
  const seen = new Set<string>();

  for (let node = 0; node < graph.nodes.length; node++) {
    if (!Number.isFinite(dist[node])) continue;
    for (const [neighbour, length] of graph.edges[node]) {
      if (!Number.isFinite(dist[neighbour])) continue;
      const pairKey = node < neighbour ? `${node}:${neighbour}` : `${neighbour}:${node}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      // The edge is banded by the arrival time at its far node.
      const band = bandOf(Math.max(dist[node], dist[neighbour]));
      if (band === null) continue;
      bands[band].push([graph.nodes[node], graph.nodes[neighbour]]);
      bandLengthM[band] += length;
    }
  }

  // reachKm is cumulative: everything reached within that many minutes.
  const reachKm: WalkshedNumbers = {
    5: Math.round((bandLengthM[5] / 1000) * 100) / 100,
    10: Math.round(((bandLengthM[5] + bandLengthM[10]) / 1000) * 100) / 100,
    15:
      Math.round(
        ((bandLengthM[5] + bandLengthM[10] + bandLengthM[15]) / 1000) * 100,
      ) / 100,
  };

  const transitCount: Record<5 | 10 | 15, number> = { 5: 0, 10: 0, 15: 0 };
  for (const element of payload.elements) {
    if (element.type !== "node") continue;
    const tags = element.tags;
    const isStop =
      tags.highway === "bus_stop" ||
      (typeof tags.railway === "string" &&
        ["station", "tram_stop", "halt"].includes(tags.railway));
    if (!isStop) continue;
    if (element.lat === undefined || element.lon === undefined) continue;
    const [x, y] = toLocal(element.lat, element.lon, origin);

    let bestMinutes: number | null = null;
    for (let node = 0; node < graph.nodes.length; node++) {
      if (!Number.isFinite(dist[node])) continue;
      const [nx, ny] = graph.nodes[node];
      if (Math.hypot(nx - x, ny - y) > TRANSIT_SNAP_M) continue;
      const minutes = dist[node] / WALK_SPEED_M_PER_MIN;
      if (bestMinutes === null || minutes < bestMinutes) bestMinutes = minutes;
    }
    if (bestMinutes === null) continue;
    for (const band of WALK_BANDS_MIN) {
      if (bestMinutes <= band) transitCount[band as 5 | 10 | 15] += 1;
    }
  }

  return {
    bands,
    reachKm,
    transitWithin: { 5: transitCount[5], 10: transitCount[10], 15: transitCount[15] },
    startNodeOffsetM: Math.round(start.distanceM * 10) / 10,
    walkingSpeedMPerMin: WALK_SPEED_M_PER_MIN,
  };
}

export const fetchWalkshed: LayerFetcher<WalkshedData> = async (input, ctx) => {
  const source = {
    name: SOURCE_DISPLAY_NAMES.overpass,
    url: overpassUrl(ctx),
    licence: SOURCE_LICENCES.overpass,
    cached: false,
  };

  try {
    const { payload, url, cached } = await fetchOsmPayload(input, ctx);
    source.url = url;
    source.cached = cached;
    const data = buildWalkshed(payload, { lat: input.lat, lng: input.lng });
    if (!data) {
      return unavailable(
        "walkshed",
        source,
        "no_coverage",
        UNAVAILABLE_MESSAGES.walkshedNoStart,
        { now: ctx.now },
      );
    }
    return ok("walkshed", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "overpass");
    return unavailable(
      "walkshed",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.overpass, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
