// Site metrics and the similarity vector. SPEC.md section 14, PHASE-3 step 3.2.
//
// The envelopes come from the committed layer fixtures, so the numbers under
// test are the numbers the sources actually returned for the three test sites.
// The flood envelope is the constructed one (FEMA has refused connections from
// this machine since 2026-09-22, PROGRESS.md), which is labelled as such in the
// fixture file itself.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  METRIC_NAMES,
  NORMALIZATION,
  PERCENTILE_METRICS,
  VECTOR_LENGTH,
  closestComponents,
  computeMetrics,
  hydrologicGroupValue,
  l2Distance,
  matchPercent,
  normalizeMetric,
  sfhaShareOf,
} from "../../src/lib/datum/metrics";
import type {
  LayerEnvelope,
  LayerName,
  FloodData,
} from "../../src/lib/datum/types";

const FIXTURES = path.join(process.cwd(), "e2e/fixtures/layers");

type Layers = Partial<Record<LayerName, LayerEnvelope<unknown>>>;

/** The eight metric bearing layers plus the constructed flood envelope. */
function siteLayers(site: string): Layers {
  const out: Layers = {};
  for (const layer of [
    "climate",
    "topo",
    "osm",
    "walkshed",
    "seismic",
    "census",
    "soil",
  ] as LayerName[]) {
    out[layer] = JSON.parse(
      readFileSync(path.join(FIXTURES, site, `${layer}.json`), "utf8"),
    ) as LayerEnvelope<unknown>;
  }
  const constructed = JSON.parse(
    readFileSync(path.join(FIXTURES, site, "flood.constructed.json"), "utf8"),
  ) as { envelope: LayerEnvelope<unknown> };
  out.flood = constructed.envelope;
  return out;
}

/**
 * The Atlanta set with the soil top component given a hydrologic group.
 *
 * Atlanta's map unit is "Urban land" with no group at all, which SPEC section
 * 14 row 13 makes null, so the real Atlanta site has no vector. This variant
 * changes exactly that one field and nothing else, so the "all fourteen inside
 * 0..1" property is checked on real values for thirteen components and one
 * substituted letter for the fourteenth. Recorded in the report: PHASE-3 step
 * 3.2 asks for the property on the Atlanta fixtures unchanged, and SPEC section
 * 14 makes that impossible for this map unit.
 */
function atlantaWithSoilGroup(group: string): Layers {
  const layers = siteLayers("atlanta");
  const soil = JSON.parse(JSON.stringify(layers.soil)) as LayerEnvelope<{
    components: Array<{ hydrologicGroup: string | null }>;
  }>;
  soil.data!.components[0].hydrologicGroup = group;
  return { ...layers, soil: soil as LayerEnvelope<unknown> };
}

test("metrics: every component of the Atlanta vector lies in 0 to 1", () => {
  const { vector, named, missing } = computeMetrics(atlantaWithSoilGroup("B"));
  expect(missing, "no component should be missing once soil carries a group").toEqual([]);
  expect(vector, "a complete site gets a vector").not.toBeNull();
  expect(vector!.length, "the vector has fourteen components").toBe(VECTOR_LENGTH);
  for (let index = 0; index < VECTOR_LENGTH; index++) {
    const value = vector![index];
    expect(
      Number.isFinite(value),
      `component ${index} (${METRIC_NAMES[index]}) should be a number`,
    ).toBe(true);
    expect(value, `component ${index} (${METRIC_NAMES[index]}) below 0`).toBeGreaterThanOrEqual(0);
    expect(value, `component ${index} (${METRIC_NAMES[index]}) above 1`).toBeLessThanOrEqual(1);
  }
  // The named values are the unnormalized measurements, so a couple are checked
  // against the fixture directly: a normalization change must not be able to
  // rewrite what was measured.
  expect(named.reliefM, "Atlanta relief from the topo fixture").toBeCloseTo(29.9, 6);
  expect(named.meanSlopePct, "Atlanta mean slope from the topo fixture").toBeCloseTo(6.2, 6);
  expect(named.buildingCoverage, "Atlanta coverage ratio from the osm fixture").toBeCloseTo(
    0.3563,
    6,
  );
  expect(named.reach10Km, "Atlanta 10 minute reach from the walkshed fixture").toBeCloseTo(
    49.33,
    6,
  );
  expect(named.sds, "Atlanta SDS from the seismic fixture").toBeCloseTo(0.21, 6);
});

