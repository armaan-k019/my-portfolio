// Structural checks for the SVG builders. PHASE-2-sheet.md step 2.2.
//
// No DOM library: the browser DOMParser check happens in e2e/sheet.spec.ts.
// These tests read the envelopes captured in e2e/fixtures/layers and assert the
// group list, the group order, the unavailable states, and the element counts.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  GROUP_ORDER,
  SITE_PLAN_SUBGROUPS,
  WALK_SHED_SUBGROUPS,
} from "../../src/lib/datum/sheet/layout";
import {
  buildSheet,
  buildSheetGroups,
  sheetFileName,
} from "../../src/lib/datum/sheet/sheet";
import type {
  SheetBrief,
  SheetContext,
  SheetLayers,
} from "../../src/lib/datum/sheet/sheet";
import { LAYER_NAMES, type LayerEnvelope, type LayerName } from "../../src/lib/datum/types";

const LAYERS_DIR = path.join(process.cwd(), "e2e", "fixtures", "layers");

/**
 * The flood fixtures are constructed, not live: hazards.fema.gov has refused
 * connections from this machine since 2026-09-22 (PROGRESS.md, Phase 0 pending
 * live check). `flood.constructed.json` was produced by replaying the captured
 * FEMA request fixtures through the Phase 1 fetcher with a fake fetch, and
 * carries a header saying so. Everything else is a live capture from the Phase 1
 * routes on 2026-09-24.
 */
function loadLayers(slug: string): SheetLayers {
  const layers: SheetLayers = {};
  for (const layer of LAYER_NAMES) {
    const file =
      layer === "flood"
        ? path.join(LAYERS_DIR, slug, "flood.constructed.json")
        : path.join(LAYERS_DIR, slug, `${layer}.json`);
    const raw = JSON.parse(readFileSync(file, "utf8")) as
      | LayerEnvelope<unknown>
      | { constructed: true; envelope: LayerEnvelope<unknown> };
    layers[layer] = "envelope" in raw ? raw.envelope : raw;
  }
  return layers;
}

const BRIEF: SheetBrief = {
  text: [
    "Ground",
    "The site sits at 281.7 m and the surface falls about 1.2 percent towards the north east [topo.siteElevationM] [topo.meanSlopePct].",
    "Climate and sun",
    "Summer solstice noon altitude is 79.7 degrees, so a south overhang of 0.18 of the glazing height shades the glass at midday [sun.june.noonAltitudeDeg].",
    "Context and access",
    "One hundred and forty buildings are mapped within 400 m [osm.stats.buildingCount].",
    "Risk",
    "The point is outside the special flood hazard area [flood.atPoint.class].",
    "What is missing",
    "Nothing in this test brief is missing.",
  ].join("\n"),
  validCitations: [
    "topo.siteElevationM",
    "topo.meanSlopePct",
    "sun.june.noonAltitudeDeg",
    "osm.stats.buildingCount",
    "flood.atPoint.class",
  ],
  invalidCitations: [],
};

function makeCtx(slug: string, overrides?: Partial<SheetContext>): SheetContext {
  return {
    site: {
      lat: 33.7751258,
      lng: -84.391975,
      locality: "Atlanta, Georgia",
      tractGeoid: "13121001002",
    },
    generatedAt: "2026-09-24T18:00:00.000Z",
    layers: loadLayers(slug),
    brief: BRIEF,
    loading: [],
    ...overrides,
  };
}

/** Count non overlapping occurrences of a literal. */
function count(haystack: string, needle: string): number {
  let total = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    total += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return total;
}

/** The contents of one top level group, by id. */
function groupBody(svg: string, id: string): string {
  const open = svg.indexOf(`<g id="${id}"`);
  expect(open, `${id} should be present`).toBeGreaterThan(-1);
  // Walk the group nesting to find the matching close tag.
  let depth = 0;
  let cursor = open;
  while (cursor < svg.length) {
    const nextOpen = svg.indexOf("<g", cursor + 1);
    const nextClose = svg.indexOf("</g>", cursor + 1);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen;
      continue;
    }
    if (depth === 0) return svg.slice(open, nextClose + 4);
    depth -= 1;
    cursor = nextClose;
  }
  throw new Error(`unbalanced group ${id}`);
}

