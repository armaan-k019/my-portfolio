import { test, expect } from "@playwright/test";
import {
  SUN_REFERENCE_YEAR,
  fetchSun,
  solarPosition,
  sunLayer,
  sunPath,
  timezoneOffsetMinutes,
} from "../../src/lib/datum/solar";
import type {
  CacheApi,
  CacheEntry,
  LayerInput,
  SourceContext,
} from "../../src/lib/datum/types";

const ATLANTA = { lat: 33.7751258, lng: -84.391975 };
const WAKEENEY = { lat: 39.019769, lng: -99.883731 };
const OBLIQUITY = 23.44;

function day(month: number, dayOfMonth: number): Date {
  return new Date(Date.UTC(SUN_REFERENCE_YEAR, month - 1, dayOfMonth));
}

function emptyCache(): CacheApi {
  return {
    async get(): Promise<CacheEntry | null> {
      return null;
    },
    async set(): Promise<void> {},
  };
}

function context(fetchImpl: typeof fetch): SourceContext {
  return {
    fetch: fetchImpl,
    cache: emptyCache(),
    overrides: {},
    userAgent: "Datum/1.0 (test)",
    now: () => new Date("2026-09-22T00:00:00.000Z"),
    env: {},
  };
}

const INPUT: LayerInput = {
  lat: ATLANTA.lat,
  lng: ATLANTA.lng,
  siteId: "test-site",
  params: {},
};

test("Atlanta noon altitude on 21 June is within 0.5 of the analytic value", () => {
  const june = sunPath(ATLANTA.lat, ATLANTA.lng, -240, day(6, 21));
  const expected = 90 - (ATLANTA.lat - OBLIQUITY);
  expect(Math.abs(june.noonAltitudeDeg - expected)).toBeLessThan(0.5);
});

test("Atlanta noon altitude on 21 December is within 0.5 of the analytic value", () => {
  const december = sunPath(ATLANTA.lat, ATLANTA.lng, -300, day(12, 21));
  const expected = 90 - (ATLANTA.lat + OBLIQUITY);
  expect(Math.abs(december.noonAltitudeDeg - expected)).toBeLessThan(0.5);
});

test("Atlanta noon altitude on 21 March is within 0.7 of the analytic value", () => {
  const march = sunPath(ATLANTA.lat, ATLANTA.lng, -240, day(3, 21));
  const expected = 90 - ATLANTA.lat;
  expect(Math.abs(march.noonAltitudeDeg - expected)).toBeLessThan(0.7);
});

test("equinox sunrise and sunset azimuths are within 1.5 degrees of east and west", () => {
  const march = sunPath(ATLANTA.lat, ATLANTA.lng, -240, day(3, 21));
  expect(march.sunriseAzimuthDeg).not.toBeNull();
  expect(march.sunsetAzimuthDeg).not.toBeNull();
  expect(Math.abs((march.sunriseAzimuthDeg as number) - 90)).toBeLessThan(1.5);
  expect(Math.abs((march.sunsetAzimuthDeg as number) - 270)).toBeLessThan(1.5);
});

test("WaKeeney noon altitude on 21 June is within 0.5 of 74.42", () => {
  const june = sunPath(WAKEENEY.lat, WAKEENEY.lng, -300, day(6, 21));
  expect(Math.abs(june.noonAltitudeDeg - 74.42)).toBeLessThan(0.5);
});

test("day length on 21 June at Atlanta is between 14.0 and 14.6 hours", () => {
  const june = sunPath(ATLANTA.lat, ATLANTA.lng, -240, day(6, 21));
  expect(june.daylightHours).not.toBeNull();
  expect(june.daylightHours as number).toBeGreaterThan(14);
  expect(june.daylightHours as number).toBeLessThan(14.6);
});

test("solarPosition puts the sun below the horizon at local midnight", () => {
  const position = solarPosition(
    new Date(Date.UTC(SUN_REFERENCE_YEAR, 5, 21, 4, 0, 0)),
    ATLANTA.lat,
    ATLANTA.lng,
  );
  expect(position.altitudeDeg).toBeLessThan(0);
});

