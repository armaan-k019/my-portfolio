import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  WIND_BIN_EDGES_MS,
  buildClimate,
  buildComfortShare,
  buildDegreeDays,
  buildMonthlyNormals,
  buildWindRose,
} from "../../src/lib/datum/climate";
import {
  archivePeriod,
  archiveUrl,
  fetchClimate,
  parseArchive,
  trimArchive,
} from "../../src/lib/datum/sources/openMeteo";
import { fetchSun } from "../../src/lib/datum/solar";
import type {
  ArchiveHour,
  ArchiveResponse,
} from "../../src/lib/datum/sources/openMeteo";
import type {
  CacheApi,
  CacheEntry,
  LayerInput,
  SourceContext,
} from "../../src/lib/datum/types";

// Playwright runs from the repository root, where the unit config lives.
const fixturesDir = path.join(process.cwd(), "e2e", "fixtures", "openmeteo");

const NOW = new Date("2026-09-22T00:00:00.000Z");
const PERIOD = archivePeriod(NOW);

const SITES = {
  atlanta: { lat: 33.7751258, lng: -84.391975 },
  wakeeney: { lat: 39.019769, lng: -99.883731 },
};

function rawFixture(slug: string): unknown {
  return JSON.parse(
    readFileSync(path.join(fixturesDir, `${slug}.json`), "utf8"),
  );
}

function archiveOf(slug: string): ArchiveResponse {
  return parseArchive(
    trimArchive(rawFixture(slug)),
    PERIOD,
    `https://archive-api.open-meteo.com/v1/archive?fixture=${slug}`,
    false,
  );
}

const atlanta = archiveOf("atlanta");
const wakeeney = archiveOf("wakeeney");