// ─── Structure ───────────────────────────────────────────────────────────────

test("buildSheet on the Atlanta fixtures is structurally sound", () => {
  const svg = buildSheet(makeCtx("atlanta"));

  // Every top level id and every nested id appears exactly once.
  for (const id of [...GROUP_ORDER, ...SITE_PLAN_SUBGROUPS, ...WALK_SHED_SUBGROUPS]) {
    expect(count(svg, `<g id="${id}"`), `${id} should appear exactly once`).toBe(1);
  }

  // Balanced groups.
  expect(count(svg, "<g")).toBe(count(svg, "</g>"));

  // Nothing raster, nothing external, nothing executable (SPEC section 11).
  expect(svg).not.toContain("<image");
  expect(svg).not.toContain("<foreignObject");
  expect(svg).not.toContain("<script");
  expect(svg).not.toContain("data:");

  // Root attributes and the two metadata elements.
  expect(svg).toContain('width="36in"');
  expect(svg).toContain('height="24in"');
  expect(svg).toContain('viewBox="0 0 2592 1728"');
  expect(svg).toContain("<title>Datum site analysis: Atlanta, Georgia</title>");
  expect(svg).toContain("<desc>Generated 2026-09-24T18:00:00.000Z.");
  expect(svg).toContain('<rect x="0" y="0" width="2592" height="1728" id="paper"');
});

test("top level groups appear in the SPEC section 11 order", () => {
  const svg = buildSheet(makeCtx("atlanta"));
  let previous = -1;
  for (const id of GROUP_ORDER) {
    const index = svg.indexOf(`<g id="${id}"`);
    expect(index, `${id} should follow the previous group`).toBeGreaterThan(previous);
    previous = index;
  }
  // The paper rectangle precedes every group.
  expect(svg.indexOf('id="paper"')).toBeLessThan(svg.indexOf(`<g id="${GROUP_ORDER[0]}"`));
});

test("buildSheetGroups returns exactly the top level ids", () => {
  const groups = buildSheetGroups(makeCtx("atlanta"));
  expect(Object.keys(groups).sort()).toEqual([...GROUP_ORDER].sort());
  for (const id of GROUP_ORDER) {
    expect(groups[id].startsWith(`<g id="${id}"`), `${id} group should open with its id`).toBe(true);
    expect(groups[id].endsWith("</g>"), `${id} group should close`).toBe(true);
  }
});

// ─── Unavailable states ──────────────────────────────────────────────────────

test("a FEMA no coverage flood layer stamps the flood summary unavailable", () => {
  const svg = buildSheet(makeCtx("wakeeney"));
  const body = groupBody(svg, "flood-summary");
  expect(body).toContain('data-status="unavailable"');
  expect(body).toContain("UNAVAILABLE");
  // The verbatim SPEC section 8 message, wrapped into tspans, so the first
  // clause is asserted rather than the whole sentence.
  expect(body).toContain("FEMA has not published");
  expect(body).toContain("msc.fema.gov");
});

test("with every layer except sun unavailable the sheet still has all groups", () => {
  const full = loadLayers("atlanta");
  const layers: SheetLayers = { sun: full.sun };
  for (const layer of LAYER_NAMES) {
    if (layer === "sun") continue;
    layers[layer] = {
      layer,
      status: "unavailable",
      data: null,
      source: {
        name: "forced failure",
        url: "http://127.0.0.1:9",
        fetchedAt: "2026-09-24T18:00:00.000Z",
        cached: false,
        licence: "n/a",
      },
      unavailable: {
        code: "upstream_error",
        message: `The ${layer} source could not be reached (upstream_error).`,
        retryable: true,
      },
      fieldPaths: [],
    };
  }

  const svg = buildSheet(makeCtx("atlanta", { layers, brief: null }));
  for (const id of [...GROUP_ORDER, ...SITE_PLAN_SUBGROUPS, ...WALK_SHED_SUBGROUPS]) {
    expect(count(svg, `<g id="${id}"`), `${id} should still appear once`).toBe(1);
  }
  expect(count(svg, "<g")).toBe(count(svg, "</g>"));

  // The site plan carries no buildings at all when OSM failed.
  const sitePlan = groupBody(svg, "site-plan");
  expect(sitePlan).toContain('data-status="unavailable"');
  const buildings = sitePlan.slice(sitePlan.indexOf('<g id="site-plan-buildings"'));
  expect(buildings.slice(0, buildings.indexOf("</g>"))).not.toContain("<path");

  // The sun panel still carries its diagram.
  expect(groupBody(svg, "sun-path")).toContain('data-status="ok"');
});

