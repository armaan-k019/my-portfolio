// Builder for the `title-block` group. SPEC.md sections 10, 11.

import { ZONES } from "../layout";
import { COLOURS, TEXT } from "../styles";
import { group, line, panelChrome, type SheetContext } from "../panel";
import { textEl } from "../text";

const GROUP_ID = "title-block";

export function build(ctx: SheetContext): string {
  const zone = ZONES[GROUP_ID];
  const parts: string[] = [panelChrome(zone, "Site analysis", null, { framed: false })];

  // panelChrome has already set "Site analysis" at this baseline, so the title
  // is not drawn twice: two identical text elements stacked on one another
  // print heavier than every other title on the sheet and arrive in Illustrator
  // as two objects to delete.
  const baseY = zone.y + 16;

  // Locality is the coarse label from the Nominatim reverse lookup. No address
  // is ever printed or stored (SPEC section 2).
  parts.push(
    textEl(
      ctx.site.locality ?? "Locality not resolved",
      zone.x + 8,
      baseY + 16,
      TEXT.subtitle,
    ),
  );

  const fields: Array<[string, string]> = [
    [
      "coordinates",
      `${ctx.site.lat.toFixed(5)}, ${ctx.site.lng.toFixed(5)}`,
    ],
    ["census tract", ctx.site.tractGeoid ?? "not resolved"],
    ["generated", `${ctx.generatedAt.slice(0, 19).replace("T", " ")} UTC`],
    ["sheet", "ARCH D 36 x 24 in, 1 pt per user unit"],
    ["scales", "site plan 1 in = 200 ft; walk shed 1 in = 800 ft; tract locator 1 in = 2000 ft"],
    ["north", "true north up on both plans"],
  ];

  let x = zone.x + 260;
  const columnW = 400;
  let y = baseY;
  for (const [key, value] of fields) {
    parts.push(
      textEl(key, x, y, TEXT.eyebrow, { letterSpacing: 0.9, uppercase: true }),
      textEl(value, x + 92, y, TEXT.data, { letterSpacing: 0.1 }),
    );
    y += 12;
    if (y > baseY + 24) {
      y = baseY;
      x += columnW;
    }
  }

  parts.push(
    line(
      zone.x,
      zone.y + zone.h - 2,
      zone.x + zone.w,
      zone.y + zone.h - 2,
      `stroke="${COLOURS.terracotta}" stroke-width="0.35" opacity="0.5"`,
    ),
  );

  return group(GROUP_ID, "ok", parts.join(""));
}
