// Unit checks for the brief prompt, serializer, and citation validator.
// PHASE-2-sheet.md step 2.3. No browser, no network, no page fixture.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  FORBIDDEN_KEYS,
  SYSTEM_PROMPT,
  briefFailedChecks,
  buildValueIndex,
  citableFieldPaths,
  flattenLayer,
  inputHash,
  serializeInput,
  userMessage,
  validateCitations,
} from "../../src/lib/datum/brief/prompt";
import {
  mergeLayers,
  parseClientLayers,
  selectLayers,
} from "../../src/lib/datum/brief/store";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/api/datum/brief/route";
import { RATE_LIMIT_PER_DAY } from "../../src/lib/datum/constants";
import {
  checkRateLimit,
  clientIpFrom,
  getSiteById,
  hashIp,
  issueLocalSiteId,
  memoryStatus,
  setClientForTests,
} from "../../src/lib/datum/memory";
import { LAYER_NAMES, type LayerEnvelope, type LayerName } from "../../src/lib/datum/types";

const LAYERS_DIR = path.join(process.cwd(), "e2e", "fixtures", "layers");

function loadLayers(slug: string): Partial<Record<LayerName, LayerEnvelope<unknown>>> {
  const layers: Partial<Record<LayerName, LayerEnvelope<unknown>>> = {};
  for (const layer of LAYER_NAMES) {
    const file =
      layer === "flood"
        ? path.join(LAYERS_DIR, slug, "flood.constructed.json")
        : path.join(LAYERS_DIR, slug, `${layer}.json`);
    const raw = JSON.parse(readFileSync(file, "utf8")) as
      | LayerEnvelope<unknown>
      | { envelope: LayerEnvelope<unknown> };
    layers[layer] = "envelope" in raw ? raw.envelope : raw;
  }
  return layers;
}

const ATLANTA = { lat: 33.7751258, lng: -84.391975 };

// ─── validateCitations ───────────────────────────────────────────────────────

test("a cited numeric sentence passes both checks", () => {
  const check = validateCitations(
    "Site elevation is 281.7 m [topo.siteElevationM].",
    ["topo.siteElevationM"],
  );
  expect(check.invalidCitations).toEqual([]);
  expect(check.uncitedNumericSentences).toBe(0);
  expect(check.validCitations).toEqual(["topo.siteElevationM"]);
});

test("a sentence with a digit and no citation is counted", () => {
  const check = validateCitations(
    "Site elevation is 281.7 m. The slope falls north [topo.aspectDeg].",
    ["topo.aspectDeg"],
  );
  expect(check.uncitedNumericSentences).toBe(1);
  expect(check.invalidCitations).toEqual([]);
});

test("a citation that is not a field path is invalid", () => {
  const check = validateCitations(
    "The tract holds 7,396 people [census.populationCount].",
    ["census.population"],
  );
  expect(check.invalidCitations).toEqual(["census.populationCount"]);
  expect(check.validCitations).toEqual([]);
});

test("the decimal point does not split a sentence", () => {
  // Without the guard, "281.7" would read as two sentences and the second
  // would count as uncited.
  const check = validateCitations(
    "Relief across the grid is 29.9 m and the mean slope is 4.2 percent [topo.reliefM] [topo.meanSlopePct].",
    ["topo.reliefM", "topo.meanSlopePct"],
  );
  expect(check.uncitedNumericSentences).toBe(0);
  expect(check.validCitations).toHaveLength(2);
});

test("a section heading with no citation is never counted", () => {
  const check = validateCitations(
    ["Ground", "The site is flat [topo.meanSlopePct].", "What is missing", "Flood."].join("\n"),
    ["topo.meanSlopePct"],
  );
  expect(check.uncitedNumericSentences).toBe(0);
});

test("one bracket may carry several comma separated paths", () => {
  const check = validateCitations(
    "Degree days are 1553 and 1379 [climate.degreeDays.hdd, climate.degreeDays.cdd].",
    ["climate.degreeDays.hdd", "climate.degreeDays.cdd"],
  );
  expect(check.invalidCitations).toEqual([]);
  expect(check.validCitations).toHaveLength(2);
});

