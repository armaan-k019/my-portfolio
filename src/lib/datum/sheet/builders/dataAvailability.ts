// Builder for the `data-availability` group. SPEC.md sections 10, 11.
//
// One row per layer: status, source, when it was fetched, and the reason when
// it failed. This is the table that makes the sheet honest, so it is always
// present and always lists every layer, including the ones never requested.

import { LAYER_NAMES, type LayerName } from "../../types";
import { ZONES, r } from "../layout";
import { COLOURS, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  group,
  line,
  panelChrome,
  type SheetContext,
} from "../panel";
import { textEl } from "../text";

const GROUP_ID = "data-availability";
const TITLE = "Data availability";

const LAYER_LABEL: Record<LayerName, string> = {
  sun: "Sun path",
  climate: "Climate and wind",
  topo: "Topography",
  seismic: "Seismic",
  soil: "Soil",
  osm: "Figure ground",
  walkshed: "Walk shed",
  flood: "Flood",
  census: "Demographics",
};

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}.`;
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const parts: string[] = [panelChrome(zone, TITLE, null)];

  const x = zone.x + 8;
  const columns = [0, 92, 150, 300];
  let y = zone.y + PANEL_HEADER_H + 14;

  const headings = ["layer", "status", "source", "fetched at"];
  headings.forEach((heading, index) => {
    parts.push(
      textEl(heading, x + columns[index], y, TEXT.eyebrow, {
        letterSpacing: 0.8,
        uppercase: true,
      }),
    );
  });
  parts.push(
    line(
      x,
      y + 4,
      x + zone.w - 16,
      y + 4,
      `stroke="${COLOURS.terracotta}" stroke-width="0.35" opacity="0.5"`,
    ),
  );
  y += 15;

  for (const layer of LAYER_NAMES) {
    const envelope = ctx.layers[layer];
    const status = envelope ? envelope.status : "not requested";
    const cells = [
      LAYER_LABEL[layer],
      envelope?.unavailable ? `${status} (${envelope.unavailable.code})` : status,
      envelope ? truncate(envelope.source.name, 26) : "n/a",
      envelope ? `${envelope.source.fetchedAt.slice(0, 19).replace("T", " ")}Z${envelope.source.cached ? " cached" : ""}` : "n/a",
    ];
    cells.forEach((cell, index) => {
      parts.push(
        textEl(cell, x + columns[index], r(y), TEXT.data, { letterSpacing: 0.1 }),
      );
    });
    y += 10.5;

    if (envelope?.unavailable) {
      parts.push(
        textEl(
          truncate(envelope.unavailable.message, 150),
          x + columns[1],
          r(y),
          TEXT.small,
          { letterSpacing: 0.1 },
        ),
      );
      y += 9;
    } else if (envelope?.partial) {
      parts.push(
        textEl(
          truncate(`missing: ${envelope.partial.missing.join(", ")}`, 150),
          x + columns[1],
          r(y),
          TEXT.small,
          { letterSpacing: 0.1 },
        ),
      );
      y += 9;
    }
  }

  const unavailableLayers = LAYER_NAMES.filter(
    (layer) => !ctx.layers[layer] || ctx.layers[layer]?.status === "unavailable",
  );
  parts.push(
    textEl(
      unavailableLayers.length === 0
        ? "Every layer answered. No value on this sheet is a default or an estimate."
        : `Unavailable: ${unavailableLayers.join(", ")}. Those panels carry no values, never defaults.`,
      x,
      zone.y + zone.h - 8,
      TEXT.small,
      { letterSpacing: 0.1 },
    ),
  );

  return group(GROUP_ID, "ok", parts.join(""));
}
