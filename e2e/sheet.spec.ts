// Phase 2 acceptance: the sheet, the export, the unavailable states, and the
// brief citations. PHASE-2-sheet.md step 2.6.
//
// Start the server yourself; playwright.config.ts reuses an existing one on
// port 3000. See e2e/README.md for the three server shapes this file needs.
//
//   normal run     DATUM_ALLOW_TEST_FLAG=1 npm run start
//   failure test A DATUM_E2E_SHEET_FAIL=overpass with the dev server
//   failure test B DATUM_E2E_SHEET_FAIL=all with the dev server
//
// Overrides are inert in a production build by design (SPEC section 15), so
// both failure tests need `npm run dev`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { testSites, type TestSite } from "./fixtures/sites";
import { roundKey, siteKey } from "../src/lib/datum/geo";
import { getClient } from "../src/lib/datum/memory";

const OUT_DIR = path.join(__dirname, "..", "docs", "datum", "screenshots", "phase-2");

/**
 * SPEC section 11 lists these top level groups, in this order, and says the
 * tests assert the exact list. PHASE-2-sheet.md calls it sixteen; the list in
 * SPEC section 11 has fifteen entries and the list is the contract.
 */
const GROUP_ORDER = [
  "sheet-frame",
  "site-plan",
  "walk-shed",
  "topography-section",
  "soil",
  "demographics",
  "seismic",
  "flood-summary",
  "sun-path",
  "wind-rose",
  "climate",
  "brief",
  "data-availability",
  "title-block",
  "attribution",
];

const SETTLE_TIMEOUT_MS = 150_000;
const BRIEF_TIMEOUT_MS = 120_000;

/** Codes that mean the network or the upstream failed, not the code. */
const NETWORK_CODES = ["timeout", "http_error", "upstream_error"];

interface ExportCheck {
  svg: string;
  groupIds: string[];
  hasImage: boolean;
  hasForeignObject: boolean;
  hasScript: boolean;
  hasDataHref: boolean;
  parserError: boolean;
  width: string | null;
  height: string | null;
  attribution: string;
  paperBeforeGroups: boolean;
}

/** Everything the export has to satisfy, checked in the browser's own parser. */
async function inspectExport(page: Page, svg: string): Promise<ExportCheck> {
  return page.evaluate((source: string) => {
    const document_ = new DOMParser().parseFromString(source, "image/svg+xml");
    const root = document_.documentElement;
    const parserError = document_.getElementsByTagName("parsererror").length > 0;

    const groupIds: string[] = [];
    for (const child of Array.from(root.children)) {
      if (child.tagName === "g" && child.id) groupIds.push(child.id);
    }

    const hasDataHref = Array.from(document_.querySelectorAll("*")).some((element) =>
      Array.from(element.attributes).some(
        (attribute) =>
          attribute.name.toLowerCase().endsWith("href") &&
          attribute.value.trim().toLowerCase().startsWith("data:"),
      ),
    );

    const paper = document_.getElementById("paper");
    const firstGroup = root.querySelector(":scope > g");
    const paperBeforeGroups =
      paper !== null &&
      firstGroup !== null &&
      (paper.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    return {
      svg: source,
      groupIds,
      hasImage: document_.getElementsByTagName("image").length > 0,
      hasForeignObject: document_.getElementsByTagName("foreignObject").length > 0,
      hasScript: document_.getElementsByTagName("script").length > 0,
      hasDataHref,
      parserError,
      width: root.getAttribute("width"),
      height: root.getAttribute("height"),
      attribution: document_.getElementById("attribution")?.textContent ?? "",
      paperBeforeGroups,
    };
  }, svg);
}

/** Click Export, read the download, and run every structural assertion. */
async function exportAndCheck(page: Page, slug: string): Promise<ExportCheck> {
  const downloadPromise = page.waitForEvent("download");
  await page.click("[data-datum-export]");
  const download = await downloadPromise;
  const file = await download.path();
  const svg = readFileSync(file, "utf8");

  const check = await inspectExport(page, svg);

  expect(check.parserError, `${slug}: the export must parse as image/svg+xml`).toBe(false);
  expect(check.groupIds, `${slug}: top level group ids, in order`).toEqual(GROUP_ORDER);
  expect(check.paperBeforeGroups, `${slug}: rect#paper precedes the groups`).toBe(true);
  expect(check.hasImage, `${slug}: no image element`).toBe(false);
  expect(check.hasForeignObject, `${slug}: no foreignObject`).toBe(false);
  expect(check.hasScript, `${slug}: no script`).toBe(false);
  expect(check.hasDataHref, `${slug}: no data: reference`).toBe(false);
  expect(check.width, `${slug}: root width`).toBe("36in");
  expect(check.height, `${slug}: root height`).toBe("24in");
  expect(check.attribution, `${slug}: attribution names OSM`).toContain(
    "OpenStreetMap contributors",
  );
  // The tripwire in PHASE-2-sheet.md: an export over 4 MB is a stop condition.
  const megabytes = Buffer.byteLength(svg) / 1_048_576;
  console.log(`${slug}: export ${megabytes.toFixed(2)} MB, ${check.groupIds.length} groups`);
  expect(megabytes, `${slug}: export size in MB`).toBeLessThan(4);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, `${slug}.svg`), svg);
  return check;
}

