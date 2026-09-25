// Step 1.10 layer checks. Request only, no browser, against a running build.
//
// Start the server with DATUM_ALLOW_TEST_FLAG=1 so { isTest: true } is honoured
// and the site rows created here are marked as test rows. See e2e/README.md.
//
// For each site: POST /api/datum/site, then GET all nine layers twice, cold
// then warm. The assertions are the table in docs/datum/PHASE-1-data.md step
// 1.10. Cold and warm durations are printed per site and layer (SPEC section
// 16 records them in the acceptance run).

import { test, expect, type APIRequestContext } from "@playwright/test";
import { testSites, type TestSite } from "./fixtures/sites";

const LAYERS = [
  "sun",
  "climate",
  "topo",
  "seismic",
  "soil",
  "osm",
  "walkshed",
  "flood",
  "census",
] as const;

type Layer = (typeof LAYERS)[number];

/** Codes that mean the network or the upstream service failed, not the code. */
const NETWORK_CODES = ["timeout", "http_error", "upstream_error"];

/**
 * Layers allowed to come back unavailable with a network code. Overpass is
 * unreliable by design (SPEC section 16). FEMA refused TLS connections from
 * this machine throughout Phase 0 and Phase 1, so flood joins the list; see
 * e2e/README.md "Known allowances".
 */
const NETWORK_TOLERANT: Layer[] = ["osm", "walkshed", "flood"];

const WARM_BUDGET_MS = 1500;

interface Envelope {
  layer: string;
  status: "ok" | "partial" | "unavailable";
  data: unknown;
  source: {
    name: string;
    url: string;
    fetchedAt: string;
    cached: boolean;
    licence: string;
  };
  unavailable?: {
    code: string;
    message: string;
    httpStatus?: number;
    retryable: boolean;
  };
  partial?: { missing: string[]; message: string };
  fieldPaths: string[];
}

interface SiteResponse {
  siteId: string;
  siteKey: string;
  locality: string | null;
  tract: { geoid: string } | null;
  memoryStatus: "online" | "offline";
  rateLimit: { remaining: number };
}

interface Timed {
  envelope: Envelope;
  ms: number;
}

async function createSite(
  request: APIRequestContext,
  site: TestSite,
): Promise<SiteResponse> {
  const response = await request.post("/api/datum/site", {
    data: { lat: site.lat, lng: site.lng, isTest: true },
    timeout: 60_000,
  });
  expect(
    response.status(),
    `POST /api/datum/site for ${site.slug} should answer 200`,
  ).toBe(200);
  return (await response.json()) as SiteResponse;
}

/**
 * GET one layer. lat and lng always travel on the query string: the route
 * ignores them for a database backed site id and requires them for the
 * `local-` id returned when Site Memory is offline.
 */
async function getLayer(
  request: APIRequestContext,
  layer: Layer,
  siteId: string,
  site: TestSite,
): Promise<Timed> {
  const url =
    `/api/datum/layers/${layer}?site=${encodeURIComponent(siteId)}` +
    `&lat=${site.lat}&lng=${site.lng}`;
  const started = Date.now();
  const response = await request.get(url, { timeout: 120_000 });
  const ms = Date.now() - started;
  expect(
    response.status(),
    `GET ${layer} for ${site.slug} should answer 200`,
  ).toBe(200);
  const envelope = (await response.json()) as Envelope;
  expect(envelope.layer, `${layer} envelope should name its layer`).toBe(layer);
  return { envelope, ms };
}

/**
 * Fire the eight independent layers together, then walkshed once osm has
 * settled: both share one Overpass fetch through the cache, and firing them at
 * once would double the Overpass load (SPEC section 7).
 */
