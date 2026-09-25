// Unit checks for the brief prompt, serializer, and citation validator.
// PHASE-2-sheet.md step 2.3. No browser, no network, no page fixture.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  FORBIDDEN_KEYS,
  SYSTEM_PROMPT,
  briefFailedChecks,
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
} from "../../src/lib/datum/brief/store";
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
    briefFailedChecks({ invalidCitations: ["a", "b"], validCitations: [], uncitedNumericSentences: 0 }),
  ).toBe(false);
  expect(
    briefFailedChecks({ invalidCitations: ["a", "b", "c"], validCitations: [], uncitedNumericSentences: 0 }),
  ).toBe(true);
  expect(
    briefFailedChecks({ invalidCitations: [], validCitations: [], uncitedNumericSentences: 1 }),
  ).toBe(true);
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
