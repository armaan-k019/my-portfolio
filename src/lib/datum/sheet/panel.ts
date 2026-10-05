// Shared drawing primitives and the sheet context every builder receives.
// SPEC.md sections 10 and 11.
//
// Erasable TypeScript only. Do not use the "@/" alias inside src/lib/datum.

import type { LayerEnvelope, LayerName, LocalPoint } from "../types";
import { ZONES, r, type Zone } from "./layout";
import { COLOURS, STROKE, TEXT } from "./styles";
import { escapeXml, paragraphEl, textEl, wrapText } from "./text";

/** What the sheet knows about the site. No address and no display name. */
export interface SheetSite {
  lat: number;
  lng: number;
  locality: string | null;
  tractGeoid: string | null;
}

/** The brief as the sheet needs it: text plus the citations that validated. */
export interface SheetBrief {
  text: string;
  validCitations: string[];
  invalidCitations: string[];
}

/** Envelopes keyed by layer. A layer that was never requested is absent. */
export type SheetLayers = Partial<Record<LayerName, LayerEnvelope<unknown>>>;

export interface SheetContext {
  site: SheetSite;
  /** ISO timestamp printed in the title block and the desc element. */
  generatedAt: string;
  layers: SheetLayers;
  brief: SheetBrief | null;
  /**
   * On screen only. A layer named here renders the loading chrome instead of
   * its panel. `buildSheet` for the export is always called with this empty,
   * because a loading panel must never reach a file (PHASE-2 step 2.4).
   */
  loading?: LayerName[];
}

export type PanelStatus = "ok" | "partial" | "unavailable" | "loading";

/** The zone a group draws into. */
export function zoneOf(id: string): Zone {
  const zone = ZONES[id];
  if (!zone) throw new Error(`no zone for group "${id}"`);
  return zone;
}

/** Open a top level or nested group. */
export function openGroup(id: string, status?: PanelStatus): string {
  const attrs = status ? ` data-status="${status}"` : "";
  return `<g id="${id}"${attrs}>`;
}

export const closeGroup = "</g>";

/** Wrap children in a group with an id and a status. */
export function group(
  id: string,
  status: PanelStatus | undefined,
  children: string,
): string {
  return `${openGroup(id, status)}${children}${closeGroup}`;
}

// ─── Geometry primitives ─────────────────────────────────────────────────────

export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  attrs: string,
): string {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" ${attrs}/>`;
}

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  attrs: string,
): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" ${attrs}/>`;
}

export function circle(cx: number, cy: number, radius: number, attrs: string): string {
  return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}" ${attrs}/>`;
}

