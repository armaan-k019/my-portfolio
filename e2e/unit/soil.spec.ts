import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import {
  SDA_FORMAT,
  fetchSoil,
  soilQuery,
} from "../../src/lib/datum/sources/usdaSoil";
import type {
  CacheApi,
  CacheEntry,
  SourceContext,
} from "../../src/lib/datum/types";
import { testSites } from "../fixtures/sites";

const NOW = () => new Date("2026-09-22T12:00:00.000Z");
const FIXTURES = join(process.cwd(), "e2e", "fixtures", "usda");

function fixture(slug: string): string {
  return readFileSync(join(FIXTURES, `${slug}.json`), "utf8");
}

function recordedRequest(slug: string): { query: string; format: string } {
  return JSON.parse(
    readFileSync(join(FIXTURES, `${slug}.request.json`), "utf8"),
  ) as { query: string; format: string };
}

function site(slug: string) {
  const found = testSites.find((entry) => entry.slug === slug);
  if (!found) throw new Error(`no test site ${slug}`);
  return found;
}

/** A cache with its own Map, so tests never share state. */
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

interface Recorder {
  ctx: SourceContext;
  calls: Array<{ url: string; init?: RequestInit }>;
}

function contextFor(responder: () => Response): Recorder {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return responder();
  }) as unknown as typeof fetch;
  return {
    calls,
    ctx: {
      fetch: fakeFetch,
      cache: freshCache(),
      overrides: {},
      userAgent: "Datum/1.0 (test)",
      now: NOW,
      env: {},
    },
  };
}