test("samples are every 15 minutes of local clock time and all above the horizon", () => {
  const june = sunPath(ATLANTA.lat, ATLANTA.lng, -240, day(6, 21));
  expect(june.samples.length).toBeGreaterThan(50);
  for (const sample of june.samples) {
    expect(sample.altitudeDeg).toBeGreaterThan(0);
    expect(sample.azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(sample.azimuthDeg).toBeLessThan(360);
    expect(Number(sample.timeLocal.slice(3)) % 15).toBe(0);
  }
  expect(june.samples[0].timeLocal < (june.sunriseLocal as string)).toBe(false);
});

test("timezoneOffsetMinutes reads the daylight saving offset from Intl", () => {
  const summer = timezoneOffsetMinutes(
    "America/New_York",
    new Date(Date.UTC(2025, 5, 21, 12)),
  );
  const winter = timezoneOffsetMinutes(
    "America/New_York",
    new Date(Date.UTC(2025, 11, 21, 12)),
  );
  expect(summer).toBe(-240);
  expect(winter).toBe(-300);
  expect(timezoneOffsetMinutes("UTC", new Date())).toBe(0);
});

test("sunLayer builds the three dates, twelve months, and an overhang ratio", () => {
  const data = sunLayer(ATLANTA.lat, ATLANTA.lng, "America/New_York");
  expect(data.timezone).toBe("America/New_York");
  expect(data.timezoneSource).toBe("open-meteo");
  expect(data.june.date.endsWith("-06-21")).toBe(true);
  expect(data.march.date.endsWith("-03-21")).toBe(true);
  expect(data.december.date.endsWith("-12-21")).toBe(true);
  expect(data.daylightHoursByMonth).toHaveLength(12);
  expect(data.daylightHoursByMonth[5]).toBeGreaterThan(
    data.daylightHoursByMonth[11],
  );
  const ratio = data.overhangRatioSouthGlazing as number;
  expect(Math.abs(ratio - 1 / Math.tan((data.june.noonAltitudeDeg * Math.PI) / 180)))
    .toBeLessThan(1e-12);
});

test("sunLayer falls back to UTC when the zone is not a real IANA zone", () => {
  const data = sunLayer(ATLANTA.lat, ATLANTA.lng, "Not/AZone");
  expect(data.timezone).toBe("UTC");
  expect(data.timezoneSource).toBe("utc");
});

test("fetchSun is partial with missing timezone when the archive is unavailable", async () => {
  const failing: typeof fetch = async () => {
    throw new Error("network down");
  };
  const envelope = await fetchSun(INPUT, context(failing));
  expect(envelope.status).toBe("partial");
  expect(envelope.partial?.missing).toEqual(["timezone"]);
  expect(envelope.data).not.toBeNull();
  expect(envelope.data?.timezone).toBe("UTC");
  expect(envelope.source.fetchedAt).toBe("2026-09-22T00:00:00.000Z");
});

test("fetchSun is never unavailable, even on an HTTP error", async () => {
  const erroring: typeof fetch = async () =>
    new Response("nope", { status: 500 });
  const envelope = await fetchSun(INPUT, context(erroring));
  expect(envelope.status).not.toBe("unavailable");
  expect(envelope.data).not.toBeNull();
});

test("sunLayer reports the archive's zone even when that zone is UTC", () => {
  const data = sunLayer(ATLANTA.lat, ATLANTA.lng, "UTC", undefined, {
    fromArchive: true,
  });
  expect(data.timezone).toBe("UTC");
  expect(data.timezoneSource).toBe("open-meteo");
});

test("sunLayer reports utc when the archive did not answer", () => {
  const data = sunLayer(ATLANTA.lat, ATLANTA.lng, "UTC", undefined, {
    fromArchive: false,
  });
  expect(data.timezone).toBe("UTC");
  expect(data.timezoneSource).toBe("utc");
});

test("an unresolvable zone is utc however it arrived", () => {
  const data = sunLayer(ATLANTA.lat, ATLANTA.lng, "Not/AZone", undefined, {
    fromArchive: true,
  });
  expect(data.timezone).toBe("UTC");
  expect(data.timezoneSource).toBe("utc");
});

test("the times a UTC archive produces are the UTC times, not shifted", () => {
  const fromArchive = sunLayer(ATLANTA.lat, ATLANTA.lng, "UTC", undefined, {
    fromArchive: true,
  });
  const noArchive = sunLayer(ATLANTA.lat, ATLANTA.lng, "UTC", undefined, {
    fromArchive: false,
  });
  // Only the provenance differs. The computation is identical.
  expect({ ...fromArchive, timezoneSource: null }).toEqual({
    ...noArchive,
    timezoneSource: null,
  });
});
