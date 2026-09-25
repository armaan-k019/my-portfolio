// Sheet geometry. SPEC.md section 10.
//
// ARCH D landscape, 36 in by 24 in, 72 user units per inch, so one user unit is
// one point and Illustrator opens the export at true size. Every number here is
// in points unless its name says otherwise.
//
// Erasable TypeScript only: no enum, no parameter properties, no namespaces.
// Do not use the "@/" alias inside src/lib/datum.

import type { LocalPoint } from "../types";

/** Points per inch. The viewBox is expressed in these units. */
export const PT_PER_IN = 72;

export const PAGE_W_IN = 36;
export const PAGE_H_IN = 24;
export const PAGE_W = PAGE_W_IN * PT_PER_IN;
export const PAGE_H = PAGE_H_IN * PT_PER_IN;
export const MARGIN_IN = 0.5;
export const MARGIN = MARGIN_IN * PT_PER_IN;

/** Metres in one foot, and in 200 and 800 feet, for the two plan scales. */
const M_PER_FT = 0.3048;
/** 1 in = 200 ft on the site plan. */
export const SITE_PLAN_M_PER_IN = 200 * M_PER_FT;
/** 1 in = 800 ft on the walk shed plan. */
export const WALK_PLAN_M_PER_IN = 800 * M_PER_FT;

export interface Zone {
  id: string;
  /** Points from the left edge of the page. */
  x: number;
  /** Points from the top edge of the page. */
  y: number;
  w: number;
  h: number;
}

function inches(id: string, x: number, y: number, w: number, h: number): Zone {
  return {
    id,
    x: x * PT_PER_IN,
    y: y * PT_PER_IN,
    w: w * PT_PER_IN,
    h: h * PT_PER_IN,
  };
}

/**
 * One zone per top level group that occupies paper. `sheet-frame` is the page
 * itself and carries no zone; every other group in SPEC section 11 has one.
 *
 * SPEC section 10 groups some zones in pairs (A2 holds the sections and the
 * soil card, B3 the seismic values and the flood summary, C4 the brief and the
 * availability table, T the title block and the attribution line). Each half
 * gets its own rectangle here so the non overlap test is meaningful and each
 * builder can draw inside its own box.
 */
export const ZONES: Record<string, Zone> = {
  // Column A: 14 in wide from the left margin.
  "site-plan": inches("site-plan", 0.5, 0.5, 14, 14),
  "topography-section": inches("topography-section", 0.5, 15, 9.5, 7),
  soil: inches("soil", 10.25, 15, 4.25, 7),

  // Column B: 10 in wide starting at 15 in.
  "walk-shed": inches("walk-shed", 15, 0.5, 10, 10),
  demographics: inches("demographics", 15, 11, 10, 5),
  seismic: inches("seismic", 15, 16.5, 4.875, 5.5),
  "flood-summary": inches("flood-summary", 20.125, 16.5, 4.875, 5.5),

  // Column C: 10 in wide starting at 25.5 in, split into two 4.75 in squares
  // at the top for the sun path and the wind rose.
  "sun-path": inches("sun-path", 25.5, 0.5, 4.75, 4.75),
  "wind-rose": inches("wind-rose", 30.75, 0.5, 4.75, 4.75),
  climate: inches("climate", 25.5, 5.75, 10, 3.25),
  brief: inches("brief", 25.5, 9.5, 10, 8.25),
  "data-availability": inches("data-availability", 25.5, 18, 10, 4),

  // Title block band across the foot of the sheet.
  "title-block": inches("title-block", 0.5, 22, 35, 1.05),
  attribution: inches("attribution", 0.5, 23.05, 35, 0.45),
};

/**
 * Top level group ids in the exact order SPEC section 11 lists them. The unit
 * tests and the e2e export check assert this list, so it is the contract.
 */
export const GROUP_ORDER: string[] = [
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

/** Nested group ids inside `site-plan`, in draw order (SPEC section 11). */
export const SITE_PLAN_SUBGROUPS: string[] = [
  "site-plan-water",
  "site-plan-flood",
  "site-plan-contours",
  "site-plan-streets",
  "site-plan-buildings",
  "site-plan-building-heights",
  "site-plan-site-marker",
  "site-plan-annotations",
];

/** Nested group ids inside `walk-shed`, in draw order (SPEC section 11). */
export const WALK_SHED_SUBGROUPS: string[] = [
  "walk-shed-streets-unreached",
  "walk-shed-15",
  "walk-shed-10",
  "walk-shed-5",
  "walk-shed-transit",
  "walk-shed-annotations",
];

// ─── Projection (SPEC section 10) ────────────────────────────────────────────

/** Points per metre on the site plan. */
export const SITE_PLAN_PT_PER_M = PT_PER_IN / SITE_PLAN_M_PER_IN;
/** Points per metre on the walk shed plan. */
export const WALK_PLAN_PT_PER_M = PT_PER_IN / WALK_PLAN_M_PER_IN;

/** Metres east or north converted to points at the site plan scale. */
export function planPx(metres: number): number {
  return metres * SITE_PLAN_PT_PER_M;
}

/** Metres east or north converted to points at the walk shed scale. */
export function walkPx(metres: number): number {
  return metres * WALK_PLAN_PT_PER_M;
}

/** The centre of a zone, in page points. */
export function zoneCentre(zone: Zone): { cx: number; cy: number } {
  return { cx: zone.x + zone.w / 2, cy: zone.y + zone.h / 2 };
}

/**
 * Project a local metre point (east, north) into page points inside a plan
 * zone. North is up on the sheet, so the northing is negated.
 */
export function projectLocal(
  point: LocalPoint,
  zone: Zone,
  ptPerM: number,
): [number, number] {
  const { cx, cy } = zoneCentre(zone);
  return [cx + point[0] * ptPerM, cy - point[1] * ptPerM];
}

/** The site plan projection, bound to its zone. */
export function siteProject(point: LocalPoint): [number, number] {
  return projectLocal(point, ZONES["site-plan"], SITE_PLAN_PT_PER_M);
}

/** The walk shed projection, bound to its zone. */
export function walkProject(point: LocalPoint): [number, number] {
  return projectLocal(point, ZONES["walk-shed"], WALK_PLAN_PT_PER_M);
}

/** Two rectangles overlap when they share interior area. */
export function zonesOverlap(a: Zone, b: Zone): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** True when the zone lies wholly inside the page. */
export function zoneInsidePage(zone: Zone): boolean {
  return (
    zone.x >= 0 &&
    zone.y >= 0 &&
    zone.x + zone.w <= PAGE_W &&
    zone.y + zone.h <= PAGE_H
  );
}

/** Round to 2 decimals so the SVG string stays compact and stable. */
export function r(value: number): number {
  return Math.round(value * 100) / 100;
}
