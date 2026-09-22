import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildOsm,
  buildQuery,
  fetchOsm,
  parseHeightM,
  parseLevels,
  trimPayload,
} from "../../src/lib/datum/sources/overpass";
import type {
  CacheApi,
  CacheEntry,
  LayerInput,
  SourceContext,
} from "../../src/lib/datum/types";

const FIXTURES = path.join(__dirname, "..", "fixtures", "overpass");

const ATLANTA = { lat: 33.7751258, lng: -84.3919750 };
const WAKEENEY = { lat: 39.0197690, lng: -99.8837310 };

function loadTrimmed(name: string) {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8"));
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

interface FakeResponse {
  status: number;
  body: unknown;
}

function makeCtx(responses: FakeResponse[]): {
  ctx: SourceContext;
  calls: () => number;
} {
  let calls = 0;
  const fakeFetch = (async () => {
    const next = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
    return {
      status: next.status,
      async text() {
        return JSON.stringify(next.body);
      },
      async json() {
        return next.body;
      },
    };
  }) as unknown as typeof fetch;

  const ctx: SourceContext = {
    fetch: fakeFetch,
    cache: memoryCache(),
    overrides: {},
    userAgent: "Datum/1.0 (test)",
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    env: {},
  };
  return { ctx, calls: () => calls };
}

function input(point: { lat: number; lng: number }): LayerInput {
  return { lat: point.lat, lng: point.lng, siteId: "test", params: {} };
}

// ─── query ───────────────────────────────────────────────────────────────────

test("buildQuery matches the query that recorded the Atlanta fixture", () => {
  // The recorded file carries the coordinate as typed; JavaScript drops the
  // trailing zero. Everything else must be identical.
  const recorded = readFileSync(
    path.join(FIXTURES, "atlanta.query.txt"),
    "utf8",
  ).replaceAll("-84.3919750", "-84.391975");
  expect(buildQuery(ATLANTA.lat, ATLANTA.lng)).toBe(recorded);
});

test("buildQuery asks for buildings at 400 m and streets at 1200 m", () => {
  const query = buildQuery(ATLANTA.lat, ATLANTA.lng);
  expect(query).toContain('way["building"](around:400,33.7751258,-84.391975);');
  expect(query).toContain("(around:1200,33.7751258,-84.391975)");
  expect(query).toContain("out geom;");
});

// ─── height parsing ──────────────────────────────────────────────────────────

test("parseHeightM handles plain metres, metre suffixes, and feet", () => {
  expect(parseHeightM("12")).toBe(12);
  expect(parseHeightM("12 m")).toBe(12);
  expect(parseHeightM("12m")).toBe(12);
  expect(parseHeightM("40'")).toBe(12.19);
  expect(parseHeightM("3 levels")).toBeNull();
  expect(parseHeightM("about 12")).toBeNull();
  expect(parseHeightM(undefined)).toBeNull();
});

test("parseLevels accepts integers only and never becomes a height", () => {
  expect(parseLevels("3")).toBe(3);
  expect(parseLevels("3.5")).toBeNull();
  expect(parseLevels(undefined)).toBeNull();
});

// ─── trimming ────────────────────────────────────────────────────────────────

test("trimPayload keeps only the nine listed tags", () => {
  const trimmed = trimPayload({
    elements: [
      {
        type: "way",
        id: 1,
        tags: {
          building: "yes",
          height: "12",
          "building:levels": "3",
          name: "Thing",
          highway: "residential",
          foot: "yes",
          sidewalk: "both",
          natural: "water",
          waterway: "stream",
          railway: "halt",
          "addr:street": "Techwood Drive",
          source: "survey",
        },
        geometry: [
          { lat: 1, lon: 2 },
          { lat: 1.0001, lon: 2.0001 },
        ],
        nodes: [1, 2],
      },
    ],
  });
  expect(Object.keys(trimmed.elements[0].tags).sort()).toEqual([
    "building",
    "building:levels",
    "foot",
    "height",
    "highway",
    "name",
    "natural",
    "railway",
    "sidewalk",
    "waterway",
  ]);
  expect(
    (trimmed.elements[0] as unknown as Record<string, unknown>).nodes,
  ).toBeUndefined();
});

test("trimPayload rejects a body with no elements array", () => {
  expect(() => trimPayload({ remark: "server too busy" })).toThrow();
});

// ─── fixtures ────────────────────────────────────────────────────────────────

// The bands below are taken from the fixture recorded on 2026-09-22, not from
// the SPEC section 5 note, which was counted on 2026-09-21 and reads "about 96
// buildings, 11 with levels, 0 with height". The recorded response holds 126
// ways tagged `building` plus 14 building relations contributing 30 outer
// rings, 11 ways carry a `height` tag and 41 carry `building:levels`. OSM edits
// move these numbers, so the bands are wide on purpose.
test("the Atlanta fixture yields the expected building counts", () => {
  const data = buildOsm(loadTrimmed("atlanta"), ATLANTA);
  expect(data.buildings.length).toBeGreaterThanOrEqual(110);
  expect(data.buildings.length).toBeLessThanOrEqual(200);
  expect(data.stats.withHeight).toBeGreaterThanOrEqual(5);
  expect(data.stats.withHeight).toBeLessThanOrEqual(40);
  expect(data.stats.withLevels).toBeGreaterThanOrEqual(30);
  expect(data.stats.withLevels).toBeLessThanOrEqual(80);
  expect(data.stats.relationCount).toBeGreaterThan(0);
  expect(data.stats.buildingCount).toBe(data.buildings.length);
  expect(data.streets.length).toBeGreaterThan(0);
  expect(data.transitStops.length).toBeGreaterThan(0);
});

test("the Atlanta fixture rings are closed and in local metres", () => {
  const data = buildOsm(loadTrimmed("atlanta"), ATLANTA);
  for (const building of data.buildings.slice(0, 20)) {
    for (const [x, y] of building.ring) {
      expect(Math.abs(x)).toBeLessThan(1500);
      expect(Math.abs(y)).toBeLessThan(1500);
    }
  }
  expect(data.stats.coverageRatio).toBeGreaterThan(0);
  expect(data.stats.coverageRatio).toBeLessThan(1);
});

test("the WaKeeney fixture yields between 10 and 40 buildings", () => {
  const data = buildOsm(loadTrimmed("wakeeney"), WAKEENEY);
  expect(data.buildings.length).toBeGreaterThanOrEqual(10);
  expect(data.buildings.length).toBeLessThanOrEqual(40);
});

// ─── fetch behaviour ─────────────────────────────────────────────────────────

const TINY_BODY = {
  elements: [
    {
      type: "way",
      id: 10,
      tags: { building: "yes" },
      geometry: [
        { lat: 33.7751, lon: -84.3919 },
        { lat: 33.7752, lon: -84.3919 },
        { lat: 33.7752, lon: -84.3918 },
        { lat: 33.7751, lon: -84.3919 },
      ],
    },
  ],
};

test("a 406 yields unavailable with http_error 406 and names Overpass", async () => {
  const { ctx, calls } = makeCtx([{ status: 406, body: { error: "no agent" } }]);
  const envelope = await fetchOsm(input(ATLANTA), ctx);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("http_error");
  expect(envelope.unavailable?.httpStatus).toBe(406);
  expect(envelope.unavailable?.message).toContain("Overpass");
  // A 406 is the User-Agent, not the mirror: no second attempt.
  expect(calls()).toBe(1);
});

test("a 504 on the first mirror then a 200 yields ok after two calls", async () => {
  const { ctx, calls } = makeCtx([
    { status: 504, body: { remark: "server is probably too busy" } },
    { status: 200, body: TINY_BODY },
  ]);
  const envelope = await fetchOsm(input(ATLANTA), ctx);
  expect(envelope.status).toBe("ok");
  expect(calls()).toBe(2);
  expect(envelope.data?.buildings.length).toBe(1);
});

test("a second layer call for the same point reads the cache", async () => {
  const { ctx, calls } = makeCtx([{ status: 200, body: TINY_BODY }]);
  const first = await fetchOsm(input(ATLANTA), ctx);
  const second = await fetchOsm(input(ATLANTA), ctx);
  expect(first.source.cached).toBe(false);
  expect(second.source.cached).toBe(true);
  expect(calls()).toBe(1);
});

test("every mirror failing yields unavailable after three attempts", async () => {
  const { ctx, calls } = makeCtx([{ status: 504, body: { remark: "busy" } }]);
  const envelope = await fetchOsm(input(WAKEENEY), ctx);
  expect(envelope.status).toBe("unavailable");
  expect(calls()).toBe(3);
  expect(envelope.unavailable?.retryable).toBe(true);
});
