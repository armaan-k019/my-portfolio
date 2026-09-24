import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { suggest, suggestCacheKey } from "../../src/lib/datum/sources/photon";
import {
  geocode,
  searchCacheKey,
  reverseLocality,
  resetNominatimRateState,
  takeNominatimToken,
  NOMINATIM_MIN_INTERVAL_MS,
} from "../../src/lib/datum/sources/nominatim";
import { haversineM } from "../../src/lib/datum/geo";
import { isSourceError } from "../../src/lib/datum/http";
import { MAX_GEOCODE_QUERY_LENGTH } from "../../src/lib/datum/constants";
import { GET as suggestRoute } from "../../src/app/api/datum/suggest/route";
import type { CacheApi, CacheEntry, SourceContext } from "../../src/lib/datum/types";

// Every request in this file is served by a fake fetch. Nothing here touches
// the network: the bodies are the responses recorded with curl under
// e2e/fixtures.

function fixture(relativePath: string): unknown {
  const full = path.resolve(process.cwd(), "e2e/fixtures", relativePath);
  return JSON.parse(readFileSync(full, "utf8")) as unknown;
}

function emptyCache(): CacheApi {
  const store = new Map<string, CacheEntry>();
  return {
    async get(key: string): Promise<CacheEntry | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, entry: CacheEntry): Promise<void> {
      store.set(key, entry);
    },
  };
}

function contextWith(fakeFetch: typeof fetch): SourceContext {
  return {
    fetch: fakeFetch,
    cache: emptyCache(),
    overrides: {},
    userAgent: "Datum/1.0 (test)",
    now: () => new Date("2026-09-22T12:00:00.000Z"),
    env: {},
  };
}

