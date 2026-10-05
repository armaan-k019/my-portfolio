// The view on the sheet: what the viewer's window is showing of the paper.
// SPEC.md section 11.
//
// Pure geometry, so it is unit testable without a DOM. The component in
// src/app/projects/datum/panels/SheetViewer.tsx owns the pointers, the
// keyboard, and the full screen layer, and calls into here for every change to
// what is on screen.
//
// Erasable TypeScript only. Do not use the "@/" alias inside src/lib/datum.

/** The authored sheet, ARCH D at 72 units to the inch (SPEC section 11). */
export const SHEET_W = 2592;
export const SHEET_H = 1728;

/**
 * The zoom ceiling. The brief asks for at least 300 percent; 400 leaves room
 * above the 6 unit text without letting the sheet become a texture.
 */
export const MAX_SCALE = 4;

/** One keyboard pan step, in CSS pixels of the window, before the Shift key. */
export const PAN_STEP_PX = 60;

/** One keyboard or button zoom step. */
export const ZOOM_STEP = 1.25;

/**
 * The view. `scale` is CSS pixels per sheet unit, or null for fit to width,
 * which is recomputed from the window rather than stored so that resizing the
 * window, or opening full screen, keeps the sheet fitted. `x` and `y` are the
 * top left of the window in sheet units.
 */
export interface View {
  scale: number | null;
  x: number;
  y: number;
}

export const FIT: View = { scale: null, x: 0, y: 0 };

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function fitScaleFor(width: number): number {
  return width > 0 ? width / SHEET_W : 1;
}

/**
 * The floor is fit to width, so the sheet never shrinks inside its own window,
 * except that 100 percent stays reachable on a window wider than the sheet.
 */
export function minScaleFor(width: number): number {
  return Math.min(fitScaleFor(width), 1);
}

export function scaleOf(view: View, width: number): number {
  return view.scale ?? fitScaleFor(width);
}

/**
 * Hold the view inside the sheet: the visible rectangle never leaves the paper,
 * and an axis the window is larger than centres rather than drifting.
 */
export function clampView(view: View, width: number, height: number): View {
  if (width <= 0 || height <= 0) return view;
  const scale = clamp(scaleOf(view, width), minScaleFor(width), MAX_SCALE);
  const visibleW = width / scale;
  const visibleH = height / scale;
  return {
    scale: view.scale === null ? null : scale,
    x:
      visibleW >= SHEET_W
        ? (SHEET_W - visibleW) / 2
        : clamp(view.x, 0, SHEET_W - visibleW),
    y:
      visibleH >= SHEET_H
        ? (SHEET_H - visibleH) / 2
        : clamp(view.y, 0, SHEET_H - visibleH),
  };
}

/**
 * Zoom to `nextScale` about the window point (px, py), which is the whole of
 * the pointer as zoom origin rule: the sheet point under the pointer before the
 * zoom is the sheet point under it after.
 */
export function zoomAbout(
  unclamped: View,
  width: number,
  height: number,
  px: number,
  py: number,
  nextScale: number,
): View {
  const view = clampView(unclamped, width, height);
  const scale = scaleOf(view, width);
  const next = clamp(nextScale, minScaleFor(width), MAX_SCALE);
  const sheetX = view.x + px / scale;
  const sheetY = view.y + py / scale;
  return clampView(
    { scale: next, x: sheetX - px / next, y: sheetY - py / next },
    width,
    height,
  );
}

/** Pan by a window delta in CSS pixels. Fit to width survives a pan. */
export function panBy(
  unclamped: View,
  width: number,
  height: number,
  dx: number,
  dy: number,
): View {
  const view = clampView(unclamped, width, height);
  const scale = scaleOf(view, width);
  return clampView(
    { scale: view.scale, x: view.x - dx / scale, y: view.y - dy / scale },
    width,
    height,
  );
}
