// Acceptance for SPEC section 8 rule 7 (rounding precision) and the section 11
// on screen viewer. Added 2026-09-25.
//
// Start the server yourself; playwright.config.ts reuses an existing one on
// port 3000.
//
//   DATUM_ALLOW_TEST_FLAG=1 npm run start
//   npx playwright test e2e/precision-and-viewer.spec.ts
//
// This runs Atlanta and Miami against the live sources and the live model, so
// it costs a brief each and needs ANTHROPIC_API_KEY. `?test=1` marks the site
// rows as test rows, which the server honours only under DATUM_ALLOW_TEST_FLAG.
//
// What it is for. The unit specs prove the rounding over the fixtures. This
// proves it end to end on a real run: every number the model actually wrote is
// checked against the precision table, so a path that reaches the brief without
// passing through the table fails here even if no fixture carries it.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { testSites, type TestSite } from "./fixtures/sites";
import { precisionFor } from "../src/lib/datum/precision";
import { LAYER_NAMES, type LayerName } from "../src/lib/datum/types";

const OUT_DIR = path.join(__dirname, "..", "docs", "datum", "screenshots", "viewer");

const SETTLE_TIMEOUT_MS = 150_000;
const BRIEF_TIMEOUT_MS = 120_000;

/** The sheet is 2592 by 1728 units, ARCH D at 72 units to the inch. */
const SHEET_W = 2592;

test.beforeAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
});

// ─── Driving a real run ──────────────────────────────────────────────────────

async function submitAddress(page: Page, query: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const hydrated = page
      .waitForRequest((request) => request.url().includes("/api/datum/suggest"), {
        timeout: 30_000,
      })
      .catch(() => null);
    await page.fill("#datum-address", query);
    await hydrated;
    await page.waitForSelector("[data-datum-submit]:not([disabled])", { timeout: 60_000 });
    await page.press("#datum-address", "Enter");
    const appeared = await page
      .waitForSelector("[data-datum-confirm]", { timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) return;
  }
  throw new Error(`the confirm step never appeared for "${query}"`);
}

/**
 * Run one analysis. `waitForBrief` is false for the viewer checks: they need a
 * drawn sheet, not a written brief, and each brief is a live model call against
 * a daily rate limit. Four full runs in one file is what exhausted it.
 */
async function analyse(
  page: Page,
  site: TestSite,
  waitForBrief = true,
): Promise<string> {
  await page.goto("/projects/datum?test=1");
  await submitAddress(page, site.query);
  await page.click("text=Confirm and analyse");

  await page.waitForFunction(
    () =>
      document.querySelector("[data-datum-sheet]")?.getAttribute("data-loading-count") ===
      "0",
    null,
    { timeout: SETTLE_TIMEOUT_MS },
  );
  if (!waitForBrief) return "";
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

  const status = await page.getAttribute("[data-datum-sheet]", "data-brief-status");
  expect(status, `${site.slug}: the brief finished`).toBe("done");

  return page.evaluate(() => {
    const brief = document.querySelector('[data-datum-sheet] g[data-group="brief"]');
    // One tspan per wrapped line, joined with a space rather than concatenated:
    // concatenating is what produced the "totalrelief" report, and the join is
    // a line break, not a missing space (e2e/unit/sheet-line-joins.spec.ts).
    return Array.from(brief?.querySelectorAll("text") ?? [])
      .map((node) =>
        Array.from(node.querySelectorAll("tspan")).length > 0
          ? Array.from(node.querySelectorAll("tspan"))
              .map((span) => span.textContent ?? "")
              .join(" ")
          : (node.textContent ?? ""),
      )
      .join("\n");
  });
}

// ─── Reading the numbers a brief wrote ───────────────────────────────────────

