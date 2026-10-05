// Sun layer. SPEC section 9 "sun", PHASE-1 step 1.2.
// NOAA solar position equations (Meeus based). No dependency, no network.
// Erasable TypeScript only, and no "@/" alias inside src/lib/datum.

import { fetchArchive } from "./sources/openMeteo";
import { ok, partial } from "./http";
import type { LayerFetcher, SunData, SunDay, SunSample } from "./types";

/** The sun layer is computed, so it has no external source URL. */
export const SUN_SOURCE = {
  name: "NOAA solar position equations (computed)",
  url: "",
  licence: "Computed from published NOAA equations; no external service",
  cached: false,
};

export interface SolarPosition {
  altitudeDeg: number;
  /** Degrees clockwise from true north. */
  azimuthDeg: number;
}

/**
 * The calendar year the sun layer is drawn for when no year is passed. Solar
 * geometry is all but identical from year to year; the year only fixes which
 * daylight saving offset the local clock times use.
 */
export const SUN_REFERENCE_YEAR = 2025;

/** Zenith angle of the sun's upper limb at sunrise and sunset, with refraction. */
const SUNRISE_ZENITH_DEG = 90.833;

const MS_PER_MINUTE = 60_000;
const SAMPLE_STEP_MINUTES = 15;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function wrap360(deg: number): number {
  const value = deg % 360;
  return value < 0 ? value + 360 : value;
}

interface SolarTerms {
  /** Solar declination in degrees. */
  declinationDeg: number;
  /** Equation of time in minutes. */
  equationOfTimeMin: number;
}

/**
 * The NOAA spreadsheet terms for an instant: declination and equation of time.
 * Both change slowly, so one evaluation per instant is enough.
 */
function solarTerms(date: Date): SolarTerms {
  const julianDay = date.getTime() / 86_400_000 + 2_440_587.5;
  const t = (julianDay - 2_451_545) / 36_525;

  const meanLongDeg = wrap360(
    280.46646 + t * (36_000.76983 + t * 0.0003032),
  );
  const meanAnomDeg = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const centreDeg =
    Math.sin(toRad(meanAnomDeg)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(toRad(2 * meanAnomDeg)) * (0.019993 - 0.000101 * t) +
    Math.sin(toRad(3 * meanAnomDeg)) * 0.000289;

  const trueLongDeg = meanLongDeg + centreDeg;
  const omegaDeg = 125.04 - 1_934.136 * t;
  const apparentLongDeg =
    trueLongDeg - 0.00569 - 0.00478 * Math.sin(toRad(omegaDeg));

  const meanObliquityDeg =
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquityDeg = meanObliquityDeg + 0.00256 * Math.cos(toRad(omegaDeg));

  const declinationDeg = toDeg(
    Math.asin(
      Math.sin(toRad(obliquityDeg)) * Math.sin(toRad(apparentLongDeg)),
    ),
  );

  const varY = Math.tan(toRad(obliquityDeg / 2)) ** 2;
  const equationOfTimeMin =
    4 *
    toDeg(
      varY * Math.sin(toRad(2 * meanLongDeg)) -
        2 * eccentricity * Math.sin(toRad(meanAnomDeg)) +
        4 *
          eccentricity *
          varY *
          Math.sin(toRad(meanAnomDeg)) *
          Math.cos(toRad(2 * meanLongDeg)) -
        0.5 * varY * varY * Math.sin(toRad(4 * meanLongDeg)) -
        1.25 *
          eccentricity *
          eccentricity *
          Math.sin(toRad(2 * meanAnomDeg)),
    );

  return { declinationDeg, equationOfTimeMin };
}

/** Minutes past UTC midnight for an instant. */
function utcMinutesOfDay(date: Date): number {
  return (
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60_000
  );
}

/**
 * Altitude above the horizon and azimuth clockwise from true north for an
 * instant, geometric (no refraction correction on the altitude).
 */
export function solarPosition(
  date: Date,
  lat: number,
  lng: number,
): SolarPosition {
  const { declinationDeg, equationOfTimeMin } = solarTerms(date);
  const trueSolarTimeMin =
    utcMinutesOfDay(date) + equationOfTimeMin + 4 * lng;
  const hourAngleDeg = trueSolarTimeMin / 4 - 180;

  const latRad = toRad(lat);
  const declRad = toRad(declinationDeg);
  const haRad = toRad(hourAngleDeg);

  const cosZenith =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const zenithRad = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const altitudeDeg = 90 - toDeg(zenithRad);

  const sinZenith = Math.sin(zenithRad);
  let azimuthDeg: number;
  if (sinZenith === 0 || Math.cos(latRad) === 0) {
    // Sun in the zenith, or the observer at a pole: azimuth is undefined, so
    // report due north rather than a NaN.
    azimuthDeg = 0;
  } else {
    const cosAz =
      (Math.sin(latRad) * Math.cos(zenithRad) - Math.sin(declRad)) /
      (Math.cos(latRad) * sinZenith);
    const azFromSouth = toDeg(Math.acos(Math.min(1, Math.max(-1, cosAz))));
    azimuthDeg =
      hourAngleDeg > 0
        ? wrap360(azFromSouth + 180)
        : wrap360(540 - azFromSouth);
  }

  return { altitudeDeg, azimuthDeg };
}

/**
 * The UTC offset of an IANA zone at an instant, in minutes east of UTC.
 * Intl is enough; no timezone dependency (OPEN-QUESTIONS item 18).
 */
export function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const read = (type: string): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : Number.NaN;
  };
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  const minutes = Math.round((asUtc - at.getTime()) / MS_PER_MINUTE);
  // Math.round returns -0 for a zero offset zone; normalise it.
  return minutes === 0 ? 0 : minutes;
}

