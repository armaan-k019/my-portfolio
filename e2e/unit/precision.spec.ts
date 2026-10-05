// Rounding precision. SPEC.md section 8, rule 7.
//
// The defect these are written against: the brief on 1111 Brickell Bay Drive
// printed "2.660512686 m", "0.777705908", "2.746897221" and "1.8284 m". The
// nine decimal values are Miami's 3DEP terrain sections arriving through
// `summarise`, which took the min and max off the unrounded array; the four
// decimal one is `roundLeaf` applying the same rule to a metre that it applied
// to a degree and a percent.
//
// So the test that matters is not that the rounding function rounds. It is that
// no number with more precision than its field allows can reach the brief's
// input or the sheet, from any of the three fixture sites.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  FIELD_PRECISION,
  GEOMETRY_PATHS,
  precisionFor,
  roundEnvelope,
  roundLayerData,
  roundTo,
  unlistedNumericPaths,
} from "../../src/lib/datum/precision";
import {
  buildValueIndex,
  citableFieldPaths,
  serializeInput,
  validateCitations,
} from "../../src/lib/datum/brief/prompt";
import { buildSheet } from "../../src/lib/datum/sheet/sheet";
import type { SheetContext } from "../../src/lib/datum/sheet/sheet";
import {
  LAYER_NAMES,
  type LayerEnvelope,
  type LayerName,
  type TopoData,
} from "../../src/lib/datum/types";

const LAYERS_DIR = path.join(process.cwd(), "e2e", "fixtures", "layers");

const SITES: Array<{ slug: string; lat: number; lng: number }> = [
  { slug: "atlanta", lat: 33.7751258, lng: -84.391975 },
  { slug: "miami", lat: 25.8011588, lng: -80.1890627 },
  { slug: "wakeeney", lat: 39.019769, lng: -99.883731 },
];

type Layers = Partial<Record<LayerName, LayerEnvelope<unknown>>>;

/** The fixtures exactly as the sources answered, before any rounding. */
function loadRaw(slug: string): Layers {
  const layers: Layers = {};
  for (const layer of LAYER_NAMES) {
    const file = path.join(
      LAYERS_DIR,
      slug,
      layer === "flood" ? "flood.constructed.json" : `${layer}.json`,
    );
    const raw = JSON.parse(readFileSync(file, "utf8")) as
      | LayerEnvelope<unknown>
      | { envelope: LayerEnvelope<unknown> };
    layers[layer] = "envelope" in raw ? raw.envelope : raw;
  }
  return layers;
}

/** The same fixtures as the layer routes now hand them on (layers.ts). */
function loadRounded(slug: string): Layers {
  const out: Layers = {};
  for (const [layer, envelope] of Object.entries(loadRaw(slug))) {
    out[layer as LayerName] = roundEnvelope(envelope);
  }
  return out;
}

/** How many decimal places a number is actually written with. */
function decimalsOf(value: number): number {
  const written = String(value);
  if (written.includes("e") || written.includes("E")) return Number.POSITIVE_INFINITY;
  const point = written.indexOf(".");
  return point < 0 ? 0 : written.length - point - 1;
}

function sheetContext(layers: Layers, lat: number, lng: number): SheetContext {
  return {
    site: { lat, lng, locality: null, tractGeoid: null },
    generatedAt: "2026-09-25T00:00:00.000Z",
    layers,
    brief: null,
    loading: [],
  };
}

// ─── The table covers the data ───────────────────────────────────────────────

test("the table covers every numeric field the nine sources return", () => {
  for (const { slug } of SITES) {
    const layers = loadRaw(slug);
    for (const layer of LAYER_NAMES) {
      const data = layers[layer]?.data;
      if (!data) continue;
      // Anything here is a numeric field with no precision and no declaration
      // that it is geometry, which is how a nine decimal value reaches a brief.
      expect(
        unlistedNumericPaths(layer, data),
        `${slug} ${layer}: these numeric paths have no precision in FIELD_PRECISION and are not declared geometry`,
      ).toEqual([]);
    }
  }
});

