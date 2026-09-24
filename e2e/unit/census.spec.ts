import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  clearMemoryCache,
  createMemoryCacheApi,
} from "../../src/lib/datum/cache";
import { USER_AGENT } from "../../src/lib/datum/constants";
import { isSourceError } from "../../src/lib/datum/http";
import {
  ACS_VINTAGE,
  fetchCensus,
  lookupTract,
} from "../../src/lib/datum/sources/census";
import type {
  CensusData,
  LayerInput,
  SourceContext,
} from "../../src/lib/datum/types";

const FIXTURES = path.join(process.cwd(), "e2e", "fixtures", "census");

function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}

const GEOCODER = fixture("geocoder-atlanta.json");
const TIGER = fixture("tiger-13121001002.json");
const MISSING_KEY_HTML = fixture("acs-missing-key.html");
const ACS_TABLE = JSON.parse(fixture("acs-atlanta.json")) as string[][];

const NOW = () => new Date("2026-09-22T12:00:00.000Z");

const ATLANTA: LayerInput = {
  lat: 33.7751258,
  lng: -84.391975,
  siteId: "local-test",
  params: {},
};

interface FakeFetch {
  ctx: SourceContext;
  calls: string[];
}

/**
 * A fetch that answers from the recorded fixtures by URL and records every
 * call, so a test can assert that no request was made at all.
 */
function makeContext(options?: {
  censusApiKey?: string;
  acsBody?: string;
  geocoderBody?: string;
  tigerStatus?: number;
}): FakeFetch {
  clearMemoryCache();
  const calls: string[] = [];
  const acsBody = options?.acsBody ?? JSON.stringify(ACS_TABLE);

  const fakeFetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const respond = (status: number, body: string) =>
      new Response(body, { status });
    if (url.includes("geocoding.geo.census.gov")) {
      return respond(200, options?.geocoderBody ?? GEOCODER);
    }
    if (url.includes("api.census.gov")) return respond(200, acsBody);
    if (url.includes("tigerweb.geo.census.gov")) {
      const status = options?.tigerStatus ?? 200;
      return respond(status, status === 200 ? TIGER : "upstream failure");
    }
    throw new Error(`unexpected request to ${url}`);
  }) as typeof fetch;

  const ctx: SourceContext = {
    fetch: fakeFetch,
    cache: createMemoryCacheApi(NOW),
    overrides: {},
    userAgent: USER_AGENT,
    now: NOW,
    env: { censusApiKey: options?.censusApiKey },
  };
  return { ctx, calls };
}

/** A copy of the recorded ACS table with one estimate set to a sentinel. */
function tableWithSentinel(variable: string, sentinel: number): string {
  const header = ACS_TABLE[0];
  const row = [...ACS_TABLE[1]];
  row[header.indexOf(variable)] = String(sentinel);
  return JSON.stringify([header, row]);
}

test("a missing Census key yields missing_key before any network call", async () => {
  const { ctx, calls } = makeContext();
  const envelope = await fetchCensus(ATLANTA, ctx);

  expect(calls).toEqual([]);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("missing_key");
  expect(envelope.unavailable?.message).toBe(
    "Census API key is not configured on the server. Demographics are unavailable.",
  );
  expect(envelope.unavailable?.retryable).toBe(false);
});

test("an HTML body from the ACS endpoint yields parse_error, not a crash", async () => {
  const { ctx } = makeContext({
    censusApiKey: "fake-key",
    acsBody: MISSING_KEY_HTML,
  });
  const envelope = await fetchCensus(ATLANTA, ctx);

  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("parse_error");
  expect(envelope.unavailable?.message).toBe(
    "Census ACS could not be reached (parse_error).",
  );
});

test("a geocoder error envelope is a parse error and is never cached", async () => {
  // Without this the error body parsed to null, which read as "no tract here",
  // was cached for 365 days, and reported the site as outside Census coverage.
  const errorEnvelope = JSON.stringify({
    errors: [{ status: "400", title: "Bad Request" }],
  });
  const { ctx } = makeContext({
    censusApiKey: "fake-key",
    geocoderBody: errorEnvelope,
  });

  const writes: string[] = [];
  const inner = ctx.cache;
  const watched: SourceContext = {
    ...ctx,
    cache: {
      get: (key: string) => inner.get(key),
      set: async (key, entry, ttl) => {
        writes.push(key);
        await inner.set(key, entry, ttl);
      },
    },
  };

  const error = await lookupTract(ATLANTA.lat, ATLANTA.lng, watched).catch(
    (raw: unknown) => raw,
  );
  expect(isSourceError(error)).toBe(true);
  expect(isSourceError(error) ? error.code : null).toBe("parse_error");
  expect(writes).toEqual([]);

  // The census layer reports the failure rather than a coverage gap.
  const envelope = await fetchCensus(ATLANTA, watched);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("parse_error");
  expect(writes).toEqual([]);
});

