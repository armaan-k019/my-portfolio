import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import {
  DEFAULT_SITE_CLASS,
  RISK_CATEGORY,
  SITE_CLASSES,
  fetchSeismic,
  isValidSiteClass,
} from "../../src/lib/datum/sources/usgsSeismic";
import type {
  CacheApi,
  CacheEntry,
  SourceContext,
} from "../../src/lib/datum/types";
import { testSites } from "../fixtures/sites";

const NOW = () => new Date("2026-09-22T12:00:00.000Z");
const FIXTURES = join(process.cwd(), "e2e", "fixtures", "usgs-seismic");

function fixture(slug: string): string {
  return readFileSync(join(FIXTURES, `${slug}.json`), "utf8");
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
  calls: string[];
}

/** A context whose fetch answers from a fixture and records every call. */
function contextFor(responder: () => Response): Recorder {
  const calls: string[] = [];
  const fakeFetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
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

function inputFor(slug: string, params: Record<string, string> = {}) {
  const point = site(slug);
  return { lat: point.lat, lng: point.lng, siteId: `test-${slug}`, params };
}

test("the Atlanta fixture yields sds 0.21, sdc B, and the default site class", async () => {
  const { ctx } = contextFor(jsonFrom("atlanta"));
  const envelope = await fetchSeismic(inputFor("atlanta"), ctx);

  expect(envelope.status).toBe("ok");
  expect(envelope.layer).toBe("seismic");
  expect(envelope.data?.sds).toBe(0.21);
  expect(envelope.data?.sdc).toBe("B");
  expect(envelope.data?.ss).toBe(0.25);
  expect(envelope.data?.s1).toBe(0.094);
  expect(envelope.data?.pgam).toBe(0.12);
  expect(envelope.data?.assumptions.siteClass).toBe(DEFAULT_SITE_CLASS);
  expect(envelope.data?.assumptions.siteClassIsDefault).toBe(true);
  expect(envelope.data?.assumptions.riskCategory).toBe(RISK_CATEGORY);
  expect(envelope.data?.assumptions.reference).toBe("ASCE 7-22");
  expect(envelope.source.fetchedAt).toBe(NOW().toISOString());
  expect(envelope.source.cached).toBe(false);
});

test("an explicit site class is not marked as the default", async () => {
  const { ctx, calls } = contextFor(jsonFrom("atlanta"));
  const envelope = await fetchSeismic(inputFor("atlanta", { siteClass: "c" }), ctx);

  expect(envelope.status).toBe("ok");
  expect(envelope.data?.assumptions.siteClass).toBe("C");
  expect(envelope.data?.assumptions.siteClassIsDefault).toBe(false);
  expect(calls[0]).toContain("siteClass=C");
  expect(calls[0]).toContain("riskCategory=II");
  expect(calls[0]).toContain("title=Datum");
});

test("the Miami and WaKeeney fixtures match the verified design values", async () => {
  const miami = await (async () => {
    const { ctx } = contextFor(jsonFrom("miami"));
    return fetchSeismic(inputFor("miami"), ctx);
  })();
  expect(miami.data?.sds).toBe(0.044);
  expect(miami.data?.sdc).toBe("A");

  const { ctx } = contextFor(jsonFrom("wakeeney"));
  const wakeeney = await fetchSeismic(inputFor("wakeeney"), ctx);
  expect(wakeeney.data?.sds).toBe(0.11);
  expect(wakeeney.data?.sd1).toBe(0.066);
  expect(wakeeney.data?.sdc).toBe("A");
});

test("only site classes A to E are valid", () => {
  expect(SITE_CLASSES).toEqual(["A", "B", "C", "D", "E"]);
  for (const value of SITE_CLASSES) expect(isValidSiteClass(value)).toBe(true);
  expect(isValidSiteClass("d")).toBe(true);
  expect(isValidSiteClass("F")).toBe(false);
  expect(isValidSiteClass("DEFAULT")).toBe(false);
  expect(isValidSiteClass("")).toBe(false);
  expect(isValidSiteClass("D; drop table")).toBe(false);
});

test("site class F is rejected before any request is made", async () => {
  const { ctx, calls } = contextFor(jsonFrom("atlanta"));
  const envelope = await fetchSeismic(inputFor("atlanta", { siteClass: "F" }), ctx);

  expect(calls).toHaveLength(0);
  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(envelope.unavailable?.code).toBe("http_error");
  expect(envelope.unavailable?.httpStatus).toBe(400);
  expect(envelope.unavailable?.retryable).toBe(false);
});

test("a second call for the same point and class is served from the cache", async () => {
  const { ctx, calls } = contextFor(jsonFrom("atlanta"));
  const first = await fetchSeismic(inputFor("atlanta"), ctx);
  const second = await fetchSeismic(inputFor("atlanta"), ctx);

  expect(calls).toHaveLength(1);
  expect(first.source.cached).toBe(false);
  expect(second.source.cached).toBe(true);
  expect(second.data?.sds).toBe(0.21);
});

test("a body with no response.data is a parse error", async () => {
  const { ctx } = contextFor(
    () =>
      new Response(JSON.stringify({ request: { status: "success" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  const envelope = await fetchSeismic(inputFor("atlanta"), ctx);

  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("parse_error");
  expect(envelope.unavailable?.message).toContain("parse_error");
});

test("an HTTP 500 yields http_error and is retryable", async () => {
  const { ctx } = contextFor(() => new Response("server error", { status: 500 }));
  const envelope = await fetchSeismic(inputFor("atlanta"), ctx);

  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("http_error");
  expect(envelope.unavailable?.httpStatus).toBe(500);
  expect(envelope.unavailable?.retryable).toBe(true);
  expect(envelope.data).toBeNull();
});

test("a missing design value makes the envelope partial", async () => {
  const body = JSON.parse(fixture("atlanta")) as {
    response: { data: Record<string, unknown> };
  };
  body.response.data.tl = null;
  const { ctx } = contextFor(
    () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  const envelope = await fetchSeismic(inputFor("atlanta"), ctx);

  expect(envelope.status).toBe("partial");
  expect(envelope.partial?.missing).toEqual(["tl"]);
  expect(envelope.data?.tl).toBeNull();
  expect(envelope.data?.sds).toBe(0.21);
});