function memoryCache(): CacheApi {
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

function context(
  fetchImpl: typeof fetch,
  cache: CacheApi = memoryCache(),
): SourceContext {
  return {
    fetch: fetchImpl,
    cache,
    overrides: {},
    userAgent: "Datum/1.0 (test)",
    now: () => NOW,
    env: {},
  };
}

const INPUT: LayerInput = {
  lat: SITES.atlanta.lat,
  lng: SITES.atlanta.lng,
  siteId: "test-site",
  params: {},
};

function serve(slug: string): typeof fetch {
  const body = readFileSync(path.join(fixturesDir, `${slug}.json`), "utf8");
  return async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

// ─── the archive request and parser ──────────────────────────────────────────

test("the period is the three calendar years ending at the last complete year", () => {
  expect(PERIOD).toEqual({ start: "2023-01-01", end: "2025-12-31", years: 3 });
  expect(archivePeriod(new Date("2027-01-02T00:00:00.000Z"))).toEqual({
    start: "2024-01-01",
    end: "2026-12-31",
    years: 3,
  });
});

test("the request URL carries the five hourly variables and timezone auto", () => {
  const url = archiveUrl(
    "https://archive-api.open-meteo.com/v1/archive",
    SITES.atlanta.lat,
    SITES.atlanta.lng,
    PERIOD,
  );
  const params = new URL(url).searchParams;
  expect(params.get("hourly")?.split(",")).toEqual([
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "shortwave_radiation",
  ]);
  expect(params.get("timezone")).toBe("auto");
  expect(params.get("start_date")).toBe("2023-01-01");
  expect(params.get("end_date")).toBe("2025-12-31");
});

test("the Atlanta fixture parses to 26304 hourly rows in America/New_York", () => {
  expect(atlanta.hours).toHaveLength(26304);
  expect(atlanta.timezone).toBe("America/New_York");
  expect(wakeeney.hours).toHaveLength(26304);
  expect(wakeeney.timezone).toBe("America/Chicago");
});

test("wind speed is converted from km/h to m/s", () => {
  const raw = rawFixture("atlanta") as {
    hourly_units: Record<string, string>;
    hourly: Record<string, number[]>;
  };
  expect(raw.hourly_units.wind_speed_10m).toBe("km/h");
  const first = atlanta.hours[0].windSpeedMs as number;
  expect(first).toBeCloseTo(raw.hourly.wind_speed_10m[0] / 3.6, 9);
});

test("a body without an hourly block is a parse error", () => {
  expect(() => trimArchive({ timezone: "UTC" })).toThrow();
  expect(() => trimArchive("not an object")).toThrow();
});

// ─── wind rose ───────────────────────────────────────────────────────────────

test("wind rose sector frequencies sum to 100 including calm", () => {
  for (const rose of [
    buildWindRose(atlanta.hours),
    buildWindRose(wakeeney.hours),
  ]) {
    expect(rose.sectors).toHaveLength(16);
    expect(rose.binEdgesMs).toEqual(WIND_BIN_EDGES_MS);
    const total =
      rose.sectors.reduce((sum, sector) => sum + sector.frequencyPct, 0) +
      rose.calmSharePct;
    expect(Math.abs(total - 100)).toBeLessThan(0.1);
    for (const sector of rose.sectors) {
      expect(sector.binsPct).toHaveLength(WIND_BIN_EDGES_MS.length);
      const binTotal = sector.binsPct.reduce((sum, pct) => sum + pct, 0);
      expect(Math.abs(binTotal - sector.frequencyPct)).toBeLessThan(0.01);
    }
    expect(rose.resultantLength).toBeGreaterThanOrEqual(0);
    expect(rose.resultantLength).toBeLessThanOrEqual(1);
    expect(rose.meanSpeedMs).toBeGreaterThan(0);
    expect(rose.sectors.map((sector) => sector.sectorDeg)).toContain(
      rose.prevailingSectorDeg,
    );
  }
});

test("wind rose bins sort a synthetic set by speed and sector", () => {
  const hours: ArchiveHour[] = [
    { time: "2023-01-01T00:00", temperatureC: 0, relativeHumidityPct: 50, windSpeedMs: 0.2, windDirectionDeg: 10, shortwaveWM2: 0 },
    { time: "2023-01-01T01:00", temperatureC: 0, relativeHumidityPct: 50, windSpeedMs: 1, windDirectionDeg: 0, shortwaveWM2: 0 },
    { time: "2023-01-01T02:00", temperatureC: 0, relativeHumidityPct: 50, windSpeedMs: 3, windDirectionDeg: 90, shortwaveWM2: 0 },
    { time: "2023-01-01T03:00", temperatureC: 0, relativeHumidityPct: 50, windSpeedMs: 12, windDirectionDeg: 270, shortwaveWM2: 0 },
  ];
  const rose = buildWindRose(hours);
  expect(rose.calmSharePct).toBeCloseTo(25, 3);
  expect(rose.sectors[0].binsPct[1]).toBeCloseTo(25, 3);
  expect(rose.sectors[4].binsPct[2]).toBeCloseTo(25, 3);
  expect(rose.sectors[12].binsPct[5]).toBeCloseTo(25, 3);
  const total =
    rose.sectors.reduce((sum, sector) => sum + sector.frequencyPct, 0) +
    rose.calmSharePct;
  expect(Math.abs(total - 100)).toBeLessThan(0.1);
});

// ─── monthly normals, degree days, comfort ───────────────────────────────────

test("monthly arrays have twelve entries and July is warmer than January", () => {
  for (const archive of [atlanta, wakeeney]) {
    const monthly = buildMonthlyNormals(archive.hours);
    expect(monthly).toHaveLength(12);
    expect(monthly.map((month) => month.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(monthly[6].meanDailyMaxC).toBeGreaterThan(monthly[0].meanDailyMaxC);
    for (const month of monthly) {
      expect(month.meanDailyMaxC).toBeGreaterThanOrEqual(month.meanDailyMinC);
      expect(month.meanDailyRadiationKwhM2).toBeGreaterThan(0);
      expect(month.meanRhPct).toBeGreaterThan(0);
    }
  }
});

test("WaKeeney has more heating degree days and Atlanta more cooling", () => {
  const atl = buildDegreeDays(atlanta.hours);
  const wak = buildDegreeDays(wakeeney.hours);
  expect(atl.baseC).toBeCloseTo(18.3, 6);
  expect(wak.hdd).toBeGreaterThan(atl.hdd);
  expect(atl.cdd).toBeGreaterThan(wak.cdd);
});

test("comfort share is a labelled percentage between 0 and 100", () => {
  const share = buildComfortShare(atlanta.hours);
  expect(share.pct).toBeGreaterThan(0);
  expect(share.pct).toBeLessThan(100);
  expect(share.definition).toContain("not ASHRAE 55");
});

test("buildClimate assembles the four parts plus the period and timezone", () => {
  const data = buildClimate(atlanta);
  expect(Object.keys(data.wind)).toEqual(["annual", "summer", "winter"]);
  expect(data.monthly).toHaveLength(12);
  expect(data.period).toEqual(PERIOD);
  expect(data.timezone).toBe("America/New_York");
  expect(data.degreeDays.hdd).toBeGreaterThan(0);
  expect(data.wind.summer.meanSpeedMs).toBeGreaterThan(0);
  expect(data.wind.winter.meanSpeedMs).toBeGreaterThan(0);
});

// ─── the climate layer envelope ──────────────────────────────────────────────

test("fetchClimate returns ok with a cached second read", async () => {
  const cache = memoryCache();
  const ctx = context(serve("atlanta"), cache);
  const first = await fetchClimate(INPUT, ctx);
  expect(first.status).toBe("ok");
  expect(first.source.cached).toBe(false);
  expect(first.source.fetchedAt).toBe(NOW.toISOString());
  expect(first.data?.timezone).toBe("America/New_York");
  expect(first.fieldPaths).toContain("monthly[].meanC");

  const second = await fetchClimate(INPUT, ctx);
  expect(second.status).toBe("ok");
  expect(second.source.cached).toBe(true);
});

test("a fetch that throws makes the climate layer unavailable with no data", async () => {
  const failing: typeof fetch = async () => {
    throw new Error("socket hang up");
  };
  const envelope = await fetchClimate(INPUT, context(failing));
  expect(envelope.status).toBe("unavailable");
  expect(envelope.data).toBeNull();
  expect(["timeout", "upstream_error"]).toContain(envelope.unavailable?.code);
  expect(envelope.unavailable?.message).toContain(
    "Open-Meteo climate archive could not be reached",
  );
});

test("a timeout makes the climate layer unavailable with code timeout", async () => {
  const aborting: typeof fetch = async (_url, init) => {
    const error = new Error("aborted");
    error.name = "AbortError";
    void init;
    throw error;
  };
  const envelope = await fetchClimate(INPUT, context(aborting));
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("timeout");
  expect(envelope.data).toBeNull();
});

test("a body that is not JSON is a parse error, not a crash", async () => {
  const html: typeof fetch = async () =>
    new Response("<html>nope</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  const envelope = await fetchClimate(INPUT, context(html));
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("parse_error");
});

test("fetchSun takes its timezone from the shared archive response", async () => {
  const envelope = await fetchSun(INPUT, context(serve("atlanta")));
  expect(envelope.status).toBe("ok");
  expect(envelope.data?.timezone).toBe("America/New_York");
  expect(envelope.data?.timezoneSource).toBe("open-meteo");
});

test("sun and climate share one Open-Meteo request through the cache", async () => {
  let calls = 0;
  const counting: typeof fetch = async (url, init) => {
    calls++;
    return serve("atlanta")(url, init);
  };
  const ctx = context(counting);
  await fetchClimate(INPUT, ctx);
  const sun = await fetchSun(INPUT, ctx);
  expect(calls).toBe(1);
  expect(sun.source.cached).toBe(true);
});
