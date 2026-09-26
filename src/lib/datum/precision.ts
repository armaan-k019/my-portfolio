// Per field rounding precision. SPEC.md section 8, rule 7.
//
// Why this exists. The brief on 1111 Brickell Bay Drive printed "2.660512686 m"
// for a terrain section. Nine decimals on a 3DEP elevation is a float, not a
// measurement. Two things put it there:
//
//   1. `roundLeaf` in brief/prompt.ts rounded every leaf to four decimals,
//      which is the same rule for a metre, a degree and a percent, and is too
//      fine for all three. "1.8284 m" is that rule working as written.
//   2. `summarise` in the same file collapses a long array to a count, a min
//      and a max, and took the min and max straight off the unrounded values.
//      The 21 point terrain sections go through it, so their extremes reached
//      the model at full float precision. That is where the nine decimals came
//      from.
//
// The value aware citation check then compared what the brief wrote against
// what the model was given, so rounding a number cost the brief a citation and
// the model learned not to round. The fix is not to tell the model to round. It
// is to stop giving it numbers that need rounding: every value is rounded here,
// at the layer, before it reaches the sheet, the model, the metrics or the
// database, and the validator then compares against the rounded value, so
// quoting the value exactly is both correct and what passes.
//
// How a precision is chosen. Each field is rounded to the coarser of what its
// unit deserves and what the sheet already prints, and where the sheet prints a
// value the two are the same, so no printed number on the sheet changes. The
// rounding uses `toFixed` for exactly that reason: the sheet formats with
// `toFixed`, and a multiply and divide form disagrees with it at a trailing .5.
//
// Drawing geometry is not in the table. A contour polyline, a building ring and
// a walk shed band are not measurements anyone reads as numbers: the serializer
// never sends them to the model, and `pathFrom` in sheet/panel.ts already
// rounds them as it writes the path. They are listed in GEOMETRY_PATHS so that
// "not rounded" is a decision on the record rather than an omission, and the
// unit tests hold the table to covering everything else.
//
// Erasable TypeScript only. Do not use the "@/" alias inside src/lib/datum.

import { LAYER_NAMES, type LayerEnvelope, type LayerName } from "./types";

/**
 * Decimal places per field. The key is the field's path inside the layer's
 * data, with `[]` for an array step, which is the same shape `flattenLayer`
 * builds its citation paths from.
 */
type PrecisionTable = Record<string, number>;

/** One solar day. The same six fields under `june`, `march` and `december`. */
const SUN_DAY: PrecisionTable = {
  // Sun angles. A tenth of a degree is finer than any shadow study needs and
  // finer than the sheet prints (sunrise azimuth at whole degrees, noon
  // altitude at a tenth).
  sunriseAzimuthDeg: 1,
  sunsetAzimuthDeg: 1,
  noonAltitudeDeg: 1,
  // Hours of daylight, to six minutes.
  daylightHours: 1,
  "samples[].altitudeDeg": 1,
  "samples[].azimuthDeg": 1,
};

/** One wind rose. The same fields under `annual`, `summer` and `winter`. */
const WIND_ROSE: PrecisionTable = {
  "sectors[].sectorDeg": 1,
  // Sector frequencies are single digit percentages, so a tenth is the
  // difference between two sectors rather than noise, and the sheet prints the
  // peak at a tenth.
  "sectors[].frequencyPct": 1,
  "sectors[].binsPct[]": 1,
  "binEdgesMs[]": 1,
  calmSharePct: 1,
  prevailingSectorDeg: 1,
  // The sheet prints mean speed at two decimals and the resultant at three.
  meanSpeedMs: 2,
  resultantLength: 3,
};

function underEach(prefix: string[], table: PrecisionTable): PrecisionTable {
  const out: PrecisionTable = {};
  for (const name of prefix) {
    for (const [path, decimals] of Object.entries(table)) {
      out[`${name}.${path}`] = decimals;
    }
  }
  return out;
}

