import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { buildTopo, contourLines, gridPoints } from "../../src/lib/datum/topo";
import {
  fetchTopo,
  multipointGeometry,
  parseGridSamples,
  parsePointElevation,
} from "../../src/lib/datum/sources/usgsElevation";
import { toLocal } from "../../src/lib/datum/geo";
import { GRID_N, GRID_SPACING_M } from "../../src/lib/datum/constants";
import type {
  CacheApi,
  CacheEntry,
  LatLng,
  SourceContext,
  TopoData,
} from "../../src/lib/datum/types";

const FIXTURES = path.join(process.cwd(), "e2e/fixtures/usgs-elevation");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as unknown;
}

const ATLANTA: LatLng = { lat: 33.7751258, lng: -84.391975 };
const NOW = () => new Date("2026-09-22T12:00:00.000Z");

interface SamplesFixture {
  samples: unknown[];
}

function epqsFixture(): unknown {
  return fixture("atlanta-epqs.json");
}

function samplesFixture(limit?: number): SamplesFixture {
  const body = fixture("atlanta-3dep.json") as SamplesFixture;
  if (limit === undefined) return body;
  return { samples: body.samples.slice(0, limit) };
}

function atlantaValues(limit?: number): Array<number | null> {
  return parseGridSamples(samplesFixture(limit), GRID_N * GRID_N);
}

/** A cache that lives for one test only. */
function freshCache(): CacheApi {
  const store = new Map<string, CacheEntry>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, entry: CacheEntry) {
      store.set(key, entry);
    },
  };
}

interface FakeFetchOptions {
  epqsStatus?: number;
  sampleLimit?: number;
}

function fakeContext(options: FakeFetchOptions = {}): {
  ctx: SourceContext;
  calls: string[];
} {
  const calls: string[] = [];
  const ctx: SourceContext = {
    fetch: (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : String(input);
      calls.push(url);
      if (url.includes("epqs")) {
        const status = options.epqsStatus ?? 200;
        return new Response(JSON.stringify(epqsFixture()), { status });
      }
      return new Response(JSON.stringify(samplesFixture(options.sampleLimit)), {
        status: 200,
      });
    }) as typeof fetch,
    cache: freshCache(),
    overrides: {},
    userAgent: "Datum/1.0 (unit test)",
    now: NOW,
    env: {},
  };
  return { ctx, calls };
}

// ─── Pure geometry ───────────────────────────────────────────────────────────

test("gridPoints is row major, north to south and west to east", () => {
  const points = gridPoints(ATLANTA, GRID_N, GRID_SPACING_M);
  expect(points.length).toBe(GRID_N * GRID_N);

  const first = toLocal(points[0].lat, points[0].lng, ATLANTA);
  expect(first[0]).toBeCloseTo(-400, 6);
  expect(first[1]).toBeCloseTo(400, 6);

  const centre = points[Math.floor(points.length / 2)];
  expect(centre.lat).toBeCloseTo(ATLANTA.lat, 9);
  expect(centre.lng).toBeCloseTo(ATLANTA.lng, 9);

  const last = toLocal(
    points[points.length - 1].lat,
    points[points.length - 1].lng,
    ATLANTA,
  );
  expect(last[0]).toBeCloseTo(400, 6);
  expect(last[1]).toBeCloseTo(-400, 6);
});

test("the recorded geometry matches what gridPoints builds today", () => {
  const recorded = fixture("atlanta-3dep-geometry.json") as {
    points: number[][];
  };
  const built = JSON.parse(
    multipointGeometry(gridPoints(ATLANTA, GRID_N, GRID_SPACING_M)),
  ) as { points: number[][] };
  expect(built.points).toEqual(recorded.points);
});

test("parsePointElevation reads the EPQS string value", () => {
  expect(parsePointElevation(epqsFixture())).toBeCloseTo(281.726287842, 6);
  expect(() => parsePointElevation({ value: null })).toThrow();
  expect(() => parsePointElevation("281.7")).toThrow();
});

