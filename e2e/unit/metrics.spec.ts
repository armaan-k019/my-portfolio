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
  FULL_MASK,
  METRICS_MIN_PRESENT,
  METRIC_NAMES,
  NORMALIZATION,
  PERCENTILE_METRICS,
  VECTOR_LENGTH,
  closestComponents,
  computeMetrics,
  hydrologicGroupValue,
  maskedDistance,
  matchPercent,
  normalizeMetric,
  presentCount,
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
 * 14 row 13 records as absent. This variant changes exactly that one field and
 * nothing else, so the "all fourteen inside 0..1" property is checked on real
 * values for thirteen components and one substituted letter for the
 * fourteenth.
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
  const { vector, named, missing, mask, present } = computeMetrics(
    atlantaWithSoilGroup("B"),
  );
  expect(missing, "no component should be missing once soil carries a group").toEqual([]);
  expect(mask, "every bit is set on a complete computation").toBe(FULL_MASK);
  expect(present, "fourteen components present").toBe(VECTOR_LENGTH);
  expect(vector.length, "the vector has fourteen components").toBe(VECTOR_LENGTH);
  for (let index = 0; index < VECTOR_LENGTH; index++) {
    const value = vector[index];
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

test("metrics: the unchanged Atlanta and Miami fixtures are eligible with soil absent", () => {
  // Urban land carries no hydrologic group at either site, so component 13 is
  // absent. SPEC section 14 as amended makes that a narrower comparison, not a
  // site that cannot be placed.
  for (const slug of ["atlanta", "miami"]) {
    const { vector, named, missing, mask, present, eligible } = computeMetrics(
      siteLayers(slug),
    );
    expect(named.hydrologicGroup, `${slug}: Urban land carries no group`).toBeUndefined();
    expect(missing, `${slug}: the soil component is the only one absent`).toEqual([
      "hydrologicGroup",
    ]);
    expect(present, `${slug}: thirteen components present`).toBe(13);
    expect(present, `${slug}: between twelve and fourteen`).toBeGreaterThanOrEqual(12);
    expect(presentCount(mask), `${slug}: the mask agrees with the count`).toBe(present);
    expect(mask & (1 << 13), `${slug}: the soil bit is clear`).toBe(0);
    expect(eligible, `${slug}: ten or more present is eligible`).toBe(true);
    // The absent entry holds the storage placeholder SPEC section 14 defines,
    // which nothing ever reads as a value.
    expect(vector.length, `${slug}: still fourteen entries`).toBe(VECTOR_LENGTH);
    expect(vector[13], `${slug}: the absent entry is the placeholder`).toBe(0);
    // Everything else was still measured.
    expect(named.dailyRadiationKwhM2, `${slug}: radiation is still named`).toBeGreaterThan(0);
    expect(named.densityPerKm2, `${slug}: density is still named`).toBeGreaterThan(0);
  }
});

test("metrics: a site with only nine components present is not eligible", () => {
  // Atlanta is short the soil component already, so thirteen are present.
  // Dropping climate takes six of those and leaves seven, which is well under
  // the threshold.
  const layers = siteLayers("atlanta");
  delete layers.climate;
  const seven = computeMetrics(layers);
  expect(seven.present, "climate carries six of the fourteen").toBe(7);
  expect(seven.eligible, "seven is fewer than ten").toBe(false);

  // Exactly nine, which is the one short case: topo is two components, osm one
  // and walkshed one, so dropping the three takes four off the thirteen.
  const short = siteLayers("atlanta");
  delete short.topo;
  delete short.osm;
  delete short.walkshed;
  const result = computeMetrics(short);
  expect(result.present, "nine of the fourteen were measured").toBe(9);
  expect(result.present, "one short of the threshold").toBe(METRICS_MIN_PRESENT - 1);
  expect(result.eligible, "nine is not enough to place a site").toBe(false);
});

test("metrics: removing flood clears its bit and keeps the rest", () => {
  const complete = atlantaWithSoilGroup("B");
  const withoutFlood: Layers = { ...complete };
  delete withoutFlood.flood;

  const { vector, named, missing, mask, eligible } = computeMetrics(withoutFlood);
  expect(named.sfhaShare, "no flood answer is absent, not zero").toBeUndefined();
  expect(missing, "flood is the only absent component").toEqual(["sfhaShare"]);
  expect(mask & (1 << 10), "the flood bit is clear").toBe(0);
  expect(vector[10], "the flood entry is the placeholder").toBe(0);
  expect(eligible, "thirteen present is still eligible").toBe(true);
  for (const metric of METRIC_NAMES) {
    if (metric === "sfhaShare") continue;
    expect(named[metric], `${metric} should survive flood being removed`).not.toBeUndefined();
  }

  // With flood present the same set sets every bit, which is what makes the
  // assertion above about flood rather than about something else.
  expect(computeMetrics(complete).mask, "the complete set has every bit").toBe(FULL_MASK);
});

test("metrics: WaKeeney flood no_coverage is an absent component, not a zero share", () => {
  const layers = siteLayers("wakeeney");
  expect(
    layers.flood!.unavailable?.code,
    "the WaKeeney flood fixture is the no coverage answer",
  ).toBe("no_coverage");

  const { vector, named, mask, eligible } = computeMetrics(layers);
  expect(named.sfhaShare, "no coverage is not zero").toBeUndefined();
  expect(mask & (1 << 10), "the flood bit is clear").toBe(0);
  expect(vector[10], "and its entry is the placeholder").toBe(0);
  expect(eligible, "the other thirteen still place the site").toBe(true);
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

function distanceOf(
  a: number[],
  maskA: number,
  b: number[],
  maskB: number,
): number {
  const scaled = maskedDistance(a, maskA, b, maskB);
  expect(scaled, "the pair should be comparable").not.toBeNull();
  return scaled!.distance;
}

test("metrics: the match percent and the closest components follow SPEC section 14", () => {
  const a = new Array<number>(VECTOR_LENGTH).fill(0);
  const b = new Array<number>(VECTOR_LENGTH).fill(0);

  expect(
    matchPercent(distanceOf(a, FULL_MASK, b, FULL_MASK)),
    "identical vectors match at 100",
  ).toBe(100);

  const farthest = new Array<number>(VECTOR_LENGTH).fill(1);
  expect(
    matchPercent(distanceOf(a, FULL_MASK, farthest, FULL_MASK)),
    "opposite corners of the unit cube match at 0",
  ).toBe(0);

  // One component apart by 1 and the rest identical, every component shared:
  // the 14 / k factor is 1, d = 1, so the match is
  // round((1 - 1 / sqrt(14)) * 100).
  const oneApart = a.slice();
  oneApart[6] = 1;
  expect(
    matchPercent(distanceOf(a, FULL_MASK, oneApart, FULL_MASK)),
    "one component apart",
  ).toBe(Math.round((1 - 1 / Math.sqrt(VECTOR_LENGTH)) * 100));
  expect(
    closestComponents(a, oneApart, FULL_MASK),
    "the one differing component is never among the three closest",
  ).not.toContain(METRIC_NAMES[6]);
  expect(closestComponents(a, oneApart, FULL_MASK).length, "three closest").toBe(3);
});

// ─── The masked distance, SPEC section 14 as amended 2026-09-25 ──────────────

test("metrics: a masked distance reads only the components both sites measured", () => {
  // Two sites with disjoint absences: A is short component 0, B is short
  // component 1, so twelve are shared. The entries under the cleared bits are
  // set as far apart as they can be, and they must not move the distance.
  const a = new Array<number>(VECTOR_LENGTH).fill(0.5);
  const b = new Array<number>(VECTOR_LENGTH).fill(0.5);
  a[0] = 0;
  b[0] = 1;
  a[1] = 1;
  b[1] = 0;
  const maskA = FULL_MASK & ~(1 << 0);
  const maskB = FULL_MASK & ~(1 << 1);

  const scaled = maskedDistance(a, maskA, b, maskB);
  expect(scaled, "twelve shared components is enough to compare").not.toBeNull();
  expect(scaled!.sharedCount, "twelve components in common").toBe(12);
  expect(scaled!.shared & (1 << 0), "component 0 is not shared").toBe(0);
  expect(scaled!.shared & (1 << 1), "component 1 is not shared").toBe(0);
  // Every shared component is identical, so the distance is exactly zero even
  // though the two unshared entries are a whole unit apart.
  expect(scaled!.distance, "an unshared component contributes nothing").toBeCloseTo(0, 12);
  expect(
    closestComponents(a, b, scaled!.shared),
    "the unshared components are never among the closest",
  ).not.toContain(METRIC_NAMES[0]);
});

test("metrics: an absent component contributes zero and the scaling is 14 over k", () => {
  const a = new Array<number>(VECTOR_LENGTH).fill(0);
  const b = new Array<number>(VECTOR_LENGTH).fill(0);
  // One shared component apart by 1, and one component that only A measured,
  // set as far apart as it can be.
  b[2] = 1;
  a[0] = 0;
  b[0] = 1;
  const maskA = FULL_MASK;
  const maskB = FULL_MASK & ~(1 << 0);

  const scaled = maskedDistance(a, maskA, b, maskB);
  expect(scaled!.sharedCount, "thirteen shared").toBe(13);
  // sum over shared = 1 (component 2 alone), so d = sqrt(14 / 13).
  expect(scaled!.distance, "sqrt((14 / k) * 1)").toBeCloseTo(
    Math.sqrt(VECTOR_LENGTH / 13),
    12,
  );

  // The same pair with component 0 present on both sides and identical: the
  // shared sum is unchanged, k is 14, and the scaling is 1.
  const bothPresent = b.slice();
  bothPresent[0] = 0;
  const complete = maskedDistance(a, FULL_MASK, bothPresent, FULL_MASK);
  expect(complete!.sharedCount, "fourteen shared").toBe(VECTOR_LENGTH);
  expect(complete!.distance, "sqrt((14 / 14) * 1)").toBeCloseTo(1, 12);
  // Sharing the absence made the pair no closer: the scaled distance with the
  // component absent is the larger of the two, never the smaller.
  expect(scaled!.distance).toBeGreaterThan(complete!.distance);
});

test("metrics: a pair with fewer than ten shared components is not compared", () => {
  const a = new Array<number>(VECTOR_LENGTH).fill(0.5);
  const b = new Array<number>(VECTOR_LENGTH).fill(0.5);
  // Ten shared is the floor and is compared.
  const tenShared = (1 << 10) - 1;
  expect(presentCount(tenShared), "ten bits").toBe(METRICS_MIN_PRESENT);
  expect(maskedDistance(a, tenShared, b, FULL_MASK), "ten is enough").not.toBeNull();
  // Nine is not.
  const nineShared = (1 << 9) - 1;
  expect(presentCount(nineShared), "nine bits").toBe(METRICS_MIN_PRESENT - 1);
  expect(maskedDistance(a, nineShared, b, FULL_MASK), "nine is not").toBeNull();
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
  expect(vector[12], "component 12 is the normalized density").toBeCloseTo(expected, 9);
});