/** The status attribute the builders put on a top level group. */
async function groupStatus(page: Page, svg: string, id: string): Promise<string | null> {
  return page.evaluate(
    ([source, groupId]: [string, string]) => {
      const document_ = new DOMParser().parseFromString(source, "image/svg+xml");
      return document_.getElementById(groupId)?.getAttribute("data-status") ?? null;
    },
    [svg, id] as [string, string],
  );
}

async function groupText(page: Page, svg: string, id: string): Promise<string> {
  return page.evaluate(
    ([source, groupId]: [string, string]) => {
      const document_ = new DOMParser().parseFromString(source, "image/svg+xml");
      return document_.getElementById(groupId)?.textContent ?? "";
    },
    [svg, id] as [string, string],
  );
}

async function groupHtml(page: Page, svg: string, id: string): Promise<string> {
  return page.evaluate(
    ([source, groupId]: [string, string]) => {
      const document_ = new DOMParser().parseFromString(source, "image/svg+xml");
      return document_.getElementById(groupId)?.outerHTML ?? "";
    },
    [svg, id] as [string, string],
  );
}

/** The chips under the sheet. SPEC section 12 renders one per citation. */
async function countChips(
  page: Page,
): Promise<{ total: number; valid: number; invalid: number }> {
  return page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll("[data-citation-chip]"));
    const valid = chips.filter(
      (chip) => chip.getAttribute("data-citation-valid") === "true",
    ).length;
    return { total: chips.length, valid, invalid: chips.length - valid };
  });
}

/**
 * A valid chip highlights its panel on hover; an invalid one is struck through
 * and carries the "not a data field" tooltip (SPEC section 12).
 */
async function assertChipBehaviour(page: Page, slug: string) {
  const valid = page.locator('[data-citation-chip][data-citation-valid="true"]').first();
  if ((await valid.count()) > 0) {
    const panel = await valid.getAttribute("data-citation-panel");
    expect(panel, `${slug}: a valid chip names the panel it cites`).toBeTruthy();
    await valid.hover();
    await expect(
      page.locator(`[data-datum-sheet] g[data-group="${panel}"]`),
    ).toHaveAttribute("data-highlight", "true");
    expect(
      await page.getAttribute("[data-datum-sheet]", "data-highlight-group"),
    ).toBe(panel);
    // Moving off the chip clears it again.
    await page.mouse.move(0, 0);
    await expect
      .poll(async () =>
        page.getAttribute("[data-datum-sheet]", "data-highlight-group"),
      )
      .toBe("");
  }

  const invalid = page.locator('[data-citation-chip][data-citation-valid="false"]');
  const invalidCount = await invalid.count();
  for (let index = 0; index < invalidCount; index++) {
    const chip = invalid.nth(index);
    await expect(chip).toHaveAttribute("title", "not a data field");
    const decoration = await chip.evaluate(
      (node) => getComputedStyle(node).textDecorationLine,
    );
    expect(decoration, `${slug}: an invalid chip is struck through`).toContain(
      "line-through",
    );
  }
}