test("an empty Census Tracts array is no tract, and that answer is cached", async () => {
  const emptyTracts = JSON.stringify({
    result: { geographies: { "Census Tracts": [] } },
  });
  const { ctx } = makeContext({
    censusApiKey: "fake-key",
    geocoderBody: emptyTracts,
  });
  expect(await lookupTract(ATLANTA.lat, ATLANTA.lng, ctx)).toBeNull();

  const envelope = await fetchCensus(ATLANTA, ctx);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("no_coverage");
});

test("the tract GEOID for the Atlanta fixture is 13121001002", async () => {
  const { ctx } = makeContext({ censusApiKey: "fake-key" });
  const tract = await lookupTract(ATLANTA.lat, ATLANTA.lng, ctx);

  expect(tract?.geoid).toBe("13121001002");
  expect(tract?.state).toBe("13");
  expect(tract?.county).toBe("121");
  expect(tract?.tract).toBe("001002");
  expect(tract?.areaLandM2).toBe(1764443);
});

test("the Atlanta fixture parses to an ok envelope with derived shares", async () => {
  const { ctx } = makeContext({ censusApiKey: "fake-key" });
  const envelope = await fetchCensus(ATLANTA, ctx);

  expect(envelope.status).toBe("ok");
  const data = envelope.data as CensusData;
  expect(data.vintage).toBe(ACS_VINTAGE);
  expect(data.tract.geoid).toBe("13121001002");
  expect(data.population).toBe(7396);
  expect(data.medianGrossRent).toBe(1714);
  expect(data.margins.population).toBe(416);

  // (57 + 633 + 40) / 2067 * 100 rounded to 0.1
  const expectedCarFree =
    Math.round(
      (((data.transitToWork as number) +
        (data.walkedToWork as number) +
        (data.bikeToWork as number)) /
        (data.workersTotal as number)) *
        1000,
    ) / 10;
  expect(data.derived.carFreeCommutePct).toBe(expectedCarFree);
  expect(data.derived.carFreeCommutePct).toBe(35.3);
  expect(data.derived.renterSharePct).toBe(94.3);
  expect(data.derived.densityPerKm2).toBe(4191.7);
  expect(data.geometry?.rings.length).toBeGreaterThan(0);
  expect(envelope.source.url).not.toContain("fake-key");
});

test("a sentinel estimate becomes null and appears in partial.missing", async () => {
  const { ctx } = makeContext({
    censusApiKey: "fake-key",
    acsBody: tableWithSentinel("B25064_001E", -666666666),
  });
  const envelope = await fetchCensus(ATLANTA, ctx);

  expect(envelope.status).toBe("partial");
  const data = envelope.data as CensusData;
  expect(data.medianGrossRent).toBeNull();
  expect(envelope.partial?.missing).toContain("medianGrossRent");
  // The unsuppressed fields still parse.
  expect(data.population).toBe(7396);
});

test("a suppressed denominator leaves the derived share null, never zero", async () => {
  const { ctx } = makeContext({
    censusApiKey: "fake-key",
    acsBody: tableWithSentinel("B08301_001E", -222222222),
  });
  const envelope = await fetchCensus(ATLANTA, ctx);

  expect(envelope.status).toBe("partial");
  const data = envelope.data as CensusData;
  expect(data.workersTotal).toBeNull();
  expect(data.derived.carFreeCommutePct).toBeNull();
});

test("a TIGERweb failure leaves geometry null and makes the envelope partial", async () => {
  const { ctx } = makeContext({ censusApiKey: "fake-key", tigerStatus: 500 });
  const envelope = await fetchCensus(ATLANTA, ctx);

  expect(envelope.status).toBe("partial");
  expect(envelope.partial?.missing).toContain("geometry");
  expect((envelope.data as CensusData).geometry).toBeNull();
});