test("briefFailedChecks follows the SPEC section 12 thresholds", () => {
  expect(
    briefFailedChecks({ invalidCitations: ["a", "b"], uncitedNumericSentences: 0 }),
  ).toBe(false);
  expect(
    briefFailedChecks({ invalidCitations: ["a", "b", "c"], uncitedNumericSentences: 0 }),
  ).toBe(true);
  expect(
    briefFailedChecks({ invalidCitations: [], uncitedNumericSentences: 1 }),
  ).toBe(true);
});

// ─── Value aware numeric check (SPEC section 12, amended 2026-09-25) ──────────

/**
 * The serialized shape the model is sent: one entry per layer, every leaf keyed
 * by the path the brief must cite. These are the values the two sentences in the
 * Phase 2 tripwire restated (PROGRESS.md).
 */
const VALUE_INPUT = {
  site: { latitude: 33.7751, longitude: -84.392 },
  layers: {
    topo: { status: "ok", fields: { "topo.meanSlopePct": 6.2, "topo.reliefM": 29.9 } },
    osm: { status: "ok", fields: { "osm.stats.buildingCount": 20 } },
    census: { status: "ok", fields: { "census.population": 7396 } },
  },
};

const VALUE_PATHS = [
  "topo.meanSlopePct",
  "topo.reliefM",
  "osm.stats.buildingCount",
  "census.population",
];

function checkValues(text: string) {
  return validateCitations(text, VALUE_PATHS, buildValueIndex(VALUE_INPUT));
}

test("a restated percentage passes when its path was cited earlier", () => {
  // The Atlanta tripwire sentence, verbatim from the run of record.
  const check = checkValues(
    [
      "Ground",
      "Mean slope across the frame is 6.2 percent [topo.meanSlopePct].",
      "Plan entry level carefully: a 6.2% slope can force split-level access or significant cut and fill.",
    ].join("\n"),
  );
  expect(check.uncitedNumericSentences).toBe(0);
  expect(check.valueMatchedSentences).toBe(1);
});

test("a restated count passes when its path was cited earlier", () => {
  // The WaKeeney tripwire sentence, verbatim from the run of record.
  const check = checkValues(
    [
      "The frame holds 20 mapped structures [osm.stats.buildingCount].",
      "Building heights are missing from all 20 mapped structures, so overshadowing and context massing studies cannot be confirmed from this data.",
    ].join("\n"),
  );
  expect(check.uncitedNumericSentences).toBe(0);
  expect(check.valueMatchedSentences).toBe(1);
});

test("the same restatements fail with no earlier citation", () => {
  const slope = checkValues(
    "Plan entry level carefully: a 6.2% slope can force split-level access or significant cut and fill.",
  );
  expect(slope.uncitedNumericSentences).toBe(1);
  expect(slope.valueMatchedSentences).toBe(0);

  const heights = checkValues(
    "Building heights are missing from all 20 mapped structures, so overshadowing cannot be confirmed.",
  );
  expect(heights.uncitedNumericSentences).toBe(1);
});

test("a number that is not in the dataset fails the sentence", () => {
  const check = checkValues(
    [
      "Mean slope across the frame is 6.2 percent [topo.meanSlopePct].",
      "The ground rises 41 m to the ridge behind the site.",
    ].join("\n"),
  );
  expect(check.uncitedNumericSentences).toBe(1);
  expect(check.valueMatchedSentences).toBe(0);
});

test("a value whose path is cited only later fails the sentence", () => {
  const check = checkValues(
    [
      "Relief across the grid is 29.9 m, which sets the section.",
      "Relief across the grid is 29.9 m [topo.reliefM].",
    ].join("\n"),
  );
  expect(check.uncitedNumericSentences).toBe(1);
  expect(check.valueMatchedSentences).toBe(0);
});

test("thousands separators and percent signs are accepted forms", () => {
  const check = checkValues(
    [
      "The tract holds 7396 people [census.population].",
      "Mean slope is 6.2 percent [topo.meanSlopePct].",
      "Housing 7,396 residents at a 6.2% grade shapes the ground floor program.",
    ].join("\n"),
  );
  expect(check.uncitedNumericSentences).toBe(0);
  expect(check.valueMatchedSentences).toBe(1);
});

