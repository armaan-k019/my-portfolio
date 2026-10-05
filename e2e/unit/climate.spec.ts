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
      (rose.calmSharePct as number);
    expect(Math.abs(total - 100)).toBeLessThan(0.1);
    for (const sector of rose.sectors) {
      expect(sector.binsPct).toHaveLength(WIND_BIN_EDGES_MS.length);
      const binTotal = sector.binsPct.reduce((sum, pct) => sum + pct, 0);
      expect(Math.abs(binTotal - sector.frequencyPct)).toBeLessThan(0.01);
    }
    expect(rose.resultantLength as number).toBeGreaterThanOrEqual(0);
    expect(rose.resultantLength as number).toBeLessThanOrEqual(1);
    expect(rose.meanSpeedMs as number).toBeGreaterThan(0);
    expect(rose.calmSharePct).not.toBeNull();
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
  expect(rose.calmSharePct as number).toBeCloseTo(25, 3);
  expect(rose.sectors[0].binsPct[1]).toBeCloseTo(25, 3);
  expect(rose.sectors[4].binsPct[2]).toBeCloseTo(25, 3);
  expect(rose.sectors[12].binsPct[5]).toBeCloseTo(25, 3);
  const total =
    rose.sectors.reduce((sum, sector) => sum + sector.frequencyPct, 0) +
    (rose.calmSharePct as number);
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
    expect(monthly[6].meanDailyMaxC as number).toBeGreaterThan(
      monthly[0].meanDailyMaxC as number,
    );
    for (const month of monthly) {
      expect(month.meanDailyMaxC as number).toBeGreaterThanOrEqual(
        month.meanDailyMinC as number,
      );
      expect(month.meanDailyRadiationKwhM2 as number).toBeGreaterThan(0);
      expect(month.meanRhPct as number).toBeGreaterThan(0);
    }
  }
});

test("WaKeeney has more heating degree days and Atlanta more cooling", () => {
  const atl = buildDegreeDays(atlanta.hours);
  const wak = buildDegreeDays(wakeeney.hours);
  expect(atl.baseC).toBeCloseTo(18.3, 6);
  expect(wak.hdd as number).toBeGreaterThan(atl.hdd as number);
  expect(atl.cdd as number).toBeGreaterThan(wak.cdd as number);
});

test("comfort share is a labelled percentage between 0 and 100", () => {
  const share = buildComfortShare(atlanta.hours);
  expect(share.pct as number).toBeGreaterThan(0);
  expect(share.pct as number).toBeLessThan(100);
  expect(share.definition).toContain("not ASHRAE 55");
});

test("buildClimate assembles the four parts plus the period and timezone", () => {
  const { data, missing } = buildClimate(atlanta);
  expect(Object.keys(data.wind)).toEqual(["annual", "summer", "winter"]);
  expect(data.monthly).toHaveLength(12);
  expect(data.period).toEqual(PERIOD);
  expect(data.timezone).toBe("America/New_York");
  expect(data.degreeDays.hdd as number).toBeGreaterThan(0);
  expect(data.wind.summer.meanSpeedMs as number).toBeGreaterThan(0);
  expect(data.wind.winter.meanSpeedMs as number).toBeGreaterThan(0);
  // A complete archive leaves nothing empty.
  expect(missing).toEqual([]);
});

// ─── empty input is null, never zero ─────────────────────────────────────────

/** The Atlanta archive with every hour of one month removed. */
function withoutMonth(archive: ArchiveResponse, month: number): ArchiveResponse {
  return {
    ...archive,
    hours: archive.hours.filter((hour) => Number(hour.time.slice(5, 7)) !== month),
  };
}

