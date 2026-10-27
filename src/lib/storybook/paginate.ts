import type { StoryEntry } from "../../../content/storybook";

// One printed side of one sheet, in reading order. A spread entry becomes two
// sides that each draw one half of the same image.
export type PageSide = { number: number } & (
  | { kind: "image"; src: string; alt: string; fit: "contain" | "cover"; half?: "left" | "right" }
  | { kind: "text"; eyebrow?: string; title: string; body: string }
  | { kind: "placeholder"; title: string; note?: string; half?: "left" | "right" }
  | { kind: "contents"; items: Section[] }
  | { kind: "blank" }
);

export interface Section {
  title: string;
  page: number;
}

export interface Layout {
  sides: PageSide[];
  sections: Section[];
}

// A side before it is numbered. Distributes over the union so each kind keeps its own fields.
type SideBody = PageSide extends infer S ? (S extends unknown ? Omit<S, "number"> : never) : never;

// Lays the entries out as page sides. Page 1 is the first right hand page
// after the cover, so odd pages are on the right and even pages on the left.
// A spread must start on a left page; a blank is inserted when it would not.
// The total is padded to an even count so every sheet has two sides.
export function paginate(entries: StoryEntry[]): Layout {
  const sides: PageSide[] = [];
  const sections: Section[] = [];
  const push = (body: SideBody) => sides.push({ ...body, number: sides.length + 1 } as PageSide);
  const nextPage = () => sides.length + 1;

  for (const e of entries) {
    const isSpread = e.kind === "spread" || (e.kind === "placeholder" && e.spread === true);
    if (isSpread && nextPage() % 2 === 1) push({ kind: "blank" });
    if ("title" in e && e.title) sections.push({ title: e.title, page: nextPage() });

    switch (e.kind) {
      case "image":
        push({ kind: "image", src: e.src, alt: e.alt, fit: e.fit ?? "contain" });
        break;
      case "spread":
        push({ kind: "image", src: e.src, alt: e.alt, fit: "cover", half: "left" });
        push({ kind: "image", src: e.src, alt: e.alt, fit: "cover", half: "right" });
        break;
      case "text":
        push({ kind: "text", eyebrow: e.eyebrow, title: e.title, body: e.body });
        break;
      case "placeholder":
        if (e.spread) {
          push({ kind: "placeholder", title: e.title, note: e.note, half: "left" });
          push({ kind: "placeholder", title: e.title, note: e.note, half: "right" });
        } else {
          push({ kind: "placeholder", title: e.title, note: e.note });
        }
        break;
      case "contents":
        push({ kind: "contents", items: [] });
        break;
      case "blank":
        push({ kind: "blank" });
        break;
    }
  }
  if (sides.length % 2 === 1) push({ kind: "blank" });

  for (const s of sides) if (s.kind === "contents") s.items = sections;
  return { sides, sections };
}

// The book turns leaves: the front cover, one leaf per paper sheet, then the
// back cover. `flipped` counts the leaves already turned to the left.
export function leafCount(sideCount: number): number {
  return sideCount / 2 + 2;
}

// How many leaves to turn so that the given page faces the reader.
export function flippedForPage(page: number): number {
  return Math.floor(page / 2) + 1;
}

// The page numbers facing the reader after `flipped` leaves, or null where
// that side is a cover or endpaper rather than a numbered page.
export function facingPages(flipped: number, sideCount: number): { left: number | null; right: number | null } {
  const left = 2 * flipped - 2;
  const right = 2 * flipped - 1;
  return {
    left: left >= 1 && left <= sideCount ? left : null,
    right: right >= 1 && right <= sideCount ? right : null,
  };
}
