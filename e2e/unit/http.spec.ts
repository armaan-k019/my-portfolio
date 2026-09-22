import { test, expect } from "@playwright/test";
import {
  fetchWithPolicy,
  fieldPathsOf,
  isSourceError,
  ok,
  partial,
  stripKey,
  unavailable,
} from "../../src/lib/datum/http";

const NOW = () => new Date("2026-09-22T12:00:00.000Z");

function ctxWith(fakeFetch: typeof fetch) {
  return { fetch: fakeFetch, userAgent: "Datum/1.0 (test)" };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("a request that never answers produces the timeout code", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }) as unknown as typeof fetch;

  const error = await fetchWithPolicy(
    "https://example.test/slow",
    {},
    { timeoutMs: 40, retries: 0, retryOn: [], source: "fema" },
    ctxWith(fakeFetch),
  ).catch((e) => e);

  expect(isSourceError(error)).toBe(true);
  expect(error.code).toBe("timeout");
  expect(calls).toHaveLength(1);
});

test("a 503 followed by a 200 succeeds after two calls", async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    return calls === 1
      ? jsonResponse(503, { error: "busy" })
      : jsonResponse(200, { value: "281.7" });
  }) as unknown as typeof fetch;

  const response = await fetchWithPolicy(
    "https://example.test/epqs",
    {},
    { timeoutMs: 5_000, retries: 1, retryOn: [503], source: "usgs_epqs" },
    ctxWith(fakeFetch),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ value: "281.7" });
  expect(calls).toBe(2);
});

test("a 406 is a non retryable http_error carrying the status", async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls += 1;
    return new Response("Not Acceptable", { status: 406 });
  }) as unknown as typeof fetch;

  const error = await fetchWithPolicy(
    "https://example.test/interpreter",
    { method: "POST" },
    { timeoutMs: 5_000, retries: 1, retryOn: [], source: "overpass" },
    ctxWith(fakeFetch),
  ).catch((e) => e);

  expect(isSourceError(error)).toBe(true);
  expect(error.code).toBe("http_error");
  expect(error.httpStatus).toBe(406);
  expect(calls).toBe(1);

  const envelope = unavailable("osm", SOURCE, "http_error", "Overpass said no.", {
    now: NOW,
    httpStatus: 406,
  });
  expect(envelope.unavailable?.retryable).toBe(false);
  expect(envelope.data).toBeNull();
  expect(envelope.fieldPaths).toEqual([]);
});

test("fetchWithPolicy sends the Datum User-Agent", async () => {
  let seen: string | null = null;
  const fakeFetch = (async (_url: string, init?: RequestInit) => {
    seen = new Headers(init?.headers).get("User-Agent");
    return jsonResponse(200, {});
  }) as unknown as typeof fetch;

  await fetchWithPolicy(
    "https://example.test/x",
    {},
    { timeoutMs: 1_000, retries: 0, retryOn: [], source: "nominatim" },
    ctxWith(fakeFetch),
  );
  expect(seen).toBe("Datum/1.0 (test)");
});

const SOURCE = {
  name: "Fixture source",
  url: "https://example.test/q?a=1&key=fake-key-value",
  licence: "public domain",
  cached: false,
};

test("fieldPathsOf collapses arrays to path[] and sorts the leaves", () => {
  const paths = fieldPathsOf({
    monthly: [{ meanC: 12.1, meanRhPct: 61 }, { meanC: 13.4, meanRhPct: 58 }],
    degreeDays: { hdd: 1200, cdd: 800 },
    timezone: "America/New_York",
    tags: [],
    atPoint: null,
  });
  expect(paths).toEqual([
    "atPoint",
    "degreeDays.cdd",
    "degreeDays.hdd",
    "monthly[].meanC",
    "monthly[].meanRhPct",
    "tags[]",
    "timezone",
  ]);
});

test("stripKey removes the key value and leaves the rest of the query", () => {
  expect(stripKey("https://api.census.gov/data?get=B01003_001E&key=fake-key")).toBe(
    "https://api.census.gov/data?get=B01003_001E&key=",
  );
  expect(stripKey("https://example.test/no-query")).toBe(
    "https://example.test/no-query",
  );
  expect(stripKey(SOURCE.url)).not.toContain("fake-key-value");
});

test("ok and partial build envelopes with a stripped url and ctx time", () => {
  const good = ok("seismic", SOURCE, { sds: 0.21, sdc: "B" }, { now: NOW });
  expect(good.status).toBe("ok");
  expect(good.source.fetchedAt).toBe("2026-09-22T12:00:00.000Z");
  expect(good.source.url).toContain("key=");
  expect(good.source.url).not.toContain("fake-key-value");
  expect(good.fieldPaths).toEqual(["sdc", "sds"]);

  const some = partial(
    "census",
    SOURCE,
    { medianGrossRent: null },
    ["medianGrossRent"],
    "The ACS suppressed one estimate.",
    { now: NOW },
  );
  expect(some.status).toBe("partial");
  expect(some.partial?.missing).toEqual(["medianGrossRent"]);
});