test("every declared geometry path is a path the serializer never sends", () => {
  // The two lists have to agree, or a path declared geometry here would still
  // reach the model unrounded through brief/prompt.ts.
  for (const [layer, paths] of Object.entries(GEOMETRY_PATHS)) {
    for (const geometryPath of paths) {
      const segments = `${layer}.${geometryPath}`.split(/[.[]/);
      expect(
        segments.some((segment) =>
          ["ring", "rings", "line", "lines", "bands", "geometry", "samples", "values", "margins"].includes(
            segment,
          ),
        ),
        `${layer}.${geometryPath} is declared geometry but the serializer would still send it`,
      ).toBe(true);
    }
  }
});

// ─── The rounding itself ─────────────────────────────────────────────────────

test("roundTo agrees with toFixed, which is how the sheet prints", () => {
  // This is the whole reason roundTo is built on toFixed. The two forms
  // disagree at a trailing .5, and the sheet formats with toFixed, so a
  // multiply and divide here would print a different number than it stored.
  for (const [value, decimals] of [
    [2.660512686, 1],
    [0.777705908, 1],
    [2.746897221, 1],
    [1.8284, 1],
    [-84.391975, 5],
    [79.66248616336355, 1],
    [0.0875, 3],
    [1398.9, 0],
  ] as Array<[number, number]>) {
    expect(String(roundTo(value, decimals))).toBe(String(Number(value.toFixed(decimals))));
  }
  // A value that rounds down through zero must not be stored as -0.
  expect(Object.is(roundTo(-0.04, 1), 0)).toBe(true);
});

test("rounding is idempotent, so a stored row re read does not drift", () => {
  for (const { slug } of SITES) {
    const once = loadRounded(slug);
    for (const layer of LAYER_NAMES) {
      const data = once[layer]?.data;
      if (!data) continue;
      expect(roundLayerData(layer, data), `${slug} ${layer}`).toEqual(data);
    }
  }
});

test("an unavailable envelope has no data to round and is passed through", () => {
  const envelope = {
    layer: "flood" as LayerName,
    status: "unavailable" as const,
    data: null,
    source: { name: "FEMA", url: "", fetchedAt: "", cached: false, licence: "" },
    fieldPaths: [],
  };
  expect(roundEnvelope(envelope)).toBe(envelope);
});

// ─── Nothing over precision reaches the brief ────────────────────────────────

/**
 * The precision a serialized key is allowed. The serializer collapses a long
 * array to a count, a min and a max, so `topo.sections.ew[].min` is the
 * extreme of `sections.ew[]` and takes that field's precision; a short array
 * arrives as a list under its own key.
 */
function allowedFor(serializedKey: string, suffix: string): number | null {
  const dot = serializedKey.indexOf(".");
  if (dot < 0) return null;
  const layer = serializedKey.slice(0, dot) as LayerName;
  if (!(LAYER_NAMES as string[]).includes(layer)) return null;
  const field = serializedKey.slice(dot + 1);
  return precisionFor(layer, `${field}${suffix}`) ?? precisionFor(layer, field);
}

test("no number in the brief's input carries more precision than its field allows", () => {
  for (const { slug, lat, lng } of SITES) {
    const input = serializeInput({ lat, lng }, loadRounded(slug));

    // The site point is sent at the five decimals the title block prints.
    expect(decimalsOf(input.site.latitude), `${slug} latitude`).toBeLessThanOrEqual(5);
    expect(decimalsOf(input.site.longitude), `${slug} longitude`).toBeLessThanOrEqual(5);

    for (const [layer, entry] of Object.entries(input.layers)) {
      if (entry.status === "unavailable") continue;
      for (const [key, value] of Object.entries(entry.fields)) {
        walkField(value, "", (suffix, found) => {
          // A collapsed array's element count is a count, not a measurement.
          if (suffix === ".count") {
            expect(Number.isInteger(found), `${slug} ${key}${suffix}`).toBe(true);
            return;
          }
          const allowed = allowedFor(key, suffix.replace(/\.(min|max)$/, ""));
          expect(allowed, `${slug} ${layer} ${key}${suffix} has no precision`).not.toBeNull();
          expect(
            decimalsOf(found),
            `${slug} ${key}${suffix} = ${found} carries ${decimalsOf(found)} decimals, its field allows ${allowed}`,
          ).toBeLessThanOrEqual(allowed as number);
        });
      }
    }
  }
});

function walkField(
  value: unknown,
  suffix: string,
  visit: (suffix: string, found: number) => void,
): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) visit(suffix, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkField(item, suffix, visit);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
      walkField(child, `${suffix}.${name}`, visit);
    }
  }
}

