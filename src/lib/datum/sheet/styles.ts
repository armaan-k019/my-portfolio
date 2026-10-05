// Sheet ink. SPEC.md section 10, visual language approved in OPEN-QUESTIONS
// item 4.
//
// The colours are hard coded hex copies of the globals.css tokens on purpose:
// the exported SVG has to be self contained, so it cannot read a CSS variable.
// If a token changes in globals.css, change it here too; nothing links them.
//
// Erasable TypeScript only. Do not use the "@/" alias inside src/lib/datum.

/** Hard coded copies of the globals.css design tokens. */
export const COLOURS = {
  /** --color-ink */
  ink: "#16241A",
  /** --color-terracotta. The token name is historic; the colour is deep green. */
  terracotta: "#2D5A27",
  /** --color-brown */
  brown: "#1A2A1A",
  /** --color-brown-light */
  brownLight: "#4A6B4A",
  /** --color-darkblue */
  darkblue: "#1E3A5F",
  /** --color-paper */
  paper: "#FBFCFA",
};

/** Stroke weights in points, from the SPEC section 10 table. */
export const STROKE = {
  frame: 0.75,
  siteMarker: 1.0,
  streetPrimary: 0.5,
  streetResidential: 0.35,
  streetFootway: 0.25,
  water: 0.35,
  contour: 0.25,
  contourIndex: 0.5,
  floodSfha: 0.35,
  floodVe: 0.35,
  flood02: 0.25,
  walkShed5: 1.2,
  walkShed10: 0.8,
  walkShed15: 0.5,
  unreached: 0.25,
  unavailable: 0.75,
  hatch: 0.25,
};

/** Font stacks. Referenced by name only; nothing is embedded (SPEC section 10). */
export const FONTS = {
  display: "Fraunces, Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  body: "Inter, system-ui, sans-serif",
};

export const TEXT = {
  title: { family: FONTS.display, size: 14, fill: COLOURS.ink },
  subtitle: { family: FONTS.display, size: 10, fill: COLOURS.ink },
  eyebrow: { family: FONTS.mono, size: 7, fill: COLOURS.terracotta },
  data: { family: FONTS.mono, size: 7, fill: COLOURS.brown },
  body: { family: FONTS.body, size: 8, fill: COLOURS.brown },
  small: { family: FONTS.body, size: 6.5, fill: COLOURS.brownLight },
  stamp: { family: FONTS.mono, size: 10, fill: COLOURS.terracotta },
};

/** Which street classes draw at which weight (SPEC section 10). */
export function streetStroke(highway: string): number {
  if (highway === "primary" || highway === "primary_link") {
    return STROKE.streetPrimary;
  }
  if (highway === "secondary" || highway === "secondary_link") {
    return STROKE.streetPrimary;
  }
  if (
    highway === "footway" ||
    highway === "path" ||
    highway === "steps" ||
    highway === "cycleway" ||
    highway === "pedestrian"
  ) {
    return STROKE.streetFootway;
  }
  return STROKE.streetResidential;
}

/** Footways and paths are dashed 2,2; everything else is solid. */
export function streetDash(highway: string): string | null {
  if (highway === "footway" || highway === "path" || highway === "steps") {
    return "2,2";
  }
  return null;
}

/**
 * Hatch and marker definitions for `<defs>`. Every fill reference in the
 * builders points at one of these ids, so the export needs no external file.
 */
export const HATCH_IDS = [
  "water-hatch",
  "flood-sfha",
  "flood-ve",
  "flood-02pct",
];

function diagonalHatch(
  id: string,
  spacing: number,
  stroke: string,
  width: number,
): string {
  return (
    `<pattern id="${id}" patternUnits="userSpaceOnUse" ` +
    `width="${spacing}" height="${spacing}" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="${spacing}" stroke="${stroke}" stroke-width="${width}"/>` +
    `</pattern>`
  );
}

function crossHatch(
  id: string,
  spacing: number,
  stroke: string,
  width: number,
): string {
  return (
    `<pattern id="${id}" patternUnits="userSpaceOnUse" ` +
    `width="${spacing}" height="${spacing}" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="${spacing}" stroke="${stroke}" stroke-width="${width}"/>` +
    `<line x1="0" y1="0" x2="${spacing}" y2="0" stroke="${stroke}" stroke-width="${width}"/>` +
    `</pattern>`
  );
}

/**
 * The full `<defs>` block: four hatches, two clip paths for the plan zones, and
 * the north arrow marker. Clip rectangles come from the caller so `layout.ts`
 * stays the only place that knows the zone geometry.
 */
export function buildDefs(
  clips: Array<{ id: string; x: number; y: number; w: number; h: number }>,
): string {
  const patterns = [
    diagonalHatch("water-hatch", 4, COLOURS.darkblue, STROKE.hatch),
    diagonalHatch("flood-sfha", 3, COLOURS.darkblue, STROKE.hatch),
    crossHatch("flood-ve", 3, COLOURS.darkblue, STROKE.hatch),
    diagonalHatch("flood-02pct", 8, COLOURS.darkblue, STROKE.hatch),
  ].join("");
  const clipPaths = clips
    .map(
      (clip) =>
        `<clipPath id="${clip.id}">` +
        `<rect x="${clip.x}" y="${clip.y}" width="${clip.w}" height="${clip.h}"/>` +
        `</clipPath>`,
    )
    .join("");
  const marker =
    `<marker id="north-arrow" viewBox="0 0 10 10" refX="5" refY="9" ` +
    `markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M 5 0 L 9 10 L 5 7.5 L 1 10 Z" fill="${COLOURS.ink}"/>` +
    `</marker>`;
  return `<defs>${patterns}${clipPaths}${marker}</defs>`;
}
