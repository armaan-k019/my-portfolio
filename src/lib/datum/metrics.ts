// Site metrics and the similarity vector. SPEC.md section 14.
//
// Fourteen components, each normalized to 0..1 with a fixed constant so the
// vectors never drift as the dataset grows. A site gets a vector only when all
// fourteen are available; anything missing leaves the vector null, and the
// named values that were computed are still returned so the site can still be
// placed in a percentile for the metrics it does have.
//
// Erasable TypeScript only, and no "@/" alias: this module is imported by the
// routes and by the unit tests alike.

import { FRAME_SIZE_M } from "./constants";
import { ringAreaM2 } from "./geo";
import type {
  ClimateData,
  CensusData,
  FloodData,
  LayerEnvelope,
  LayerName,
  OsmData,
  SeismicData,
  SoilData,
  TopoData,
  WalkshedData,
} from "./types";

// ─── Normalization constants (SPEC section 14) ───────────────────────────────

/**
 * Every constant the fourteen normalizations use, exported so a test can check
 * that a component stays inside 0..1 for the range the constant claims to cover
 * and so that a change to one of them is visible in a diff rather than buried
 * in an expression.
 */
export const NORMALIZATION = {
  /** (v + 10) / 40, so -10 C maps to 0 and +30 C maps to 1. */
  annualMeanTempOffsetC: 10,
  annualMeanTempSpanC: 40,
  /** v / 60 degrees of annual range. */
  annualTempRangeSpanC: 60,
  /** v / 100 percent relative humidity. */
  meanRhSpanPct: 100,
  /** v / 8 kWh/m2 of mean daily radiation. */
  dailyRadiationSpanKwhM2: 8,
  /** v / 10 m/s of mean wind speed. */
  meanWindSpanMs: 10,
  /** log10(1 + v) / 2.5, so about 315 m of relief maps to 1. */
  reliefLogDivisor: 2.5,
  /** v / 30 percent mean slope. */
  meanSlopeSpanPct: 30,
  /** v / 25 km of street reached inside the 10 minute band. */
  reach10SpanKm: 25,
  /** v / 2 g of SDS. */
  sdsSpan: 2,
  /** log10(1 + v) / 5, so about 100 000 people per km2 maps to 1. */
  densityLogDivisor: 5,
  /** The hydrologic group ordinals, straight from the SPEC section 14 table. */
  hydrologicGroupValues: { A: 0, B: 0.33, C: 0.67, D: 1 } as Record<string, number>,
} as const;

