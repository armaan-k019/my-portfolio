import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  classifyZone,
  clipRingToFrame,
  fetchFlood,
} from "../../src/lib/datum/sources/fema";
import type {
  CacheApi,
  CacheEntry,
  LayerInput,
  LocalPoint,
  SourceContext,
} from "../../src/lib/datum/types";

// Fixtures are read from disk, never fetched. No test in this file touches the
// network: every ctx.fetch below is a fake that answers from these files.
const FIXTURES = path.join(process.cwd(), "e2e", "fixtures", "fema");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, `${name}.json`), "utf8");
}

const ATLANTA = { lat: 33.7751258, lng: -84.391975 };
const MIAMI = { lat: 25.8011588, lng: -80.1890627 };
const WAKEENEY = { lat: 39.019769, lng: -99.883731 };

const FIXED_NOW = new Date("2026-09-22T12:00:00.000Z");

interface FakeFetch {
  calls: string[];
  fetch: typeof fetch;
}

/** Answers by matching the layer and geometry type in the request URL. */
function fakeFetch(
  routes: Array<{ match: (url: string) => boolean; status?: number; body: string }>,
): FakeFetch {
  const calls: string[] = [];
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const route = routes.find((candidate) => candidate.match(url));
    if (!route) throw new Error(`no fake route for ${url}`);
    const status = typeof route.status === "number" ? route.status : 200;
    return new Response(route.body, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetch: impl as unknown as typeof fetch };
}

function memoryCache(): CacheApi {
  const store = new Map<string, CacheEntry>();
  return {
    async get(key: string) {
      const hit = store.get(key);
      return hit === undefined ? null : hit;
    },
    async set(key: string, entry: CacheEntry) {
      store.set(key, entry);
    },
  };
}

function makeCtx(fake: FakeFetch, cache?: CacheApi): SourceContext {
  return {
    fetch: fake.fetch,
    cache: cache === undefined ? memoryCache() : cache,
    overrides: {},
    userAgent: "Datum unit test",
    now: () => FIXED_NOW,
    env: {},
  };
}

function makeInput(point: { lat: number; lng: number }): LayerInput {
  return { lat: point.lat, lng: point.lng, siteId: "local-test", params: {} };
}

const isLayer0 = (url: string) => url.includes("/0/query");
const isPoint28 = (url: string) =>
  url.includes("/28/query") && url.includes("esriGeometryPoint");
const isEnvelope28 = (url: string) =>
  url.includes("/28/query") && url.includes("esriGeometryEnvelope");

// ─── classifyZone ────────────────────────────────────────────────────────────

test("classifyZone reads the fields and never guesses", () => {
  expect(classifyZone("AE", null, "T")).toBe("sfha");
  expect(classifyZone("VE", null, "T")).toBe("sfha");
  expect(classifyZone("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", "F")).toBe("moderate");
  expect(classifyZone("X", "AREA OF MINIMAL FLOOD HAZARD", "F")).toBe("minimal");
  expect(classifyZone("D", null, "F")).toBe("undetermined");
  expect(classifyZone("A99", null, "F")).toBe("other");
  expect(classifyZone("X", null, "F")).toBe("other");
});

// ─── clipRingToFrame ─────────────────────────────────────────────────────────

test("clipRingToFrame clips a ring that crosses the frame", () => {
  const ring: LocalPoint[] = [
    [-200, -200],
    [900, -200],
    [900, 200],
    [-200, 200],
  ];
  const clipped = clipRingToFrame(ring, 400);
  for (const [x, y] of clipped) {
    expect(x).toBeLessThanOrEqual(400.000001);
    expect(x).toBeGreaterThanOrEqual(-400.000001);
    expect(y).toBeLessThanOrEqual(400.000001);
    expect(y).toBeGreaterThanOrEqual(-400.000001);
  }
  expect(clipped.some(([x]) => Math.abs(x - 400) < 1e-6)).toBe(true);
  expect(clipped.some(([x, y]) => x === -200 && y === -200)).toBe(true);
});

test("clipRingToFrame keeps an interior ring and drops an exterior one", () => {
  const inside: LocalPoint[] = [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ];
  expect(clipRingToFrame(inside, 400)).toEqual(inside);

  const outside: LocalPoint[] = [
    [1000, 1000],
    [1200, 1000],
    [1200, 1200],
    [1000, 1200],
  ];
  expect(clipRingToFrame(outside, 400)).toEqual([]);
  expect(clipRingToFrame([[0, 0]], 400)).toEqual([]);
});

test("clipRingToFrame turns a ring that spans the frame into the frame itself", () => {
  const spanning: LocalPoint[] = [
    [-5000, -5000],
    [5000, -5000],
    [5000, 5000],
    [-5000, 5000],
  ];
  const clipped = clipRingToFrame(spanning, 400);
  expect(clipped).toHaveLength(4);
  for (const [x, y] of clipped) {
    expect(Math.abs(Math.abs(x) - 400)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(y) - 400)).toBeLessThan(1e-6);
  }
});

// ─── fetchFlood ──────────────────────────────────────────────────────────────