test("a raw float never matches the four decimal value the model was sent", () => {
  const values = buildValueIndex({
    layers: {
      sun: {
        status: "ok",
        fields: flattenLayer("sun", { june: { noonAltitudeDeg: 79.66248616336355 } }),
      },
    },
  });
  const paths = ["sun.june.noonAltitudeDeg"];
  const cited = "June noon altitude is 79.6625 degrees [sun.june.noonAltitudeDeg].";

  const rounded = validateCitations(
    [cited, "A 79.6625 degree noon sun sets the overhang depth."].join("\n"),
    paths,
    values,
  );
  expect(rounded.uncitedNumericSentences).toBe(0);
  expect(rounded.valueMatchedSentences).toBe(1);

  const raw = validateCitations(
    [cited, "A 79.66248616336355 degree noon sun sets the overhang depth."].join("\n"),
    paths,
    values,
  );
  expect(raw.uncitedNumericSentences).toBe(1);
});

test("a value the serializer sent unrounded matches the string it sent", () => {
  // flattenLayer rounds the leaves it flattens and nothing else: a collapsed
  // array reports its min and max at full precision, and the site point is sent
  // as it was geocoded. Those strings are what the model read.
  const values = buildValueIndex({
    site: { latitude: 25.8011588, longitude: -80.1890627 },
    layers: {
      topo: {
        status: "ok",
        fields: flattenLayer("topo", {
          sections: { ew: Array.from({ length: 20 }, (_, index) => index + 0.060939878) },
        }),
      },
    },
  });
  expect(values.has("0.060939878")).toBe(true);
  expect(values.get("25.8011588")).toEqual(new Set(["site.latitude"]));

  const check = validateCitations(
    [
      "The east-west section starts at 0.060939878 m [topo.sections.ew[]].",
      "That 0.060939878 m low point sets the drainage fall.",
    ].join("\n"),
    ["topo.sections.ew[]"],
    values,
  );
  expect(check.uncitedNumericSentences).toBe(0);
  expect(check.valueMatchedSentences).toBe(1);
});

test("every decision is logged only when DATUM_DEBUG_CITATIONS is set", () => {
  const text = [
    "Mean slope across the frame is 6.2 percent [topo.meanSlopePct].",
    "A 6.2% slope can force split-level access.",
  ].join("\n");
  const lines: string[] = [];
  const original = console.debug;
  console.debug = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    delete process.env.DATUM_DEBUG_CITATIONS;
    checkValues(text);
    expect(lines, "a production run logs nothing").toEqual([]);

    process.env.DATUM_DEBUG_CITATIONS = "1";
    checkValues(text);
    expect(lines.length).toBeGreaterThan(0);
    expect(
      lines.some(
        (line) =>
          line.includes("token=6.2%") &&
          line.includes("matched=topo.meanSlopePct") &&
          line.includes("earlierCitation=topo.meanSlopePct"),
      ),
      `a decision line names the token, the path, and the earlier citation: ${lines.join(" | ")}`,
    ).toBe(true);
  } finally {
    console.debug = original;
    delete process.env.DATUM_DEBUG_CITATIONS;
  }
});

// ─── Serializer ──────────────────────────────────────────────────────────────

test("the serializer never carries a locality, address, display name, or city", () => {
  const input = serializeInput(ATLANTA, loadLayers("atlanta"));
  const json = JSON.stringify(input);
  for (const key of FORBIDDEN_KEYS) {
    expect(json, `the input must not carry a "${key}" key`).not.toContain(`"${key}"`);
  }
  // The point is there, because the sun path depends on it.
  expect(input.site.latitude).toBeCloseTo(ATLANTA.lat, 6);
  expect(input.site.longitude).toBeCloseTo(ATLANTA.lng, 6);
});

