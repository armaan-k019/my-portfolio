// Text helpers for the sheet builders. SPEC.md section 11.
//
// Nothing here measures a real glyph: the builders run in Node with no DOM, so
// wrapping uses a fixed average glyph width. SPEC section 11 fixes it at 0.5 em
// and asks that the result be checked visually in the phase 2 screenshots.
//
// Erasable TypeScript only. Do not use the "@/" alias inside src/lib/datum.

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** Escape the five XML significant characters. Every text value goes through this. */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/**
 * Break text into lines that fit `maxWidthPt` at `fontSizePt`, using a fixed
 * average glyph width of `avgCharEm` em. Words longer than one line are hard
 * split so nothing ever runs past the zone edge. Existing newlines are kept as
 * paragraph breaks.
 */
export function wrapText(
  text: string,
  maxWidthPt: number,
  fontSizePt: number,
  avgCharEm = 0.5,
): string[] {
  const charWidth = fontSizePt * avgCharEm;
  const maxChars = Math.max(1, Math.floor(maxWidthPt / charWidth));
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of trimmed.split(/\s+/)) {
      let piece = word;
      // A single word longer than the line is split rather than allowed to run
      // over the zone edge.
      while (piece.length > maxChars) {
        if (current.length > 0) {
          lines.push(current);
          current = "";
        }
        lines.push(piece.slice(0, maxChars));
        piece = piece.slice(maxChars);
      }
      if (current.length === 0) {
        current = piece;
      } else if (current.length + 1 + piece.length <= maxChars) {
        current = `${current} ${piece}`;
      } else {
        lines.push(current);
        current = piece;
      }
    }
    if (current.length > 0) lines.push(current);
  }

  return lines;
}

export interface TextStyle {
  family: string;
  size: number;
  fill: string;
}

export interface TextOpts {
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
  uppercase?: boolean;
  weight?: string;
  opacity?: number;
}

/** One `<text>` element. The content is escaped here, never by the caller. */
export function textEl(
  value: string,
  x: number,
  y: number,
  style: TextStyle,
  opts?: TextOpts,
): string {
  const content = opts?.uppercase ? value.toUpperCase() : value;
  const parts = [
    `x="${round(x)}"`,
    `y="${round(y)}"`,
    `font-family="${style.family}"`,
    `font-size="${style.size}"`,
    `fill="${style.fill}"`,
  ];
  if (opts?.weight) parts.push(`font-weight="${opts.weight}"`);
  if (opts?.anchor && opts.anchor !== "start") {
    parts.push(`text-anchor="${opts.anchor}"`);
  }
  if (typeof opts?.letterSpacing === "number") {
    parts.push(`letter-spacing="${opts.letterSpacing}"`);
  }
  if (typeof opts?.opacity === "number") {
    parts.push(`opacity="${opts.opacity}"`);
  }
  return `<text ${parts.join(" ")}>${escapeXml(content)}</text>`;
}

/** A `<text>` whose lines are `<tspan>` children, one per wrapped line. */
export function paragraphEl(
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  style: TextStyle,
): string {
  const spans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight;
      return `<tspan x="${round(x)}" dy="${round(dy)}">${escapeXml(line)}</tspan>`;
    })
    .join("");
  return (
    `<text x="${round(x)}" y="${round(y)}" font-family="${style.family}" ` +
    `font-size="${style.size}" fill="${style.fill}">${spans}</text>`
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Imperial first with metric in parentheses (SPEC section 9). */
export function metresAsFeet(metres: number, decimals = 1): string {
  const feet = metres / 0.3048;
  return `${feet.toFixed(decimals)} ft (${metres.toFixed(decimals)} m)`;
}

/** A number formatted with thousands separators, or an em free dash when null. */
export function num(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "not available";
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
