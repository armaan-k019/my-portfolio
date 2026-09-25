// Builder for the `site-plan` group and its eight nested groups.
// SPEC.md sections 9, 10, 11.
//
// The site plan is the one panel that draws several layers at once: buildings,
// streets, and water from `osm`, flood polygons from `flood`, contours from
// `topo`. OSM is the base drawing, so the group's status follows the `osm`
// envelope: with no OSM there is no figure ground and the panel is unavailable,
// while flood and topography simply contribute nothing when they failed.

import { FRAME_SIZE_M, SITE_RADIUS_M } from "../../constants";
import type {
  FloodData,
  FloodPolygon,
  LocalPoint,
  OsmBuilding,
  OsmData,
  TopoData,
} from "../../types";
import {
  SITE_PLAN_PT_PER_M,
  ZONES,
  planPx,
  r,
  siteProject,
  zoneCentre,
} from "../layout";
import { COLOURS, STROKE, TEXT, streetDash, streetStroke } from "../styles";
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

const GROUP_ID = "site-plan";
const TITLE = "Site plan";
const SUBTITLE_SCALE = "1 in = 200 ft (1:2400)";

const HALF_M = FRAME_SIZE_M / 2;
const HALF_PT = planPx(HALF_M);
const SITE_RING_PT = planPx(50);

/** The 800 m frame square in page points. */
function frameRect(): { x: number; y: number; size: number } {
  const { cx, cy } = zoneCentre(ZONES[GROUP_ID]);
  return { x: cx - HALF_PT, y: cy - HALF_PT, size: HALF_PT * 2 };
}

/** True when any vertex of a local polyline falls inside the 800 m frame. */
function touchesFrame(points: LocalPoint[]): boolean {
  for (const [x, y] of points) {
    if (Math.abs(x) <= HALF_M && Math.abs(y) <= HALF_M) return true;
  }
  return false;
}

/** A clipped nested group: the clip keeps every plan layer inside the frame. */
function clipped(id: string, children: string): string {
  return `<g id="${id}" clip-path="url(#clip-site-plan)">${children}${closeGroup}`;
}

function centroid(ring: LocalPoint[]): LocalPoint {
  let x = 0;
  let y = 0;
  for (const point of ring) {
    x += point[0];
    y += point[1];
  }
  return [x / ring.length, y / ring.length];
}

// ─── Nested layers ───────────────────────────────────────────────────────────

function waterGroup(osm: OsmData | null): string {
  if (!osm) return clipped("site-plan-water", "");
  const parts: string[] = [];
  for (const feature of osm.water) {
    if (feature.ring && feature.ring.length > 2 && touchesFrame(feature.ring)) {
      parts.push(
        localPath(
          feature.ring,
          siteProject,
          true,
          `fill="url(#water-hatch)" stroke="${COLOURS.darkblue}" stroke-width="${STROKE.water}"`,
        ),
      );
    } else if (feature.line && feature.line.length > 1 && touchesFrame(feature.line)) {
      parts.push(
        localPath(
          feature.line,
          siteProject,
          false,
          strokeAttrs(COLOURS.darkblue, STROKE.water),
        ),
      );
    }
  }
  return clipped("site-plan-water", parts.join(""));
}

function floodFill(polygon: FloodPolygon): { fill: string; stroke: number } {
  const zone = (polygon.zone ?? "").toUpperCase();
  if (zone.startsWith("V")) {
    return { fill: "url(#flood-ve)", stroke: STROKE.floodVe };
  }
  if (polygon.sfha || polygon.class === "sfha") {
    return { fill: "url(#flood-sfha)", stroke: STROKE.floodSfha };
  }
  if (polygon.class === "moderate") {
    return { fill: "url(#flood-02pct)", stroke: STROKE.flood02 };
  }
  return { fill: "none", stroke: STROKE.flood02 };
}

function floodGroup(flood: FloodData | null): string {
  if (!flood) return clipped("site-plan-flood", "");
  const parts: string[] = [];
  for (const polygon of flood.polygons) {
    const { fill, stroke } = floodFill(polygon);
    for (const ring of polygon.rings) {
      if (ring.length < 3) continue;
      parts.push(
        localPath(
          ring,
          siteProject,
          true,
          `fill="${fill}" stroke="${COLOURS.darkblue}" stroke-width="${stroke}"`,
        ),
      );
    }
  }
  return clipped("site-plan-flood", parts.join(""));
}

function contourGroup(topo: TopoData | null): string {
  if (!topo) return clipped("site-plan-contours", "");
  const parts: string[] = [];
  topo.contours.lines.forEach((polyline, index) => {
    if (polyline.length < 2) return;
    // Every fifth line is an index contour and draws heavier. The data carries
    // no elevation per line, so the index is by draw order; the interval is
    // printed in the annotations.
    const weight = index % 5 === 0 ? STROKE.contourIndex : STROKE.contour;
    parts.push(
      localPath(
        polyline,
        siteProject,
        false,
        strokeAttrs(COLOURS.brownLight, weight, null, 0.8),
      ),
    );
  });
  return clipped("site-plan-contours", parts.join(""));
}