test("parseGridSamples aligns on locationId and pads the gaps", () => {
  const values = atlantaValues();
  expect(values.length).toBe(441);
  expect(values.filter((value) => value !== null).length).toBe(441);

  const sparse = parseGridSamples(
    { samples: [{ locationId: 3, value: "12.5" }, { locationId: 900, value: "9" }] },
    441,
  );
  expect(sparse[3]).toBe(12.5);
  expect(sparse.filter((value) => value !== null).length).toBe(1);
});

test("the Atlanta fixture yields 4 to 20 contour lines inside the frame", () => {
  const { intervalM, lines } = contourLines(
    atlantaValues(),
    GRID_N,
    GRID_SPACING_M,
  );
  expect([1, 2, 5, 10]).toContain(intervalM);
  expect(lines.length).toBeGreaterThanOrEqual(4);
  expect(lines.length).toBeLessThanOrEqual(20);

  for (const line of lines) {
    expect(line.length).toBeGreaterThan(2);
    for (const [x, y] of line) {
      expect(Math.abs(x)).toBeLessThanOrEqual(420);
      expect(Math.abs(y)).toBeLessThanOrEqual(420);
    }
  }
});

test("buildTopo reports the Atlanta surface", () => {
  const data = buildTopo(281.726287842, atlantaValues(), GRID_SPACING_M, GRID_N);
  expect(data.siteElevationM).toBeGreaterThan(270);
  expect(data.siteElevationM).toBeLessThan(295);
  expect(data.reliefM as number).toBeGreaterThan(5);
  expect(data.reliefM as number).toBeLessThan(80);
  expect(data.sections.ew.length).toBe(GRID_N);
  expect(data.sections.ns.length).toBe(GRID_N);
  expect(data.grid.values.length).toBe(GRID_N * GRID_N);
  expect(data.meanSlopePct as number).toBeGreaterThan(0);
  expect(data.aspectDeg as number).toBeGreaterThanOrEqual(0);
  expect(data.aspectDeg as number).toBeLessThan(360);
});

test("a degenerate grid reports null, not zero, for every derived measure", () => {
  const empty = new Array<number | null>(GRID_N * GRID_N).fill(null);
  const bare = buildTopo(null, empty, GRID_SPACING_M, GRID_N);
  expect(bare.reliefM).toBeNull();
  expect(bare.meanSlopePct).toBeNull();
  expect(bare.aspectDeg).toBeNull();
  expect(bare.contours.lines).toEqual([]);

  // A level surface has a relief of zero, which is measured, but no aspect.
  const level = new Array<number | null>(GRID_N * GRID_N).fill(100);
  const flat = buildTopo(100, level, GRID_SPACING_M, GRID_N);
  expect(flat.reliefM).toBe(0);
  expect(flat.meanSlopePct).toBe(0);
  expect(flat.aspectDeg).toBeNull();

  // Two samples cannot carry a plane or a central difference.
  const sparse = new Array<number | null>(GRID_N * GRID_N).fill(null);
  sparse[0] = 10;
  sparse[1] = 12;
  const thin = buildTopo(null, sparse, GRID_SPACING_M, GRID_N);
  expect(thin.reliefM).toBe(2);
  expect(thin.meanSlopePct).toBeNull();
  expect(thin.aspectDeg).toBeNull();
});

test("a south facing plane has an aspect of 180 degrees", () => {
  const values: number[] = [];
  for (let row = 0; row < GRID_N; row++) {
    for (let col = 0; col < GRID_N; col++) {
      // Row 0 is north, so elevation falling southward means falling with row.
      values.push(100 - row * 4);
    }
  }
  const data = buildTopo(100, values, GRID_SPACING_M, GRID_N);
  expect(data.aspectDeg as number).toBeCloseTo(180, 1);
  expect(data.meanSlopePct as number).toBeCloseTo(10, 1);
});

// ─── fetchTopo ───────────────────────────────────────────────────────────────

