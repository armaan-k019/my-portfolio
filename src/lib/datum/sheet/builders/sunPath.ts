// Builder for the `sun-path` group. SPEC.md sections 9, 10.
//
// A stereographic sun path diagram, north up, with the 21 June and 21 December
// arcs, hour ticks, the site latitude, and the overhang ratio table. Everything
// is geometry from the sun layer; nothing about obstructions is implied.

import type { SunDay, SunData, SunSample } from "../../types";
import { ZONES, r, zoneCentre } from "../layout";
import { COLOURS, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  bodyText,
  circle,
  dataRow,
  group,
  line,
  panelChrome,
  pathFrom,
  strokeAttrs,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "sun-path";
const TITLE = "Sun path";

/** Stereographic sky projection: the horizon at the rim, the zenith at centre. */
function project(
  sample: { altitudeDeg: number; azimuthDeg: number },
  cx: number,
  cy: number,
  radius: number,
): [number, number] {
  const altitude = Math.max(0, Math.min(90, sample.altitudeDeg));
  const rr = radius * Math.tan((((90 - altitude) / 2) * Math.PI) / 180);
  const azimuth = (sample.azimuthDeg * Math.PI) / 180;
  return [cx + rr * Math.sin(azimuth), cy - rr * Math.cos(azimuth)];
}

function aboveHorizon(samples: SunSample[]): SunSample[] {
  return samples.filter((sample) => sample.altitudeDeg > 0);
}

function arc(
  day: SunDay,
  cx: number,
  cy: number,
  radius: number,
  weight: number,
  dash: string | null,
): string {
  const samples = aboveHorizon(day.samples);
  if (samples.length < 2) return "";
  const points = samples.map((sample) => project(sample, cx, cy, radius));
  return pathFrom(points, false, strokeAttrs(COLOURS.ink, weight, dash));
}

/** Hour ticks on the summer arc, labelled on the whole hour. */
function hourTicks(day: SunDay, cx: number, cy: number, radius: number): string {
  const parts: string[] = [];
  for (const sample of aboveHorizon(day.samples)) {
    if (!sample.timeLocal.endsWith(":00")) continue;
    const [x, y] = project(sample, cx, cy, radius);
    parts.push(circle(x, y, 1.1, `fill="${COLOURS.terracotta}" stroke="none"`));
    const hour = sample.timeLocal.slice(0, 2);
    parts.push(
      textEl(hour, x, y - 3.5, TEXT.small, { anchor: "middle", opacity: 0.85 }),
    );
  }
  return parts.join("");
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const loading = ctx.loading ?? [];
  if (loading.includes("sun")) {
    return unavailable(GROUP_ID, TITLE, "", { status: "loading", sourceName: "Computed, NOAA equations" });
  }

  const envelope = ctx.layers.sun;
  const sun = (envelope?.data as SunData | null) ?? null;
  if (!sun) {
    return unavailable(
      GROUP_ID,
      TITLE,
      envelope?.unavailable?.message ??
        "The sun path was not computed for this site.",
      { sourceName: envelope?.source.name ?? "Computed" },
    );
  }

  const parts: string[] = [panelChrome(zone, TITLE, envelope?.source.name ?? null)];

  // The zone is 4.75 in square: 342 pt, of which 26 pt is the header. The
  // diagram and the value table have to share what is left, so the radius is
  // sized to the space rather than the other way round.
  const { cx } = zoneCentre(zone);
  const radius = 88;
  const cy = zone.y + PANEL_HEADER_H + 8 + radius;

  // Horizon circle plus the 30 and 60 degree altitude circles.
  parts.push(
    circle(cx, cy, radius, `fill="none" stroke="${COLOURS.ink}" stroke-width="0.5"`),
  );
  for (const altitude of [30, 60]) {
    const rr = radius * Math.tan((((90 - altitude) / 2) * Math.PI) / 180);
    parts.push(
      circle(cx, cy, rr, `fill="none" stroke="${COLOURS.brownLight}" stroke-width="0.25" opacity="0.5"`),
    );
    parts.push(
      textEl(`${altitude}`, cx + 2, cy - rr - 2, TEXT.small, { opacity: 0.7 }),
    );
  }

  // Cardinal rays and labels.
  const cardinals: Array<[string, number]> = [
    ["N", 0],
    ["E", 90],
    ["S", 180],
    ["W", 270],
  ];
  for (const [label, azimuth] of cardinals) {
    const rad = (azimuth * Math.PI) / 180;
    parts.push(
      line(
        cx,
        cy,
        cx + radius * Math.sin(rad),
        cy - radius * Math.cos(rad),
        `stroke="${COLOURS.brownLight}" stroke-width="0.25" opacity="0.4"`,
      ),
    );
    parts.push(
      textEl(
        label,
        cx + (radius + 9) * Math.sin(rad),
        cy - (radius + 9) * Math.cos(rad) + 3,
        TEXT.eyebrow,
        { anchor: "middle", letterSpacing: 0.6 },
      ),
    );
  }

  parts.push(arc(sun.june, cx, cy, radius, 0.75, null));
  parts.push(arc(sun.march, cx, cy, radius, 0.35, "3,2"));
  parts.push(arc(sun.december, cx, cy, radius, 0.75, "1,2"));
  parts.push(hourTicks(sun.june, cx, cy, radius));

  // Key and values under the diagram.
  const x = zone.x + 8;
  const width = zone.w - 16;
  let y = cy + radius + 22;

  parts.push(
    textEl(
      `Latitude ${sun.latitude.toFixed(5)}, timezone ${sun.timezone} (${sun.timezoneSource})`,
      x,
      y,
      TEXT.eyebrow,
      { letterSpacing: 0.7, uppercase: true },
    ),
  );
  y += 13;

  const days: Array<[string, SunDay]> = [
    ["21 jun noon altitude", sun.june],
    ["21 mar noon altitude", sun.march],
    ["21 dec noon altitude", sun.december],
  ];
  for (const [label, day] of days) {
    parts.push(dataRow(x, y, width, label, `${day.noonAltitudeDeg.toFixed(1)} deg`));
    y += 11.5;
  }
  parts.push(
    dataRow(
      x,
      y,
      width,
      "21 jun sunrise, sunset",
      `${sun.june.sunriseLocal ?? "n/a"} to ${sun.june.sunsetLocal ?? "n/a"}`,
    ),
  );
  y += 11.5;
  parts.push(
    dataRow(
      x,
      y,
      width,
      "21 jun sunrise azimuth",
      sun.june.sunriseAzimuthDeg === null
        ? "not available"
        : `${sun.june.sunriseAzimuthDeg.toFixed(0)} deg`,
    ),
  );
  y += 11.5;
  const ratio = sun.overhangRatioSouthGlazing;
  parts.push(
    dataRow(
      x,
      y,
      width,
      "south overhang ratio",
      ratio === null ? "not available" : `1 to ${ratio.toFixed(2)}`,
    ),
  );
  parts.push(
    bodyText(
      zone,
      "Overhang projection over glazing height is 1 / tan(summer solstice noon altitude): geometry only, no site obstructions.",
      x,
      r(zone.y + zone.h - 16),
      width,
      6,
    ),
  );

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