test("WaKeeney layer 0 empty yields no_coverage and makes no second request", async () => {
  const fake = fakeFetch([{ match: isLayer0, body: fixture("wakeeney-layer0") }]);
  const envelope = await fetchFlood(makeInput(WAKEENEY), makeCtx(fake));

  expect(fake.calls).toHaveLength(1);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("no_coverage");
  expect(envelope.unavailable?.retryable).toBe(false);
  expect(envelope.unavailable?.message).toContain("msc.fema.gov");
  expect(envelope.source.fetchedAt).toBe(FIXED_NOW.toISOString());
});

test("Miami point is moderate, not SFHA, with a null static BFE from -9999", async () => {
  const fake = fakeFetch([
    { match: isLayer0, body: fixture("miami-layer0") },
    { match: isPoint28, body: fixture("miami-layer28-point") },
    { match: isEnvelope28, body: fixture("miami-layer28-envelope") },
  ]);
  const envelope = await fetchFlood(makeInput(MIAMI), makeCtx(fake));

  expect(envelope.status).toBe("ok");
  expect(envelope.data?.coverage).toBe(true);
  expect(envelope.data?.atPoint?.class).toBe("moderate");
  expect(envelope.data?.atPoint?.sfha).toBe(false);
  expect(envelope.data?.atPoint?.zone).toBe("X");
  expect(envelope.data?.atPoint?.staticBfeFt).toBeNull();
});

test("Miami envelope yields SFHA polygons including zone VE, all inside the frame", async () => {
  const fake = fakeFetch([
    { match: isLayer0, body: fixture("miami-layer0") },
    { match: isPoint28, body: fixture("miami-layer28-point") },
    { match: isEnvelope28, body: fixture("miami-layer28-envelope") },
  ]);
  const envelope = await fetchFlood(makeInput(MIAMI), makeCtx(fake));
  const polygons = envelope.data?.polygons;

  expect(polygons?.length).toBeGreaterThan(0);
  expect(polygons?.length).toBeLessThanOrEqual(200);
  expect(polygons?.map((polygon) => polygon.class)).toContain("sfha");
  expect(polygons?.map((polygon) => polygon.zone)).toContain("VE");
  expect(polygons?.some((polygon) => polygon.sfha)).toBe(true);

  for (const polygon of polygons ?? []) {
    expect(polygon.rings.length).toBeGreaterThan(0);
    for (const ring of polygon.rings) {
      expect(ring.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of ring) {
        expect(Math.abs(x)).toBeLessThanOrEqual(400.000001);
        expect(Math.abs(y)).toBeLessThanOrEqual(400.000001);
      }
    }
  }
});

test("the envelope request sends geometryPrecision=6 and returns geometry in 4326", async () => {
  const fake = fakeFetch([
    { match: isLayer0, body: fixture("miami-layer0") },
    { match: isPoint28, body: fixture("miami-layer28-point") },
    { match: isEnvelope28, body: fixture("miami-layer28-envelope") },
  ]);
  await fetchFlood(makeInput(MIAMI), makeCtx(fake));

  const areaUrl = fake.calls.find(isEnvelope28);
  expect(areaUrl).toBeDefined();
  expect(areaUrl).toContain("geometryPrecision=6");
  expect(areaUrl).toContain("returnGeometry=true");
  expect(areaUrl).toContain("outSR=4326");
  expect(fake.calls.find(isLayer0)).toContain("returnGeometry=false");
});

test("a warm cache answers Miami without another request", async () => {
  const cache = memoryCache();
  const routes = [
    { match: isLayer0, body: fixture("miami-layer0") },
    { match: isPoint28, body: fixture("miami-layer28-point") },
    { match: isEnvelope28, body: fixture("miami-layer28-envelope") },
  ];
  const cold = fakeFetch(routes);
  const first = await fetchFlood(makeInput(MIAMI), makeCtx(cold, cache));
  expect(first.source.cached).toBe(false);

  const warm = fakeFetch(routes);
  const second = await fetchFlood(makeInput(MIAMI), makeCtx(warm, cache));
  expect(warm.calls).toHaveLength(0);
  expect(second.source.cached).toBe(true);
  expect(second.data?.polygons.length).toBe(first.data?.polygons.length);
});

test("Atlanta point is minimal", async () => {
  const fake = fakeFetch([
    { match: isLayer0, body: fixture("atlanta-layer0") },
    { match: isPoint28, body: fixture("atlanta-layer28-point") },
    { match: isEnvelope28, body: fixture("atlanta-layer28-point") },
  ]);
  const envelope = await fetchFlood(makeInput(ATLANTA), makeCtx(fake));

  expect(envelope.status).toBe("ok");
  expect(envelope.data?.atPoint?.class).toBe("minimal");
  expect(envelope.data?.atPoint?.sfha).toBe(false);
});

test("HTTP 500 yields unavailable with http_error 500 and retryable true", async () => {
  const fake = fakeFetch([
    { match: isLayer0, status: 500, body: '{"error":{"code":500}}' },
  ]);
  const envelope = await fetchFlood(makeInput(MIAMI), makeCtx(fake));

  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("http_error");
  expect(envelope.unavailable?.httpStatus).toBe(500);
  expect(envelope.unavailable?.retryable).toBe(true);
  expect(envelope.unavailable?.message).toContain("http_error");
});

test("a body that is not JSON yields parse_error and never throws", async () => {
  const fake = fakeFetch([{ match: isLayer0, body: "<html>service unavailable</html>" }]);
  const envelope = await fetchFlood(makeInput(MIAMI), makeCtx(fake));

  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("parse_error");
  expect(envelope.data).toBeNull();
});