test("a layer that was never requested reads as not requested, never as a zero", () => {
  const svg = buildSheet(makeCtx("atlanta", { layers: { sun: loadLayers("atlanta").sun } }));
  const availability = groupBody(svg, "data-availability");
  expect(availability).toContain("not requested");
  expect(groupBody(svg, "seismic")).toContain('data-status="unavailable"');
});

// ─── Site plan content ───────────────────────────────────────────────────────

test("the Atlanta site plan draws the figure ground and only tagged heights", () => {
  const svg = buildSheet(makeCtx("atlanta"));
  const sitePlan = groupBody(svg, "site-plan");
  expect(sitePlan).toContain('data-status="ok"');

  const buildings = sitePlan.slice(
    sitePlan.indexOf('<g id="site-plan-buildings"'),
  );
  const buildingBody = buildings.slice(0, buildings.indexOf("</g>"));
  const paths = count(buildingBody, "<path");
  expect(paths).toBeGreaterThanOrEqual(60);
  expect(paths).toBeLessThanOrEqual(160);

  // PHASE-2-sheet.md step 2.2 asked for zero height labels at Atlanta. That
  // came from the retracted 2026-09-21 probe ("0 with height"). The committed
  // capture, and SPEC section 5 as corrected by PROGRESS.md owner decision 2 of
  // 2026-09-24, has 14 distinct features with a height tag (16 rings). The
  // assertion is that heights are few and come only from tagged features, never
  // derived from levels: 49 features carry levels and none of them prints.
  const heights = sitePlan.slice(
    sitePlan.indexOf('<g id="site-plan-building-heights"'),
  );
  const heightBody = heights.slice(0, heights.indexOf("</g>"));
  const labels = count(heightBody, "<text");
  expect(labels).toBeGreaterThan(0);
  expect(labels).toBeLessThan(25);
});

test("the Miami site plan prints more than 150 height labels", () => {
  const svg = buildSheet(makeCtx("miami"));
  const sitePlan = groupBody(svg, "site-plan");
  const heights = sitePlan.slice(
    sitePlan.indexOf('<g id="site-plan-building-heights"'),
  );
  const heightBody = heights.slice(0, heights.indexOf("</g>"));
  expect(count(heightBody, "<text")).toBeGreaterThan(150);
});

test("WaKeeney prints no height label, because nothing there is tagged", () => {
  const svg = buildSheet(makeCtx("wakeeney"));
  const sitePlan = groupBody(svg, "site-plan");
  const heights = sitePlan.slice(
    sitePlan.indexOf('<g id="site-plan-building-heights"'),
  );
  expect(count(heights.slice(0, heights.indexOf("</g>")), "<text")).toBe(0);
});

test("the Miami flood polygons carry the VE cross hatch", () => {
  const svg = buildSheet(makeCtx("miami"));
  const sitePlan = groupBody(svg, "site-plan");
  const flood = sitePlan.slice(sitePlan.indexOf('<g id="site-plan-flood"'));
  const floodBody = flood.slice(0, flood.indexOf("</g>"));
  expect(floodBody).toContain('fill="url(#flood-ve)"');
  expect(floodBody).toContain('fill="url(#flood-sfha)"');
});

// ─── Scale bars ──────────────────────────────────────────────────────────────