export const FIELD_PRECISION: Record<LayerName, PrecisionTable> = {
  sun: {
    // The site point, at the five decimals the title block prints it at
    // (about a metre), so the sun panel and the title block cannot disagree.
    latitude: 5,
    longitude: 5,
    "daylightHoursByMonth[]": 1,
    // A shading ratio the sheet prints as "1 to 0.18".
    overhangRatioSouthGlazing: 2,
    ...underEach(["june", "march", "december"], SUN_DAY),
  },

  climate: {
    ...underEach(["wind.annual", "wind.summer", "wind.winter"], WIND_ROSE),
    "monthly[].month": 0,
    // Temperature normals to a tenth of a degree, which is what ERA5 resolves.
    "monthly[].meanC": 1,
    "monthly[].meanDailyMaxC": 1,
    "monthly[].meanDailyMinC": 1,
    "monthly[].meanRhPct": 1,
    // The sheet prints peak radiation at two decimals.
    "monthly[].meanDailyRadiationKwhM2": 2,
    "degreeDays.baseC": 1,
    // Degree days are whole days; the sheet prints them whole.
    "degreeDays.hdd": 0,
    "degreeDays.cdd": 0,
    "comfortShare.pct": 1,
    "period.years": 0,
  },

  topo: {
    // Elevations and section values to 0.1 m. 3DEP is a 1 m to 10 m surface;
    // a tenth of a metre is already past what it resolves, and it is what the
    // sheet prints.
    siteElevationM: 1,
    reliefM: 1,
    "grid.values[]": 1,
    "sections.ew[]": 1,
    "sections.ns[]": 1,
    "grid.spacingM": 1,
    "grid.n": 0,
    "contours.intervalM": 1,
    // Slope to 0.1 percent, aspect to 0.1 degrees.
    meanSlopePct: 1,
    aspectDeg: 1,
  },

  seismic: {
    // ASCE 7-22 design values are published and printed to three decimals.
    ss: 3,
    s1: 3,
    sms: 3,
    sm1: 3,
    sds: 3,
    sd1: 3,
    pgam: 3,
    // The long period transition, in seconds, printed to a tenth.
    tl: 1,
  },

  soil: {
    // SSURGO reports component composition in whole percent, and a fraction of
    // a percent of a map unit is not a claim anyone can use.
    "components[].percent": 0,
    "components[].slopePct": 1,
  },

  osm: {
    // Tagged building heights in metres. The sheet prints them whole; a tenth
    // keeps the tag's own value where it carries one.
    "buildings[].heightM": 1,
    "buildings[].levels": 0,
    "buildings[].id": 0,
    "streets[].id": 0,
    "transitStops[].id": 0,
    // Stop positions in local metres, to 0.1 m.
    "transitStops[].x": 1,
    "transitStops[].y": 1,
    "stats.buildingCount": 0,
    "stats.ringCount": 0,
    "stats.withHeight": 0,
    "stats.withLevels": 0,
    "stats.relationCount": 0,
    // A footprint share of the frame. Three decimals is a tenth of a percent.
    "stats.coverageRatio": 3,
    "stats.sizeWarning.bytes": 0,
    "stats.sizeWarning.thresholdBytes": 0,
  },

  walkshed: {
    // Street kilometres reached, printed to a tenth.
    "reachKm.5": 1,
    "reachKm.10": 1,
    "reachKm.15": 1,
    "transitWithin.5": 0,
    "transitWithin.10": 0,
    "transitWithin.15": 0,
    startNodeOffsetM: 1,
    walkingSpeedMPerMin: 0,
  },

  flood: {
    // FEMA publishes base flood elevations to a tenth of a foot.
    "atPoint.staticBfeFt": 1,
  },

  census: {
    "tract.areaLandM2": 0,
    // ACS counts are people, households and units: whole numbers.
    population: 0,
    householdsTotal: 0,
    ownerOccupied: 0,
    renterOccupied: 0,
    workersTotal: 0,
    transitToWork: 0,
    walkedToWork: 0,
    bikeToWork: 0,
    workedFromHome: 0,
    unitsTotal: 0,
    singleDetached: 0,
    units5to9: 0,
    units10to19: 0,
    units20to49: 0,
    units50plus: 0,
    medianHouseholdIncome: 0,
    medianGrossRent: 0,
    medianAge: 1,
    avgHouseholdSize: 2,
    "derived.densityPerKm2": 1,
    // Tract shares the sheet prints to a tenth. A tenth of a percent of a
    // tract is a household or two, so the fraction carries something.
    "derived.renterSharePct": 1,
    "derived.carFreeCommutePct": 1,
    "derived.multifamily5plusSharePct": 1,
  },
};

