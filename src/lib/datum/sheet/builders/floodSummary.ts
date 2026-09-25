// Builder for the `flood-summary` group. SPEC.md sections 9, 10.
//
// The flood at the point, plus the legend for the zone codes present in the
// site plan. The FEMA no coverage answer routes to the unavailable panel with
// the verbatim message, because "no published layer" is an answer, not a blank.

import type { FloodData } from "../../types";
import { ZONES } from "../layout";
import { COLOURS, STROKE, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  bodyText,
  dataRow,
  group,
  panelChrome,
  rect,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "flood-summary";
const TITLE = "Flood";

const CLASS_LABEL: Record<string, string> = {
  sfha: "Special flood hazard area, 1 percent annual chance",
  moderate: "Moderate, 0.2 percent annual chance",
  minimal: "Minimal flood hazard",
  undetermined: "Undetermined (zone D)",
  other: "Reported zone, no risk label assigned",
};

function legendSwatch(
  x: number,
  y: number,
  fill: string,
  label: string,
): string {
  return (
    rect(x, y, 16, 9, `fill="${fill}" stroke="${COLOURS.darkblue}" stroke-width="${STROKE.flood02}"`) +
    textEl(label, x + 22, y + 7, TEXT.small, { letterSpacing: 0.1 })
  );
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const loading = ctx.loading ?? [];
  if (loading.includes("flood")) {
    return unavailable(GROUP_ID, TITLE, "", { status: "loading", sourceName: "FEMA NFHL" });
  }

  const envelope = ctx.layers.flood;
  const flood = (envelope?.data as FloodData | null) ?? null;
  if (!flood || !flood.atPoint) {
    return unavailable(
      GROUP_ID,
      TITLE,
      envelope?.unavailable?.message ??
        "FEMA flood data was not requested for this site.",
      { sourceName: envelope?.source.name ?? "FEMA NFHL" },
    );
  }

  const parts: string[] = [panelChrome(zone, TITLE, envelope?.source.name ?? null)];
  const x = zone.x + 8;
  const width = zone.w - 16;
  let y = zone.y + PANEL_HEADER_H + 16;

  parts.push(
    textEl(`Zone ${flood.atPoint.zone ?? "not given"}`, x, y + 6, TEXT.title, {
      weight: "600",
    }),
  );
  y += 24;

  parts.push(
    bodyText(zone, CLASS_LABEL[flood.atPoint.class] ?? flood.atPoint.class, x, y, width, 7),
  );
  y += 18;

  const rows: Array<[string, string]> = [
    ["zone subtype", flood.atPoint.subtype ?? "none given"],
    ["sfha", flood.atPoint.sfha ? "yes" : "no"],
    [
      "static bfe",
      flood.atPoint.staticBfeFt === null
        ? "no static base flood elevation"
        : `${flood.atPoint.staticBfeFt.toFixed(1)} ft`,
    ],
    ["polygons in frame", String(flood.polygons.length)],
  ];
  for (const [key, value] of rows) {
    parts.push(dataRow(x, y, width, key, value));
    y += 12;
  }

  // Legend: only the codes actually present in the frame.
  const zones = [...new Set(flood.polygons.map((polygon) => polygon.zone ?? "unnamed"))];
  y += 10;
  parts.push(
    textEl(
      zones.length > 0 ? `Zone codes in frame: ${zones.join(", ")}` : "No flood polygons in the 800 m frame",
      x,
      y,
      TEXT.eyebrow,
      { letterSpacing: 0.7, uppercase: true },
    ),
  );
  y += 12;

  const hasSfha = flood.polygons.some((polygon) => polygon.sfha && !(polygon.zone ?? "").toUpperCase().startsWith("V"));
  const hasVe = flood.polygons.some((polygon) => (polygon.zone ?? "").toUpperCase().startsWith("V"));
  const hasModerate = flood.polygons.some((polygon) => polygon.class === "moderate");

  if (hasSfha) {
    parts.push(legendSwatch(x, y, "url(#flood-sfha)", "SFHA, dense hatch"));
    y += 13;
  }
  if (hasVe) {
    parts.push(legendSwatch(x, y, "url(#flood-ve)", "VE coastal, cross hatch"));
    y += 13;
  }
  if (hasModerate) {
    parts.push(legendSwatch(x, y, "url(#flood-02pct)", "0.2 percent, sparse hatch"));
    y += 13;
  }

  parts.push(
    bodyText(
      zone,
      "Classified from the FEMA fields FLD_ZONE, ZONE_SUBTY, SFHA_TF, and STATIC_BFE. Verify the effective map at msc.fema.gov before setting a finished floor elevation.",
      x,
      zone.y + zone.h - 34,
      width,
      6.5,
    ),
  );

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