async function runPass(
  request: APIRequestContext,
  siteId: string,
  site: TestSite,
): Promise<Record<Layer, Timed>> {
  const independent = LAYERS.filter((layer) => layer !== "walkshed");
  const settled = await Promise.all(
    independent.map((layer) => getLayer(request, layer, siteId, site)),
  );
  const results = {} as Record<Layer, Timed>;
  independent.forEach((layer, index) => {
    results[layer] = settled[index];
  });
  results.walkshed = await getLayer(request, "walkshed", siteId, site);
  return results;
}

/** An unavailable envelope must carry no data and a real sentence. */
function assertUnavailableShape(layer: Layer, slug: string, env: Envelope) {
  expect(env.data, `${slug} ${layer} unavailable must have data null`).toBeNull();
  expect(
    env.unavailable,
    `${slug} ${layer} unavailable must carry an unavailable block`,
  ).toBeDefined();
  expect(
    (env.unavailable?.message ?? "").trim().length,
    `${slug} ${layer} unavailable must carry a non empty message`,
  ).toBeGreaterThan(0);
}

/**
 * True when this layer is allowed to be unavailable on this run: a tolerated
 * layer that failed with a network code. The caller prints a warning instead of
 * failing, but the envelope shape is still checked.
 */
function tolerated(layer: Layer, slug: string, env: Envelope): boolean {
  if (env.status !== "unavailable") return false;
  if (!NETWORK_TOLERANT.includes(layer)) return false;
  if (!NETWORK_CODES.includes(env.unavailable?.code ?? "")) return false;
  assertUnavailableShape(layer, slug, env);
  return true;
}

// ─── The expected values, one entry per site and layer ───────────────────────

type Check = (env: Envelope, slug: string) => void;

function between(value: unknown, low: number, high: number, label: string) {
  expect(typeof value, `${label} should be a number`).toBe("number");
  expect(value as number, label).toBeGreaterThanOrEqual(low);
  expect(value as number, label).toBeLessThanOrEqual(high);
}

function sunNoon(low: number, high: number): Check {
  return (env, slug) => {
    expect(env.status, `${slug} sun should be ok`).toBe("ok");
    const data = env.data as { june: { noonAltitudeDeg: number } };
    between(
      data.june.noonAltitudeDeg,
      low,
      high,
      `${slug} sun 21 June noon altitude`,
    );
  };
}

function climateIn(timezone: string): Check {
  return (env, slug) => {
    expect(env.status, `${slug} climate should be ok`).toBe("ok");
    const data = env.data as { timezone: string; monthly: unknown[] };
    expect(data.timezone, `${slug} climate timezone`).toBe(timezone);
    expect(data.monthly.length, `${slug} climate months`).toBe(12);
  };
}

function topoElevation(low: number, high: number): Check {
  return (env, slug) => {
    expect(env.status, `${slug} topo should be ok`).toBe("ok");
    const data = env.data as { siteElevationM: number | null };
    between(data.siteElevationM, low, high, `${slug} site elevation m`);
  };
}

function seismic(sdc: string, sds?: [number, number]): Check {
  return (env, slug) => {
    expect(env.status, `${slug} seismic should be ok`).toBe("ok");
    const data = env.data as { sdc: string | null; sds: number | null };
    expect(data.sdc, `${slug} seismic design category`).toBe(sdc);
    if (sds) between(data.sds, sds[0], sds[1], `${slug} seismic sds`);
  };
}

function soilNamed(fragment: string, hydrologicGroup?: string): Check {
  return (env, slug) => {
    expect(env.status, `${slug} soil should be ok`).toBe("ok");
    const data = env.data as {
      mapUnitName: string;
      components: Array<{ hydrologicGroup: string | null }>;
    };
    expect(data.mapUnitName, `${slug} soil map unit name`).toContain(fragment);
    if (hydrologicGroup !== undefined) {
      expect(
        data.components.map((component) => component.hydrologicGroup),
        `${slug} soil hydrologic groups`,
      ).toContain(hydrologicGroup);
    }
  };
}