test("the Miami terrain sections reach the model at 0.1 m, not at nine decimals", () => {
  // The reported values came from here: 21 samples per section is past the
  // serializer's 16 value limit, so each section collapsed to a min and a max
  // taken off the raw 3DEP array.
  const raw = loadRaw("miami").topo?.data as TopoData;
  const rawEw = raw.sections.ew.filter((v): v is number => v !== null);
  expect(Math.max(...rawEw.map(decimalsOf))).toBeGreaterThan(5);

  const input = serializeInput(
    { lat: 25.8011588, lng: -80.1890627 },
    loadRounded("miami"),
  );
  const fields = (input.layers.topo as { fields: Record<string, unknown> }).fields;
  for (const key of ["topo.sections.ew[]", "topo.sections.ns[]"]) {
    const collapsed = fields[key] as { count: number; min: number; max: number };
    expect(collapsed.count, key).toBe(21);
    expect(decimalsOf(collapsed.min), `${key} min = ${collapsed.min}`).toBeLessThanOrEqual(1);
    expect(decimalsOf(collapsed.max), `${key} max = ${collapsed.max}`).toBeLessThanOrEqual(1);
  }
  // And the site elevation, which is where "1.8284 m" came from.
  expect(decimalsOf(fields["topo.siteElevationM"] as number)).toBeLessThanOrEqual(1);
});

// ─── Nothing over precision reaches the sheet ────────────────────────────────

/** Every number written into a <text> or <tspan> on the sheet. */
function numbersPrintedOn(svg: string): Array<{ text: string; value: number }> {
  const out: Array<{ text: string; value: number }> = [];
  for (const node of svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<]*)</g)) {
    for (const token of node[1].matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?/g)) {
      const value = Number(token[0].split(",").join(""));
      if (Number.isFinite(value)) out.push({ text: node[1], value });
    }
  }
  return out;
}

test("no number printed on the sheet carries more than the site point's precision", () => {
  // Five decimals is the finest thing the sheet prints: the site point in the
  // title block. Anything finer is a float that reached the paper.
  for (const { slug, lat, lng } of SITES) {
    const svg = buildSheet(sheetContext(loadRounded(slug), lat, lng));
    for (const printed of numbersPrintedOn(svg)) {
      expect(
        decimalsOf(printed.value),
        `${slug}: "${printed.text}" prints ${printed.value}`,
      ).toBeLessThanOrEqual(5);
    }
  }
});

test("the topography panel prints the values the data now carries", () => {
  const svg = buildSheet(
    sheetContext(loadRounded("miami"), 25.8011588, -80.1890627),
  );
  const topo = loadRounded("miami").topo?.data as TopoData;
  expect(decimalsOf(topo.siteElevationM as number)).toBeLessThanOrEqual(1);
  expect(svg).toContain(`Site elevation ${(topo.siteElevationM as number).toFixed(1)} m`);
  expect(svg).toContain(`Mean slope ${(topo.meanSlopePct as number).toFixed(1)} percent`);
});

/** Every <text> and <tspan> body on the sheet, in document order. */
function textsOn(svg: string): string[] {
  return Array.from(svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<]*)</g), (node) => node[1]);
}

test("rounding leaves every value Atlanta's panels print unchanged", () => {
  // The text on the sheet is the sheet's content. Atlanta prints all 294 of
  // its text nodes exactly as it printed them before the table existed.
  //
  // Drawn geometry is compared separately below, because a contour, a sun path
  // arc and a terrain profile are plotted from the values and do move by the
  // rounding, at a scale far under one sheet unit.
  const { slug, lat, lng } = SITES[0];
  const before = textsOn(buildSheet(sheetContext(loadRaw(slug), lat, lng)));
  const after = textsOn(buildSheet(sheetContext(loadRounded(slug), lat, lng)));
  expect(after.length).toBe(294);
  expect(after).toEqual(before);
});

