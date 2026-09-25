// Builder for the `attribution` group. SPEC.md section 11.
//
// The attribution text is verbatim from the spec. A source line appears only
// when its layer was attempted, except OpenStreetMap, which always appears
// because the base drawing is OSM, and geocoding, which every analysis uses.

import type { CensusData } from "../../types";
import { ZONES } from "../layout";
import { TEXT } from "../styles";
import { group, type SheetContext } from "../panel";
import { textEl } from "../text";

const GROUP_ID = "attribution";

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const attempted = (name: keyof SheetContext["layers"]) =>
    ctx.layers[name] !== undefined;

  const lines: string[] = [
    "Map data © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright).",
  ];
  if (attempted("flood")) lines.push("Flood: FEMA NFHL.");
  if (attempted("topo")) lines.push("Elevation: USGS 3DEP.");
  if (attempted("seismic")) lines.push("Seismic: USGS.");
  if (attempted("soil")) lines.push("Soil: USDA NRCS SSURGO.");
  if (attempted("climate") || attempted("sun")) {
    lines.push("Climate: Open-Meteo (ERA5).");
  }
  if (attempted("census")) {
    const vintage =
      (ctx.layers.census?.data as CensusData | null)?.vintage ?? "2023";
    lines.push(`Demographics: US Census Bureau ACS 5-year ${vintage}.`);
  }
  lines.push("Geocoding: Nominatim and Photon (OSM).");

  const parts: string[] = [
    textEl(lines.join(" "), zone.x + 8, zone.y + 12, TEXT.small, {
      letterSpacing: 0.1,
    }),
    textEl(
      "Fonts: Fraunces, IBM Plex Mono, Inter. Substituted when not installed, which is acceptable for a tracing base.",
      zone.x + 8,
      zone.y + 22,
      TEXT.small,
      { letterSpacing: 0.1 },
    ),
    textEl(
      "Every value traces to a named source and field. An unavailable source shows an unavailable panel, never a default or an estimate.",
      zone.x + zone.w - 8,
      zone.y + 22,
      TEXT.small,
      { anchor: "end", letterSpacing: 0.1 },
    ),
  ];

  return group(GROUP_ID, "ok", parts.join(""));
}