function osmBuildings(low: number, high: number, withHeightOver?: number): Check {
  return (env, slug) => {
    expect(env.status, `${slug} osm should be ok`).toBe("ok");
    const data = env.data as {
      buildings: unknown[];
      stats: { withHeight: number };
    };
    between(data.buildings.length, low, high, `${slug} osm building count`);
    if (withHeightOver !== undefined) {
      expect(data.stats.withHeight, `${slug} osm buildings with height`).toBeGreaterThan(
        withHeightOver,
      );
    }
  };
}

const walkshedReach: Check = (env, slug) => {
  expect(env.status, `${slug} walkshed should be ok`).toBe("ok");
  const data = env.data as { reachKm: Record<string, number> };
  expect(data.reachKm["10"], `${slug} walkshed 10 minute reach km`).toBeGreaterThan(3);
};

function floodClass(className: string, zones?: string[]): Check {
  return (env, slug) => {
    expect(env.status, `${slug} flood should be ok`).toBe("ok");
    const data = env.data as {
      atPoint: { class: string } | null;
      polygons: Array<{ zone: string | null }>;
    };
    expect(data.atPoint?.class, `${slug} flood class at the point`).toBe(className);
    for (const zone of zones ?? []) {
      expect(
        data.polygons.map((polygon) => polygon.zone),
        `${slug} flood polygon zones`,
      ).toContain(zone);
    }
  };
}

const floodNoCoverage: Check = (env, slug) => {
  expect(env.status, `${slug} flood should be unavailable`).toBe("unavailable");
  expect(env.unavailable?.code, `${slug} flood code`).toBe("no_coverage");
  assertUnavailableShape("flood", slug, env);
};

function censusTract(geoid: string): Check {
  return (env, slug) => {
    expect(
      ["ok", "partial"],
      `${slug} census should be ok or partial`,
    ).toContain(env.status);
    const data = env.data as { tract: { geoid: string } };
    expect(data.tract.geoid, `${slug} census tract GEOID`).toBe(geoid);
  };
}

const expectations: Record<string, Record<Layer, Check>> = {
  atlanta: {
    sun: sunNoon(79.2, 80.2),
    climate: climateIn("America/New_York"),
    topo: topoElevation(270, 295),
    seismic: seismic("B", [0.19, 0.23]),
    soil: soilNamed("Urban land"),
    osm: osmBuildings(60, 160),
    walkshed: walkshedReach,
    flood: floodClass("minimal"),
    census: censusTract("13121001002"),
  },
  miami: {
    sun: (env, slug) => expect(env.status, `${slug} sun should be ok`).toBe("ok"),
    climate: climateIn("America/New_York"),
    topo: topoElevation(0, 6),
    seismic: seismic("A"),
    soil: soilNamed("Urban land"),
    osm: osmBuildings(0, Number.MAX_SAFE_INTEGER, 150),
    walkshed: walkshedReach,
    flood: floodClass("moderate", ["VE"]),
    census: censusTract("12086002707"),
  },
  wakeeney: {
    sun: sunNoon(73.9, 74.9),
    climate: climateIn("America/Chicago"),
    topo: topoElevation(735, 755),
    seismic: seismic("A", [0.09, 0.13]),
    soil: soilNamed("Harney", "C"),
    osm: osmBuildings(8, 40),
    walkshed: walkshedReach,
    flood: floodNoCoverage,
    census: censusTract("20195955800"),
  },
};

/**
 * walkshed follows osm: they share one Overpass fetch through the cache, so an
 * osm that answered means walkshed must answer too. The converse does not
 * hold. When osm fails with a network code nothing is cached, and the walkshed
 * request that follows makes its own Overpass attempt, which can succeed where
 * the osm attempt timed out. That is observed behaviour at Atlanta and Miami,
 * not a fault, so it is reported rather than asserted.
 */