/** A number as a brief writes it, with the citation brackets removed first. */
const NUMERIC = /(?:(?<=^|[\s([])-)?\d+(?:,\d{3})*(?:\.\d+)?/g;
const CITATION = /\[((?:[^[\]\n]|\[\])+)\]/g;

function decimalsOf(written: string): number {
  const point = written.indexOf(".");
  return point < 0 ? 0 : written.length - point - 1;
}

/**
 * The finest precision any field in the brief's citations allows. A sentence
 * may restate a value cited earlier, so the bound that has to hold for a given
 * number is the loosest of every field cited anywhere in the brief, not of the
 * fields cited in its own sentence. That is a weaker statement than the unit
 * specs make over the serialized input, and it is the one that is true of prose.
 */
function finestAllowed(text: string): { decimals: number; paths: string[] } {
  const paths: string[] = [];
  let finest = 0;
  for (const match of text.matchAll(CITATION)) {
    for (const raw of match[1].split(",")) {
      const citation = raw.trim();
      const dot = citation.indexOf(".");
      if (dot < 0) continue;
      const layer = citation.slice(0, dot) as LayerName;
      const field = citation.slice(dot + 1);
      if (
        !(LAYER_NAMES as string[]).includes(layer) &&
        citation !== "site.latitude" &&
        citation !== "site.longitude"
      ) {
        continue;
      }
      // The site point is not a layer field. The serializer sends it at the
      // five decimals the title block prints, so a brief may quote five.
      if (citation === "site.latitude" || citation === "site.longitude") {
        paths.push(citation);
        finest = Math.max(finest, 5);
        continue;
      }
      const decimals = precisionFor(layer, field);
      if (decimals === null) continue;
      paths.push(citation);
      finest = Math.max(finest, decimals);
    }
  }
  return { decimals: finest, paths };
}

// ─── The checks ──────────────────────────────────────────────────────────────

for (const site of testSites.filter((candidate) => candidate.slug !== "wakeeney")) {
  test(`${site.slug}: no number in the brief carries more precision than its field allows`, async ({
    page,
  }) => {
    const brief = await analyse(page, site);
    writeFileSync(path.join(OUT_DIR, `${site.slug}.brief.txt`), brief);

    expect(brief.length, `${site.slug}: the brief has text`).toBeGreaterThan(400);

    const { decimals: allowed, paths } = finestAllowed(brief);
    expect(paths.length, `${site.slug}: the brief cites real fields`).toBeGreaterThan(5);

    const over: string[] = [];
    for (const sentence of brief.split(/(?<=[.!?])\s+|\n+/)) {
      const prose = sentence.replace(CITATION, " ");
      for (const token of prose.matchAll(NUMERIC)) {
        const written = token[0];
        // A four digit year is a date, not a measurement.
        if (/^(?:1[89]|20)\d{2}$/.test(written)) continue;
        if (decimalsOf(written) > allowed) {
          over.push(`"${written}" (${decimalsOf(written)} decimals) in: ${sentence.trim()}`);
        }
      }
    }

    // The defect this is written against: "2.660512686 m", "0.777705908",
    // "2.746897221" and "1.8284 m" in a brief. Nothing over the table's
    // finest field may appear, and nothing may carry more than five decimals
    // whatever it cites.
    expect(
      over,
      `${site.slug}: these numbers carry more than the ${allowed} decimals the cited fields allow`,
    ).toEqual([]);
    for (const token of brief.replace(CITATION, " ").matchAll(NUMERIC)) {
      expect(
        decimalsOf(token[0]),
        `${site.slug}: "${token[0]}" is a float, not a measurement`,
      ).toBeLessThanOrEqual(5);
    }
  });
}

// The three viewer checks share one analysis: they read the drawn sheet, and a
// fresh run each would spend three more briefs against the daily cap.
test.describe.serial("the sheet viewer", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await analyse(page, testSites[0], false);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("it fits to width, reaches 100 percent, and stays vector", async () => {
  const viewer = page.locator("[data-datum-sheet-viewer]");
  await expect(viewer).toBeVisible();
  const svg = viewer.locator("svg");

  // Fit to width: the viewBox is the whole sheet, and the readout agrees with
  // the measured ratio of the window to the sheet.
  const box = (await viewer.boundingBox())!;
  const fitPercent = Math.round((box.width / SHEET_W) * 100);
  await expect(page.locator("[data-datum-zoom]").first()).toHaveAttribute(
    "data-datum-zoom",
    String(fitPercent),
  );
  const fitViewBox = (await svg.getAttribute("viewBox"))!.split(" ").map(Number);
  expect(fitViewBox[2], "fit to width shows the full sheet width").toBeCloseTo(SHEET_W, 0);

  // 100 percent: one sheet unit to one CSS pixel, so the viewBox width is the
  // window's pixel width. This is where the 6 unit text sets at 6 px.
  await page.getByRole("button", { name: "100%" }).first().click();
  await expect(page.locator("[data-datum-zoom]").first()).toHaveAttribute(
    "data-datum-zoom",
    "100",
  );
  const hundred = (await svg.getAttribute("viewBox"))!.split(" ").map(Number);
  expect(hundred[2], "100 percent is one unit to one pixel").toBeCloseTo(box.width, 0);

  // The text is real text at real size, not a scaled bitmap. The smallest
  // authored size is 6 units, which at 100 percent is 6 px on screen.
  const smallest = await svg.evaluate((node) => {
    let min = Infinity;
    for (const text of Array.from(node.querySelectorAll("text, tspan"))) {
      const size = Number(getComputedStyle(text).fontSize.replace("px", ""));
      if (Number.isFinite(size) && size > 0) min = Math.min(min, size);
    }
    return min;
  });
  expect(smallest, "the smallest text renders at its authored size").toBeGreaterThanOrEqual(5.9);

  // Nothing rasterizes the sheet: no CSS transform on the svg, and no image.
  const transform = await svg.evaluate((node) => getComputedStyle(node).transform);
  expect(transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  expect(await svg.locator("image, foreignObject").count()).toBe(0);

  await page.getByRole("button", { name: "Fit" }).first().click();
  await expect(page.locator("[data-datum-zoom]").first()).toHaveAttribute(
    "data-datum-zoom",
    String(fitPercent),
  );
  await page.locator("[data-datum-sheet]").screenshot({
    path: path.join(OUT_DIR, "atlanta-fit.png"),
  });
});

  test("scroll zooms about the pointer, drag pans, and the keyboard does both", async () => {
  const viewer = page.locator("[data-datum-sheet-viewer]");
  const svg = viewer.locator("svg");
  const box = (await viewer.boundingBox())!;

  const viewBoxOf = async () =>
    (await svg.getAttribute("viewBox"))!.split(" ").map(Number);

  // Scroll to zoom, with the pointer well away from the centre so an origin
  // bug cannot pass by symmetry: the sheet point under the pointer holds.
  const px = Math.round(box.x + box.width * 0.78);
  const py = Math.round(box.y + box.height * 0.22);
  const before = await viewBoxOf();
  const scaleBefore = box.width / before[2];
  const sheetX = before[0] + (px - box.x) / scaleBefore;
  const sheetY = before[1] + (py - box.y) / scaleBefore;

  await page.mouse.move(px, py);
  await page.mouse.wheel(0, -600);
  await expect
    .poll(async () => (await viewBoxOf())[2])
    .toBeLessThan(before[2] - 1);

  const after = await viewBoxOf();
  const scaleAfter = box.width / after[2];
  // One CSS pixel of the window, expressed in sheet units at the zoomed scale.
  // A real origin bug is off by hundreds of units; this tolerance only absorbs
  // the browser rounding the pointer position to whole pixels.
  const onePixel = 1 / scaleAfter;
  expect(
    Math.abs(after[0] + (px - box.x) / scaleAfter - sheetX),
    "the sheet point under the pointer holds in x",
  ).toBeLessThan(onePixel);
  expect(
    Math.abs(after[1] + (py - box.y) / scaleAfter - sheetY),
    "the sheet point under the pointer holds in y",
  ).toBeLessThan(onePixel);

  // Drag to pan: dragging left moves the window right across the sheet.
  const panned0 = await viewBoxOf();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 140, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await viewBoxOf())[0]).toBeGreaterThan(panned0[0] + 1);

  // Keyboard: the window is focusable, arrows pan, minus zooms out, 0 fits.
  await viewer.focus();
  const beforeArrow = await viewBoxOf();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await viewBoxOf())[0]).toBeGreaterThan(beforeArrow[0]);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await viewBoxOf())[0]).toBeCloseTo(beforeArrow[0], 0);

  const beforeMinus = (await viewBoxOf())[2];
  await page.keyboard.press("-");
  await expect.poll(async () => (await viewBoxOf())[2]).toBeGreaterThan(beforeMinus);

  await page.keyboard.press("0");
  await expect
    .poll(async () => (await viewBoxOf())[2])
    .toBeCloseTo(SHEET_W, 0);
});

  test("full screen traps focus, Escape closes it, and focus returns", async () => {
  const opener = page.getByRole("button", { name: "Full screen" });
  await opener.click();

  const layer = page.getByRole("dialog", { name: "Site analysis sheet, full screen" });
  await expect(layer).toBeVisible();
  // The layer fills the window, so the sheet is read at the window's width.
  const layerBox = (await layer.boundingBox())!;
  expect(layerBox.width).toBeCloseTo(page.viewportSize()!.width, 0);
  // The body does not scroll behind it.
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.locator("[data-datum-sheet-viewer]").screenshot({
    path: path.join(OUT_DIR, "atlanta-full-screen.png"),
  });

  // Tab cycles inside the layer and never reaches the page behind it.
  const inside = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const seen: string[] = [];
    return { has: !!dialog, seen };
  });
  expect(inside.has).toBe(true);
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    const contained = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return !!dialog && !!document.activeElement && dialog.contains(document.activeElement);
    });
    expect(contained, `focus stayed inside the layer at tab ${step + 1}`).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(layer).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  // Focus returns to the control that opened it.
  await expect(opener).toBeFocused();
});
});
