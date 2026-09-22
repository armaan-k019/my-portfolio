// Climate normals from the Open-Meteo archive. SPEC section 9 "climate",
// PHASE-1 step 1.3. Pure functions over an ArchiveResponse. No fetching here.

import type { ArchiveHour, ArchiveResponse } from "./sources/openMeteo";
import type {
  ClimateData,
  ClimateMonth,
  WindRose,
  WindSector,
} from "./types";

/** Sixteen sectors of 22.5 degrees, centred on north. */
export const WIND_SECTOR_COUNT = 16;
const SECTOR_WIDTH_DEG = 360 / WIND_SECTOR_COUNT;

/**
 * Upper edges in m/s. The first bin is the calm band: calm hours are counted in
 * `calmSharePct` and left out of the sectors, so every sector's bin 0 is zero
 * and `sum(sectors) + calm` is 100.
 */
export const WIND_BIN_EDGES_MS = [0.5, 2, 4, 6, 8, Infinity];

/** Below this speed the direction carries no information (SPEC section 9). */
export const CALM_THRESHOLD_MS = WIND_BIN_EDGES_MS[0];

/** Degree day base in Celsius (65 F). */
export const DEGREE_DAY_BASE_C = 18.3;

export const COMFORT_MIN_C = 18;
export const COMFORT_MAX_C = 26;
export const COMFORT_MAX_RH_PCT = 70;
export const COMFORT_DEFINITION =
  "Hours between 18 and 26 C with relative humidity under 70 percent. Simple comfort band, not ASHRAE 55.";

const SUMMER_MONTHS = [6, 7, 8];
const WINTER_MONTHS = [12, 1, 2];

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Month number 1 to 12 from a local "YYYY-MM-DDTHH:MM" archive timestamp. */
export function monthOf(time: string): number {
  return Number(time.slice(5, 7));
}

/** The local calendar day "YYYY-MM-DD" of an archive timestamp. */
export function dayOf(time: string): string {
  return time.slice(0, 10);
}

function sectorIndex(directionDeg: number): number {
  const wrapped = ((directionDeg % 360) + 360) % 360;
  return Math.round(wrapped / SECTOR_WIDTH_DEG) % WIND_SECTOR_COUNT;
}

function binIndex(speedMs: number): number {
  for (let i = 0; i < WIND_BIN_EDGES_MS.length; i++) {
    if (speedMs < WIND_BIN_EDGES_MS[i]) return i;
  }
  return WIND_BIN_EDGES_MS.length - 1;
}

/**
 * Sixteen sectors, the speed bins from SPEC section 9, calm under 0.5 m/s.
 * Calm hours are reported in `calmSharePct` and excluded from the sectors.
 */
export function buildWindRose(hours: ArchiveHour[]): WindRose {
  const counts: number[][] = Array.from(
    { length: WIND_SECTOR_COUNT },
    () => new Array<number>(WIND_BIN_EDGES_MS.length).fill(0),
  );

  let usable = 0;
  let calm = 0;
  let speedSum = 0;
  let eastSum = 0;
  let northSum = 0;

  for (const hour of hours) {
    const speed = hour.windSpeedMs;
    const direction = hour.windDirectionDeg;
    if (speed === null || direction === null) continue;
    usable++;
    speedSum += speed;

    // Meteorological convention: the direction is where the wind comes from.
    const fromRad = (direction * Math.PI) / 180;
    eastSum += -speed * Math.sin(fromRad);
    northSum += -speed * Math.cos(fromRad);

    if (speed < CALM_THRESHOLD_MS) {
      calm++;
      continue;
    }
    counts[sectorIndex(direction)][binIndex(speed)]++;
  }

  const scale = usable > 0 ? 100 / usable : 0;
  const sectors: WindSector[] = counts.map((bins, index) => {
    const binsPct = bins.map((count) => round(count * scale, 3));
    const total = bins.reduce((sum, count) => sum + count, 0);
    return {
      sectorDeg: index * SECTOR_WIDTH_DEG,
      frequencyPct: round(total * scale, 3),
      binsPct,
    };
  });

  let prevailingSectorDeg = 0;
  let best = -1;
  for (const sector of sectors) {
    if (sector.frequencyPct > best) {
      best = sector.frequencyPct;
      prevailingSectorDeg = sector.sectorDeg;
    }
  }

  const resultantLength =
    speedSum > 0
      ? Math.sqrt(eastSum * eastSum + northSum * northSum) / speedSum
      : 0;

  return {
    sectors,
    binEdgesMs: [...WIND_BIN_EDGES_MS],
    calmSharePct: round(calm * scale, 3),
    prevailingSectorDeg,
    meanSpeedMs: usable > 0 ? round(speedSum / usable, 3) : 0,
    resultantLength: round(resultantLength, 4),
  };
}

interface DayAccumulator {
  maxC: number | null;
  minC: number | null;
  radiationWhM2: number;
}