test("the serializer keys every leaf by the path the brief must cite", () => {
  const input = serializeInput(ATLANTA, loadLayers("atlanta"));
  const topo = input.layers.topo;
  expect(topo.status).toBe("ok");
  if (topo.status === "unavailable") throw new Error("topo should be available");
  expect(Object.keys(topo.fields)).toContain("topo.siteElevationM");
  expect(topo.fields["topo.siteElevationM"]).toBeGreaterThan(270);

  const seismic = input.layers.seismic;
  if (seismic.status === "unavailable") throw new Error("seismic should be available");
  expect(seismic.fields["seismic.sdc"]).toBe("B");
});

test("an unavailable layer carries only a status and a reason", () => {
  const layers = loadLayers("wakeeney");
  const input = serializeInput(ATLANTA, layers);
  const flood = input.layers.flood;
  expect(flood.status).toBe("unavailable");
  if (flood.status !== "unavailable") throw new Error("flood should be unavailable");
  expect(flood.reason).toContain("FEMA has not published");
  expect(Object.keys(flood)).toEqual(["status", "reason"]);
});

test("the serializer drops drawing geometry and stays a sane size", () => {
  const input = serializeInput(ATLANTA, loadLayers("atlanta"));
  const json = JSON.stringify(input);
  // The osm layer alone is 1.4 MB of coordinates on disk. None of it is citable
  // and none of it reaches the model.
  expect(json.length).toBeLessThan(80_000);
  expect(json).not.toContain('"osm.buildings[].ring');
  expect(json).not.toContain('"walkshed.bands');

  const osm = input.layers.osm;
  if (osm.status === "unavailable") throw new Error("osm should be available");
  expect(osm.fields["osm.stats.buildingCount"]).toBe(140);
  expect(osm.fields["osm.stats.withHeight"]).toBe(14);
});

test("a long array collapses to a count and a range, never to a single value", () => {
  const fields = flattenLayer("climate", {
    monthly: Array.from({ length: 12 }, (_, index) => ({ meanC: index })),
    hours: Array.from({ length: 40 }, (_, index) => index),
  });
  expect(fields["climate.monthly[].meanC"]).toHaveLength(12);
  expect(fields["climate.hours[]"]).toEqual({ count: 40, min: 0, max: 39 });
});

test("citable field paths cover what the serializer sent", () => {
  const layers = loadLayers("atlanta");
  const paths = new Set(citableFieldPaths(layers));
  const input = serializeInput(ATLANTA, layers);
  for (const entry of Object.values(input.layers)) {
    if (entry.status === "unavailable") continue;
    for (const key of Object.keys(entry.fields)) {
      expect(paths.has(key), `${key} should be citable`).toBe(true);
    }
  }
  // An unavailable layer contributes nothing to cite. Atlanta's flood envelope
  // is ok, so WaKeeney, where FEMA has no coverage, is the case to check.
  const wakeeney = new Set(citableFieldPaths(loadLayers("wakeeney")));
  expect([...wakeeney].some((path) => path.startsWith("flood."))).toBe(false);
  expect([...wakeeney].some((path) => path.startsWith("topo."))).toBe(true);
});

test("the input hash is stable for the same data and changes with it", () => {
  const first = serializeInput(ATLANTA, loadLayers("atlanta"));
  const second = serializeInput(ATLANTA, loadLayers("atlanta"));
  expect(inputHash(first)).toBe(inputHash(second));
  expect(inputHash(serializeInput(ATLANTA, loadLayers("miami")))).not.toBe(
    inputHash(first),
  );
});

test("the user message carries the input JSON and nothing else", () => {
  const input = serializeInput(ATLANTA, loadLayers("wakeeney"));
  const message = userMessage(input);
  expect(message.startsWith("Site data:")).toBe(true);
  expect(message).toContain('"latitude"');
});

// ─── System prompt contract ──────────────────────────────────────────────────

test("the system prompt states every SPEC section 12 rule", () => {
  for (const heading of [
    "Ground",
    "Climate and sun",
    "Context and access",
    "Risk",
    "What is missing",
  ]) {
    expect(SYSTEM_PROMPT).toContain(heading);
  }
  expect(SYSTEM_PROMPT).toContain("[layer.path.to.field]");
  expect(SYSTEM_PROMPT).toContain("350 words");
  expect(SYSTEM_PROMPT).toContain("No em dashes");
  // The character itself is written as an escape so this file carries none.
  expect(SYSTEM_PROMPT).not.toContain(String.fromCharCode(0x2014));
});