/** Per layer status from the rail, which mirrors the envelopes. */
async function layerStatuses(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const node of Array.from(document.querySelectorAll("[data-layer]"))) {
      out[node.getAttribute("data-layer") ?? ""] =
        node.getAttribute("data-layer-status") ?? "";
    }
    return out;
  });
}

/** The unavailable code the rail printed for one layer, if any. */
async function layerCode(page: Page, layer: string): Promise<string | null> {
  return page.evaluate((name: string) => {
    const node = document.querySelector(`[data-layer="${name}"] .meta`);
    return node ? (node.textContent ?? "").trim() : null;
  }, layer);
}

/**
 * Fill the field and submit. The submit button is disabled until React has
 * hydrated and seen the value, so waiting for it to enable is the hydration
 * signal: on a cold `npm run dev` the first Enter press otherwise lands before
 * the handler exists and is silently lost. The press is retried for the same
 * reason.
 */
async function submitAddress(page: Page, query: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // The field is filled inside the loop, not before it. On `npm run dev` the
    // webpack watcher reloads the page whenever Playwright writes an artifact
    // into the project (test-results, and the screenshots this file saves), and
    // a reload empties the field: a retry that only pressed Enter again would
    // submit nothing for the rest of the run.
    //
    // The debounced suggestion request fires only from a hydrated effect, so
    // waiting for it proves the submit handler exists. Without it a cold dev
    // server takes the native form submission instead.
    const hydrated = page
      .waitForRequest((request) => request.url().includes("/api/datum/suggest"), {
        timeout: 30_000,
      })
      .catch(() => null);
    await page.fill("#datum-address", query);
    await hydrated;
    await page.waitForSelector("[data-datum-submit]:not([disabled])", {
      timeout: 60_000,
    });
    await page.press("#datum-address", "Enter");

    const appeared = await page
      .waitForSelector("[data-datum-confirm]", { timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) return;
    console.log(`submit attempt ${attempt + 1} did not reach the confirm step; retrying`);
  }
  throw new Error(`the confirm step never appeared for "${query}"`);
}

/** Address to confirm map, asserting the marker lands on the fixture point. */
async function resolveAndConfirm(page: Page, site: TestSite) {
  await page.goto("/projects/datum?test=1");
  await page.fill("#datum-address", site.query);

  // Suggestions are a convenience: Photon may be throttled, and the submit path
  // never uses them, so a missing list is logged rather than failed.
  const suggestions = await page
    .waitForSelector("[data-datum-suggestions]", { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!suggestions) {
    console.log(`${site.slug}: no Photon suggestion list appeared; submitting the typed text`);
  }

  // Enter without selecting a suggestion: the submit is Nominatim.
  await submitAddress(page, site.query);

  const lat = Number(await page.getAttribute("[data-confirm-lat]", "data-confirm-lat"));
  const lng = Number(await page.getAttribute("[data-confirm-lng]", "data-confirm-lng"));
  expect(Math.abs(lat - site.lat), `${site.slug}: confirmed latitude`).toBeLessThan(0.002);
  expect(Math.abs(lng - site.lng), `${site.slug}: confirmed longitude`).toBeLessThan(0.002);

  await page.click("text=Confirm and analyse");
}

async function waitForLayers(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector("[data-datum-sheet]")?.getAttribute("data-loading-count") ===
      "0",
    null,
    { timeout: SETTLE_TIMEOUT_MS },
  );
}

async function waitForBrief(page: Page): Promise<string> {
  await page.waitForFunction(
    () => {
      const status = document
        .querySelector("[data-datum-sheet]")
        ?.getAttribute("data-brief-status");
      return status === "done" || status === "error";
    },
    null,
    { timeout: BRIEF_TIMEOUT_MS },
  );
  return (
    (await page.getAttribute("[data-datum-sheet]", "data-brief-status")) ?? "unknown"
  );
}

// ─── Per site ────────────────────────────────────────────────────────────────