test("a month with no hours is null in every measure, not zero", () => {
  const { data, missing } = buildClimate(withoutMonth(atlanta, 4));
  const april = data.monthly[3];
  expect(april.month).toBe(4);
  expect(april.meanC).toBeNull();
  expect(april.meanDailyMaxC).toBeNull();
  expect(april.meanDailyMinC).toBeNull();
  expect(april.meanRhPct).toBeNull();
  expect(april.meanDailyRadiationKwhM2).toBeNull();
  expect(missing).toContain("monthly[3].meanC");
  expect(missing).toContain("monthly[3].meanDailyRadiationKwhM2");
  // The other eleven months are untouched.
  expect(data.monthly[0].meanC).not.toBeNull();
});

test("an empty archive is null throughout and names every path", () => {
  const empty: ArchiveResponse = { ...atlanta, hours: [] };
  const { data, missing } = buildClimate(empty);

  expect(data.wind.annual.sectors).toEqual([]);
  expect(data.wind.annual.calmSharePct).toBeNull();
  expect(data.wind.annual.prevailingSectorDeg).toBeNull();
  expect(data.wind.annual.meanSpeedMs).toBeNull();
  expect(data.wind.annual.resultantLength).toBeNull();
  expect(data.degreeDays.hdd).toBeNull();
  expect(data.degreeDays.cdd).toBeNull();
  expect(data.comfortShare.pct).toBeNull();
  for (const month of data.monthly) {
    expect(month.meanC).toBeNull();
    expect(month.meanDailyRadiationKwhM2).toBeNull();
  }

  expect(missing).toContain("wind.annual.meanSpeedMs");
  expect(missing).toContain("wind.summer.prevailingSectorDeg");
  expect(missing).toContain("wind.winter.resultantLength");
  expect(missing).toContain("degreeDays.hdd");
  expect(missing).toContain("comfortShare.pct");
  // Twelve months times five measures, plus the wind and the three aggregates.
  expect(missing.length).toBeGreaterThan(60);
});