function streetGroup(osm: OsmData | null): string {
  if (!osm) return clipped("site-plan-streets", "");
  const parts: string[] = [];
  for (const street of osm.streets) {
    // The site plan extent is the 400 m radius (SPEC section 3). A way that
    // never enters the frame belongs to the walk shed extent, not this one.
    if (street.line.length < 2 || !touchesFrame(street.line)) continue;
    parts.push(
      localPath(
        street.line,
        siteProject,
        false,
        strokeAttrs(
          COLOURS.brownLight,
          streetStroke(street.highway),
          streetDash(street.highway),
        ),
      ),
    );
  }
  return clipped("site-plan-streets", parts.join(""));
}

function buildingGroup(osm: OsmData | null): string {
  if (!osm) return clipped("site-plan-buildings", "");
  const parts: string[] = [];
  for (const building of osm.buildings) {
    if (building.ring.length < 3) continue;
    parts.push(
      localPath(building.ring, siteProject, true, `fill="${COLOURS.ink}" stroke="none"`),
    );
  }
  return clipped("site-plan-buildings", parts.join(""));
}

/** Heights print only where OSM carries a height tag. Nothing is estimated. */
function heightGroup(osm: OsmData | null): string {
  if (!osm) return clipped("site-plan-building-heights", "");
  const parts: string[] = [];
  for (const building of osm.buildings as OsmBuilding[]) {
    if (building.heightM === null || building.ring.length < 3) continue;
    const point = centroid(building.ring);
    if (Math.abs(point[0]) > HALF_M || Math.abs(point[1]) > HALF_M) continue;
    const [x, y] = siteProject(point);
    parts.push(
      textEl(`${building.heightM.toFixed(0)}m`, x, y, TEXT.small, {
        anchor: "middle",
        opacity: 0.9,
      }),
    );
  }
  return clipped("site-plan-building-heights", parts.join(""));
}

function markerGroup(): string {
  const { cx, cy } = zoneCentre(ZONES[GROUP_ID]);
  const parts = [
    circle(
      cx,
      cy,
      SITE_RING_PT,
      `fill="none" stroke="${COLOURS.terracotta}" stroke-width="${STROKE.siteMarker}"`,
    ),
    line(cx - 10, cy, cx + 10, cy, `stroke="${COLOURS.terracotta}" stroke-width="${STROKE.siteMarker}"`),
    line(cx, cy - 10, cx, cy + 10, `stroke="${COLOURS.terracotta}" stroke-width="${STROKE.siteMarker}"`),
    textEl("SITE, 50 M RING", cx + SITE_RING_PT + 5, cy - 3, TEXT.eyebrow, {
      letterSpacing: 0.8,
      uppercase: true,
    }),
  ];
  return clipped("site-plan-site-marker", parts.join(""));
}

// ─── Annotations: frame, scale bars, north arrow ──────────────────────────────

/**
 * An imperial scale bar. `data-tick-ft` is on every tick so the unit test can
 * assert that 200 ft is exactly 72 pt from the origin at 1 in = 200 ft.
 */
function scaleBar(
  x: number,
  y: number,
  ticksFt: number[],
  ticksM: number[],
): string {
  const parts: string[] = [];
  const ftToPt = (feet: number) => feet * 0.3048 * SITE_PLAN_PT_PER_M;
  const maxFt = ticksFt[ticksFt.length - 1];
  const barW = ftToPt(maxFt);

  parts.push(`<g data-scale="imperial" data-origin-x="${r(x)}">`);
  parts.push(
    rect(x, y, barW, 3, `fill="none" stroke="${COLOURS.ink}" stroke-width="0.5"`),
  );
  for (const feet of ticksFt) {
    const tx = x + ftToPt(feet);
    parts.push(
      `<line data-tick-ft="${feet}" x1="${r(tx)}" y1="${r(y)}" x2="${r(tx)}" y2="${r(y + 6)}" stroke="${COLOURS.ink}" stroke-width="0.5"/>`,
    );
    parts.push(
      textEl(String(feet), tx, y - 2, TEXT.eyebrow, {
        anchor: feet === 0 ? "start" : "middle",
        letterSpacing: 0.4,
      }),
    );
  }
  parts.push(textEl("FT", x + barW + 5, y + 4, TEXT.eyebrow, { letterSpacing: 0.8 }));
  parts.push(closeGroup);

  const mToPt = (metres: number) => planPx(metres);
  const metricW = mToPt(ticksM[ticksM.length - 1]);
  const my = y + 12;
  parts.push(`<g data-scale="metric" data-origin-x="${r(x)}">`);
  parts.push(
    rect(x, my, metricW, 3, `fill="none" stroke="${COLOURS.ink}" stroke-width="0.5"`),
  );
  for (const metres of ticksM) {
    const tx = x + mToPt(metres);
    parts.push(
      `<line data-tick-m="${metres}" x1="${r(tx)}" y1="${r(my)}" x2="${r(tx)}" y2="${r(my + 6)}" stroke="${COLOURS.ink}" stroke-width="0.5"/>`,
    );
    parts.push(
      textEl(String(metres), tx, my + 13, TEXT.eyebrow, {
        anchor: metres === 0 ? "start" : "middle",
        letterSpacing: 0.4,
      }),
    );
  }
  parts.push(textEl("M", x + metricW + 5, my + 4, TEXT.eyebrow, { letterSpacing: 0.8 }));
  parts.push(closeGroup);

  return parts.join("");
}