function formatClock(minutesOfDay: number): string {
  const wrapped = ((minutesOfDay % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = Math.round(wrapped - hours * 60);
  const carry = minutes === 60 ? 1 : 0;
  const hh = String((hours + carry) % 24).padStart(2, "0");
  const mm = String(carry === 1 ? 0 : minutes).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Sunrise, sunset, solar noon altitude, and a sample every 15 minutes of local
 * clock time. `date` names the calendar day by its UTC year, month, and day.
 */
export function sunPath(
  lat: number,
  lng: number,
  tzOffsetMinutes: number,
  date: Date,
): SunDay {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const localMidnightMs =
    Date.UTC(year, month - 1, day) - tzOffsetMinutes * MS_PER_MINUTE;

  // Solar noon, then the half day arc from the terms at that instant.
  const noonGuess = new Date(localMidnightMs + 12 * 60 * MS_PER_MINUTE);
  const { declinationDeg, equationOfTimeMin } = solarTerms(noonGuess);
  const solarNoonUtcMin = 720 - 4 * lng - equationOfTimeMin;
  const solarNoonMs =
    Date.UTC(year, month - 1, day) + solarNoonUtcMin * MS_PER_MINUTE;
  const noon = solarPosition(new Date(solarNoonMs), lat, lng);

  const latRad = toRad(lat);
  const declRad = toRad(declinationDeg);
  const cosHa =
    Math.cos(toRad(SUNRISE_ZENITH_DEG)) / (Math.cos(latRad) * Math.cos(declRad)) -
    Math.tan(latRad) * Math.tan(declRad);

  let sunriseLocal: string | null = null;
  let sunsetLocal: string | null = null;
  let sunriseAzimuthDeg: number | null = null;
  let sunsetAzimuthDeg: number | null = null;
  let daylightHours: number | null = null;

  if (cosHa >= -1 && cosHa <= 1) {
    const haDeg = toDeg(Math.acos(cosHa));
    const sunriseMs = solarNoonMs - haDeg * 4 * MS_PER_MINUTE;
    const sunsetMs = solarNoonMs + haDeg * 4 * MS_PER_MINUTE;
    sunriseLocal = formatClock(
      (sunriseMs - localMidnightMs) / MS_PER_MINUTE,
    );
    sunsetLocal = formatClock((sunsetMs - localMidnightMs) / MS_PER_MINUTE);
    sunriseAzimuthDeg = solarPosition(new Date(sunriseMs), lat, lng).azimuthDeg;
    sunsetAzimuthDeg = solarPosition(new Date(sunsetMs), lat, lng).azimuthDeg;
    daylightHours = (haDeg * 8) / 60;
  } else if (cosHa < -1) {
    // The sun never sets on this day at this latitude.
    daylightHours = 24;
  } else {
    // The sun never rises on this day at this latitude.
    daylightHours = 0;
  }

  const samples: SunSample[] = [];
  for (let minute = 0; minute <= 1440; minute += SAMPLE_STEP_MINUTES) {
    const at = new Date(localMidnightMs + minute * MS_PER_MINUTE);
    const position = solarPosition(at, lat, lng);
    if (position.altitudeDeg <= 0) continue;
    samples.push({
      timeLocal: formatClock(minute),
      altitudeDeg: position.altitudeDeg,
      azimuthDeg: position.azimuthDeg,
    });
  }

  return {
    date: isoDate(year, month, day),
    sunriseLocal,
    sunsetLocal,
    sunriseAzimuthDeg,
    sunsetAzimuthDeg,
    noonAltitudeDeg: noon.altitudeDeg,
    daylightHours,
    samples,
  };
}

/** Daylight hours on the 15th of each month, January first. */
function daylightByMonth(lat: number, lng: number, year: number): number[] {
  const out: number[] = [];
  for (let month = 1; month <= 12; month++) {
    const day = sunPath(lat, lng, 0, new Date(Date.UTC(year, month - 1, 15)));
    out.push(day.daylightHours === null ? 0 : day.daylightHours);
  }
  return out;
}

/**
 * The full sun layer for 21 March, 21 June, and 21 December. `timezone` is the
 * IANA zone from the Open-Meteo archive, or "UTC" when the archive is
 * unavailable (OPEN-QUESTIONS item 18).
 *
 * `fromArchive` says whether the archive answered. It is passed rather than
 * inferred from the string: "UTC" is itself a zone the archive can legitimately
 * return, and reading the string meant a site whose real zone is UTC was
 * reported as having no zone at all, with a partial envelope saying the archive
 * could not be reached when it had answered correctly. That is a fetched value
 * presented as a failure, which the anti fabrication rule forbids in both
 * directions. It defaults to true so a caller with a zone in hand needs nothing
 * extra.
 */
export function sunLayer(
  lat: number,
  lng: number,
  timezone: string,
  year?: number,
  options?: { fromArchive?: boolean },
): SunData {
  const calendarYear = typeof year === "number" ? year : SUN_REFERENCE_YEAR;
  const fromArchive = options?.fromArchive !== false;

  let resolvedZone = timezone;
  let timezoneSource: SunData["timezoneSource"] = fromArchive ? "open-meteo" : "utc";
  const offsetFor = (date: Date): number => {
    try {
      return timezoneOffsetMinutes(resolvedZone, date);
    } catch {
      resolvedZone = "UTC";
      timezoneSource = "utc";
      return 0;
    }
  };

  const days: Array<[number, number]> = [
    [3, 21],
    [6, 21],
    [12, 21],
  ];
  const built = days.map(([month, day]) => {
    const date = new Date(Date.UTC(calendarYear, month - 1, day));
    return sunPath(lat, lng, offsetFor(date), date);
  });

  const march = built[0];
  const june = built[1];
  const december = built[2];

  const noonAltitudeRad = toRad(june.noonAltitudeDeg);
  const overhangRatioSouthGlazing =
    june.noonAltitudeDeg > 0 ? 1 / Math.tan(noonAltitudeRad) : null;

  return {
    latitude: lat,
    longitude: lng,
    timezone: resolvedZone,
    timezoneSource,
    june,
    march,
    december,
    daylightHoursByMonth: daylightByMonth(lat, lng, calendarYear),
    overhangRatioSouthGlazing,
  };
}

/**
 * The sun layer is computed, so it is never unavailable. It reads the IANA
 * timezone from the Open-Meteo archive (through the shared cache, so whichever
 * of sun and climate runs second pays nothing). If the archive cannot be
 * reached the times are computed in UTC and the envelope is partial with
 * missing ["timezone"] (OPEN-QUESTIONS item 18).
 */
export const fetchSun: LayerFetcher<SunData> = async (input, ctx) => {
  const year = ctx.now().getUTCFullYear();

  let timezone = "UTC";
  let cached = false;
  let reached = true;
  try {
    const archive = await fetchArchive(input, ctx);
    timezone = archive.timezone;
    cached = archive.cached;
  } catch {
    reached = false;
  }

  const source = { ...SUN_SOURCE, cached };
  const data = sunLayer(input.lat, input.lng, timezone, year, { fromArchive: reached });

  // timezoneSource is now the single record of where the zone came from: it is
  // "utc" when the archive did not answer and when the zone it gave could not
  // be resolved, and only then.
  if (data.timezoneSource === "utc") {
    return partial(
      "sun",
      source,
      data,
      ["timezone"],
      "The local time zone could not be read from the Open-Meteo archive, so sun times are given in UTC.",
      { now: ctx.now },
    );
  }
  return ok("sun", source, data, { now: ctx.now });
};
