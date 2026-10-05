// Builder for the `topography-section` group. SPEC.md sections 9, 10.
//
// Two sections through the site, east to west over north to south, with the
// vertical exaggeration printed because a 840 m span against a few metres of
// relief is unreadable at true scale.

import { GRID_SPACING_M } from "../../constants";
import type { TopoData } from "../../types";
import { ZONES, r } from "../layout";
import { COLOURS, STROKE, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  group,
  line,
  panelChrome,
  pathFrom,
  strokeAttrs,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "topography-section";
const TITLE = "Sections";

interface Profile {
  label: string;
  values: Array<number | null>;
}

function drawProfile(
  profile: Profile,
  x: number,
  y: number,
  width: number,
  height: number,
  min: number,
  span: number,
  spanM: number,
): string {
  const parts: string[] = [];
  const present = profile.values.filter((value): value is number => value !== null);

  parts.push(
    textEl(profile.label, x, y - 4, TEXT.eyebrow, {
      letterSpacing: 1,
      uppercase: true,
    }),
  );
  // The ground line and the two datum rules.
  parts.push(
    line(x, y + height, x + width, y + height, `stroke="${COLOURS.ink}" stroke-width="0.5"`),
    line(x, y, x + width, y, `stroke="${COLOURS.brownLight}" stroke-width="0.25" opacity="0.4"`),
  );

  if (present.length < 2) {
    parts.push(
      textEl("no samples on this section", x + 4, y + height / 2, TEXT.small),
    );
    return parts.join("");
  }

  const points: Array<[number, number]> = [];
  profile.values.forEach((value, index) => {
    if (value === null) return;
    const px = x + (index / (profile.values.length - 1)) * width;
    const py = y + height - ((value - min) / span) * height;
    points.push([px, py]);
  });
  parts.push(pathFrom(points, false, strokeAttrs(COLOURS.ink, 0.75)));

  // Site centre tick: the middle sample is the site point.
  const centreX = x + width / 2;
  parts.push(
    line(centreX, y, centreX, y + height, `stroke="${COLOURS.terracotta}" stroke-width="${STROKE.siteMarker}" stroke-dasharray="2,2"`),
  );

  parts.push(
    textEl(`${spanM} m`, x + width, y + height + 9, TEXT.eyebrow, {
      anchor: "end",
      letterSpacing: 0.6,
    }),
  );
  return parts.join("");
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const loading = ctx.loading ?? [];
  if (loading.includes("topo")) {
    return unavailable(GROUP_ID, TITLE, "", {
      status: "loading",
      sourceName: "USGS 3DEP",
    });
  }

  const envelope = ctx.layers.topo;
  const topo = (envelope?.data as TopoData | null) ?? null;
  if (!topo) {
    return unavailable(
      GROUP_ID,
      TITLE,
      envelope?.unavailable?.message ??
        "USGS 3DEP elevation was not requested for this site.",
      { sourceName: envelope?.source.name ?? "USGS 3DEP" },
    );
  }

  const values = [...topo.sections.ew, ...topo.sections.ns].filter(
    (value): value is number => value !== null,
  );
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = Math.max(max - min, 0.5);
  const spanM = (topo.grid.n - 1) * GRID_SPACING_M;

  const innerX = zone.x + 34;
  const innerW = zone.w - 48;
  const profileH = 62;
  const topY = zone.y + PANEL_HEADER_H + 22;

  const parts: string[] = [panelChrome(zone, TITLE, envelope?.source.name ?? null)];

  parts.push(
    drawProfile(
      { label: "Section A, east to west", values: topo.sections.ew },
      innerX,
      topY,
      innerW,
      profileH,
      min,
      span,
      spanM,
    ),
  );
  parts.push(
    drawProfile(
      { label: "Section B, north to south", values: topo.sections.ns },
      innerX,
      topY + profileH + 44,
      innerW,
      profileH,
      min,
      span,
      spanM,
    ),
  );

  // Vertical exaggeration: horizontal metres per point over vertical metres per
  // point, both computed from the drawn geometry.
  const hPerPt = spanM / innerW;
  const vPerPt = span / profileH;
  const exaggeration = hPerPt / vPerPt;

  const rows: string[] = [
    `Vertical exaggeration ${exaggeration.toFixed(1)} to 1`,
    `Site elevation ${topo.siteElevationM === null ? "not available" : `${topo.siteElevationM.toFixed(1)} m`}`,
    `Relief ${topo.reliefM === null ? "not available" : `${topo.reliefM.toFixed(1)} m`}`,
    `Mean slope ${topo.meanSlopePct === null ? "not available" : `${topo.meanSlopePct.toFixed(1)} percent`}`,
    `Downhill aspect ${topo.aspectDeg === null ? "not available" : `${topo.aspectDeg.toFixed(0)} degrees from north`}`,
    `Grid ${topo.grid.n} by ${topo.grid.n} at ${topo.grid.spacingM} m, contour interval ${topo.contours.intervalM} m`,
  ];
  let textY = zone.y + zone.h - 12 - (rows.length - 1) * 10;
  for (const row of rows) {
    parts.push(textEl(row, innerX, r(textY), TEXT.data, { letterSpacing: 0.2 }));
    textY += 10;
  }

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
