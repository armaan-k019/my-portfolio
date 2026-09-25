// Builder for the `climate` group. SPEC.md sections 9, 10.
//
// Twelve monthly columns: a temperature band from mean daily minimum to mean
// daily maximum, the relative humidity line over it, a radiation bar under it,
// and the degree days and comfort share printed. A month the archive left empty
// draws nothing and is marked, never a zero.

import type { ClimateData, ClimateMonth } from "../../types";
import { ZONES, r } from "../layout";
import { COLOURS, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  group,
  line,
  panelChrome,
  pathFrom,
  rect,
  strokeAttrs,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "climate";
const TITLE = "Climate and comfort";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function extent(months: ClimateMonth[]): { min: number; max: number } {
  const values: number[] = [];
  for (const month of months) {
    if (month.meanDailyMinC !== null) values.push(month.meanDailyMinC);
    if (month.meanDailyMaxC !== null) values.push(month.meanDailyMaxC);
  }
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min: Math.floor(min - 2), max: Math.ceil(max + 2) };
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

  const plotX = zone.x + 34;
  const plotW = zone.w - 200;
  const plotY = zone.y + PANEL_HEADER_H + 14;
  const bandH = 84;
  const radiationH = 26;
  const columnW = plotW / 12;

  const { min, max } = extent(climate.monthly);
  const span = Math.max(max - min, 1);
  const tempY = (celsius: number) => plotY + bandH - ((celsius - min) / span) * bandH;

  // Temperature axis: three labelled rules.
  for (let i = 0; i <= 2; i++) {
    const celsius = min + (span * i) / 2;
    const y = tempY(celsius);
    parts.push(
      line(plotX, y, plotX + plotW, y, `stroke="${COLOURS.brownLight}" stroke-width="0.2" opacity="0.4"`),
      textEl(`${celsius.toFixed(0)}C`, plotX - 4, y + 2.5, TEXT.small, { anchor: "end" }),
    );
  }

  const rhPoints: Array<[number, number]> = [];
  const maxRadiation = climate.monthly.reduce(
    (peak, month) => Math.max(peak, month.meanDailyRadiationKwhM2 ?? 0),
    0,
  );

  climate.monthly.forEach((month, index) => {
    const cx = plotX + columnW * (index + 0.5);
    parts.push(
      textEl(MONTHS[index], cx, plotY + bandH + 10, TEXT.eyebrow, {
        anchor: "middle",
        letterSpacing: 0.4,
      }),
    );

    if (month.meanDailyMinC !== null && month.meanDailyMaxC !== null) {
      const top = tempY(month.meanDailyMaxC);
      const bottom = tempY(month.meanDailyMinC);
      parts.push(
        rect(
          cx - columnW * 0.3,
          top,
          columnW * 0.6,
          Math.max(bottom - top, 0.5),
          `fill="${COLOURS.ink}" opacity="0.14" stroke="${COLOURS.ink}" stroke-width="0.25"`,
        ),
      );
    } else {
      parts.push(
        textEl("n/a", cx, plotY + bandH / 2, TEXT.small, { anchor: "middle" }),
      );
    }
    if (month.meanC !== null) {
      const y = tempY(month.meanC);
      parts.push(
        line(cx - columnW * 0.3, y, cx + columnW * 0.3, y, `stroke="${COLOURS.ink}" stroke-width="0.6"`),
      );
    }
    if (month.meanRhPct !== null) {
      rhPoints.push([cx, plotY + bandH - (month.meanRhPct / 100) * bandH]);
    }
    if (month.meanDailyRadiationKwhM2 !== null && maxRadiation > 0) {
      const h = (month.meanDailyRadiationKwhM2 / maxRadiation) * radiationH;
      parts.push(
        rect(
          cx - columnW * 0.22,
          plotY + bandH + 16 + (radiationH - h),
          columnW * 0.44,
          h,
          `fill="${COLOURS.terracotta}" opacity="0.55" stroke="none"`,
        ),
      );
    }
  });

  if (rhPoints.length > 1) {
    parts.push(pathFrom(rhPoints, false, strokeAttrs(COLOURS.darkblue, 0.5, "2,1.5")));
  }

  parts.push(
    textEl(
      `RADIATION, PEAK ${maxRadiation.toFixed(2)} KWH/M2 PER DAY`,
      plotX,
      plotY + bandH + 16 + radiationH + 9,
      TEXT.eyebrow,
      { letterSpacing: 0.7, uppercase: true },
    ),
  );
  parts.push(
    textEl(
      "Band: mean daily minimum to maximum. Tick: monthly mean. Dashed: relative humidity, 0 to 100 percent over the band height.",
      plotX,
      plotY + bandH + 16 + radiationH + 19,
      TEXT.small,
      { letterSpacing: 0.1 },
    ),
  );

  // The numbers column on the right.
  const nx = plotX + plotW + 22;
  let ny = plotY + 6;
  const rows: Array<[string, string]> = [
    [
      "hdd base 18.3 c",
      climate.degreeDays.hdd === null ? "not available" : climate.degreeDays.hdd.toFixed(0),
    ],
    [
      "cdd base 18.3 c",
      climate.degreeDays.cdd === null ? "not available" : climate.degreeDays.cdd.toFixed(0),
    ],
    [
      "comfort share",
      climate.comfortShare.pct === null
        ? "not available"
        : `${climate.comfortShare.pct.toFixed(1)} pct`,
    ],
    ["period", `${climate.period.start} to ${climate.period.end}`],
    ["years", String(climate.period.years)],
    ["timezone", climate.timezone],
  ];
  for (const [key, value] of rows) {
    parts.push(
      textEl(key, nx, r(ny), TEXT.eyebrow, { letterSpacing: 0.6, uppercase: true }),
      textEl(value, nx + 156, r(ny), TEXT.data, { anchor: "end" }),
    );
    ny += 12;
  }
  parts.push(
    textEl(climate.comfortShare.definition, nx, r(ny + 6), TEXT.small, {
      letterSpacing: 0.1,
    }),
  );
  parts.push(
    textEl(
      "Simple comfort band, not ASHRAE 55.",
      nx,
      r(ny + 16),
      TEXT.small,
      { letterSpacing: 0.1 },
    ),
  );

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
