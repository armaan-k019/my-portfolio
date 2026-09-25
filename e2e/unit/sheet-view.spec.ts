// The viewer's geometry. SPEC.md section 11.
//
// The numbers here are the ones the defect was reported at: a 1014 by 676 CSS
// pixel window onto a 2592 by 1728 sheet, which is the 0.391 scale that set the
// 6 unit text at 2.3 px.

import { test, expect } from "@playwright/test";
import {
  FIT,
  MAX_SCALE,
  SHEET_H,
  SHEET_W,
  clampView,
  fitScaleFor,
  minScaleFor,
  panBy,
  scaleOf,
  zoomAbout,
} from "../../src/lib/datum/sheet/view";

/** The window the defect was measured in: a 1440 px viewport at 1440x900. */
const W = 1014;
const H = 676;

function viewBoxOf(view: { scale: number | null; x: number; y: number }, w = W, h = H) {
  const scale = scaleOf(view, w);
  return { x: view.x, y: view.y, w: w / scale, h: h / scale, scale };
}

test("fit to width is the reported 0.391 scale and shows the whole sheet", () => {
  const fit = fitScaleFor(W);
  expect(fit).toBeCloseTo(0.391, 3);

  const box = viewBoxOf(clampView(FIT, W, H));
  expect(box.w).toBeCloseTo(SHEET_W, 6);
  // The window is 3:2, the sheet is 3:2, so fitting the width fits the height.
  expect(box.h).toBeCloseTo(SHEET_H, 6);
  expect(box.x).toBeCloseTo(0, 6);
  expect(box.y).toBeCloseTo(0, 6);
});

test("100 percent is one sheet unit to one CSS pixel, where 6 unit text is 6 px", () => {
  const view = zoomAbout(FIT, W, H, W / 2, H / 2, 1);
  const box = viewBoxOf(view);
  expect(box.scale).toBe(1);
  // One CSS pixel of window per sheet unit means the window shows exactly as
  // many sheet units as it has pixels.
  expect(box.w).toBeCloseTo(W, 6);
  expect(box.h).toBeCloseTo(H, 6);
  // The 6 unit text the brief named renders at 6 px rather than 2.3 px.
  expect(6 * box.scale).toBe(6);
});

test("the zoom range runs from fit to width up to at least 300 percent", () => {
  expect(minScaleFor(W)).toBeCloseTo(fitScaleFor(W), 6);
  expect(MAX_SCALE).toBeGreaterThanOrEqual(3);

  // Below fit to width is refused: the sheet never shrinks inside its window.
  const tooFar = zoomAbout(FIT, W, H, W / 2, H / 2, 0.01);
  expect(scaleOf(tooFar, W)).toBeCloseTo(fitScaleFor(W), 6);

  // Above the ceiling is refused too.
  const tooClose = zoomAbout(FIT, W, H, W / 2, H / 2, 99);
  expect(scaleOf(tooClose, W)).toBe(MAX_SCALE);
});

test("100 percent stays reachable on a window wider than the sheet", () => {
  // A 3000 px window fits the width at 1.157, so a fit floor would put 100
  // percent out of range.
  const wide = 3000;
  expect(fitScaleFor(wide)).toBeGreaterThan(1);
  expect(minScaleFor(wide)).toBe(1);
  const view = zoomAbout(FIT, wide, 900, wide / 2, 450, 1);
  expect(scaleOf(view, wide)).toBe(1);
});

test("the pointer is the zoom origin: the sheet point under it does not move", () => {
  // A point well away from the centre, so an origin bug cannot pass by symmetry.
  const px = 812;
  const py = 143;
  const before = clampView(FIT, W, H);
  const scaleBefore = scaleOf(before, W);
  const sheetX = before.x + px / scaleBefore;
  const sheetY = before.y + py / scaleBefore;

  const after = zoomAbout(before, W, H, px, py, 2);
  const scaleAfter = scaleOf(after, W);
  expect(after.x + px / scaleAfter).toBeCloseTo(sheetX, 6);
  expect(after.y + py / scaleAfter).toBeCloseTo(sheetY, 6);
});