function jsonFrom(slug: string): () => Response {
  return () =>
    new Response(fixture(slug), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

function inputFor(slug: string) {
  const point = site(slug);
  return { lat: point.lat, lng: point.lng, siteId: `test-${slug}`, params: {} };
}

test("the query formats the coordinates to 6 decimals and varies in nothing else", () => {
  const many = soilQuery(33.77512584321987, -84.39197501234567);
  expect(many).toContain("point(-84.391975 33.775126)");
  expect(many).not.toContain("33.77512584321987");
  expect(many).not.toContain("-84.39197501234567");

  // A short coordinate is padded to the same 6 decimals.
  expect(soilQuery(39, -99.8)).toContain("point(-99.800000 39.000000)");

  // The only difference between two queries is the WKT point.
  const other = soilQuery(25.8011588, -80.1890627);
  const template = (sql: string) =>
    sql.replace(/point\([^)]*\)/, "point(<lng> <lat>)");
  expect(template(many)).toBe(template(other));
  expect(template(many)).toBe(
    "SELECT TOP 5 mu.muname, mu.mukey, c.compname, c.comppct_r, c.hydgrp, " +
      "c.drainagecl, c.taxorder, c.slope_r, c.hydricrating " +
      "FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(<lng> <lat>)') AS i " +
      "INNER JOIN mapunit AS mu ON mu.mukey = i.mukey " +
      "INNER JOIN component AS c ON c.mukey = mu.mukey " +
      "ORDER BY c.comppct_r DESC",
  );

  // Nothing but the two numbers is interpolated, so no user text can reach it.
  expect(many.match(/\$\{|'/g)).toEqual(["'", "'"]);
});

test("the query matches the recorded request body for every test site", () => {
  for (const slug of ["atlanta", "miami", "wakeeney"]) {
    const point = site(slug);
    const recorded = recordedRequest(slug);
    expect(recorded.query).toBe(soilQuery(point.lat, point.lng));
    expect(recorded.format).toBe(SDA_FORMAT);
  }
});

test("the WaKeeney fixture yields Harney silt loam, group C, well drained", async () => {
  const { ctx, calls } = contextFor(jsonFrom("wakeeney"));
  const envelope = await fetchSoil(inputFor("wakeeney"), ctx);

  expect(envelope.status).toBe("ok");
  expect(envelope.layer).toBe("soil");
  expect(envelope.data?.mapUnitName.startsWith("Harney silt loam")).toBe(true);
  expect(envelope.data?.mukey).toBe("2605936");

  const top = envelope.data?.components[0];
  expect(top?.name).toBe("Harney");
  expect(top?.percent).toBe(97);
  expect(top?.hydrologicGroup).toBe("C");
  expect(top?.drainageClass).toBe("Well drained");
  expect(top?.taxOrder).toBe("Mollisols");
  expect(top?.slopePct).toBe(1);
  expect(top?.hydric).toBe("No");

  // Components arrive ordered by percent, largest first.
  const percents = envelope.data?.components.map((entry) => entry.percent);
  expect(percents).toEqual([97, 2, 1]);

  const body = JSON.parse(String(calls[0].init?.body)) as {
    query: string;
    format: string;
  };
  expect(calls[0].init?.method).toBe("POST");
  expect(body.format).toBe("JSON+COLUMNNAME");
  expect(body.query).toBe(soilQuery(site("wakeeney").lat, site("wakeeney").lng));
});

test("the Atlanta fixture yields Urban land with a null hydrologic group", async () => {
  const { ctx } = contextFor(jsonFrom("atlanta"));
  const envelope = await fetchSoil(inputFor("atlanta"), ctx);

  expect(envelope.status).toBe("ok");
  expect(envelope.data?.mapUnitName).toBe("Urban land");
  expect(envelope.data?.components[0].name).toBe("Urban land");
  expect(envelope.data?.components[0].hydrologicGroup).toBeNull();
  expect(envelope.data?.components[0].drainageClass).toBeNull();
  expect(envelope.data?.components[0].percent).toBe(100);
});

test("the Miami fixture yields Urban land, 0 to 2 percent slopes", async () => {
  const { ctx } = contextFor(jsonFrom("miami"));
  const envelope = await fetchSoil(inputFor("miami"), ctx);

  expect(envelope.status).toBe("ok");
  expect(envelope.data?.mapUnitName).toBe("Urban land, 0 to 2 percent slopes");
  expect(envelope.data?.components).toHaveLength(5);
  expect(envelope.data?.components[1].hydrologicGroup).toBe("B/D");
});

test("a body with no Table is no_coverage and is cached", async () => {
  const { ctx, calls } = contextFor(jsonFrom("no-coverage"));
  const envelope = await fetchSoil(inputFor("miami"), ctx);

  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("no_coverage");
  expect(envelope.unavailable?.message).toBe(
    "No SSURGO soil map unit intersects this point.",
  );
  expect(envelope.unavailable?.retryable).toBe(false);

  // no_coverage is a real answer, so the second call makes no request.
  const again = await fetchSoil(inputFor("miami"), ctx);
  expect(calls).toHaveLength(1);
  expect(again.unavailable?.code).toBe("no_coverage");
  expect(again.source.cached).toBe(true);
});

test("a Table with only the header row is no_coverage", async () => {
  const { ctx } = contextFor(
    () =>
      new Response(JSON.stringify({ Table: [["muname", "mukey"]] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  const envelope = await fetchSoil(inputFor("atlanta"), ctx);

  expect(envelope.unavailable?.code).toBe("no_coverage");
});

test("a second call for the same point is served from the cache", async () => {
  const { ctx, calls } = contextFor(jsonFrom("wakeeney"));
  const first = await fetchSoil(inputFor("wakeeney"), ctx);
  const second = await fetchSoil(inputFor("wakeeney"), ctx);

  expect(calls).toHaveLength(1);
  expect(first.source.cached).toBe(false);
  expect(second.source.cached).toBe(true);
  expect(second.data?.mukey).toBe("2605936");
});

test("an HTTP 500 yields http_error and never a fallback map unit", async () => {
  const { ctx } = contextFor(() => new Response("server error", { status: 500 }));
  const envelope = await fetchSoil(inputFor("atlanta"), ctx);

  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("http_error");
  expect(envelope.unavailable?.httpStatus).toBe(500);
  expect(envelope.unavailable?.message).toBe(
    "USDA soil survey could not be reached (http_error).",
  );
});

test("a body that is not an object is a parse error", async () => {
  const { ctx } = contextFor(
    () =>
      new Response(JSON.stringify("nope"), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  const envelope = await fetchSoil(inputFor("atlanta"), ctx);

  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("parse_error");
});