for (const site of testSites) {
  test(`datum sheet: ${site.slug}`, async ({ page }) => {
    test.setTimeout(10 * 60 * 1000);

    await resolveAndConfirm(page, site);
    await waitForLayers(page);

    const statuses = await layerStatuses(page);
    console.log(`${site.slug}: layer statuses ${JSON.stringify(statuses)}`);

    mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(OUT_DIR, `${site.slug}.png`),
      fullPage: true,
    });

    const briefStatus = await waitForBrief(page);
    console.log(`${site.slug}: brief ${briefStatus}`);

    if (briefStatus === "done") {
      // Real chip elements, not bracket substrings in the drawing's text.
      const chips = await countChips(page);
      console.log(
        `${site.slug}: ${chips.total} citation chips ` +
          `(${chips.valid} valid, ${chips.invalid} struck through)`,
      );
      expect(chips.total, `${site.slug}: citation chips`).toBeGreaterThanOrEqual(8);
      await assertChipBehaviour(page, site.slug);

      // The unverified banner is allowed when a layer other than osm and
      // walkshed was unavailable, and is logged when it appears.
      const unverified = await page.$("[data-brief-unverified]");
      if (unverified) {
        const excused = Object.entries(statuses).some(
          ([layer, status]) =>
            status === "unavailable" && layer !== "osm" && layer !== "walkshed",
        );
        console.log(
          `${site.slug}: unverified banner shown; excused by an unavailable layer: ${excused}`,
        );
        expect(
          excused,
          `${site.slug}: the unverified banner needs an unavailable layer to excuse it`,
        ).toBe(true);
      }
    } else {
      console.log(`${site.slug}: brief did not complete, so the chip count is skipped`);
    }

    const check = await exportAndCheck(page, site.slug);

    // ── Site specific ──
    const floodStatus = statuses.flood;
    const floodCode = await layerCode(page, "flood");
    // FEMA (hazards.fema.gov) has refused connections from this machine since
    // 2026-09-22 (PROGRESS.md, Phase 0 pending live check). The FEMA specific
    // assertions run when the layer answered or reported no coverage, and print
    // "pending: FEMA unreachable" otherwise. This mirrors the allowance the
    // owner accepted for the Phase 1 layers spec (e2e/README.md).
    const femaAnswered =
      floodStatus !== "unavailable" ||
      (floodCode !== null && !NETWORK_CODES.includes(floodCode));

    if (site.slug === "wakeeney") {
      if (femaAnswered) {
        expect(await groupStatus(page, check.svg, "flood-summary")).toBe("unavailable");
        expect(await groupText(page, check.svg, "flood-summary")).toContain(
          "FEMA has not published",
        );
      } else {
        console.log("wakeeney: pending: FEMA unreachable, no coverage stamp not checked");
      }
    }

    if (site.slug === "miami") {
      if (femaAnswered) {
        const sitePlan = await groupHtml(page, check.svg, "site-plan");
        expect(sitePlan, "miami: a VE cross hatched polygon").toContain(
          'fill="url(#flood-ve)"',
        );
      } else {
        console.log("miami: pending: FEMA unreachable, VE hatch not checked");
      }
    }

    if (site.slug === "atlanta") {
      // Heights print only where OSM carries a height tag. The 2026-09-22
      // capture has 14 tagged features, and PHASE-2 step 2.6's "no <text" came
      // from the retracted 2026-09-21 probe (PROGRESS.md owner decision 2), so
      // the check is that labels are few and that the 49 features carrying
      // levels print nothing.
      if (statuses.osm !== "unavailable") {
        const heights = await groupHtml(page, check.svg, "site-plan");
        const block = heights.slice(heights.indexOf('id="site-plan-building-heights"'));
        const labels = (block.slice(0, block.indexOf("</g>")).match(/<text/g) ?? []).length;
        console.log(`atlanta: ${labels} height labels from tagged features`);
        expect(labels, "atlanta: height labels").toBeLessThan(25);
      } else {
        console.log("atlanta: osm unavailable, height label count not checked");
      }
    }
  });
}

// ─── Failure tests ───────────────────────────────────────────────────────────
//
// Both analyse a cold point rather than a test site. An override only blocks a
// request that is actually made, and api_cache is shared and live: the three
// test sites have Overpass, climate, and elevation rows from earlier runs, so
// an overridden source there would answer ok from the cache and the test would
// pass while proving nothing. That is exactly how the Phase 1 forced failure
// run failed on 2026-09-24 (PROGRESS.md, owner decision c). Sparta, Tennessee
// is about 36.0, -85.5: more than a degree from every test site and from both
// Phase 1 cold points, so its 0.1 degree climate cell and its 0.001 degree
// point keys are all cold.
//
// PHASE-2-sheet.md step 2.6 says "run Atlanta" for failure test A. Recorded
// deviation: Atlanta cannot be used while its Overpass row is cached.
const COLD_SITE: TestSite = {
  slug: "sparta-tn",
  query: "Sparta, TN",
  // Only used for the confirm assertion tolerance, which is widened below
  // because this point comes from Nominatim rather than from SPEC section 5.
  lat: 35.9284,
  lng: -85.4636,
};