test("metrics: the real Atlanta fixtures have no vector, because Urban land has no hydrologic group", () => {
  const { vector, named, missing } = computeMetrics(siteLayers("atlanta"));
  expect(named.hydrologicGroup, "Urban land carries no group").toBeNull();
  expect(missing, "the soil component is the only one missing").toEqual([
    "hydrologicGroup",
  ]);
  expect(vector, "any missing component means no vector").toBeNull();
  // Everything else was still measured, so the site can still be placed in a
  // percentile for the metrics it does have.
  expect(named.dailyRadiationKwhM2, "radiation is still named").not.toBeNull();
  expect(named.densityPerKm2, "density is still named").not.toBeNull();
});

test("metrics: removing flood gives a null vector and a null sfhaShare, and keeps the rest", () => {
  const complete = atlantaWithSoilGroup("B");
  const withoutFlood: Layers = { ...complete };
  delete withoutFlood.flood;

  const { vector, named, missing } = computeMetrics(withoutFlood);
  expect(vector, "an unavailable layer means no vector").toBeNull();
  expect(named.sfhaShare, "no flood answer is null, not zero").toBeNull();
  expect(missing, "flood is the only missing component").toEqual(["sfhaShare"]);
  for (const metric of METRIC_NAMES) {
    if (metric === "sfhaShare") continue;
    expect(named[metric], `${metric} should survive flood being removed`).not.toBeNull();
  }

  // With flood present the same set does produce one, which is what makes the
  // assertion above about flood rather than about something else.
  expect(computeMetrics(complete).vector, "the complete set has a vector").not.toBeNull();
});

test("metrics: WaKeeney flood no_coverage gives a null vector, not a zero share", () => {
  const layers = siteLayers("wakeeney");
  expect(
    layers.flood!.unavailable?.code,
    "the WaKeeney flood fixture is the no coverage answer",
  ).toBe("no_coverage");

  const { vector, named } = computeMetrics(layers);
  expect(named.sfhaShare, "no coverage is not zero").toBeNull();
  expect(vector, "a null component means no vector").toBeNull();
});

test("metrics: an SFHA polygon covering the frame gives a share of 1, and none gives 0", () => {
  const half = 400;
  const full: FloodData = {
    atPoint: null,
    coverage: true,
    polygons: [
      {
        zone: "AE",
        subtype: null,
        sfha: true,
        class: "sfha",
        rings: [
          [
            [-half, -half],
            [half, -half],
            [half, half],
            [-half, half],
          ],
        ],
      },
    ],
  };
  expect(sfhaShareOf(full), "the whole frame is SFHA").toBeCloseTo(1, 9);
  expect(
    sfhaShareOf({ atPoint: null, coverage: true, polygons: [] }),
    "coverage with no SFHA polygon is a measured zero",
  ).toBe(0);
  expect(
    sfhaShareOf({ atPoint: null, coverage: false, polygons: [] }),
    "no coverage is null",
  ).toBeNull();
});

test("metrics: hydrologic groups follow the SPEC section 14 table", () => {
  expect(hydrologicGroupValue("A"), "group A").toBe(0);
  expect(hydrologicGroupValue("B"), "group B").toBe(0.33);
  expect(hydrologicGroupValue("C"), "group C").toBe(0.67);
  expect(hydrologicGroupValue("D"), "group D").toBe(1);
  // A dual group takes its second letter.
  expect(hydrologicGroupValue("B/D"), "B/D takes the second letter").toBe(1);
  expect(hydrologicGroupValue("A/D"), "A/D takes the second letter").toBe(1);
  expect(hydrologicGroupValue("Urban land"), "a map unit name is not a group").toBeNull();
  expect(hydrologicGroupValue(null), "no group at all").toBeNull();
  expect(hydrologicGroupValue(""), "an empty string").toBeNull();
  expect(hydrologicGroupValue("E"), "a letter outside the table").toBeNull();
});

