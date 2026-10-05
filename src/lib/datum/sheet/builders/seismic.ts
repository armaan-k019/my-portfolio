// Builder for the `seismic` group. SPEC.md sections 9, 10.

import type { SeismicData } from "../../types";
import { ZONES } from "../layout";
import { TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  bodyText,
  dataRow,
  group,
  panelChrome,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "seismic";
const TITLE = "Seismic";

/** Verbatim from SPEC section 9: the defaults have to be stated on the sheet. */
const ASSUMPTION_NOTE =
  "Site Class D and Risk Category II are defaults. A site specific geotechnical report is required to confirm site class.";

function value(input: number | null, decimals = 3): string {
  return input === null ? "not available" : input.toFixed(decimals);
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const loading = ctx.loading ?? [];
  if (loading.includes("seismic")) {
    return unavailable(GROUP_ID, TITLE, "", { status: "loading", sourceName: "USGS ASCE 7-22" });
  }

  const envelope = ctx.layers.seismic;
  const seismic = (envelope?.data as SeismicData | null) ?? null;
  if (!seismic) {
    return unavailable(
      GROUP_ID,
      TITLE,
      envelope?.unavailable?.message ??
        "USGS seismic design values were not requested for this site.",
      { sourceName: envelope?.source.name ?? "USGS ASCE 7-22" },
    );
  }

  const parts: string[] = [panelChrome(zone, TITLE, envelope?.source.name ?? null)];
  const x = zone.x + 8;
  const width = zone.w - 16;
  let y = zone.y + PANEL_HEADER_H + 16;

  parts.push(
    textEl(
      `${seismic.assumptions.reference}, risk category ${seismic.assumptions.riskCategory}, site class ${seismic.assumptions.siteClass}`,
      x,
      y,
      TEXT.eyebrow,
      { letterSpacing: 0.7, uppercase: true },
    ),
  );
  y += 16;

  parts.push(
    textEl(
      `SDC ${seismic.sdc ?? "not available"}`,
      x,
      y + 6,
      TEXT.title,
      { weight: "600" },
    ),
  );
  y += 26;

  const rows: Array<[string, string]> = [
    ["ss", value(seismic.ss)],
    ["s1", value(seismic.s1)],
    ["sms", value(seismic.sms)],
    ["sm1", value(seismic.sm1)],
    ["sds", value(seismic.sds)],
    ["sd1", value(seismic.sd1)],
    ["pgam", value(seismic.pgam)],
    ["tl", value(seismic.tl, 1)],
  ];
  for (const [key, text] of rows) {
    parts.push(dataRow(x, y, width, key, text));
    y += 12;
  }

  parts.push(
    textEl(
      seismic.assumptions.siteClassIsDefault
        ? "Site class is the default, not measured"
        : "Site class was supplied on the request",
      x,
      y + 6,
      TEXT.small,
      { letterSpacing: 0.1 },
    ),
  );

  parts.push(bodyText(zone, ASSUMPTION_NOTE, x, zone.y + zone.h - 34, width, 6.5));

  return group(GROUP_ID, envelope?.status ?? "ok", parts.join(""));
}