/**
 * An override only blocks a request that is actually made, and api_cache is
 * live and shared, so a point analysed by an earlier run answers ok from the
 * cache with every source overridden. Phase 1 met the same problem and cleared
 * the rows it could not move away from (e2e/README.md, owner decision c).
 *
 * This clears only the rows keyed by this one point: the 0.001 degree keys for
 * Overpass, FEMA, elevation, seismic, soil, and the Census geocoder, and the
 * 0.1 degree key for the Open-Meteo archive. Nothing else in api_cache is
 * touched, and each cleared row costs one re-fetch on a later real run.
 *
 * census_acs and tiger are keyed by tract GEOID rather than by point, so they
 * are left alone: with census_geo overridden the tract is never resolved and
 * the ACS row is never reached.
 */
async function clearPointCache(lat: number, lng: number) {
  const db = getClient();
  if (!db) {
    // Same requirement as the other database aware specs (e2e/README.md): the
    // test process needs SUPABASE_URL and SUPABASE_SECRET_KEY in its own
    // environment, because Next loads .env.local and Playwright does not.
    console.log(
      "no Supabase client in the test process; api_cache was not cleared. " +
        "Export SUPABASE_URL and SUPABASE_SECRET_KEY before this run.",
    );
    return;
  }
  const point = roundKey(lat, lng, 3);
  const cell = roundKey(lat, lng, 1);
  const patterns = [
    `overpass:${point}%`,
    `fema:${point}%`,
    `usgs_epqs:${point}%`,
    `usgs_3dep:${point}%`,
    `usgs_seismic:${point}%`,
    `usda:${point}%`,
    `census_geo:${point}%`,
    `openmeteo:${cell}%`,
  ];
  let removed = 0;
  for (const pattern of patterns) {
    const { data, error } = await db
      .from("api_cache")
      .delete()
      .like("cache_key", pattern)
      .select("cache_key");
    expect(error, `clearing api_cache for ${pattern}`).toBeNull();
    removed += (data ?? []).length;
  }
  // The brief prefers the copy in layer_results over the client's (SPEC section
  // 12), so a stored envelope from an earlier run at this point would make a
  // layer citable while this run shows it unavailable. Deleting the site row
  // cascades to its layer_results. It is scoped to this one test point and to
  // is_test rows.
  const { data: sites, error: siteError } = await db
    .from("sites")
    .delete()
    .eq("site_key", siteKey(lat, lng))
    .eq("is_test", true)
    .select("id");
  expect(siteError, "clearing the cold point site row").toBeNull();

  console.log(
    `cleared ${removed} api_cache rows and ${(sites ?? []).length} site rows for the cold point`,
  );
}

/** Geocode through the API so the point is known before the cache is cleared. */
async function coldPoint(page: Page): Promise<{ lat: number; lng: number }> {
  const response = await page.request.post("/api/datum/geocode", {
    data: { q: COLD_SITE.query },
  });
  expect(response.status(), "the cold point should geocode").toBe(200);
  const body = (await response.json()) as { lat: number; lng: number };
  return { lat: body.lat, lng: body.lng };
}

/** The cold point flow: no coordinate assertion, because it is not a fixture. */
async function resolveColdPoint(page: Page) {
  const point = await coldPoint(page);
  await clearPointCache(point.lat, point.lng);
  await page.goto("/projects/datum?test=1");
  await submitAddress(page, COLD_SITE.query);
  await page.click("text=Confirm and analyse");
}

// ─── Failure test A: Overpass down ───────────────────────────────────────────