// ─── The offline fallback ────────────────────────────────────────────────────

test("client sent layers are accepted only when they look like envelopes", () => {
  const good = loadLayers("atlanta");
  const parsed = parseClientLayers({
    sun: good.sun,
    // Wrong layer name inside the envelope.
    topo: { ...good.topo, layer: "soil" },
    // Not an envelope at all.
    seismic: { sdc: "B" },
    // Not a layer name.
    zoning: good.soil,
  });
  expect(Object.keys(parsed)).toEqual(["sun"]);
  expect(parseClientLayers(null)).toEqual({});
  expect(parseClientLayers([1, 2])).toEqual({});
});

test("the stored copy wins over the client copy, and the client fills the rest", () => {
  const stored = loadLayers("atlanta");
  const fromClient = loadLayers("miami");
  const merged = mergeLayers({ topo: stored.topo }, fromClient);
  expect(merged.topo).toBe(stored.topo);
  expect(merged.seismic).toBe(fromClient.seismic);
  expect(Object.keys(merged)).toHaveLength(LAYER_NAMES.length);
});

test("an array path citation keeps its empty bracket pair", () => {
  // "[topo.sections.ew[]]" is one citation of "topo.sections.ew[]". A pattern
  // that stops at the first closing bracket reads it as "topo.sections.ew[",
  // which is not a field and would fail a correct brief.
  const check = validateCitations(
    "The section falls from 297.1 m to 275.2 m [topo.sections.ew[]].",
    ["topo.sections.ew[]"],
  );
  expect(check.invalidCitations).toEqual([]);
  expect(check.validCitations).toEqual(["topo.sections.ew[]"]);
  expect(check.uncitedNumericSentences).toBe(0);
});

test("leaf numbers are rounded before the model sees them", () => {
  const fields = flattenLayer("sun", {
    june: { noonAltitudeDeg: 79.66248616336355 },
    overhangRatioSouthGlazing: 0.18240724411125084,
  });
  expect(fields["sun.june.noonAltitudeDeg"]).toBe(79.6625);
  expect(fields["sun.overhangRatioSouthGlazing"]).toBe(0.1824);
});

test("the prompt tells the model to finish all five sections", () => {
  expect(SYSTEM_PROMPT).toContain("never more than 420");
  expect(SYSTEM_PROMPT).toContain("stops mid sentence is a failure");
});

// ─── OSM names never reach the model ─────────────────────────────────────────

/** A minimal but shape correct envelope, for the branches the fixtures miss. */
function envelopeOf(
  layer: LayerName,
  data: unknown,
  fieldPaths: string[],
): LayerEnvelope<unknown> {
  return {
    layer,
    status: "ok",
    data,
    source: {
      name: "synthetic",
      url: "",
      fetchedAt: "2026-09-24T18:00:00.000Z",
      cached: false,
      licence: "n/a",
    },
    fieldPaths,
  };
}

/**
 * A frame with few buildings and few stops. Under the sixteen value cap a
 * bucket is sent element by element rather than collapsed to a count, so this
 * is the envelope shape where an OpenStreetMap label would reach the model.
 */
const SPARSE_BUILDING_NAMES = [
  "Peachtree Center Station",
  "Flatiron Building",
  "Saint Luke's Episcopal Church",
];
const SPARSE_STOP_NAMES = ["Marietta St NW at Forsyth St NW", "Five Points"];

function sparseOsm() {
  return {
    buildings: SPARSE_BUILDING_NAMES.map((name, index) => ({
      id: index + 1,
      ring: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      heightM: index === 0 ? 42.5 : null,
      levels: 3,
      name,
    })),
    water: [],
    streets: [],
    transitStops: SPARSE_STOP_NAMES.map((name, index) => ({
      id: 100 + index,
      kind: "bus",
      x: index * 5,
      y: index * 5,
      name,
    })),
    stats: {
      buildingCount: 3,
      ringCount: 3,
      withHeight: 1,
      withLevels: 3,
      coverageRatio: 0.02,
    },
  };
}

