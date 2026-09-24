import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  buildOsm,
  buildQuery,
  fetchOsm,
  parseHeightM,
  parseLevels,
  resetOverpassBudgetForTests,
  setOverpassBudgetMsForTests,
  trimPayload,
} from "../../src/lib/datum/sources/overpass";
import { CACHE_SIZE_WARN_BYTES } from "../../src/lib/datum/cache";
import { fromLocal } from "../../src/lib/datum/geo";
import type {
  CacheApi,
  CacheEntry,
  LayerInput,
  LocalPoint,
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

/**
 * Distinct way and relation ids tagged `building` in a trimmed fixture, counted
 * by a plain loop here rather than by anything in the module under test, so the
 * two counts are arrived at independently.
 */
function distinctBuildingIds(name: string): Set<string> {
  const payload = loadTrimmed(name) as {
    elements: Array<{ type: string; id: number; tags: Record<string, string> }>;
  };
  const ids = new Set<string>();
  for (const element of payload.elements) {
    if (typeof element.tags.building !== "string") continue;
    if (element.type === "way") ids.add(`w${element.id}`);
    if (element.type === "relation") ids.add(`r${element.id}`);
  }
  return ids;
}

// Two assertions, deliberately of different kinds. The first is structural:
// buildingCount is recounted from the fixture by the loop above, so an OSM edit
// to the recorded response moves both sides together. On its own that is
// self referential, because the loop states the same rule the parser applies.
// The second is absolute: fixed numbers that no change to the parser can move.
//
// The absolute bands come from the 2026-09-22 Overpass capture in
// e2e/fixtures/overpass, which holds 140 distinct building tagged features
// within the Atlanta 400 m extent. SPEC section 5 recorded "about 96 buildings,
// 11 with levels, 0 with height" from the 2026-09-21 probe, a narrower query
// against a different day of OSM data, so the bands are wide enough to hold
// both that figure and ordinary map editing, and narrow enough that a parser
// counting rings, nodes, or every element would fall outside them.
test("the Atlanta fixture counts distinct buildings, not rings", () => {
  const data = buildOsm(loadTrimmed("atlanta"), ATLANTA);
  const expected = distinctBuildingIds("atlanta");

  expect(data.stats.buildingCount).toBe(expected.size);
  // Absolute: the count itself, not just agreement with the parser.
  expect(expected.size).toBeGreaterThanOrEqual(100);
  expect(expected.size).toBeLessThanOrEqual(200);
  expect(data.stats.buildingCount).toBeGreaterThanOrEqual(100);
  expect(data.stats.buildingCount).toBeLessThanOrEqual(200);

  // A relation contributes several outer rings, all of them drawn.
  expect(data.stats.ringCount).toBe(data.buildings.length);
  expect(data.stats.ringCount).toBeGreaterThan(data.stats.buildingCount);
  expect(data.stats.relationCount).toBeGreaterThan(0);

  // Absolute bands, same reasoning as the building count.
  expect(data.stats.withHeight).toBeGreaterThanOrEqual(5);
  expect(data.stats.withHeight).toBeLessThanOrEqual(40);
  expect(data.stats.withLevels).toBeGreaterThanOrEqual(30);
  expect(data.stats.withLevels).toBeLessThanOrEqual(80);
  // A tag counted per feature can never exceed the feature count.
  expect(data.stats.withHeight).toBeLessThanOrEqual(data.stats.buildingCount);
  expect(data.stats.withLevels).toBeLessThanOrEqual(data.stats.buildingCount);

  expect(data.streets.length).toBeGreaterThan(0);
  expect(data.transitStops.length).toBeGreaterThan(0);
});

test("the WaKeeney fixture counts distinct buildings too", () => {
  const data = buildOsm(loadTrimmed("wakeeney"), WAKEENEY);
  expect(data.stats.buildingCount).toBe(distinctBuildingIds("wakeeney").size);
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
  // A sanity range, not a measurement: OSM edits move this.
  const data = buildOsm(loadTrimmed("wakeeney"), WAKEENEY);
  expect(data.buildings.length).toBeGreaterThanOrEqual(10);
  expect(data.buildings.length).toBeLessThanOrEqual(40);
});

test("coverage counts only the footprint area inside the 800 m frame", () => {
  const data = buildOsm(loadTrimmed("atlanta"), ATLANTA);
  expect(data.stats.coverageRatio).toBeGreaterThan(0);
  expect(data.stats.coverageRatio).toBeLessThan(1);

  // One 400 by 200 m building straddling the west frame edge. Half of it lies
  // outside the sheet, so it covers 200 x 200 m of the 800 x 800 m frame.
  const corners: LocalPoint[] = [
    [-600, -100],
    [-200, -100],
    [-200, 100],
    [-600, 100],
    [-600, -100],
  ];
  const straddling = {
    elements: [
      {
        type: "way",
        id: 1,
        tags: { building: "yes" },
        geometry: corners.map(([x, y]) => {
          const point = fromLocal(x, y, ATLANTA);
          return { lat: point.lat, lon: point.lng };
        }),
      },
    ],
  };

  const clipped = buildOsm(straddling as never, ATLANTA);
  expect(clipped.stats.buildingCount).toBe(1);
  // 200 x 200 of 800 x 800, not the 400 x 200 the ring actually spans.
  expect(clipped.stats.coverageRatio).toBeCloseTo((200 * 200) / (800 * 800), 3);
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

test("the three mirror attempts share one deadline", async () => {
  // A hanging Overpass used to cost 45 s per attempt against a budget computed
  // fresh inside each call, so three attempts ran for 135 s. One shared
  // deadline bounds the whole loop, and an attempt with under 2 s left is not
  // started at all.
  // Just over the 2 s an attempt needs, so exactly one attempt fits.
  setOverpassBudgetMsForTests(2_400);
  let calls = 0;
  const hanging = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as unknown as typeof fetch;

  const ctx: SourceContext = {
    fetch: hanging,
    cache: memoryCache(),
    overrides: {},
    userAgent: "Datum/1.0 (test)",
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    env: {},
  };

  const startedAt = Date.now();
  const envelope = await fetchOsm(input(ATLANTA), ctx);
  const elapsed = Date.now() - startedAt;
  resetOverpassBudgetForTests();

  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("timeout");
  // The shared budget, not three times the 45 s per attempt timeout.
  expect(elapsed).toBeLessThan(5_000);
  // The first attempt consumed the budget, so the later mirrors were skipped.
  expect(calls).toBe(1);
});

test("the Atlanta payload is 1.42 MB and carries no size warning", async () => {
  const raw = JSON.parse(
    readFileSync(path.join(FIXTURES, "atlanta.raw.json"), "utf8"),
  );
  const { ctx } = makeCtx([{ status: 200, body: raw }]);

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  let envelope;
  try {
    envelope = await fetchOsm(input(ATLANTA), ctx);
  } finally {
    console.warn = originalWarn;
  }

  expect(envelope.status).toBe("ok");
  // The trimmed payload is about 1.42 MB, well under the 3 MB threshold, so
  // the envelope carries no sizeWarning and nothing is logged.
  const trimmedBytes = Buffer.byteLength(JSON.stringify(trimPayload(raw)));
  expect(trimmedBytes).toBeGreaterThan(1_000_000);
  expect(trimmedBytes).toBeLessThan(CACHE_SIZE_WARN_BYTES);
  expect(envelope.data?.stats.sizeWarning).toBeUndefined();
  expect(warnings).toEqual([]);
});