/** A `<path>` from projected page points. `close` adds the Z command. */
export function pathFrom(
  points: Array<[number, number]>,
  close: boolean,
  attrs: string,
): string {
  if (points.length === 0) return "";
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${r(point[0])} ${r(point[1])}`)
    .join(" ");
  return `<path d="${d}${close ? " Z" : ""}" ${attrs}/>`;
}

/** Project every point of a local metre polyline or ring, then draw it. */
export function localPath(
  points: LocalPoint[],
  project: (point: LocalPoint) => [number, number],
  close: boolean,
  attrs: string,
): string {
  return pathFrom(points.map(project), close, attrs);
}

export function strokeAttrs(
  colour: string,
  width: number,
  dash?: string | null,
  opacity?: number,
): string {
  const parts = [
    `fill="none"`,
    `stroke="${colour}"`,
    `stroke-width="${width}"`,
    `stroke-linejoin="round"`,
    `stroke-linecap="round"`,
  ];
  if (dash) parts.push(`stroke-dasharray="${dash}"`);
  if (typeof opacity === "number") parts.push(`opacity="${opacity}"`);
  return parts.join(" ");
}

// ─── Panel chrome ────────────────────────────────────────────────────────────

/** Height reserved above a panel's content for the eyebrow and the title. */
export const PANEL_HEADER_H = 26;

/**
 * The frame, eyebrow, title, and source line every panel shares. The eyebrow
 * carries the panel name and the title block of the panel carries the source,
 * so the sheet reads the same way whether a layer answered or not.
 */
export function panelChrome(
  zone: Zone,
  title: string,
  sourceName: string | null,
  opts?: { framed?: boolean },
): string {
  const framed = opts?.framed !== false;
  const parts: string[] = [];
  if (framed) {
    parts.push(
      rect(
        zone.x,
        zone.y,
        zone.w,
        zone.h,
        `fill="none" stroke="${COLOURS.ink}" stroke-width="${STROKE.frame}" opacity="0.35"`,
      ),
    );
  }
  parts.push(
    textEl(title, zone.x + 8, zone.y + 16, TEXT.title, { weight: "600" }),
  );
  if (sourceName) {
    parts.push(
      textEl(sourceName, zone.x + zone.w - 8, zone.y + 16, TEXT.eyebrow, {
        anchor: "end",
        letterSpacing: 1,
        uppercase: true,
      }),
    );
  }
  parts.push(
    line(
      zone.x + 8,
      zone.y + PANEL_HEADER_H - 4,
      zone.x + zone.w - 8,
      zone.y + PANEL_HEADER_H - 4,
      `stroke="${COLOURS.terracotta}" stroke-width="0.5" opacity="0.5"`,
    ),
  );
  return parts.join("");
}

/** A left aligned key and value row, monospace, for the data tables. */
export function dataRow(
  x: number,
  y: number,
  width: number,
  key: string,
  value: string,
): string {
  return (
    textEl(key, x, y, TEXT.eyebrow, { letterSpacing: 0.6, uppercase: true }) +
    textEl(value, x + width, y, TEXT.data, { anchor: "end" })
  );
}

/** A wrapped body paragraph inside a zone. */
export function bodyText(
  zone: Zone,
  text: string,
  x: number,
  y: number,
  width: number,
  size = TEXT.body.size,
): string {
  const lines = wrapText(text, width, size);
  return paragraphEl(lines, x, y, size * 1.35, { ...TEXT.body, size });
}

/**
 * The unavailable panel (SPEC section 8 rule 4): the frame, the panel title,
 * the source name, the word UNAVAILABLE in the eyebrow style, and the reason.
 * `status: "loading"` is the on screen variant: a pulsing hairline instead of
 * the stamp, never written to an exported file.
 */
export function unavailablePanel(
  groupId: string,
  title: string,
  message: string,
  opts?: { sourceName?: string | null; status?: "unavailable" | "loading"; zoneId?: string },
): string {
  const zone = zoneOf(opts?.zoneId ?? groupId);
  const status = opts?.status ?? "unavailable";
  const parts: string[] = [panelChrome(zone, title, opts?.sourceName ?? null)];

  if (status === "loading") {
    // The hairline animates through a CSS class the page owns. The exported
    // document never contains this branch, so no animation ever leaves here.
    parts.push(
      rect(
        zone.x + 8,
        zone.y + PANEL_HEADER_H + 10,
        zone.w - 16,
        1.5,
        `fill="${COLOURS.terracotta}" opacity="0.35" class="datum-pulse"`,
      ),
    );
    parts.push(
      textEl("loading", zone.x + 8, zone.y + PANEL_HEADER_H + 28, TEXT.eyebrow, {
        letterSpacing: 1.2,
        uppercase: true,
      }),
    );
    return group(groupId, "loading", parts.join(""));
  }

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
    bodyText(
      zone,
      message,
      zone.x + 8,
      zone.y + PANEL_HEADER_H + 42,
      zone.w - 16,
    ),
  );
  return group(groupId, "unavailable", parts.join(""));
}

/**
 * The reason string a panel shows. An unavailable envelope carries its own
 * verbatim message; a layer that was never requested says so plainly.
 */
export function reasonOf(envelope: LayerEnvelope<unknown> | undefined): string {
  if (!envelope) return "This layer was not requested for this site.";
  if (envelope.unavailable) return envelope.unavailable.message;
  return "This layer returned no usable data.";
}

/** The status a top level group carries, from its envelope. */
export function statusOf(
  envelope: LayerEnvelope<unknown> | undefined,
): PanelStatus {
  if (!envelope) return "unavailable";
  return envelope.status;
}

/** `escapeXml` re-exported so builders import one module for text handling. */
export { escapeXml };