/** True north up, drawn with the shared marker. */
function northArrow(x: number, y: number, length: number): string {
  return (
    `<line x1="${r(x)}" y1="${r(y + length)}" x2="${r(x)}" y2="${r(y)}" ` +
    `stroke="${COLOURS.ink}" stroke-width="0.75" marker-end="url(#north-arrow)"/>` +
    textEl("N", x, y - 8, TEXT.eyebrow, { anchor: "middle", letterSpacing: 0.8 })
  );
}

function annotationGroup(
  osm: OsmData | null,
  topo: TopoData | null,
  flood: FloodData | null,
): string {
  const zone = ZONES[GROUP_ID];
  const frame = frameRect();
  const parts: string[] = [];

  parts.push(
    rect(
      frame.x,
      frame.y,
      frame.size,
      frame.size,
      `fill="none" stroke="${COLOURS.ink}" stroke-width="${STROKE.frame}"`,
    ),
  );
  parts.push(
    textEl(
      `${FRAME_SIZE_M} M FRAME, ${SITE_RADIUS_M} M RADIUS`,
      frame.x,
      frame.y - 4,
      TEXT.eyebrow,
      { letterSpacing: 1, uppercase: true },
    ),
  );
  parts.push(
    textEl(SUBTITLE_SCALE, frame.x + frame.size, frame.y - 4, TEXT.eyebrow, {
      anchor: "end",
      letterSpacing: 1,
      uppercase: true,
    }),
  );

  parts.push(northArrow(frame.x + frame.size - 22, frame.y + 16, 34));
  parts.push(scaleBar(frame.x, zone.y + zone.h - 22, [0, 200, 400, 800], [0, 100, 200]));

  // The footer states what is known and what is not, from the stats only.
  const footer: string[] = [];
  if (osm) {
    footer.push(
      `heights known for ${osm.stats.withHeight} of ${osm.stats.buildingCount} buildings; levels known for ${osm.stats.withLevels}`,
    );
  } else {
    footer.push("OpenStreetMap buildings and streets are unavailable");
  }
  if (topo) footer.push(`contours at ${topo.contours.intervalM} m`);
  else footer.push("contours unavailable");
  if (flood) footer.push(`${flood.polygons.length} FEMA flood polygons in frame`);
  else footer.push("FEMA flood polygons unavailable");

  parts.push(
    textEl(footer.join(".  "), frame.x + 260, zone.y + zone.h - 6, TEXT.small, {
      letterSpacing: 0.2,
    }),
  );

  return group("site-plan-annotations", undefined, parts.join(""));
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function build(ctx: SheetContext): string {
  const loading = ctx.loading ?? [];
  if (loading.includes("osm")) {
    return unavailable(GROUP_ID, TITLE, "", {
      status: "loading",
      sourceName: "OpenStreetMap",
    });
  }

  const osmEnvelope = ctx.layers.osm;
  const osm = (osmEnvelope?.data as OsmData | null) ?? null;
  const topo = (ctx.layers.topo?.data as TopoData | null) ?? null;
  const flood = (ctx.layers.flood?.data as FloodData | null) ?? null;

  const status = osm ? (osmEnvelope?.status ?? "ok") : "unavailable";

  const parts: string[] = [
    panelChrome(
      ZONES[GROUP_ID],
      TITLE,
      osmEnvelope?.source.name ?? "OpenStreetMap",
    ),
  ];

  if (!osm) {
    // Every nested id still exists, in order and exactly once, so the group
    // list a tracing application sees never changes (SPEC section 11).
    const reason =
      osmEnvelope?.unavailable?.message ??
      "OpenStreetMap data was not requested for this site, so there is no figure ground.";
    const zone = ZONES[GROUP_ID];
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
    );
    parts.push(
      textEl(
        "UNAVAILABLE",
        zone.x + 8 + stampW / 2,
        zone.y + PANEL_HEADER_H + 8 + stampH - 5.5,
        TEXT.stamp,
        { anchor: "middle", letterSpacing: 0.4 },
      ),
    );
    parts.push(
      bodyText(zone, reason, zone.x + 8, zone.y + PANEL_HEADER_H + 46, 420),
    );
  }

  parts.push(waterGroup(osm));
  parts.push(floodGroup(osm ? flood : null));
  parts.push(contourGroup(osm ? topo : null));
  parts.push(streetGroup(osm));
  parts.push(buildingGroup(osm));
  parts.push(heightGroup(osm));
  parts.push(markerGroup());
  parts.push(annotationGroup(osm, topo, flood));

  return group(GROUP_ID, status, parts.join(""));
}