test("the Atlanta fixtures produce an ok topo envelope", async () => {
  const { ctx, calls } = fakeContext();
  const envelope = await fetchTopo(
    { lat: ATLANTA.lat, lng: ATLANTA.lng, siteId: "local-test", params: {} },
    ctx,
  );
  expect(envelope.status).toBe("ok");
  expect(envelope.source.cached).toBe(false);
  expect(envelope.source.fetchedAt).toBe("2026-09-22T12:00:00.000Z");
  expect(calls.length).toBe(2);

  const data = envelope.data as TopoData;
  expect(data.siteElevationM).toBeGreaterThan(270);
  expect(data.siteElevationM).toBeLessThan(295);
  expect(data.reliefM as number).toBeGreaterThan(5);
  expect(data.reliefM as number).toBeLessThan(80);
  expect(envelope.partial).toBeUndefined();
  expect(data.meanSlopePct).not.toBeNull();
  expect(data.aspectDeg).not.toBeNull();
  expect(data.contours.lines.length).toBeGreaterThanOrEqual(4);
  expect(data.contours.lines.length).toBeLessThanOrEqual(20);
  expect(data.grid.spacingM).toBe(GRID_SPACING_M);
  expect(data.grid.n).toBe(GRID_N);
});

test("430 samples yields partial with the missing count", async () => {
  const { ctx } = fakeContext({ sampleLimit: 430 });
  const envelope = await fetchTopo(
    { lat: ATLANTA.lat, lng: ATLANTA.lng, siteId: "local-test", params: {} },
    ctx,
  );
  expect(envelope.status).toBe("partial");
  expect(envelope.partial?.missing).toContain("grid.values");
  expect(envelope.partial?.message).toContain("430 of 441");
  expect(envelope.data).not.toBeNull();
});

test("200 samples yields unavailable with parse_error", async () => {
  const { ctx } = fakeContext({ sampleLimit: 200 });
  const envelope = await fetchTopo(
    { lat: ATLANTA.lat, lng: ATLANTA.lng, siteId: "local-test", params: {} },
    ctx,
  );
  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("parse_error");
  expect(envelope.unavailable?.message).toContain("USGS 3DEP elevation");
  expect(envelope.unavailable?.message).toContain("parse_error");
});

test("a failed EPQS point leaves the surface partial, not unavailable", async () => {
  const { ctx } = fakeContext({ epqsStatus: 404 });
  const envelope = await fetchTopo(
    { lat: ATLANTA.lat, lng: ATLANTA.lng, siteId: "local-test", params: {} },
    ctx,
  );
  expect(envelope.status).toBe("partial");
  expect(envelope.partial?.missing).toEqual(["siteElevationM"]);
  expect((envelope.data as TopoData).siteElevationM).toBeNull();
  expect((envelope.data as TopoData).contours.lines.length).toBeGreaterThanOrEqual(4);
});

test("a 500 from 3DEP is unavailable, retryable, with the http status", async () => {
  const ctx: SourceContext = {
    fetch: (async () => new Response("upstream failure", { status: 500 })) as typeof fetch,
    cache: freshCache(),
    overrides: {},
    userAgent: "Datum/1.0 (unit test)",
    now: NOW,
    env: {},
  };
  const envelope = await fetchTopo(
    { lat: ATLANTA.lat, lng: ATLANTA.lng, siteId: "local-test", params: {} },
    ctx,
  );
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("http_error");
  expect(envelope.unavailable?.httpStatus).toBe(500);
  expect(envelope.unavailable?.retryable).toBe(true);
});

test("a second call is served from the cache", async () => {
  const { ctx, calls } = fakeContext();
  const input = {
    lat: ATLANTA.lat,
    lng: ATLANTA.lng,
    siteId: "local-test",
    params: {},
  };
  await fetchTopo(input, ctx);
  const warm = await fetchTopo(input, ctx);
  expect(warm.status).toBe("ok");
  expect(warm.source.cached).toBe(true);
  expect(calls.length).toBe(2);
});