/** Twelve entries, January first. */
export function buildMonthlyNormals(hours: ArchiveHour[]): ClimateMonth[] {
  const tempSum = new Array<number>(12).fill(0);
  const tempCount = new Array<number>(12).fill(0);
  const rhSum = new Array<number>(12).fill(0);
  const rhCount = new Array<number>(12).fill(0);
  const days = new Map<string, DayAccumulator>();

  for (const hour of hours) {
    const month = monthOf(hour.time);
    if (month < 1 || month > 12) continue;
    const index = month - 1;

    if (hour.temperatureC !== null) {
      tempSum[index] += hour.temperatureC;
      tempCount[index]++;
    }
    if (hour.relativeHumidityPct !== null) {
      rhSum[index] += hour.relativeHumidityPct;
      rhCount[index]++;
    }

    const key = dayOf(hour.time);
    let day = days.get(key);
    if (!day) {
      day = { maxC: null, minC: null, radiationWhM2: 0 };
      days.set(key, day);
    }
    if (hour.temperatureC !== null) {
      day.maxC = day.maxC === null ? hour.temperatureC : Math.max(day.maxC, hour.temperatureC);
      day.minC = day.minC === null ? hour.temperatureC : Math.min(day.minC, hour.temperatureC);
    }
    if (hour.shortwaveWM2 !== null) {
      // One hourly sample of W/m2 is one hour of Wh/m2.
      day.radiationWhM2 += hour.shortwaveWM2;
    }
  }

  const maxSum = new Array<number>(12).fill(0);
  const maxCount = new Array<number>(12).fill(0);
  const minSum = new Array<number>(12).fill(0);
  const minCount = new Array<number>(12).fill(0);
  const radSum = new Array<number>(12).fill(0);
  const radCount = new Array<number>(12).fill(0);

  for (const [key, day] of days) {
    const index = Number(key.slice(5, 7)) - 1;
    if (index < 0 || index > 11) continue;
    if (day.maxC !== null) {
      maxSum[index] += day.maxC;
      maxCount[index]++;
    }
    if (day.minC !== null) {
      minSum[index] += day.minC;
      minCount[index]++;
    }
    radSum[index] += day.radiationWhM2 / 1000;
    radCount[index]++;
  }

  const mean = (sum: number, count: number): number =>
    count > 0 ? sum / count : 0;

  const out: ClimateMonth[] = [];
  for (let index = 0; index < 12; index++) {
    out.push({
      month: index + 1,
      meanC: round(mean(tempSum[index], tempCount[index]), 2),
      meanDailyMaxC: round(mean(maxSum[index], maxCount[index]), 2),
      meanDailyMinC: round(mean(minSum[index], minCount[index]), 2),
      meanRhPct: round(mean(rhSum[index], rhCount[index]), 2),
      meanDailyRadiationKwhM2: round(mean(radSum[index], radCount[index]), 3),
    });
  }
  return out;
}

/** HDD and CDD base 18.3 C per year, averaged over the period. */
export function buildDegreeDays(hours: ArchiveHour[]): {
  baseC: number;
  hdd: number;
  cdd: number;
} {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const hour of hours) {
    if (hour.temperatureC === null) continue;
    const key = dayOf(hour.time);
    const day = sums.get(key);
    if (day) {
      day.sum += hour.temperatureC;
      day.count++;
    } else {
      sums.set(key, { sum: hour.temperatureC, count: 1 });
    }
  }

  const years = new Set<string>();
  let hdd = 0;
  let cdd = 0;
  for (const [key, day] of sums) {
    if (day.count === 0) continue;
    years.add(key.slice(0, 4));
    const meanC = day.sum / day.count;
    if (meanC < DEGREE_DAY_BASE_C) hdd += DEGREE_DAY_BASE_C - meanC;
    else cdd += meanC - DEGREE_DAY_BASE_C;
  }

  const yearCount = years.size;
  return {
    baseC: DEGREE_DAY_BASE_C,
    hdd: yearCount > 0 ? round(hdd / yearCount, 1) : 0,
    cdd: yearCount > 0 ? round(cdd / yearCount, 1) : 0,
  };
}

/** Percent of hours at 18 to 26 C with RH under 70 percent. */
export function buildComfortShare(hours: ArchiveHour[]): {
  pct: number;
  definition: string;
} {
  let usable = 0;
  let comfortable = 0;
  for (const hour of hours) {
    if (hour.temperatureC === null || hour.relativeHumidityPct === null) continue;
    usable++;
    if (
      hour.temperatureC >= COMFORT_MIN_C &&
      hour.temperatureC <= COMFORT_MAX_C &&
      hour.relativeHumidityPct < COMFORT_MAX_RH_PCT
    ) {
      comfortable++;
    }
  }
  return {
    pct: usable > 0 ? round((comfortable / usable) * 100, 1) : 0,
    definition: COMFORT_DEFINITION,
  };
}

function inMonths(hours: ArchiveHour[], months: number[]): ArchiveHour[] {
  return hours.filter((hour) => months.includes(monthOf(hour.time)));
}

export function buildClimate(archive: ArchiveResponse): ClimateData {
  const hours = archive.hours;
  return {
    wind: {
      annual: buildWindRose(hours),
      summer: buildWindRose(inMonths(hours, SUMMER_MONTHS)),
      winter: buildWindRose(inMonths(hours, WINTER_MONTHS)),
    },
    monthly: buildMonthlyNormals(hours),
    degreeDays: buildDegreeDays(hours),
    comfortShare: buildComfortShare(hours),
    period: archive.period,
    timezone: archive.timezone,
  };
}