test("an archive missing a month makes the climate envelope partial", async () => {
  const raw = rawFixture("atlanta") as {
    hourly: Record<string, Array<number | null>>;
  };
  // Blank every April hour in the recorded body, the way the archive does when
  // it has no data for a period.
  const times = raw.hourly.time as unknown as string[];
  const blanked = {
    ...raw,
    hourly: Object.fromEntries(
      Object.entries(raw.hourly).map(([name, column]) =>
        name === "time"
          ? [name, column]
          : [
              name,
              column.map((value, index) =>
                times[index].slice(5, 7) === "04" ? null : value,
              ),
            ],
      ),
    ),
  };

  const serveBlanked: typeof fetch = async () =>
    new Response(JSON.stringify(blanked), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const envelope = await fetchClimate(INPUT, context(serveBlanked));
  expect(envelope.status).toBe("partial");
  expect(envelope.data?.monthly[3].meanC).toBeNull();
  expect(envelope.partial?.missing).toContain("monthly[3].meanC");
  expect(envelope.partial?.missing).toContain("temperature_2m");
});

test("an archive with no usable values is null throughout and partial", async () => {
  // Open-Meteo answers with the hours it was asked for and null in every
  // column when it holds no data for the period. Rows with no values behind
  // them must produce nulls, not zeroes.
  const raw = rawFixture("atlanta") as {
    hourly: Record<string, unknown[]>;
  };
  const times = raw.hourly.time as string[];
  const blank = {
    ...raw,
    hourly: Object.fromEntries(
      Object.entries(raw.hourly).map(([name, column]) =>
        name === "time" ? [name, column] : [name, times.map(() => null)],
      ),
    ),
  };
  const serveBlank: typeof fetch = async () =>
    new Response(JSON.stringify(blank), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const envelope = await fetchClimate(INPUT, context(serveBlank));
  expect(envelope.status).toBe("partial");
  expect(envelope.data?.degreeDays.hdd).toBeNull();
  expect(envelope.data?.degreeDays.cdd).toBeNull();
  expect(envelope.data?.comfortShare.pct).toBeNull();
  expect(envelope.data?.wind.annual.meanSpeedMs).toBeNull();
  expect(envelope.data?.wind.annual.sectors).toEqual([]);
  for (const month of envelope.data?.monthly ?? []) {
    expect(month.meanC).toBeNull();
    expect(month.meanDailyRadiationKwhM2).toBeNull();
  }
  expect(envelope.partial?.missing).toContain("degreeDays.hdd");
  expect(envelope.partial?.missing).toContain("wind.annual.meanSpeedMs");
  expect(envelope.partial?.missing).toContain("monthly[0].meanC");
});

test("a body with no hourly rows at all is a parse error, not a null sheet", async () => {
  const emptyBody = {
    timezone: "America/New_York",
    hourly_units: { wind_speed_10m: "km/h" },
    hourly: {
      time: [],
      temperature_2m: [],
      relative_humidity_2m: [],
      wind_speed_10m: [],
      wind_direction_10m: [],
      shortwave_radiation: [],
    },
  };
  const serveEmpty: typeof fetch = async () =>
    new Response(JSON.stringify(emptyBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const envelope = await fetchClimate(INPUT, context(serveEmpty));
  expect(envelope.status).toBe("unavailable");
  expect(envelope.unavailable?.code).toBe("parse_error");
  expect(envelope.data).toBeNull();
});

test("the Atlanta fixture still answers ok with no nulls in the data", async () => {
  const envelope = await fetchClimate(INPUT, context(serve("atlanta")));
  expect(envelope.status).toBe("ok");
  expect(envelope.partial).toBeUndefined();
  const data = envelope.data;
  expect(data).not.toBeNull();
  for (const rose of [data!.wind.annual, data!.wind.summer, data!.wind.winter]) {
    expect(rose.sectors).toHaveLength(16);
    expect(rose.calmSharePct).not.toBeNull();
    expect(rose.prevailingSectorDeg).not.toBeNull();
    expect(rose.meanSpeedMs).not.toBeNull();
    expect(rose.resultantLength).not.toBeNull();
  }
  for (const month of data!.monthly) {
    expect(month.meanC).not.toBeNull();
    expect(month.meanDailyMaxC).not.toBeNull();
    expect(month.meanDailyMinC).not.toBeNull();
    expect(month.meanRhPct).not.toBeNull();
    expect(month.meanDailyRadiationKwhM2).not.toBeNull();
  }
  expect(data!.degreeDays.hdd).not.toBeNull();
  expect(data!.degreeDays.cdd).not.toBeNull();
  expect(data!.comfortShare.pct).not.toBeNull();
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

test("an archive that answers UTC is reported as the archive's zone, not as a failure", async () => {
  // "UTC" is a zone the archive can legitimately return. Reading the string
  // rather than the archive result turned that answer into a partial envelope
  // saying Open-Meteo could not be reached, which is a fetched value presented
  // as a failure.
  const raw = rawFixture("atlanta") as Record<string, unknown>;
  const body = JSON.stringify({
    ...raw,
    timezone: "UTC",
    timezone_abbreviation: "UTC",
    utc_offset_seconds: 0,
  });
  const serveUtc: typeof fetch = async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const envelope = await fetchSun(INPUT, context(serveUtc));
  expect(envelope.status).toBe("ok");
  expect(envelope.partial).toBeUndefined();
  expect(envelope.data?.timezone).toBe("UTC");
  expect(envelope.data?.timezoneSource).toBe("open-meteo");
});

test("an archive that cannot be reached is still partial with missing timezone", async () => {
  const failing: typeof fetch = async () => {
    throw new Error("network down");
  };
  const envelope = await fetchSun(INPUT, context(failing));
  expect(envelope.status).toBe("partial");
  expect(envelope.partial?.missing).toEqual(["timezone"]);
  expect(envelope.data?.timezone).toBe("UTC");
  expect(envelope.data?.timezoneSource).toBe("utc");
});