test("metrics: every normalization clamps to 0 and 1 at the edges of its constant", () => {
  const extremes: Array<[(typeof METRIC_NAMES)[number], number, number]> = [
    // metric, a value at or below the floor, a value at or above the ceiling
    ["annualMeanTempC", -NORMALIZATION.annualMeanTempOffsetC - 50, 1000],
    ["annualTempRangeC", -5, NORMALIZATION.annualTempRangeSpanC * 2],
    ["meanRhPct", -1, 250],
    ["dailyRadiationKwhM2", -1, NORMALIZATION.dailyRadiationSpanKwhM2 * 3],
    ["meanWindMs", -1, NORMALIZATION.meanWindSpanMs * 3],
    ["windConcentration", -1, 5],
    ["reliefM", -1, 10_000],
    ["meanSlopePct", -1, NORMALIZATION.meanSlopeSpanPct * 4],
    ["buildingCoverage", -1, 5],
    ["reach10Km", -1, NORMALIZATION.reach10SpanKm * 10],
    ["sfhaShare", -1, 5],
    ["sds", -1, NORMALIZATION.sdsSpan * 4],
    ["densityPerKm2", -1, 10_000_000],
    ["hydrologicGroup", -1, 5],
  ];
  expect(extremes.length, "one row per component").toBe(VECTOR_LENGTH);
  for (const [metric, low, high] of extremes) {
    expect(normalizeMetric(metric, low), `${metric} floor`).toBe(0);
    expect(normalizeMetric(metric, high), `${metric} ceiling`).toBe(1);
  }
});

test("metrics: the match percent and the closest components follow SPEC section 14", () => {
  const a = new Array<number>(VECTOR_LENGTH).fill(0);
  const b = new Array<number>(VECTOR_LENGTH).fill(0);

  expect(matchPercent(l2Distance(a, b)), "identical vectors match at 100").toBe(100);

  const farthest = new Array<number>(VECTOR_LENGTH).fill(1);
  expect(
    matchPercent(l2Distance(a, farthest)),
    "opposite corners of the unit cube match at 0",
  ).toBe(0);

  // One component apart by 1 and the rest identical: d = 1, so the match is
  // round((1 - 1 / sqrt(14)) * 100).
  const oneApart = a.slice();
  oneApart[6] = 1;
  expect(matchPercent(l2Distance(a, oneApart)), "one component apart").toBe(
    Math.round((1 - 1 / Math.sqrt(VECTOR_LENGTH)) * 100),
  );
  expect(
    closestComponents(a, oneApart),
    "the one differing component is never among the three closest",
  ).not.toContain(METRIC_NAMES[6]);
  expect(closestComponents(a, oneApart).length, "three closest components").toBe(3);
});

test("metrics: the percentile metrics are the six SPEC section 14 names", () => {
  expect(PERCENTILE_METRICS.map((entry) => entry.metric)).toEqual([
    "dailyRadiationKwhM2",
    "buildingCoverage",
    "reach10Km",
    "reliefM",
    "meanWindMs",
    "densityPerKm2",
  ]);
  // SPEC section 14 writes this one out; the rest follow its shape.
  expect(PERCENTILE_METRICS[0].label).toBe("More sun than");
});

test("metrics: the stored density is the raw one, and only the normalizer takes the log", () => {
  const layers = atlantaWithSoilGroup("B");
  const { named, vector } = computeMetrics(layers);
  const census = JSON.parse(
    readFileSync(path.join(FIXTURES, "atlanta", "census.json"), "utf8"),
  ) as LayerEnvelope<{ derived: { densityPerKm2: number } }>;
  const raw = census.data!.derived.densityPerKm2;

  // The named value is what the census layer measured, people per square
  // kilometre, so a percentile over the stored metrics is a percentile over a
  // number somebody reported.
  expect(named.densityPerKm2, "the stored key holds the raw density").toBeCloseTo(raw, 9);
  expect(named.densityPerKm2!, "a raw density is far above the log of itself").toBeGreaterThan(1);

  // The log is the normalization, SPEC section 14 row 12.
  const expected = Math.log10(1 + raw) / NORMALIZATION.densityLogDivisor;
  expect(normalizeMetric("densityPerKm2", raw), "the normalizer keeps the log").toBeCloseTo(
    expected,
    9,
  );
  expect(vector![12], "component 12 is the normalized density").toBeCloseTo(expected, 9);
});