function jsonFetch(bodyFor: (url: string) => unknown, status = 200): typeof fetch {
  return (async (url: string | URL | Request) => {
    return new Response(JSON.stringify(bodyFor(String(url))), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

// ─── Photon suggestions ──────────────────────────────────────────────────────

test("suggest maps the recorded Photon GeoJSON to label, lat, and lng", async () => {
  const body = fixture("photon/techwood-atlanta.json");
  const suggestions = await suggest("Techwood Drive Atlanta", contextWith(jsonFetch(() => body)));

  expect(suggestions.length).toBeGreaterThan(0);
  const first = suggestions[0];
  expect(Object.keys(first).sort()).toEqual(["label", "lat", "lng"]);
  expect(first.label).toContain("Techwood Drive Northwest");
  expect(first.label).toContain("Atlanta");
  expect(first.label).toContain("Georgia");
  expect(first.lat).toBeCloseTo(33.77, 1);
  expect(first.lng).toBeCloseTo(-84.39, 1);
});

test("suggest caps the list at six", async () => {
  const recorded = fixture("photon/techwood-atlanta.json") as { features: unknown[] };
  const many = {
    ...recorded,
    features: [
      ...recorded.features,
      ...recorded.features,
      ...recorded.features,
      ...recorded.features,
    ],
  };
  expect(many.features.length).toBeGreaterThan(6);

  const suggestions = await suggest("Techwood Drive Atlanta", contextWith(jsonFetch(() => many)));
  expect(suggestions).toHaveLength(6);
});

test("Photon mis-resolves the Miami intersection and Nominatim resolves it", async () => {
  // The confirm step in the UI exists because of this. Evidence, not a bug.
  const truth = { lat: 25.8011588, lng: -80.1890627 };

  const photonBody = fixture("photon/miami-intersection.json");
  const suggestions = await suggest(
    "NE 25th St & Biscayne Blvd Miami",
    contextWith(jsonFetch(() => photonBody)),
  );
  const photonTop = suggestions[0];
  expect(haversineM(truth, { lat: photonTop.lat, lng: photonTop.lng })).toBeGreaterThan(1_000);

  resetNominatimRateState();
  const searchBody = fixture("nominatim/search-miami-intersection.json");
  const reverseBody = fixture("nominatim/reverse-atlanta-zoom10.json");
  const resolved = await geocode(
    "NE 25th St & Biscayne Blvd, Miami, FL",
    contextWith(
      jsonFetch((url) => (url.includes("/reverse") ? reverseBody : searchBody)),
    ),
  );

  expect(resolved).not.toBeNull();
  expect(haversineM(truth, { lat: resolved!.lat, lng: resolved!.lng })).toBeLessThan(1);
  expect(resolved!.displayName).toContain("Northeast 25th Street");
});

// ─── Nominatim ───────────────────────────────────────────────────────────────

test("geocode returns null on an empty array rather than an error", async () => {
  resetNominatimRateState();
  const result = await geocode("nowhere at all", contextWith(jsonFetch(() => [])));
  expect(result).toBeNull();
});

test("reverseLocality builds City, State from the recorded address parts", async () => {
  resetNominatimRateState();
  const body = fixture("nominatim/reverse-atlanta-zoom10.json");
  const locality = await reverseLocality(33.7751258, -84.391975, contextWith(jsonFetch(() => body)));
  expect(locality).toBe("Atlanta, Georgia");
});

test("reverseLocality returns null when both the place and the state are absent", async () => {
  resetNominatimRateState();
  const locality = await reverseLocality(
    0,
    0,
    contextWith(jsonFetch(() => ({ address: { country: "United States" } }))),
  );
  expect(locality).toBeNull();
});

test("a Nominatim 429 is rate_limited", async () => {
  resetNominatimRateState();
  const error = await geocode(
    "Techwood Drive NW, Atlanta, GA 30313",
    contextWith(jsonFetch(() => ({ error: "Too Many Requests" }), 429)),
  ).catch((raw: unknown) => raw);

  expect(isSourceError(error)).toBe(true);
  expect(isSourceError(error) ? error.code : null).toBe("rate_limited");
});

// ─── The route token bucket ──────────────────────────────────────────────────

test("the token bucket refuses a second call within a second and allows it after", () => {
  resetNominatimRateState();
  const t0 = 1_700_000_000_000;
  expect(takeNominatimToken(t0)).toBe(true);
  expect(takeNominatimToken(t0 + 500)).toBe(false);
  expect(takeNominatimToken(t0 + NOMINATIM_MIN_INTERVAL_MS)).toBe(true);
  resetNominatimRateState();
});

// ─── Cache keys ──────────────────────────────────────────────────────────────

test("a geocoding cache key is a fixed length hash, not the caller's string", () => {
  const long = "a".repeat(5_000);
  for (const key of [suggestCacheKey(long), searchCacheKey(long)]) {
    expect(key).not.toContain("aaaa");
    // "<source>:" plus 32 hex characters.
    expect(/^(photon|nominatim):[0-9a-f]{32}$/.test(key)).toBe(true);
  }

  // Normalization still collapses to one key, and different text does not.
  expect(suggestCacheKey("  Techwood   Drive  ")).toBe(
    suggestCacheKey("techwood drive"),
  );
  expect(suggestCacheKey("techwood drive")).not.toBe(
    suggestCacheKey("techwood road"),
  );
  expect(searchCacheKey("techwood drive")).not.toBe(
    searchCacheKey("techwood road"),
  );
});

test("the suggest cache key is the key the photon fetch writes", async () => {
  const body = fixture("photon/techwood-atlanta.json");
  const written: string[] = [];
  const ctx = contextWith(jsonFetch(() => body));
  const inner = ctx.cache;
  const watched = {
    ...ctx,
    cache: {
      get: (key: string) => inner.get(key),
      set: async (key: string, entry: CacheEntry, ttl: number) => {
        written.push(key);
        await inner.set(key, entry, ttl);
      },
    },
  };

  await suggest("Techwood Drive Atlanta", watched);
  expect(written).toEqual([suggestCacheKey("Techwood Drive Atlanta")]);
});

// ─── The suggest route ───────────────────────────────────────────────────────

function suggestRequest(query: string): Request {
  return new Request(
    `https://datum.test/api/datum/suggest?q=${encodeURIComponent(query)}`,
  );
}

test("the suggest route refuses a query under 3 or over 120 characters", async () => {
  const short = await suggestRoute(suggestRequest("ab"));
  expect(short.status).toBe(400);

  const long = await suggestRoute(
    suggestRequest("a".repeat(MAX_GEOCODE_QUERY_LENGTH + 1)),
  );
  expect(long.status).toBe(400);
  const body = (await long.json()) as { error: { code: string } };
  expect(body.error.code).toBe("bad_request");
});

test("a Photon failure answers 200 with an empty list and a reason", async () => {
  // "No matches" and "the suggester is down" must not look the same to the UI.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("upstream failure", { status: 500 })) as typeof fetch;
  try {
    const response = await suggestRoute(
      suggestRequest("Techwood Drive Atlanta, suggester down"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      suggestions: unknown[];
      unavailable?: { code: string; message: string };
    };
    expect(body.suggestions).toEqual([]);
    expect(body.unavailable?.code).toBe("http_error");
    expect(body.unavailable?.message).toContain("unavailable");
  } finally {
    globalThis.fetch = realFetch;
  }
});
