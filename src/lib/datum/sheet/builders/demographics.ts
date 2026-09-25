// Builder for the `demographics` group. SPEC.md sections 9, 10.
//
// A table of ACS estimates plus a small tract locator with the site marked.

import type { CensusData, LocalPoint } from "../../types";
import {
  TRACT_LOCATOR,
  TRACT_LOCATOR_PT_PER_M,
  ZONES,
  projectLocal,
} from "../layout";
import { COLOURS, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  circle,
  dataRow,
  group,
  line,
  localPath,
  panelChrome,
  rect,
  strokeAttrs,
  type SheetContext,
} from "../panel";
import { num, textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "demographics";
const TITLE = "Demographics";

/**
 * The tract at 1 in = 2000 ft (SPEC section 10). A tract larger than the box
 * runs past it, so the rings are clipped rather than allowed to cross the
 * panel; the box and its clipPath are declared together in layout.ts.
 */
function locator(rings: LocalPoint[][]): string {
  const box = TRACT_LOCATOR;
  const project = (point: LocalPoint) =>
    projectLocal(point, box, TRACT_LOCATOR_PT_PER_M);
  const parts: string[] = [
    rect(
      box.x,
      box.y,
      box.w,
      box.h,
      `fill="none" stroke="${COLOURS.ink}" stroke-width="0.25" opacity="0.5"`,
    ),
    '<g clip-path="url(#clip-tract-locator)">',
  ];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    parts.push(
      localPath(ring, project, true, strokeAttrs(COLOURS.brownLight, 0.5)),
    );
  }
  const [cx, cy] = project([0, 0]);
  parts.push(circle(cx, cy, 2.4, `fill="${COLOURS.terracotta}" stroke="none"`));
  parts.push("</g>");
  parts.push(
    textEl("TRACT, 1 IN = 2000 FT", box.x, box.y + box.h + 9, TEXT.eyebrow, {
      letterSpacing: 0.8,
      uppercase: true,
    }),
  );
  return parts.join("");
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const loading = ctx.loading ?? [];
  if (loading.includes("census")) {
    return unavailable(GROUP_ID, TITLE, "", {
      status: "loading",
      sourceName: "US Census ACS",
    });
  }

  const envelope = ctx.layers.census;
  const census = (envelope?.data as CensusData | null) ?? null;
  if (!census) {
    return unavailable(
      GROUP_ID,
      TITLE,
      envelope?.unavailable?.message ??
        "Census demographics were not requested for this site.",
      { sourceName: envelope?.source.name ?? "US Census ACS" },
    );
  }

  const parts: string[] = [panelChrome(zone, TITLE, envelope?.source.name ?? null)];
  const x = zone.x + 8;
  const tableW = 300;
  let y = zone.y + PANEL_HEADER_H + 16;

  parts.push(
    textEl(
      `Tract ${census.tract.geoid}${census.tract.name ? `, ${census.tract.name}` : ""}, ACS 5-year ${census.vintage}`,
      x,
      y,
      TEXT.eyebrow,
      { letterSpacing: 0.8, uppercase: true },
    ),
  );
  y += 14;

  const rows: Array<[string, string]> = [
    ["population", num(census.population)],
    ["density per km2", num(census.derived.densityPerKm2)],
    ["median age", num(census.medianAge, 1)],
    ["avg household size", num(census.avgHouseholdSize, 2)],
    ["households", num(census.householdsTotal)],
    ["renter share pct", num(census.derived.renterSharePct, 1)],
    ["car free commute pct", num(census.derived.carFreeCommutePct, 1)],
    ["worked from home", num(census.workedFromHome)],
    ["housing units", num(census.unitsTotal)],
    ["single detached", num(census.singleDetached)],
    ["5 plus unit share pct", num(census.derived.multifamily5plusSharePct, 1)],
    ["median household income", num(census.medianHouseholdIncome)],
    ["median gross rent", num(census.medianGrossRent)],
  ];

  for (const [key, value] of rows) {
    parts.push(dataRow(x, y, tableW, key, value));
    y += 11.5;
  }

  parts.push(
    line(
      x + tableW + 18,
      zone.y + PANEL_HEADER_H + 8,
      x + tableW + 18,
      zone.y + zone.h - 14,
      `stroke="${COLOURS.terracotta}" stroke-width="0.25" opacity="0.4"`,
    ),
  );

  if (census.geometry) {
    parts.push(locator(census.geometry.rings));
  } else {
    parts.push(
      textEl(
        "TRACT GEOMETRY UNAVAILABLE",
        x + tableW + 40,
        zone.y + PANEL_HEADER_H + 24,
        TEXT.eyebrow,
        { letterSpacing: 1, uppercase: true },
      ),
    );
  }

  if (envelope?.partial) {
    parts.push(
      textEl(
        `Suppressed or missing: ${envelope.partial.missing.slice(0, 6).join(", ")}`,
        x,
        zone.y + zone.h - 8,
        TEXT.small,
        { letterSpacing: 0.1 },
      ),
    );
  } else {
    parts.push(
      textEl(
        `Land area ${num(census.tract.areaLandM2)} m2. Margins of error are stored with the estimates.`,
        x,
        zone.y + zone.h - 8,
        TEXT.small,
        { letterSpacing: 0.1 },
      ),
    );
  }

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
