// Builder for the `soil` group. SPEC.md sections 9, 10.

import type { SoilData } from "../../types";
import { ZONES } from "../layout";
import { TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  bodyText,
  dataRow,
  group,
  line,
  panelChrome,
  type SheetContext,
} from "../panel";
import { COLOURS } from "../styles";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "soil";
const TITLE = "Soil";

/**
 * SPEC section 9: "Urban land" is a valid answer and the sheet says what it
 * means rather than leaving a blank hydrologic group unexplained.
 */
const URBAN_LAND_NOTE =
  "SSURGO maps this as Urban land: the natural profile is disturbed or covered and no hydrologic group is assigned.";

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const loading = ctx.loading ?? [];
  if (loading.includes("soil")) {
    return unavailable(GROUP_ID, TITLE, "", { status: "loading", sourceName: "USDA SSURGO" });
  }

  const envelope = ctx.layers.soil;
  const soil = (envelope?.data as SoilData | null) ?? null;
  if (!soil) {
    return unavailable(
      GROUP_ID,
      TITLE,
      envelope?.unavailable?.message ??
        "The USDA soil survey was not requested for this site.",
      { sourceName: envelope?.source.name ?? "USDA SSURGO" },
    );
  }

  const parts: string[] = [panelChrome(zone, TITLE, envelope?.source.name ?? null)];
  const x = zone.x + 8;
  const width = zone.w - 16;
  let y = zone.y + PANEL_HEADER_H + 16;

  parts.push(textEl(soil.mapUnitName, x, y, TEXT.subtitle, { weight: "600" }));
  y += 14;
  parts.push(dataRow(x, y, width, "mukey", soil.mukey));
  y += 16;

  parts.push(
    line(x, y - 8, x + width, y - 8, `stroke="${COLOURS.terracotta}" stroke-width="0.25" opacity="0.4"`),
  );

  for (const component of soil.components.slice(0, 5)) {
    parts.push(
      textEl(
        `${component.name}${component.percent === null ? "" : ` ${component.percent} percent`}`,
        x,
        y,
        TEXT.data,
        { letterSpacing: 0.2 },
      ),
    );
    y += 10;
    const detail = [
      `group ${component.hydrologicGroup ?? "none assigned"}`,
      component.drainageClass ?? "drainage not given",
      component.taxOrder ?? "order not given",
      component.slopePct === null ? "slope not given" : `slope ${component.slopePct} percent`,
      component.hydric === null ? "hydric not given" : `hydric ${component.hydric}`,
    ].join(", ");
    parts.push(textEl(detail, x + 6, y, TEXT.small, { letterSpacing: 0.1 }));
    y += 15;
  }

  if (/urban land/i.test(soil.mapUnitName)) {
    parts.push(bodyText(zone, URBAN_LAND_NOTE, x, zone.y + zone.h - 44, width, 6.5));
  }
  parts.push(
    bodyText(
      zone,
      "A site specific geotechnical investigation is required before any foundation decision.",
      x,
      zone.y + zone.h - 14,
      width,
      6.5,
    ),
  );

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