/** Every string leaf in a serialized input, wherever it sits. */
function stringLeaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringLeaves(item, out);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      stringLeaves(child, out);
    }
  }
  return out;
}

test("an OSM building or stop name never reaches the model, even in a sparse frame", () => {
  const layers: Partial<Record<LayerName, LayerEnvelope<unknown>>> = {
    osm: envelopeOf(
      "osm",
      sparseOsm(),
      ["buildings[].name", "buildings[].heightM", "stats.buildingCount"],
    ),
  };
  const input = serializeInput(ATLANTA, layers);
  const osm = input.layers.osm;
  if (osm.status === "unavailable") throw new Error("osm should be available");

  // The branch is the one the cap leaves uncollapsed: three buildings, not 140.
  expect(osm.fields["osm.stats.buildingCount"]).toBe(3);
  expect(osm.fields["osm.buildings[].heightM"]).toEqual([42.5, null, null]);
  expect(Object.keys(osm.fields)).not.toContain("osm.buildings[].name");
  expect(Object.keys(osm.fields)).not.toContain("osm.transitStops[].name");

  // Values, not key names: no serialized string is one of these labels.
  const leaves = new Set(stringLeaves(input));
  for (const name of [...SPARSE_BUILDING_NAMES, ...SPARSE_STOP_NAMES]) {
    expect(leaves.has(name), `"${name}" must not be serialized`).toBe(false);
  }
});

test("no OSM name from the committed fixtures is serialized for any site", () => {
  for (const slug of ["atlanta", "miami", "wakeeney"]) {
    const layers = loadLayers(slug);
    const data = layers.osm?.data as
      | {
          buildings: Array<{ name: string | null }>;
          transitStops: Array<{ name: string | null }>;
        }
      | null;
    if (!data) continue;
    const names = [...data.buildings, ...data.transitStops]
      .map((feature) => feature.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);
    const leaves = new Set(stringLeaves(serializeInput(ATLANTA, layers)));
    for (const name of names) {
      expect(leaves.has(name), `${slug}: "${name}" must not be serialized`).toBe(false);
    }
  }
});

test("a soil series name and a tract name are still serialized", () => {
  // The skip is scoped to the OpenStreetMap layers. These are measurements the
  // brief is meant to cite, and dropping them would be the wrong cure.
  const input = serializeInput(ATLANTA, loadLayers("atlanta"));
  const soil = input.layers.soil;
  if (soil.status === "unavailable") throw new Error("soil should be available");
  expect(Object.keys(soil.fields)).toContain("soil.components[].name");
});

// ─── Which envelopes the brief is written from ───────────────────────────────

test("a client supplied fieldPaths list is never trusted", () => {
  // fieldPaths is what the citation check validates against. A caller that
  // could set it could declare any citation valid, and the check would mean
  // nothing, so it is recomputed from the data the envelope carries.
  const good = loadLayers("atlanta");
  const parsed = parseClientLayers({
    topo: { ...good.topo, fieldPaths: ["topo.anythingIWant", "invented.path"] },
  });
  const paths = parsed.topo?.fieldPaths ?? [];
  expect(paths).not.toContain("topo.anythingIWant");
  expect(paths).not.toContain("invented.path");
  expect(paths).toEqual(good.topo?.fieldPaths);

  // And the recomputed list is what citableFieldPaths then allows.
  const citable = citableFieldPaths(parsed);
  expect(citable).not.toContain("topo.topo.anythingIWant");
  expect(citable.some((path) => path.startsWith("topo."))).toBe(true);
});

test("an envelope with no data gets an empty fieldPaths list", () => {
  const parsed = parseClientLayers({
    flood: {
      layer: "flood",
      status: "unavailable",
      data: null,
      source: {
        name: "FEMA NFHL",
        url: "",
        fetchedAt: "2026-09-24T18:00:00.000Z",
        cached: false,
        licence: "",
      },
      fieldPaths: ["atPoint.zone"],
    },
  });
  expect(parsed.flood?.fieldPaths).toEqual([]);
});