function assertWalkshedFollowsOsm(
  slug: string,
  osm: Envelope,
  walkshed: Envelope,
): string | null {
  if (osm.status !== "unavailable") {
    expect(
      walkshed.status,
      `${slug} walkshed should answer whenever osm answered`,
    ).not.toBe("unavailable");
    return null;
  }
  if (walkshed.status === "unavailable") return null;
  return `WARNING ${slug} osm was unavailable (${osm.unavailable?.code}) but the later walkshed Overpass attempt succeeded`;
}

function printTable(slug: string, cold: Record<Layer, Timed>, warm: Record<Layer, Timed>) {
  const lines = [
    `\n${slug}: cold and warm durations (ms)`,
    "layer      cold    status      warm    status      cached",
  ];
  for (const layer of LAYERS) {
    lines.push(
      [
        layer.padEnd(10),
        String(cold[layer].ms).padStart(6),
        `  ${cold[layer].envelope.status.padEnd(12)}`,
        String(warm[layer].ms).padStart(6),
        `  ${warm[layer].envelope.status.padEnd(12)}`,
        String(warm[layer].envelope.source.cached),
      ].join(""),
    );
  }
  console.log(lines.join("\n"));
}

for (const site of testSites) {
  test(`datum layers: ${site.slug} cold then warm`, async ({ request }) => {
    test.setTimeout(10 * 60 * 1000);

    const created = await createSite(request, site);
    expect(created.siteId.length, "the site route should return a site id").toBeGreaterThan(0);

    const cold = await runPass(request, created.siteId, site);
    const warm = await runPass(request, created.siteId, site);
    printTable(site.slug, cold, warm);

    const checks = expectations[site.slug];
    // Warnings print as they are found, so they survive a later failure.
    const warn = (line: string) => console.log(line);

    for (const layer of LAYERS) {
      const env = cold[layer].envelope;
      if (tolerated(layer, site.slug, env)) {
        warn(
          `WARNING ${site.slug} ${layer} unavailable cold (${env.unavailable?.code}): ${env.unavailable?.message}`,
        );
        continue;
      }
      if (env.status === "unavailable") assertUnavailableShape(layer, site.slug, env);
      checks[layer](env, site.slug);
    }

    const followWarning = assertWalkshedFollowsOsm(
      site.slug,
      cold.osm.envelope,
      cold.walkshed.envelope,
    );
    if (followWarning) warn(followWarning);

    // Warm run: anything that answered cold answers from the cache, with the
    // same status, and inside the warm budget.
    for (const layer of LAYERS) {
      const coldEnv = cold[layer].envelope;
      if (coldEnv.status === "unavailable") continue;
      const warmEnv = warm[layer].envelope;
      if (tolerated(layer, site.slug, warmEnv)) {
        warn(
          `WARNING ${site.slug} ${layer} was ${coldEnv.status} cold but unavailable warm (${warmEnv.unavailable?.code})`,
        );
        continue;
      }
      expect(warmEnv.status, `${site.slug} ${layer} warm status`).toBe(coldEnv.status);
      expect(
        warmEnv.source.cached,
        `${site.slug} ${layer} warm should be served from the cache`,
      ).toBe(true);
      expect(warm[layer].ms, `${site.slug} ${layer} warm duration ms`).toBeLessThan(
        WARM_BUDGET_MS,
      );
    }
  });
}

test("datum layers: Site Memory is online and the site id is a database row", async ({
  request,
}) => {
  test.skip(
    process.env.DATUM_E2E_DB !== "1",
    "needs migration 0001 applied: set DATUM_E2E_DB=1 once the Supabase tables exist",
  );
  test.setTimeout(2 * 60 * 1000);

  const site = testSites[0];
  const created = await createSite(request, site);
  expect(created.memoryStatus, "Site Memory should be online").toBe("online");
  expect(
    created.siteId.startsWith("local-"),
    "a database backed run should not return a local- site id",
  ).toBe(false);

  const { envelope } = await getLayer(request, "sun", created.siteId, site);
  expect(envelope.status, "sun should answer for a database backed site").toBe("ok");
});
