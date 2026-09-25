// Builder for the `sheet-frame` group. SPEC.md sections 10 and 11.

import { MARGIN, PAGE_H, PAGE_W, ZONES } from "../layout";
import { COLOURS, STROKE, TEXT } from "../styles";
import { group, line, rect } from "../panel";
import { textEl } from "../text";
import type { SheetContext } from "../panel";

/**
 * The sheet border, the three column rules, and the corner registration ticks.
 * The frame is always present and always `ok`: it draws no data.
 */
export function build(_envelope: null, ctx: SheetContext): string {
  const parts: string[] = [];

  parts.push(
    rect(
      MARGIN / 2,
      MARGIN / 2,
      PAGE_W - MARGIN,
      PAGE_H - MARGIN,
      `fill="none" stroke="${COLOURS.ink}" stroke-width="${STROKE.frame}"`,
    ),
  );

  // Column gutters, drawn as hairlines so the three column grid reads.
  const gutters = [
    ZONES["walk-shed"].x - MARGIN / 2,
    ZONES["sun-path"].x - MARGIN / 2,
  ];
  for (const x of gutters) {
    parts.push(
      line(
        x,
        MARGIN / 2,
        x,
        ZONES["title-block"].y - MARGIN / 2,
        `stroke="${COLOURS.ink}" stroke-width="0.25" opacity="0.25"`,
      ),
    );
  }

  // The rule above the title block band.
  parts.push(
    line(
      MARGIN / 2,
      ZONES["title-block"].y - MARGIN / 2,
      PAGE_W - MARGIN / 2,
      ZONES["title-block"].y - MARGIN / 2,
      `stroke="${COLOURS.ink}" stroke-width="${STROKE.frame}"`,
    ),
  );

  // Registration ticks at the four corners, 12 pt long.
  const tick = 12;
  const corners: Array<[number, number, number, number]> = [
    [MARGIN / 2, MARGIN / 2, tick, 0],
    [MARGIN / 2, MARGIN / 2, 0, tick],
    [PAGE_W - MARGIN / 2, MARGIN / 2, -tick, 0],
    [PAGE_W - MARGIN / 2, MARGIN / 2, 0, tick],
    [MARGIN / 2, PAGE_H - MARGIN / 2, tick, 0],
    [MARGIN / 2, PAGE_H - MARGIN / 2, 0, -tick],
    [PAGE_W - MARGIN / 2, PAGE_H - MARGIN / 2, -tick, 0],
    [PAGE_W - MARGIN / 2, PAGE_H - MARGIN / 2, 0, -tick],
  ];
  for (const [x, y, dx, dy] of corners) {
    parts.push(
      line(
        x,
        y,
        x + dx,
        y + dy,
        `stroke="${COLOURS.terracotta}" stroke-width="0.5"`,
      ),
    );
  }

  // The sheet name sits in the top left of the border, outside every zone.
  parts.push(
    textEl("DATUM SITE ANALYSIS", MARGIN / 2 + 4, MARGIN / 2 - 5, TEXT.eyebrow, {
      letterSpacing: 1.6,
      uppercase: true,
    }),
  );
  parts.push(
    textEl(
      `ARCH D 36 x 24 IN  ${ctx.generatedAt.slice(0, 10)}`,
      PAGE_W - MARGIN / 2 - 4,
      MARGIN / 2 - 5,
      TEXT.eyebrow,
      { anchor: "end", letterSpacing: 1.2, uppercase: true },
    ),
  );

  return group("sheet-frame", "ok", parts.join(""));
}
