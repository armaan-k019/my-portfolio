// Builder for the `brief` group. SPEC.md sections 11, 12.
//
// The brief text wrapped into tspan lines at a fixed average glyph width. The
// citations stay inline exactly as Claude wrote them, because the citation is
// the evidence: removing it from the paper would leave a claim with no source.
//
// The zone is 10 in wide, which at 8 pt and 0.5 em per glyph would give a 176
// character measure: unreadable, and past the 110 character budget in PHASE-2
// step 2.2. The text therefore sets in two columns, and the wrap width is the
// narrower of the column width and the 110 character budget.

import { ZONES, r } from "../layout";
import { COLOURS, TEXT } from "../styles";
import {
  PANEL_HEADER_H,
  group,
  line,
  panelChrome,
  type SheetContext,
} from "../panel";
import { escapeXml, textEl, wrapText } from "../text";
import { build as unavailable } from "./unavailablePanel";

const GROUP_ID = "brief";
const TITLE = "Site brief";

const LINE_SIZE = 8;
const LINE_HEIGHT = 11;
const COLUMN_GUTTER = 22;
/** PHASE-2 step 2.2: no tspan line exceeds this many characters. */
export const MAX_LINE_CHARS = 110;

/** The five section names the prompt contract fixes (SPEC section 12). */
const SECTION_NAMES = [
  "Ground",
  "Climate and sun",
  "Context and access",
  "Risk",
  "What is missing",
];

function isSectionHeading(text: string): boolean {
  const bare = text.trim().replace(/[:.]$/, "");
  return SECTION_NAMES.includes(bare);
}

interface Block {
  kind: "heading" | "body";
  lines: string[];
}

function layOut(text: string, wrapWidth: number): Block[] {
  const blocks: Block[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) continue;
    if (isSectionHeading(trimmed)) {
      blocks.push({ kind: "heading", lines: [trimmed] });
      continue;
    }
    blocks.push({ kind: "body", lines: wrapText(trimmed, wrapWidth, LINE_SIZE) });
  }
  return blocks;
}

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const brief = ctx.brief;

  if (!brief || brief.text.trim().length === 0) {
    return unavailable(
      GROUP_ID,
      TITLE,
      "The site brief has not been written for this analysis.",
      { sourceName: "Claude, claude-sonnet-4-6" },
    );
  }

  const parts: string[] = [panelChrome(zone, TITLE, "Claude, claude-sonnet-4-6")];

  const left = zone.x + 8;
  const usable = zone.w - 16;
  const columnW = (usable - COLUMN_GUTTER) / 2;
  const wrapWidth = Math.min(columnW, MAX_LINE_CHARS * LINE_SIZE * 0.5);
  const columnX = [left, left + columnW + COLUMN_GUTTER];

  let top = zone.y + PANEL_HEADER_H + 14;
  if (brief.invalidCitations.length > 0) {
    parts.push(
      textEl(
        `${brief.invalidCitations.length} citation${brief.invalidCitations.length === 1 ? "" : "s"} did not match a data field: treat those claims as unverified`,
        left,
        top,
        TEXT.eyebrow,
        { letterSpacing: 0.7, uppercase: true },
      ),
    );
    top += 14;
  }

  const bottom = zone.y + zone.h - 18;
  let column = 0;
  let y = top;

  for (const block of layOut(brief.text, wrapWidth)) {
    const blockH =
      block.kind === "heading"
        ? LINE_HEIGHT + 7
        : block.lines.length * LINE_HEIGHT + 4;
    // A block that does not fit starts the second column rather than running
    // off the sheet. A brief that overruns both columns is truncated, which is
    // visible, rather than drawn outside the zone, which is not.
    if (y + blockH > bottom && column === 0) {
      column = 1;
      y = top;
    }
    if (y + blockH > bottom && column === 1) break;

    const x = columnX[column];
    if (block.kind === "heading") {
      parts.push(
        textEl(block.lines[0], x, r(y + 5), TEXT.eyebrow, {
          letterSpacing: 1.1,
          uppercase: true,
        }),
        line(
          x,
          r(y + 8.5),
          x + columnW,
          r(y + 8.5),
          `stroke="${COLOURS.terracotta}" stroke-width="0.25" opacity="0.35"`,
        ),
      );
      y += blockH;
      continue;
    }

    const spans = block.lines
      .map(
        (text, index) =>
          `<tspan x="${r(x)}" dy="${index === 0 ? 0 : LINE_HEIGHT}">${escapeXml(text)}</tspan>`,
      )
      .join("");
    parts.push(
      `<text x="${r(x)}" y="${r(y)}" font-family="${TEXT.body.family}" font-size="${LINE_SIZE}" fill="${TEXT.body.fill}">${spans}</text>`,
    );
    y += blockH;
  }

  parts.push(
    line(
      columnX[1] - COLUMN_GUTTER / 2,
      top,
      columnX[1] - COLUMN_GUTTER / 2,
      bottom,
      `stroke="${COLOURS.terracotta}" stroke-width="0.2" opacity="0.25"`,
    ),
  );

  parts.push(
    textEl(
      `${brief.validCitations.length} verified citations. Every bracketed reference is a field in the data on this sheet.`,
      left,
      zone.y + zone.h - 6,
      TEXT.small,
      { letterSpacing: 0.1 },
    ),
  );

  return group(
    GROUP_ID,
    brief.invalidCitations.length > 0 ? "partial" : "ok",
    parts.join(""),
  );
}
