// Builder for the `wind-rose` group. SPEC.md sections 9, 10.
//
// The annual rose large at the top of the zone, summer and winter as two small
// roses beneath it, all inside the zone rectangle. Each sector is drawn as a
// stack of wedge segments, one per speed bin, so the bins read as rings.

import type { ClimateData, WindRose } from "../../types";
import { ZONES, r, zoneCentre } from "../layout";
import { COLOURS, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  circle,
  dataRow,
  group,
  line,
  panelChrome,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "wind-rose";
const TITLE = "Wind";

const SECTOR_WIDTH_DEG = 22.5;

/** A wedge annulus between two radii across one 22.5 degree sector. */
function wedge(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  centreDeg: number,
  fillOpacity: number,
): string {
  const half = (SECTOR_WIDTH_DEG / 2) * 0.86;
  const a0 = ((centreDeg - half) * Math.PI) / 180;
  const a1 = ((centreDeg + half) * Math.PI) / 180;
  const point = (radius: number, angle: number): [number, number] => [
    cx + radius * Math.sin(angle),
    cy - radius * Math.cos(angle),
  ];
  const [x0, y0] = point(inner, a0);
  const [x1, y1] = point(outer, a0);
  const [x2, y2] = point(outer, a1);
  const [x3, y3] = point(inner, a1);
  const d =
    `M${r(x0)} ${r(y0)} L${r(x1)} ${r(y1)} ` +
    `A${r(outer)} ${r(outer)} 0 0 1 ${r(x2)} ${r(y2)} ` +
    `L${r(x3)} ${r(y3)} ` +
    (inner > 0 ? `A${r(inner)} ${r(inner)} 0 0 0 ${r(x0)} ${r(y0)} ` : "") +
    "Z";
  return (
    `<path d="${d}" fill="${COLOURS.terracotta}" fill-opacity="${r(fillOpacity)}" ` +
    `stroke="${COLOURS.terracotta}" stroke-width="0.2"/>`
  );
}

/**
 * Bin fill opacity rises with speed, so the outer bins read heavier. It is a
 * `fill-opacity` attribute rather than an eight digit #RRGGBBAA fill: Illustrator
 * and Rhino both reject the alpha form, and a fill they cannot parse is a wind
 * rose that arrives as an empty outline in the one application the export exists
 * for.
 */
function binOpacity(index: number, bins: number): number {
  return 0.18 + (0.72 * (index + 1)) / bins;
}

function rose(
  data: WindRose,
  cx: number,
  cy: number,
  radius: number,
  label: string,
): string {
  const parts: string[] = [];
  parts.push(
    circle(cx, cy, radius, `fill="none" stroke="${COLOURS.ink}" stroke-width="0.35"`),
  );
  for (const fraction of [0.5]) {
    parts.push(
      circle(cx, cy, radius * fraction, `fill="none" stroke="${COLOURS.brownLight}" stroke-width="0.2" opacity="0.5"`),
    );
  }
  for (const azimuth of [0, 90, 180, 270]) {
    const rad = (azimuth * Math.PI) / 180;
    parts.push(
      line(
        cx,
        cy,
        cx + radius * Math.sin(rad),
        cy - radius * Math.cos(rad),
        `stroke="${COLOURS.brownLight}" stroke-width="0.2" opacity="0.4"`,
      ),
    );
  }

  const maxFrequency = data.sectors.reduce(
    (peak, sector) => Math.max(peak, sector.frequencyPct),
    0,
  );
  if (maxFrequency > 0) {
    for (const sector of data.sectors) {
      let inner = 0;
      const bins = sector.binsPct.length;
      sector.binsPct.forEach((share, index) => {
        if (share <= 0) return;
        const outer = inner + (share / maxFrequency) * radius;
        parts.push(
          wedge(cx, cy, inner, outer, sector.sectorDeg, binOpacity(index, bins)),
        );
        inner = outer;
      });
    }
  } else {
    parts.push(
      textEl("no wind hours", cx, cy, TEXT.small, { anchor: "middle" }),
    );
  }

  parts.push(
    textEl("N", cx, cy - radius - 4, TEXT.eyebrow, {
      anchor: "middle",
      letterSpacing: 0.6,
    }),
  );
  parts.push(
    textEl(label, cx, cy + radius + 11, TEXT.eyebrow, {
      anchor: "middle",
      letterSpacing: 0.9,
      uppercase: true,
    }),
  );
  if (maxFrequency > 0) {
    parts.push(
      textEl(`peak ${maxFrequency.toFixed(1)} pct`, cx, cy + radius + 20, TEXT.small, {
        anchor: "middle",
      }),
    );
  }
  return parts.join("");
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const loading = ctx.loading ?? [];
  if (loading.includes("climate")) {
    return unavailable(GROUP_ID, TITLE, "", { status: "loading", sourceName: "Open-Meteo ERA5" });
  }

  const envelope = ctx.layers.climate;
  const climate = (envelope?.data as ClimateData | null) ?? null;
  if (!climate) {
    return unavailable(
      GROUP_ID,
      TITLE,
      envelope?.unavailable?.message ??
        "The Open-Meteo climate archive was not requested for this site.",
      { sourceName: envelope?.source.name ?? "Open-Meteo ERA5" },
    );
  }

  const parts: string[] = [panelChrome(zone, TITLE, envelope?.source.name ?? null)];
  const { cx } = zoneCentre(zone);

  // The zone is 4.75 in square: 342 pt less the 26 pt header. The annual rose,
  // the two seasonal roses, and the value table are sized to share it.
  const annualR = 62;
  const annualCy = zone.y + PANEL_HEADER_H + 10 + annualR;
  parts.push(rose(climate.wind.annual, cx, annualCy, annualR, "annual"));

  const smallR = 30;
  const smallCy = annualCy + annualR + 30 + smallR;
  parts.push(rose(climate.wind.summer, zone.x + 8 + smallR + 24, smallCy, smallR, "summer, jun to aug"));
  parts.push(rose(climate.wind.winter, zone.x + zone.w - 8 - smallR - 24, smallCy, smallR, "winter, dec to feb"));

  const x = zone.x + 8;
  const width = zone.w - 16;
  let y = smallCy + smallR + 34;
  const annual = climate.wind.annual;
  const rows: Array<[string, string]> = [
    [
      "prevailing sector",
      annual.prevailingSectorDeg === null
        ? "not available"
        : `${annual.prevailingSectorDeg.toFixed(1)} deg from north`,
    ],
    [
      "mean speed",
      annual.meanSpeedMs === null ? "not available" : `${annual.meanSpeedMs.toFixed(2)} m/s`,
    ],
    [
      "calm share",
      annual.calmSharePct === null ? "not available" : `${annual.calmSharePct.toFixed(1)} pct`,
    ],
    [
      "resultant length",
      annual.resultantLength === null ? "not available" : annual.resultantLength.toFixed(3),
    ],
  ];
  for (const [key, value] of rows) {
    parts.push(dataRow(x, y, width, key, value));
    y += 11.5;
  }
  parts.push(
    textEl(
      `Bins m/s: ${annual.binEdgesMs
        .map((edge) => (Number.isFinite(edge) ? edge : "over"))
        .join(", ")}. Calm under 0.5 m/s. ERA5 ${climate.period.start} to ${climate.period.end}.`,
      x,
      zone.y + zone.h - 8,
      TEXT.small,
      { letterSpacing: 0.1 },
    ),
  );

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
