// Step 1.10 forced failure run. Every external source is pointed at an
// unreachable port, so every layer that depends on one must come back
// unavailable with data null and a real sentence, and nothing may be cached.
//
// Start the server with (one line, exactly this JSON):
//
//   DATUM_ALLOW_TEST_FLAG=1 DATUM_E2E_FORCED=1 \
//   DATUM_SOURCE_OVERRIDES='{"fema":"http://127.0.0.1:9","usgs_elev":"http://127.0.0.1:9","usgs_seis":"http://127.0.0.1:9","usda":"http://127.0.0.1:9","openmeteo":"http://127.0.0.1:9","overpass":"http://127.0.0.1:9","census_acs":"http://127.0.0.1:9"}' \
//   npm run start
//
// DATUM_SOURCE_OVERRIDES is read only when NODE_ENV !== "production"
// (SPEC section 15), so the server must be started from a development build.
// See e2e/README.md.

import { test, expect, type APIRequestContext } from "@playwright/test";
import { testSites } from "./fixtures/sites";
import { getClient } from "../src/lib/datum/memory";

/**
 * The layers knocked out by the override map above. `sun` is absent on
 * purpose: only its timezone comes from Open-Meteo, so it still answers with
 * timezoneSource "utc". `census` is included because census_acs is overridden
 * even though the Census geocoder still resolves the tract.
 */
const FORCED_LAYERS = [
  "climate",
  "topo",
  "seismic",
  "soil",
  "osm",
  "walkshed",
  "flood",
  "census",
] as const;

/** api_cache key prefixes written by the overridden sources. */
const FORCED_CACHE_PREFIXES = [
  "openmeteo",
  "usgs_epqs",
  "usgs_3dep",
  "usgs_seismic",
  "usda",
  "overpass",
  "fema",
  "census_acs",
];

interface Envelope {
  layer: string;
  status: "ok" | "partial" | "unavailable";
  data: unknown;
  unavailable?: { code: string; message: string; retryable: boolean };
}

/**
 * Row counts for the overridden cache key prefixes. Runs inside the test
 * process only, and returns null when Supabase is not configured there. No URL
 * and no key is ever printed.
 */
async function apiCacheCounts(): Promise<Record<string, number> | null> {
  const client = getClient();
  if (!client) return null;
  const counts: Record<string, number> = {};
  for (const prefix of FORCED_CACHE_PREFIXES) {
    const { count, error } = await client
      .from("api_cache")
      .select("cache_key", { count: "exact", head: true })
      .like("cache_key", `${prefix}:%`);
    if (error) return null;
    counts[prefix] = count ?? 0;
  }
  return counts;
}

async function createSite(request: APIRequestContext, lat: number, lng: number) {
  const response = await request.post("/api/datum/site", {
    data: { lat, lng, isTest: true },
    timeout: 60_000,
  });
  expect(response.status(), "POST /api/datum/site should answer 200").toBe(200);
  return (await response.json()) as { siteId: string };
}

test("datum layers: every overridden source reports unavailable", async ({ request }) => {
  test.skip(
    process.env.DATUM_E2E_FORCED !== "1",
    "forced failure run: start the server with DATUM_SOURCE_OVERRIDES and set DATUM_E2E_FORCED=1",
  );
  test.setTimeout(10 * 60 * 1000);

  const site = testSites[0];
  const created = await createSite(request, site.lat, site.lng);

  for (const layer of FORCED_LAYERS) {
    const response = await request.get(
      `/api/datum/layers/${layer}?site=${encodeURIComponent(created.siteId)}` +
        `&lat=${site.lat}&lng=${site.lng}`,
      { timeout: 120_000 },
    );
    expect(response.status(), `GET ${layer} should answer 200`).toBe(200);
    const envelope = (await response.json()) as Envelope;

    expect(envelope.status, `${layer} should be unavailable`).toBe("unavailable");
    expect(envelope.data, `${layer} unavailable must have data null`).toBeNull();
    expect(envelope.unavailable, `${layer} must carry an unavailable block`).toBeDefined();
    expect(
      (envelope.unavailable?.message ?? "").trim().length,
      `${layer} must carry a non empty message`,
    ).toBeGreaterThan(0);
    console.log(
      `forced failure ${layer}: ${envelope.unavailable?.code} ${envelope.unavailable?.message}`,
    );
  }
});

test("datum layers: a forced failure writes nothing to api_cache", async ({ request }) => {
  test.skip(
    process.env.DATUM_E2E_FORCED !== "1",
    "forced failure run: start the server with DATUM_SOURCE_OVERRIDES and set DATUM_E2E_FORCED=1",
  );
  test.skip(
    process.env.DATUM_E2E_DB !== "1",
    "needs migration 0001 applied and SUPABASE_URL plus SUPABASE_SECRET_KEY in the test process: set DATUM_E2E_DB=1",
  );
  test.setTimeout(10 * 60 * 1000);

  const before = await apiCacheCounts();
  expect(before, "the test process should be able to read api_cache").not.toBeNull();

  // A fresh point, so no prior cache row can satisfy any of these layers.
  const site = testSites[2];
  const created = await createSite(request, site.lat + 0.004, site.lng + 0.004);
  for (const layer of FORCED_LAYERS) {
    await request.get(
      `/api/datum/layers/${layer}?site=${encodeURIComponent(created.siteId)}` +
        `&lat=${site.lat + 0.004}&lng=${site.lng + 0.004}`,
      { timeout: 120_000 },
    );
  }

  const after = await apiCacheCounts();
  expect(after, "the test process should be able to read api_cache").not.toBeNull();
  for (const prefix of FORCED_CACHE_PREFIXES) {
    expect(
      after?.[prefix],
      `api_cache rows for "${prefix}:" should not grow during a forced failure run`,
    ).toBe(before?.[prefix]);
  }
});