test("the client's envelopes are ignored while memory has rows for the site", () => {
  const stored = loadLayers("atlanta");
  const fromClient = loadLayers("miami");

  // Memory online with rows: the server's own record is the whole answer.
  const online = selectLayers({ topo: stored.topo }, fromClient, false);
  expect(Object.keys(online.layers)).toEqual(["topo"]);
  expect(online.layers.topo).toBe(stored.topo);
  expect(online.usedClientLayers).toBe(false);

  // Memory offline: nothing was stored, so the client's copy is the only copy.
  const offline = selectLayers({}, fromClient, true);
  expect(Object.keys(offline.layers)).toHaveLength(LAYER_NAMES.length);
  expect(offline.layers.seismic).toBe(fromClient.seismic);
  expect(offline.usedClientLayers).toBe(true);

  // Memory online but nothing stored for this site yet: the same situation one
  // moment earlier, so the client's copy is admitted.
  const empty = selectLayers({}, fromClient, false);
  expect(Object.keys(empty.layers)).toHaveLength(LAYER_NAMES.length);
  expect(empty.usedClientLayers).toBe(true);

  // Offline with a partial stored set: stored still wins where it exists.
  const mixed = selectLayers({ topo: stored.topo }, fromClient, true);
  expect(mixed.layers.topo).toBe(stored.topo);
  expect(mixed.layers.seismic).toBe(fromClient.seismic);
});

test("a client envelope carrying data is dropped, one carrying only a reason is kept", () => {
  // The layer route stores a failed envelope only for no_coverage, so a layer
  // whose source was unreachable leaves no row. Without the client's copy the
  // serializer would tell the model that layer "was not requested", which is
  // false. An envelope with no data has no leaf values and no citable field
  // path, so admitting it can put no number on the sheet: all it carries is the
  // reason the panel is already showing.
  const stored = loadLayers("atlanta");
  const failed: LayerEnvelope<unknown> = {
    layer: "osm",
    status: "unavailable",
    data: null,
    source: {
      name: "Overpass",
      url: "http://127.0.0.1:9",
      fetchedAt: "2026-09-24T18:00:00.000Z",
      cached: false,
      licence: "ODbL 1.0",
    },
    unavailable: {
      code: "upstream_error",
      message: "OpenStreetMap data could not be loaded (upstream_error).",
      retryable: true,
    },
    fieldPaths: [],
  };

  const chosen = selectLayers(
    { topo: stored.topo, seismic: stored.seismic },
    { osm: failed, census: loadLayers("miami").census },
    false,
  );
  // The failed osm envelope is kept, so "What is missing" can name Overpass.
  expect(chosen.layers.osm).toBe(failed);
  // The census envelope from the client carries data, so it is dropped.
  expect(chosen.layers.census).toBeUndefined();
  expect(Object.keys(chosen.layers).sort()).toEqual(["osm", "seismic", "topo"]);

  // And nothing admitted this way is citable.
  const citable = citableFieldPaths(chosen.layers);
  expect(citable.some((path) => path.startsWith("osm."))).toBe(false);
  expect(citable.some((path) => path.startsWith("census."))).toBe(false);
});

// ─── The brief route's rate limit ────────────────────────────────────────────

test("a brief past the daily cap is a 429 before the stream opens", async () => {
  // The same non incrementing peek the layer route makes, and the same body the
  // site route answers with. No model token is spent and no upstream is called.
  setClientForTests(null);
  await getSiteById("11111111-1111-1111-1111-111111111111");
  expect(memoryStatus()).toBe("offline");

  const ip = "203.0.113.77";
  const ipHash = hashIp(clientIpFrom(ip));
  for (let i = 0; i < RATE_LIMIT_PER_DAY + 1; i++) {
    await checkRateLimit(ipHash);
  }

  const hadKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "unit-test-placeholder";
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const response = await POST(
      new NextRequest("https://datum.test/api/datum/brief", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({
          siteId: issueLocalSiteId("33.775,-84.392"),
          layers: {},
        }),
      }),
    );
    expect(response.status).toBe(429);
    const body = (await response.json()) as {
      error: { code: string; resetAt?: string };
    };
    expect(body.error.code).toBe("rate_limited");
    expect(typeof body.error.resetAt).toBe("string");
    expect(calls, "no upstream call").toBe(0);
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = hadKey;
  }
});