test("the site plan imperial 200 ft tick is 72 pt from the bar origin", () => {
  const svg = buildSheet(makeCtx("atlanta"));
  const annotations = groupBody(svg, "site-plan");
  const barStart = annotations.indexOf('data-scale="imperial"');
  expect(barStart).toBeGreaterThan(-1);
  const bar = annotations.slice(barStart);

  const originMatch = /data-origin-x="([\d.]+)"/.exec(bar);
  expect(originMatch, "the imperial bar should record its origin").not.toBeNull();
  const origin = Number(originMatch?.[1]);

  const tickMatch = /data-tick-ft="200" x1="([\d.]+)"/.exec(bar);
  expect(tickMatch, "the 200 ft tick should be present").not.toBeNull();
  const tick = Number(tickMatch?.[1]);

  // 1 in = 200 ft, so 200 ft is exactly one inch, which is 72 pt.
  expect(tick - origin).toBeCloseTo(72, 1);
});

// ─── Brief text ──────────────────────────────────────────────────────────────

test("no tspan line in the brief group exceeds 110 characters", () => {
  const svg = buildSheet(makeCtx("atlanta"));
  const briefBody = groupBody(svg, "brief");
  const spans = briefBody.match(/<tspan[^>]*>([^<]*)<\/tspan>/g) ?? [];
  expect(spans.length, "the brief should wrap into tspan lines").toBeGreaterThan(3);
  for (const span of spans) {
    const text = span.replace(/<[^>]+>/g, "");
    expect(text.length, `"${text}" should fit the zone`).toBeLessThanOrEqual(110);
  }
  // The citations stay in the text: they are the evidence.
  expect(briefBody).toContain("topo.siteElevationM");
});

test("an unwritten brief renders the unavailable panel, never a blank box", () => {
  const svg = buildSheet(makeCtx("atlanta", { brief: null }));
  const briefBody = groupBody(svg, "brief");
  expect(briefBody).toContain('data-status="unavailable"');
  expect(briefBody).toContain("UNAVAILABLE");
});

// ─── Attribution and file name ───────────────────────────────────────────────

test("the attribution group names OpenStreetMap and every attempted source", () => {
  const svg = buildSheet(makeCtx("atlanta"));
  const body = groupBody(svg, "attribution");
  expect(body).toContain("OpenStreetMap contributors");
  expect(body).toContain("ODbL 1.0");
  expect(body).toContain("FEMA NFHL");
  expect(body).toContain("USGS 3DEP");
  expect(body).toContain("USDA NRCS SSURGO");
  expect(body).toContain("Open-Meteo (ERA5)");
  expect(body).toContain("US Census Bureau ACS 5-year");
  expect(body).toContain("Nominatim and Photon");
});

test("the attribution omits a source that was never attempted, but never OSM", () => {
  const layers = loadLayers("atlanta");
  const only: SheetLayers = { sun: layers.sun, osm: layers.osm };
  const body = groupBody(buildSheet(makeCtx("atlanta", { layers: only })), "attribution");
  expect(body).toContain("OpenStreetMap contributors");
  expect(body).not.toContain("FEMA NFHL");
  expect(body).not.toContain("USDA NRCS SSURGO");
});

test("the export file name carries the point and the day", () => {
  expect(sheetFileName(33.7751258, -84.391975, "2026-09-24T18:00:00.000Z")).toBe(
    "datum-site-33.77513_-84.39198-20260924.svg",
  );
});

// ─── Loading is on screen only ───────────────────────────────────────────────

test("buildSheet ignores the loading list, so no loading panel is ever exported", () => {
  const svg = buildSheet(
    makeCtx("atlanta", { loading: LAYER_NAMES as LayerName[] }),
  );
  expect(svg).not.toContain('data-status="loading"');
  expect(svg).not.toContain("datum-pulse");
});

test("buildSheetGroups renders the loading chrome when a layer is still in flight", () => {
  const groups = buildSheetGroups(makeCtx("atlanta", { loading: ["seismic"] }));
  expect(groups.seismic).toContain('data-status="loading"');
  expect(groups.seismic).toContain("datum-pulse");
  expect(groups.soil).toContain('data-status="ok"');
});