/** The fourteen component names, in vector order. Index i is component i. */
export const METRIC_NAMES = [
  "annualMeanTempC",
  "annualTempRangeC",
  "meanRhPct",
  "dailyRadiationKwhM2",
  "meanWindMs",
  "windConcentration",
  "reliefM",
  "meanSlopePct",
  "buildingCoverage",
  "reach10Km",
  "sfhaShare",
  "sds",
  "logDensity",
  "hydrologicGroup",
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

/** Which layer each component comes from, for the "sites like this" reason. */
export const METRIC_LAYERS: Record<MetricName, LayerName> = {
  annualMeanTempC: "climate",
  annualTempRangeC: "climate",
  meanRhPct: "climate",
  dailyRadiationKwhM2: "climate",
  meanWindMs: "climate",
  windConcentration: "climate",
  reliefM: "topo",
  meanSlopePct: "topo",
  buildingCoverage: "osm",
  reach10Km: "walkshed",
  sfhaShare: "flood",
  sds: "seismic",
  logDensity: "census",
  hydrologicGroup: "soil",
};

/**
 * The six metrics the Site Memory panel places in a percentile
 * (SPEC section 14), with the wording each sentence uses.
 *
 * SPEC section 14 writes only the radiation sentence out in full ("more sun
 * than X percent of analyzed sites"). The other five follow its shape with the
 * metric named in the same plain register; recorded as new user facing copy in
 * PROGRESS.md.
 */
export const PERCENTILE_METRICS: Array<{ metric: MetricName; label: string }> = [
  { metric: "dailyRadiationKwhM2", label: "More sun than" },
  { metric: "buildingCoverage", label: "More built coverage than" },
  { metric: "reach10Km", label: "More street reach than" },
  { metric: "reliefM", label: "More relief than" },
  { metric: "meanWindMs", label: "More wind than" },
  { metric: "logDensity", label: "More density than" },
];

/**
 * A short plain name for each component, for the "sites like this" list.
 *
 * SPEC section 14 names the components in field terms, which is right for a
 * stored metric and wrong for a sentence a visitor reads. Recorded as new user
 * facing copy in the Phase 3 report.
 */
export const METRIC_LABELS: Record<MetricName, string> = {
  annualMeanTempC: "mean temperature",
  annualTempRangeC: "temperature range",
  meanRhPct: "humidity",
  dailyRadiationKwhM2: "sun",
  meanWindMs: "wind speed",
  windConcentration: "wind direction",
  reliefM: "relief",
  meanSlopePct: "slope",
  buildingCoverage: "built coverage",
  reach10Km: "street reach",
  sfhaShare: "flood extent",
  sds: "seismic demand",
  logDensity: "density",
  hydrologicGroup: "soil drainage",
};

/** The vector's dimension. Its square root is the largest possible distance. */
export const VECTOR_LENGTH = METRIC_NAMES.length;

/**
 * How many analyzed sites a metric needs behind it before a percentile is
 * shown (SPEC section 14). `metric_percentile` enforces the same number in SQL.
 */
export const PERCENTILE_MIN_SITES = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** A finite number, or null. Never a zero standing in for a missing value. */
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The mean of the finite entries, or null when there are none. */
function meanOrNull(values: Array<number | null | undefined>): number | null {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    const n = numberOrNull(value);
    if (n === null) continue;
    sum += n;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}

/**
 * The data of an envelope that carries data. An unavailable layer and a layer
 * that was never requested are the same thing here: no value, so no component.
 */
function dataOf<T>(envelope: LayerEnvelope<unknown> | undefined): T | null {
  if (!envelope) return null;
  if (envelope.status === "unavailable") return null;
  if (envelope.data === null || envelope.data === undefined) return null;
  return envelope.data as T;
}

/**
 * The hydrologic group ordinal for one group string (SPEC section 14 row 13).
 *
 * A dual group such as "B/D" takes its second letter, which is the drained
 * condition's counterpart and the wetter of the two. Anything that is not one
 * of the four letters, which is what a component like "Urban land" carries, is
 * null: there is no group, and null is not zero.
 */
export function hydrologicGroupValue(group: string | null | undefined): number | null {
  if (typeof group !== "string") return null;
  const trimmed = group.trim().toUpperCase();
  if (trimmed.length === 0) return null;
  const letters = trimmed.split("/");
  const letter = letters[letters.length - 1].trim();
  if (letter.length !== 1) return null;
  const value = NORMALIZATION.hydrologicGroupValues[letter];
  return value === undefined ? null : value;
}

/**
 * The share of the 800 m frame covered by SFHA polygons.
 *
 * The rings arrive already clipped to the frame in local metres (SPEC section
 * 9), so the numerator is their shoelace area and the denominator is the frame.
 * A site inside FEMA coverage with no SFHA polygon scores 0, which is a
 * measurement. A site outside coverage scores null, because nobody has mapped
 * it: no coverage is not zero.
 */
export function sfhaShareOf(flood: FloodData | null): number | null {
  if (!flood) return null;
  if (flood.coverage !== true) return null;
  let area = 0;
  for (const polygon of flood.polygons) {
    if (polygon.sfha !== true) continue;
    for (const ring of polygon.rings) area += ringAreaM2(ring);
  }
  return area / (FRAME_SIZE_M * FRAME_SIZE_M);
}

// ─── The fourteen components ─────────────────────────────────────────────────

export interface ComputedMetrics {
  /** The unnormalized value of each of the fourteen, null where unavailable. */
  named: Record<string, number | null>;
  /** Fourteen numbers in 0..1, or null when any component is unavailable. */
  vector: number[] | null;
  /** The names of the components that had no value, in vector order. */
  missing: MetricName[];
}

type Normalizer = (value: number) => number;

const NORMALIZERS: Record<MetricName, Normalizer> = {
  annualMeanTempC: (v) =>
    clamp01(
      (v + NORMALIZATION.annualMeanTempOffsetC) / NORMALIZATION.annualMeanTempSpanC,
    ),
  annualTempRangeC: (v) => clamp01(v / NORMALIZATION.annualTempRangeSpanC),
  meanRhPct: (v) => clamp01(v / NORMALIZATION.meanRhSpanPct),
  dailyRadiationKwhM2: (v) => clamp01(v / NORMALIZATION.dailyRadiationSpanKwhM2),
  meanWindMs: (v) => clamp01(v / NORMALIZATION.meanWindSpanMs),
  windConcentration: (v) => clamp01(v),
  reliefM: (v) =>
    clamp01(Math.log10(1 + Math.max(0, v)) / NORMALIZATION.reliefLogDivisor),
  meanSlopePct: (v) => clamp01(v / NORMALIZATION.meanSlopeSpanPct),
  buildingCoverage: (v) => clamp01(v),
  reach10Km: (v) => clamp01(v / NORMALIZATION.reach10SpanKm),
  sfhaShare: (v) => clamp01(v),
  sds: (v) => clamp01(v / NORMALIZATION.sdsSpan),
  logDensity: (v) =>
    clamp01(Math.log10(1 + Math.max(0, v)) / NORMALIZATION.densityLogDivisor),
  hydrologicGroup: (v) => clamp01(v),
};

/** Normalize one named value. Exported so the unit test can check the ranges. */
export function normalizeMetric(metric: MetricName, value: number): number {
  return NORMALIZERS[metric](value);
}

/**
 * The fourteen named values for one analysis, and the vector when every one of
 * them is present.
 *
 * Nothing here substitutes a default. A layer that failed, a field the source
 * suppressed, and a soil component with no hydrologic group all produce null,
 * and a null anywhere means no vector (SPEC section 14).
 */
export function computeMetrics(
  layers: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
): ComputedMetrics {
  const climate = dataOf<ClimateData>(layers.climate);
  const topo = dataOf<TopoData>(layers.topo);
  const osm = dataOf<OsmData>(layers.osm);
  const walkshed = dataOf<WalkshedData>(layers.walkshed);
  const flood = dataOf<FloodData>(layers.flood);
  const seismic = dataOf<SeismicData>(layers.seismic);
  const census = dataOf<CensusData>(layers.census);
  const soil = dataOf<SoilData>(layers.soil);

  const months = climate?.monthly ?? [];
  const maxima = months
    .map((month) => numberOrNull(month.meanDailyMaxC))
    .filter((value): value is number => value !== null);
  const minima = months
    .map((month) => numberOrNull(month.meanDailyMinC))
    .filter((value): value is number => value !== null);

  // The soil component with the largest share of the map unit. Ties keep the
  // order the source returned, which is the order it ranks them in.
  let topComponent = soil?.components[0] ?? null;
  for (const component of soil?.components ?? []) {
    const best = numberOrNull(topComponent?.percent) ?? -Infinity;
    const candidate = numberOrNull(component.percent) ?? -Infinity;
    if (candidate > best) topComponent = component;
  }

  const named: Record<string, number | null> = {
    annualMeanTempC: meanOrNull(months.map((month) => month.meanC)),
    annualTempRangeC:
      maxima.length > 0 && minima.length > 0
        ? Math.max(...maxima) - Math.min(...minima)
        : null,
    meanRhPct: meanOrNull(months.map((month) => month.meanRhPct)),
    dailyRadiationKwhM2: meanOrNull(
      months.map((month) => month.meanDailyRadiationKwhM2),
    ),
    meanWindMs: numberOrNull(climate?.wind.annual.meanSpeedMs),
    windConcentration: numberOrNull(climate?.wind.annual.resultantLength),
    reliefM: numberOrNull(topo?.reliefM),
    meanSlopePct: numberOrNull(topo?.meanSlopePct),
    buildingCoverage: numberOrNull(osm?.stats.coverageRatio),
    reach10Km: numberOrNull(walkshed?.reachKm[10]),
    sfhaShare: sfhaShareOf(flood),
    sds: numberOrNull(seismic?.sds),
    logDensity: numberOrNull(census?.derived.densityPerKm2),
    hydrologicGroup: hydrologicGroupValue(topComponent?.hydrologicGroup ?? null),
  };

  const missing: MetricName[] = [];
  const vector: number[] = [];
  for (const metric of METRIC_NAMES) {
    const value = named[metric];
    if (value === null) {
      missing.push(metric);
      continue;
    }
    vector.push(normalizeMetric(metric, value));
  }

  return { named, vector: missing.length === 0 ? vector : null, missing };
}

/**
 * Euclidean distance between two vectors. Both callers hold vectors of
 * VECTOR_LENGTH: `computeMetrics` builds one of exactly that length and
 * `parseVector` in memory.ts rejects a stored vector of any other, so there is
 * no shorter side to substitute a zero for.
 */
export function l2Distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = a[i] - b[i];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

/**
 * The match percent SPEC section 14 defines: round((1 - d / sqrt(14)) * 100).
 * sqrt(14) is the largest distance two clamped vectors can be apart, so the
 * result is a percentage without any further clamping.
 */
export function matchPercent(distance: number): number {
  return Math.round((1 - distance / Math.sqrt(VECTOR_LENGTH)) * 100);
}

/** The components that differ least between two vectors, closest first. */
export function closestComponents(
  a: number[],
  b: number[],
  limit = 3,
): MetricName[] {
  return METRIC_NAMES.map((metric, index) => ({
    metric,
    delta: Math.abs(a[index] - b[index]),
  }))
    .sort((left, right) => left.delta - right.delta)
    .slice(0, limit)
    .map((entry) => entry.metric);
}