test("zooming in then back out about the same point returns the view", () => {
  const px = 300;
  const py = 500;
  const start = clampView(FIT, W, H);
  const zoomed = zoomAbout(start, W, H, px, py, 2.5);
  const back = zoomAbout(zoomed, W, H, px, py, scaleOf(start, W));
  expect(back.x).toBeCloseTo(start.x, 6);
  expect(back.y).toBeCloseTo(start.y, 6);
});

test("a pan moves the sheet under the window and keeps the fit mode", () => {
  const zoomed = zoomAbout(FIT, W, H, W / 2, H / 2, 2);
  const scale = scaleOf(zoomed, W);
  const panned = panBy(zoomed, W, H, -100, -40);
  // Dragging the sheet left by 100 px moves the window 100 px to the right.
  expect(panned.x).toBeCloseTo(zoomed.x + 100 / scale, 6);
  expect(panned.y).toBeCloseTo(zoomed.y + 40 / scale, 6);

  // At fit to width the view is still fitted after a pan, so the readout and
  // the Fit control do not disagree with what is on screen.
  const atFit = panBy(clampView(FIT, W, H), W, H, -100, -40);
  expect(atFit.scale).toBeNull();
});

test("the view never leaves the paper, however hard it is dragged", () => {
  const zoomed = zoomAbout(FIT, W, H, W / 2, H / 2, 3);
  for (const [dx, dy] of [
    [-100_000, -100_000],
    [100_000, 100_000],
    [0, -100_000],
    [-100_000, 0],
  ]) {
    const box = viewBoxOf(panBy(zoomed, W, H, dx, dy));
    expect(box.x).toBeGreaterThanOrEqual(-1e-6);
    expect(box.y).toBeGreaterThanOrEqual(-1e-6);
    expect(box.x + box.w).toBeLessThanOrEqual(SHEET_W + 1e-6);
    expect(box.y + box.h).toBeLessThanOrEqual(SHEET_H + 1e-6);
  }
});

test("an axis the window is larger than centres rather than drifting", () => {
  // A window twice as wide as it is tall at fit to width: the sheet is taller
  // than the window, so y pans, and x is pinned.
  const short = 338;
  const view = clampView(FIT, W, short);
  const box = viewBoxOf(view, W, short);
  expect(box.w).toBeCloseTo(SHEET_W, 6);
  expect(box.x).toBeCloseTo(0, 6);
  expect(box.h).toBeLessThan(SHEET_H);

  // Dragging up moves down the sheet and stops at its bottom edge.
  const bottom = viewBoxOf(panBy(view, W, short, 0, -100_000), W, short);
  expect(bottom.y + bottom.h).toBeCloseTo(SHEET_H, 6);
});

test("resizing the window reflows a fitted view instead of stranding it", () => {
  // The full screen layer is the case that matters: a 1014 px window becomes a
  // 1440 px one, and a fitted view fits the new width without a state change.
  const fitted = clampView(FIT, W, H);
  expect(fitted.scale).toBeNull();
  const wider = clampView(fitted, 1440, 960);
  expect(scaleOf(wider, 1440)).toBeCloseTo(1440 / SHEET_W, 6);
  expect(viewBoxOf(wider, 1440, 960).w).toBeCloseTo(SHEET_W, 6);
});

test("a view held at 300 percent survives the window shrinking", () => {
  const close = zoomAbout(FIT, W, H, W / 2, H / 2, 3);
  const narrow = clampView(close, 380, 253);
  expect(scaleOf(narrow, 380)).toBe(3);
  const box = viewBoxOf(narrow, 380, 253);
  expect(box.x).toBeGreaterThanOrEqual(-1e-6);
  expect(box.x + box.w).toBeLessThanOrEqual(SHEET_W + 1e-6);
});