test("datum sheet: a cold point with Overpass unreachable", async ({ page }) => {
  test.skip(
    process.env.DATUM_E2E_SHEET_FAIL !== "overpass",
    'needs the dev server with DATUM_SOURCE_OVERRIDES pointing overpass at an unreachable port: set DATUM_E2E_SHEET_FAIL=overpass',
  );
  test.setTimeout(10 * 60 * 1000);

  await resolveColdPoint(page);
  await waitForLayers(page);

  const statuses = await layerStatuses(page);
  expect(statuses.osm, "osm should be unavailable").toBe("unavailable");
  expect(statuses.walkshed, "walkshed should be unavailable").toBe("unavailable");

  const rail = await page.textContent("[data-datum-rail]");
  expect(rail, "the Overpass message").toContain("OpenStreetMap data could not be loaded");

  const briefStatus = await waitForBrief(page);
  const check = await exportAndCheck(page, "failure-a-overpass-down");

  expect(await groupStatus(page, check.svg, "site-plan")).toBe("unavailable");
  expect(await groupStatus(page, check.svg, "walk-shed")).toBe("unavailable");

  const sitePlan = await groupHtml(page, check.svg, "site-plan");
  const buildings = sitePlan.slice(sitePlan.indexOf('id="site-plan-buildings"'));
  expect(
    buildings.slice(0, buildings.indexOf("</g>")),
    "no building path when Overpass failed",
  ).not.toContain("<path");

  if (briefStatus === "done") {
    const brief = (await groupText(page, check.svg, "brief")).toLowerCase();
    expect(
      brief.includes("openstreetmap") ||
        brief.includes("figure ground") ||
        brief.includes("figure-ground"),
      'the brief should name OpenStreetMap or the figure ground in "What is missing"',
    ).toBe(true);
  } else {
    console.log("overpass down: brief did not complete, so its wording is not checked");
  }
});

// ─── Failure test B: every external source down ──────────────────────────────

test("datum sheet: a cold point with every layer source unreachable", async ({ page }) => {
  test.skip(
    process.env.DATUM_E2E_SHEET_FAIL !== "all",
    "needs the dev server with every source overridden: set DATUM_E2E_SHEET_FAIL=all",
  );
  test.setTimeout(10 * 60 * 1000);

  // Every layer source is overridden. Photon and Nominatim are not: with
  // geocoding down there is no point to analyse and the run could not start,
  // and the geocoders are not layers. Recorded deviation from "override all
  // sources" in PHASE-2-sheet.md step 2.6.
  await resolveColdPoint(page);
  await waitForLayers(page);

  const statuses = await layerStatuses(page);
  console.log(`all down: layer statuses ${JSON.stringify(statuses)}`);
  expect(statuses.sun, "sun is computed and never fails").not.toBe("unavailable");
  for (const [layer, status] of Object.entries(statuses)) {
    if (layer === "sun") continue;
    expect(status, `${layer} should be unavailable`).toBe("unavailable");
  }

  const briefStatus = await waitForBrief(page);
  const check = await exportAndCheck(page, "failure-b-all-down");

  if (briefStatus === "done") {
    const brief = await groupText(page, check.svg, "brief");
    expect(brief, 'the brief should carry "What is missing"').toContain("WHAT IS MISSING");

    // Only sun has field paths, so only sun paths can validate. A citation of
    // any other layer is the model filling a gap, which is precisely what the
    // server side check exists to catch: it lands in the invalid list and the
    // sheet says the brief is unverified rather than carrying the claim.
    const valid = (
      (await page.getAttribute("[data-datum-sheet]", "data-brief-valid")) ?? ""
    )
      .split(" ")
      .filter((path) => path.length > 0);
    const invalid = (
      (await page.getAttribute("[data-datum-sheet]", "data-brief-invalid")) ?? ""
    )
      .split(" ")
      .filter((path) => path.length > 0);
    console.log(`all down: ${valid.length} valid, ${invalid.length} invalid citations`);
    console.log(`all down: invalid were ${invalid.join(", ") || "none"}`);

    for (const path of valid) {
      expect(path, "only sun paths can validate when everything else failed").toMatch(
        /^sun\./,
      );
    }
    if (invalid.length > 0) {
      expect(
        await page.$("[data-brief-unverified]"),
        "an invalid citation must raise the unverified banner",
      ).not.toBeNull();
    }
  } else {
    console.log("all down: brief did not complete, so the citations are not checked");
  }
});