/**
 * Paths that are drawing geometry, deliberately left as the source sent them.
 * The serializer never sends them to the model (brief/prompt.ts skips every
 * geometry segment), and the sheet rounds them as it writes the path data, so
 * rounding them here would buy nothing and would move drawn lines.
 */
export const GEOMETRY_PATHS: Record<LayerName, string[]> = {
  sun: [],
  climate: [],
  topo: ["contours.lines[][][]"],
  seismic: [],
  soil: [],
  osm: [
    "buildings[].ring[][]",
    "water[].ring[][]",
    "water[].line[][]",
    "streets[].line[][]",
  ],
  walkshed: ["bands.5[][][]", "bands.10[][][]", "bands.15[][][]"],
  flood: ["polygons[].rings[][][]"],
  census: ["geometry.rings[][][]"],
};

const ACS_MARGIN_PREFIX = "margins.";

/**
 * The decimals this field is rounded to, or null when it has none: geometry, or
 * a field the table does not know. A field the table does not know is left
 * exactly as the source sent it, which is the behaviour before this module
 * existed; `unlistedNumericPaths` is what turns that into a test failure rather
 * than a silent nine decimal number in a brief.
 */
export function precisionFor(layer: LayerName, path: string): number | null {
  const table = FIELD_PRECISION[layer];
  const direct = table[path];
  if (direct !== undefined) return direct;
  // An ACS margin of error is keyed by the name of the estimate it qualifies
  // and is in that estimate's unit, so it takes that estimate's precision.
  if (layer === "census" && path.startsWith(ACS_MARGIN_PREFIX)) {
    const base = table[path.slice(ACS_MARGIN_PREFIX.length)];
    if (base !== undefined) return base;
  }
  return null;
}

/**
 * Round one value. `toFixed` and not a multiply and divide: the sheet formats
 * with `toFixed`, and the two disagree at a trailing .5, so this is the form
 * that guarantees the stored value and the printed value are the same number.
 * A rounded down negative can land on -0, which serializes as "0" but reads
 * badly in a debug log, so it is normalised.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundInto(value: unknown, path: string, layer: LayerName): unknown {
  if (typeof value === "number") {
    const decimals = precisionFor(layer, path);
    return decimals === null ? value : roundTo(value, decimals);
  }
  if (Array.isArray(value)) {
    const next = `${path}[]`;
    return value.map((item) => roundInto(item, next, layer));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
      out[name] = roundInto(child, path ? `${path}.${name}` : name, layer);
    }
    return out;
  }
  return value;
}

/** One layer's data with every table listed value rounded. Never mutates. */
export function roundLayerData<T>(layer: LayerName, data: T): T {
  if (data === null || typeof data !== "object") return data;
  return roundInto(data, "", layer) as T;
}

/** One envelope with its data rounded. An unavailable envelope has none. */
export function roundEnvelope<T>(envelope: LayerEnvelope<T>): LayerEnvelope<T> {
  if (envelope.data === null || envelope.data === undefined) return envelope;
  if (!(LAYER_NAMES as string[]).includes(envelope.layer)) return envelope;
  return { ...envelope, data: roundLayerData(envelope.layer, envelope.data) };
}

/**
 * Every numeric path in this data that the table does not cover and that is not
 * declared geometry. The unit tests assert this is empty for every fixture, so
 * a new numeric field on any source fails the build rather than reaching a
 * brief at whatever precision the source happened to send.
 */
export function unlistedNumericPaths(layer: LayerName, data: unknown): string[] {
  const geometry = new Set(GEOMETRY_PATHS[layer]);
  const found = new Set<string>();

  function walk(value: unknown, path: string): void {
    if (typeof value === "number") {
      if (geometry.has(path)) return;
      if (precisionFor(layer, path) === null) found.add(path);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, `${path}[]`);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, path ? `${path}.${name}` : name);
      }
    }
  }

  walk(data, "");
  return [...found].sort();
}
