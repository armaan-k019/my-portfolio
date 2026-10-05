// Builder for the `walk-shed` group and its six nested groups.
// SPEC.md sections 9, 10, 11.

import { WALK_RADIUS_M, WALK_SPEED_M_PER_MIN } from "../../constants";
import type { LocalPoint, OsmData, WalkshedData } from "../../types";
import {
  WALK_PLAN_PT_PER_M,
  ZONES,
  r,
  walkPx,
  walkProject,
  zoneCentre,
} from "../layout";
import { COLOURS, STROKE, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  bodyText,
  circle,
  closeGroup,
  group,
  line,
  localPath,
  panelChrome,
  rect,
  strokeAttrs,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "walk-shed";
const TITLE = "Walk shed";
const SCALE_LABEL = "1 in = 800 ft (1:9600)";

/** The fetch extent is a 1200 m radius, drawn as a 2400 m square. */
const HALF_M = WALK_RADIUS_M;
const HALF_PT = walkPx(HALF_M);

function clipped(id: string, children: string): string {
  return `<g id="${id}" clip-path="url(#clip-walk-shed)">${children}${closeGroup}`;
}

function touchesExtent(points: LocalPoint[]): boolean {
  for (const [x, y] of points) {
    if (Math.abs(x) <= HALF_M && Math.abs(y) <= HALF_M) return true;
  }
  return false;
}

function unreachedGroup(osm: OsmData | null): string {
  if (!osm) return clipped("walk-shed-streets-unreached", "");
  const parts: string[] = [];
  for (const street of osm.streets) {
    if (street.line.length < 2 || !touchesExtent(street.line)) continue;
    parts.push(
      localPath(
        street.line,
        walkProject,
        false,
        strokeAttrs(COLOURS.brownLight, STROKE.unreached, null, 0.35),
      ),
    );
  }
  return clipped("walk-shed-streets-unreached", parts.join(""));
}

function bandGroup(id: string, edges: LocalPoint[][] | undefined, weight: number): string {
  if (!edges) return clipped(id, "");
  const parts: string[] = [];
  for (const edge of edges) {
    if (edge.length < 2) continue;
    parts.push(
      localPath(edge, walkProject, false, strokeAttrs(COLOURS.terracotta, weight)),
    );
  }
  return clipped(id, parts.join(""));
}

function transitGroup(osm: OsmData | null): string {
  if (!osm) return clipped("walk-shed-transit", "");
  const parts: string[] = [];
  for (const stop of osm.transitStops) {
    if (Math.abs(stop.x) > HALF_M || Math.abs(stop.y) > HALF_M) continue;
    const [x, y] = walkProject([stop.x, stop.y]);
    if (stop.kind === "rail") {
      // Rail: a small square.
      parts.push(
        rect(x - 2.2, y - 2.2, 4.4, 4.4, `fill="${COLOURS.ink}" stroke="none"`),
      );
    } else {
      // Bus: a hollow circle.
      parts.push(
        circle(x, y, 1.8, `fill="none" stroke="${COLOURS.ink}" stroke-width="0.5"`),
      );
    }
  }
  return clipped("walk-shed-transit", parts.join(""));
}

function keyRow(x: number, y: number, weight: number, label: string): string {
  return (
    line(x, y, x + 18, y, strokeAttrs(COLOURS.terracotta, weight)) +
    textEl(label, x + 24, y + 2.5, TEXT.eyebrow, { letterSpacing: 0.6, uppercase: true })
  );
}

function annotationGroup(
  walkshed: WalkshedData | null,
  osm: OsmData | null,
): string {
  const zone = ZONES[GROUP_ID];
  const { cx, cy } = zoneCentre(zone);
  const parts: string[] = [];

  const frameX = cx - HALF_PT;
  const frameY = cy - HALF_PT;
  parts.push(
    rect(
      frameX,
      frameY,
      HALF_PT * 2,
      HALF_PT * 2,
      `fill="none" stroke="${COLOURS.ink}" stroke-width="${STROKE.frame}"`,
    ),
  );
  // The frame all but fills the zone, so the extent and scale labels sit on a
  // paper backing strip inside it rather than on paper that does not exist.
  parts.push(
    rect(
      frameX + 0.5,
      frameY + 0.5,
      HALF_PT * 2 - 1,
      14,
      `fill="${COLOURS.paper}" fill-opacity="0.92" stroke="none"`,
    ),
    textEl(`${WALK_RADIUS_M * 2} M EXTENT`, frameX + 6, frameY + 11, TEXT.eyebrow, {
      letterSpacing: 1,
      uppercase: true,
    }),
    textEl(SCALE_LABEL, frameX + HALF_PT * 2 - 6, frameY + 11, TEXT.eyebrow, {
      anchor: "end",
      letterSpacing: 1,
      uppercase: true,
    }),
  );

  // North arrow, true north up.
  parts.push(
    `<line x1="${r(frameX + HALF_PT * 2 - 20)}" y1="${r(frameY + 66)}" ` +
      `x2="${r(frameX + HALF_PT * 2 - 20)}" y2="${r(frameY + 34)}" ` +
      `stroke="${COLOURS.ink}" stroke-width="0.75" marker-end="url(#north-arrow)"/>`,
  );
  parts.push(
    textEl("N", frameX + HALF_PT * 2 - 20, frameY + 28, TEXT.eyebrow, {
      anchor: "middle",
      letterSpacing: 0.8,
    }),
  );

  // The 2.4 km extent is 9.84 in across in a 10 in zone, so there is no paper
  // outside the frame for a scale bar or a key. Both sit inside the frame on a
  // paper backing, which is the drafting convention for a legend on a plan.
  const legendW = 232;
  const legendH = 84;
  const legendX = frameX + 6;
  const legendY = frameY + HALF_PT * 2 - legendH - 6;
  parts.push(
    rect(
      legendX,
      legendY,
      legendW,
      legendH,
      `fill="${COLOURS.paper}" fill-opacity="0.92" stroke="${COLOURS.ink}" stroke-width="0.35"`,
    ),
  );

  // The 5, 10, 15 minute key and the reach numbers.
  let keyY = legendY + 12;
  for (const band of [5, 10, 15] as const) {
    const weight =
      band === 5 ? STROKE.walkShed5 : band === 10 ? STROKE.walkShed10 : STROKE.walkShed15;
    const reach = walkshed ? walkshed.reachKm[band] : null;
    const stops = walkshed ? walkshed.transitWithin[band] : null;
    const label =
      reach === null
        ? `${band} min`
        : `${band} min, ${reach.toFixed(1)} km, ${stops} transit`;
    parts.push(keyRow(legendX + 8, keyY, weight, label));
    keyY += 12;
  }

  // Imperial over metric scale bar (SPEC section 10).
  const barX = legendX + 8;
  const barY = keyY + 12;
  const ftToPt = (feet: number) => feet * 0.3048 * WALK_PLAN_PT_PER_M;
  parts.push(
    `<g data-scale="imperial" data-origin-x="${r(barX)}">`,
    rect(barX, barY, ftToPt(2000), 3, `fill="none" stroke="${COLOURS.ink}" stroke-width="0.5"`),
  );
  for (const feet of [0, 1000, 2000]) {
    const tx = barX + ftToPt(feet);
    parts.push(
      `<line data-tick-ft="${feet}" x1="${r(tx)}" y1="${r(barY)}" x2="${r(tx)}" y2="${r(barY + 5)}" stroke="${COLOURS.ink}" stroke-width="0.5"/>`,
      textEl(String(feet), tx, barY - 2, TEXT.eyebrow, {
        anchor: feet === 0 ? "start" : "middle",
        letterSpacing: 0.4,
      }),
    );
  }
  parts.push(textEl("FT", barX + ftToPt(2000) + 5, barY + 4, TEXT.eyebrow, { letterSpacing: 0.8 }));
  parts.push(closeGroup);

  const metricY = barY + 14;
  parts.push(
    `<g data-scale="metric" data-origin-x="${r(barX)}">`,
    rect(barX, metricY, walkPx(500), 3, `fill="none" stroke="${COLOURS.ink}" stroke-width="0.5"`),
  );
  for (const metres of [0, 500]) {
    const tx = barX + walkPx(metres);
    parts.push(
      `<line data-tick-m="${metres}" x1="${r(tx)}" y1="${r(metricY)}" x2="${r(tx)}" y2="${r(metricY + 5)}" stroke="${COLOURS.ink}" stroke-width="0.5"/>`,
      textEl(String(metres), tx, metricY + 11, TEXT.eyebrow, {
        anchor: metres === 0 ? "start" : "middle",
        letterSpacing: 0.4,
      }),
    );
  }
  parts.push(textEl("M", barX + walkPx(500) + 5, metricY + 4, TEXT.eyebrow, { letterSpacing: 0.8 }));
  parts.push(closeGroup);

  // The note sits on its own backing strip at the foot of the frame.
  const speed = walkshed ? walkshed.walkingSpeedMPerMin : WALK_SPEED_M_PER_MIN;
  const footer = walkshed
    ? `Walking speed ${speed} m per minute. Start node ${walkshed.startNodeOffsetM.toFixed(0)} m from the site point. Unreached streets in the fetch extent are faint.`
    : "Walk shed unavailable; the street network could not be built.";
  const noteX = legendX + legendW + 10;
  const noteW = frameX + HALF_PT * 2 - 6 - noteX;
  parts.push(
    rect(noteX, legendY + legendH - 24, noteW, 24, `fill="${COLOURS.paper}" fill-opacity="0.92" stroke="none"`),
    bodyText(zone, footer, noteX + 4, legendY + legendH - 14, noteW - 8, 6.5),
  );

  if (!osm) {
    parts.push(
      textEl(
        "STREET NETWORK UNAVAILABLE",
        frameX + 8,
        frameY + 30,
        TEXT.eyebrow,
        { letterSpacing: 1, uppercase: true },
      ),
    );
  }

  return group("walk-shed-annotations", undefined, parts.join(""));
}

export function build(ctx: SheetContext): string {
  const loading = ctx.loading ?? [];
  if (loading.includes("walkshed") || loading.includes("osm")) {
    return unavailable(GROUP_ID, TITLE, "", {
      status: "loading",
      sourceName: "OpenStreetMap",
    });
  }

  const envelope = ctx.layers.walkshed;
  const walkshed = (envelope?.data as WalkshedData | null) ?? null;
  const osm = (ctx.layers.osm?.data as OsmData | null) ?? null;
  const status = walkshed ? (envelope?.status ?? "ok") : "unavailable";

  // The plan fills the zone, so the panel title draws on a paper backing over
  // the drawing rather than on paper above it. It is pushed last, after the
  // drawing groups, so nothing covers it.
  const header = [
    rect(
      ZONES[GROUP_ID].x,
      ZONES[GROUP_ID].y,
      ZONES[GROUP_ID].w,
      24,
      `fill="${COLOURS.paper}" fill-opacity="0.94" stroke="none"`,
    ),
    panelChrome(
      ZONES[GROUP_ID],
      TITLE,
      envelope?.source.name ?? "OpenStreetMap",
    ),
  ].join("");

  const parts: string[] = [];

  if (!walkshed) {
    const zone = ZONES[GROUP_ID];
    const reason =
      envelope?.unavailable?.message ??
      "The walk shed was not requested for this site.";
    const stampW = 78;
    const stampH = 18;
    parts.push(
      rect(
        zone.x + 8,
        zone.y + PANEL_HEADER_H + 8,
        stampW,
        stampH,
        `fill="none" stroke="${COLOURS.terracotta}" stroke-width="${STROKE.unavailable}"`,
      ),
      textEl(
        "UNAVAILABLE",
        zone.x + 8 + stampW / 2,
        zone.y + PANEL_HEADER_H + 8 + stampH - 5.5,
        TEXT.stamp,
        { anchor: "middle", letterSpacing: 0.4 },
      ),
      bodyText(zone, reason, zone.x + 8, zone.y + PANEL_HEADER_H + 46, 400),
    );
  }

  parts.push(unreachedGroup(walkshed ? osm : null));
  parts.push(bandGroup("walk-shed-15", walkshed?.bands[15], STROKE.walkShed15));
  parts.push(bandGroup("walk-shed-10", walkshed?.bands[10], STROKE.walkShed10));
  parts.push(bandGroup("walk-shed-5", walkshed?.bands[5], STROKE.walkShed5));
  parts.push(transitGroup(walkshed ? osm : null));
  parts.push(annotationGroup(walkshed, osm));
  parts.push(header);

  return group(GROUP_ID, status, parts.join(""));
}
