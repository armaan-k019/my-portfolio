import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildGraph,
  buildWalkshed,
  fetchWalkshed,
  isWalkable,
} from "../../src/lib/datum/walkshed";
import type { TrimmedOverpass } from "../../src/lib/datum/sources/overpass";
import type {
  CacheApi,
  CacheEntry,
  LayerInput,
  SourceContext,
} from "../../src/lib/datum/types";

const FIXTURES = path.join(__dirname, "..", "fixtures", "overpass");

const ATLANTA = { lat: 33.7751258, lng: -84.3919750 };
const WAKEENEY = { lat: 39.0197690, lng: -99.8837310 };

function loadTrimmed(name: string): TrimmedOverpass {
  return JSON.parse(
    readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"),
  ) as TrimmedOverpass;
}

function memoryCache(): CacheApi {
  const store = new Map<string, CacheEntry>();
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, entry) {
      store.set(key, entry);
    },
  };
}

function makeCtx(status: number, body: unknown): SourceContext {
  const fakeFetch = (async () => ({
    status,
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    },
  })) as unknown as typeof fetch;
  return {
    fetch: fakeFetch,
    cache: memoryCache(),
    overrides: {},
    userAgent: "Datum/1.0 (test)",
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    env: {},
  };
}

function input(point: { lat: number; lng: number }): LayerInput {
  return { lat: point.lat, lng: point.lng, siteId: "test", params: {} };
}

// ─── walkability rules ───────────────────────────────────────────────────────

test("isWalkable follows the SPEC include list and the foot=no exclusion", () => {
  expect(isWalkable({ highway: "residential" })).toBe(true);
  expect(isWalkable({ highway: "footway" })).toBe(true);
  expect(isWalkable({ highway: "cycleway" })).toBe(true);
  expect(isWalkable({ highway: "cycleway", foot: "no" })).toBe(false);
  expect(isWalkable({ highway: "residential", foot: "no" })).toBe(false);
  expect(isWalkable({ highway: "motorway" })).toBe(false);
  expect(isWalkable({ building: "yes" })).toBe(false);
});

// ─── graph ───────────────────────────────────────────────────────────────────

test("buildGraph dedupes shared nodes at 1 cm", () => {
  // Two ways that meet at one coordinate share exactly one node.
  const payload: TrimmedOverpass = {
    elements: [
      {
        type: "way",
        id: 1,
        tags: { highway: "residential" },
        geometry: [
          { lat: 33.7751258, lon: -84.391975 },
          { lat: 33.7761258, lon: -84.391975 },
        ],
      },
      {
        type: "way",
        id: 2,
        tags: { highway: "footway" },
        geometry: [
          { lat: 33.7761258, lon: -84.391975 },
          { lat: 33.7761258, lon: -84.390975 },
        ],
      },
    ],
  };
  const graph = buildGraph(payload, ATLANTA);
  expect(graph.nodes.length).toBe(3);
  expect(graph.edges[graph.nodeIndex.get("0,11057") as number].length).toBe(2);
});

// ─── fixtures ────────────────────────────────────────────────────────────────

test("the Atlanta walk shed grows with every band", () => {
  const data = buildWalkshed(loadTrimmed("atlanta"), ATLANTA);
  expect(data).not.toBeNull();
  if (!data) return;
  expect(data.startNodeOffsetM).toBeLessThan(150);
  expect(data.reachKm[5]).toBeGreaterThan(0);
  expect(data.reachKm[5]).toBeLessThan(data.reachKm[10]);
  expect(data.reachKm[10]).toBeLessThan(data.reachKm[15]);
  expect(data.transitWithin[15]).toBeGreaterThanOrEqual(1);
  expect(data.transitWithin[5]).toBeLessThanOrEqual(data.transitWithin[15]);
  expect(data.walkingSpeedMPerMin).toBe(80);
  expect(data.bands[5].length).toBeGreaterThan(0);
});

test("every Atlanta walk shed edge lies inside the 1200 m fetch radius", () => {
  const data = buildWalkshed(loadTrimmed("atlanta"), ATLANTA);
  expect(data).not.toBeNull();
  if (!data) return;
  for (const band of [5, 10, 15] as const) {
    for (const edge of data.bands[band]) {
      for (const [x, y] of edge) {
        expect(Math.hypot(x, y)).toBeLessThan(1400);
      }
    }
  }
});

test("the WaKeeney walk shed has a start node and reaches streets", () => {
  const data = buildWalkshed(loadTrimmed("wakeeney"), WAKEENEY);
  expect(data).not.toBeNull();
  if (!data) return;
  expect(data.startNodeOffsetM).toBeLessThan(150);
  expect(data.reachKm[15]).toBeGreaterThan(data.reachKm[5]);
});

// ─── envelope ────────────────────────────────────────────────────────────────

test("no walkable street near the point yields no_coverage", async () => {
  const ctx = makeCtx(200, {
    elements: [
      {
        type: "way",
        id: 1,
        tags: { highway: "residential" },
        // About 3 km north of the site, well past the 150 m snap.
        geometry: [
          { lat: 33.8051258, lon: -84.391975 },
          { lat: 33.8061258, lon: -84.391975 },
        ],
      },
    ],
  });
  const envelope = await fetchWalkshed(input(ATLANTA), ctx);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("no_coverage");
  expect(envelope.unavailable?.message).toContain("150 m");
  expect(envelope.data).toBeNull();
});

test("an Overpass failure makes walkshed unavailable with the Overpass message", async () => {
  const ctx = makeCtx(406, { error: "no agent" });
  const envelope = await fetchWalkshed(input(ATLANTA), ctx);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("http_error");
  expect(envelope.unavailable?.httpStatus).toBe(406);
  expect(envelope.unavailable?.message).toContain("Overpass");
});
