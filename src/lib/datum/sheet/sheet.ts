// Assembles the sheet. SPEC.md sections 10 and 11.
//
// `buildSheetGroups` returns one string per top level group; the React panels
// render those strings into a single on screen <svg>. `buildSheet` joins the
// same strings into the exported document. One code path, so what is on screen
// is what is exported.

import { GROUP_ORDER, PAGE_H, PAGE_W, TRACT_LOCATOR, ZONES } from "./layout";
import { COLOURS, buildDefs } from "./styles";
import { rect, type SheetContext } from "./panel";
import { escapeXml } from "./text";
import { build as buildAttribution } from "./builders/attribution";
import { build as buildBrief } from "./builders/brief";
import { build as buildClimate } from "./builders/climate";
import { build as buildDataAvailability } from "./builders/dataAvailability";
import { build as buildDemographics } from "./builders/demographics";
import { build as buildFloodSummary } from "./builders/floodSummary";
import { build as buildFrame } from "./builders/frame";
import { build as buildSeismic } from "./builders/seismic";
import { build as buildSitePlan } from "./builders/sitePlan";
import { build as buildSoil } from "./builders/soil";
import { build as buildSunPath } from "./builders/sunPath";
import { build as buildTitleBlock } from "./builders/titleBlock";
import { build as buildTopographySection } from "./builders/topographySection";
import { build as buildWalkShed } from "./builders/walkShed";
import { build as buildWindRose } from "./builders/windRose";

export type { SheetContext, SheetBrief, SheetLayers, SheetSite } from "./panel";

/** The background rectangle. It sits before every group (SPEC section 11). */
export function buildPaper(): string {
  return rect(0, 0, PAGE_W, PAGE_H, `id="paper" fill="${COLOURS.paper}"`);
}

/** The `<defs>` block with the four hatches, two clip paths, and the marker. */
export function buildSheetDefs(): string {
  const sitePlan = ZONES["site-plan"];
  const walkShed = ZONES["walk-shed"];
  return buildDefs([
    { id: "clip-site-plan", x: sitePlan.x, y: sitePlan.y, w: sitePlan.w, h: sitePlan.h },
    { id: "clip-walk-shed", x: walkShed.x, y: walkShed.y, w: walkShed.w, h: walkShed.h },
    {
      id: "clip-tract-locator",
      x: TRACT_LOCATOR.x,
      y: TRACT_LOCATOR.y,
      w: TRACT_LOCATOR.w,
      h: TRACT_LOCATOR.h,
    },
  ]);
}

/**
 * Every top level group, keyed by id. The keys are exactly `GROUP_ORDER`, in
 * that order, whatever the layers did: an unavailable layer still gets its
 * group, carrying the framed unavailable panel (SPEC section 11).
 */
export function buildSheetGroups(ctx: SheetContext): Record<string, string> {
  const groups: Record<string, string> = {
    "sheet-frame": buildFrame(null, ctx),
    "site-plan": buildSitePlan(ctx),
    "walk-shed": buildWalkShed(ctx),
    "topography-section": buildTopographySection(ctx),
    soil: buildSoil(ctx),
    demographics: buildDemographics(ctx),
    seismic: buildSeismic(ctx),
    "flood-summary": buildFloodSummary(ctx),
    "sun-path": buildSunPath(ctx),
    "wind-rose": buildWindRose(ctx),
    climate: buildClimate(ctx),
    brief: buildBrief(ctx),
    "data-availability": buildDataAvailability(ctx),
    "title-block": buildTitleBlock(ctx),
    attribution: buildAttribution(ctx),
  };
  return groups;
}

/**
 * The full document. `ctx.loading` must be empty here: a loading panel is an on
 * screen state and never belongs in a file (PHASE-2 step 2.4).
 */
export function buildSheet(ctx: SheetContext): string {
  const groups = buildSheetGroups({ ...ctx, loading: [] });
  const title = ctx.site.locality
    ? `Datum site analysis: ${ctx.site.locality}`
    : "Datum site analysis";
  const desc =
    `Generated ${ctx.generatedAt}. Sources listed in the attribution group. ` +
    `Coordinates ${ctx.site.lat.toFixed(5)}, ${ctx.site.lng.toFixed(5)}.`;

  const body = GROUP_ORDER.map((id) => groups[id]).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="36in" height="24in" ` +
    `viewBox="0 0 ${PAGE_W} ${PAGE_H}">` +
    `<title>${escapeXml(title)}</title>` +
    `<desc>${escapeXml(desc)}</desc>` +
    buildSheetDefs() +
    buildPaper() +
    body +
    `</svg>`
  );
}

/** The exported file name (SPEC section 11). */
export function sheetFileName(
  lat: number,
  lng: number,
  generatedAt: string,
): string {
  const day = generatedAt.slice(0, 10).replace(/-/g, "");
  return `datum-site-${lat.toFixed(5)}_${lng.toFixed(5)}-${day}.svg`;
}

/** The export string with an XML declaration, ready for a Blob. */
export function sheetDocument(ctx: SheetContext): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${buildSheet(ctx)}`;
}