test("the two derived scalars that do move are named, and nothing else moves", () => {
  // Miami and WaKeeney each move a vertical exaggeration, and WaKeeney moves
  // two climate axis ticks. All three are computed from the data rather than
  // measured: the exaggeration is the ratio of the drawn spans, and an axis
  // tick is a label on the temperature extent. Neither is a citable field, and
  // both now describe the data the sheet actually draws.
  const moved: string[] = [];
  for (const { slug, lat, lng } of SITES) {
    const before = textsOn(buildSheet(sheetContext(loadRaw(slug), lat, lng)));
    const after = textsOn(buildSheet(sheetContext(loadRounded(slug), lat, lng)));
    expect(after.length, slug).toBe(before.length);
    for (let index = 0; index < before.length; index += 1) {
      if (before[index] !== after[index]) {
        moved.push(`${slug}: "${before[index]}" -> "${after[index]}"`);
      }
    }
  }
  expect(moved).toEqual([
    'miami: "Vertical exaggeration 20.8 to 1" -> "Vertical exaggeration 21.1 to 1"',
    'wakeeney: "Vertical exaggeration 8.5 to 1" -> "Vertical exaggeration 8.6 to 1"',
    'wakeeney: "-10C" -> "-9C"',
    'wakeeney: "12C" -> "13C"',
  ]);
});

// ─── The validator now agrees with correct rounding ──────────────────────────

test("a brief quoting the rounded value passes the value aware check", () => {
  // This is the half of the defect that taught the model not to round. The
  // check compares what the brief writes against what the model was given, so
  // when the model is given 1.8284 and writes the 1.8 an architect would write,
  // the sentence fails. Given 1.8, writing 1.8 is both correct and what passes.
  const layers = loadRounded("miami");
  const input = serializeInput({ lat: 25.8011588, lng: -80.1890627 }, layers);
  const values = buildValueIndex(input);
  const paths = citableFieldPaths(layers);
  const elevation = (layers.topo?.data as TopoData).siteElevationM as number;

  const brief =
    `Ground\n` +
    `The site sits at ${elevation} m [topo.siteElevationM].\n` +
    `That ${elevation} m is the entry level the ground floor has to meet.`;

  const check = validateCitations(brief, paths, values);
  expect(check.invalidCitations).toEqual([]);
  expect(check.validCitations).toContain("topo.siteElevationM");
  // The second sentence carries the number again with no citation of its own,
  // and passes because it restates a value cited earlier.
  expect(check.uncitedNumericSentences).toBe(0);
  expect(check.valueMatchedSentences).toBe(1);
});

test("a number the data does not carry still fails", () => {
  // The rounding must not have made the check permissive: an invented value is
  // as uncitable as it ever was.
  const layers = loadRounded("miami");
  const input = serializeInput({ lat: 25.8011588, lng: -80.1890627 }, layers);
  const values = buildValueIndex(input);
  const paths = citableFieldPaths(layers);

  const brief =
    `Ground\n` +
    `The site sits at 1.9 m [topo.siteElevationM].\n` +
    `Bedrock is 14.7 m below grade.`;

  const check = validateCitations(brief, paths, values);
  expect(check.uncitedNumericSentences).toBe(1);
});

// ─── The table is a decision, not an accident ────────────────────────────────

test("the units the brief named round to the precision the brief asked for", () => {
  // Elevations and section values to 0.1 m, slope to 0.1 percent, degrees to
  // 0.1, soil composition percentages to whole numbers.
  expect(FIELD_PRECISION.topo.siteElevationM).toBe(1);
  expect(FIELD_PRECISION.topo.reliefM).toBe(1);
  expect(FIELD_PRECISION.topo["sections.ew[]"]).toBe(1);
  expect(FIELD_PRECISION.topo["sections.ns[]"]).toBe(1);
  expect(FIELD_PRECISION.topo["grid.values[]"]).toBe(1);
  expect(FIELD_PRECISION.topo.meanSlopePct).toBe(1);
  expect(FIELD_PRECISION.topo.aspectDeg).toBe(1);
  expect(FIELD_PRECISION.sun["june.noonAltitudeDeg"]).toBe(1);
  expect(FIELD_PRECISION.soil["components[].percent"]).toBe(0);
  expect(FIELD_PRECISION.climate["degreeDays.hdd"]).toBe(0);
});

test("an ACS margin of error takes the precision of the estimate it qualifies", () => {
  expect(precisionFor("census", "margins.population")).toBe(0);
  expect(precisionFor("census", "margins.medianAge")).toBe(1);
  expect(precisionFor("census", "margins.avgHouseholdSize")).toBe(2);
  // A margin for a field the table does not know is left alone rather than
  // guessed at, and the coverage test above is what catches it.
  expect(precisionFor("census", "margins.somethingNew")).toBeNull();
});
