// The architecture portfolio, bound as a 3D book at /architecture.
//
// To add work: put the page images in public/storybook/ and replace the
// placeholder entries below with "image" or "spread" entries. Pages are laid
// out in reading order; the book pairs them into sheets on its own.
//
//   { kind: "image", src: "/storybook/house-plan.jpg", alt: "...", title: "House" }
//     One page. Images are fitted to the page ("contain") unless fit is "cover".
//   { kind: "spread", src: "/storybook/site-section.jpg", alt: "...", title: "Site" }
//     One wide image across two facing pages. If it would start on a right
//     page, a blank page is inserted before it so it lands on a full spread.
//   { kind: "text", eyebrow: "...", title: "...", body: "..." }
//     A typeset page, for project statements.
//   { kind: "placeholder", title: "..." }
//     A marked empty page. Placeholders are labeled as such on the page.
//   { kind: "contents" }
//     The contents page, built from every entry that has a title.
//   { kind: "blank" }
//
// Any entry with a title appears on the contents page and in the contents
// menu, and the menu can jump straight to it.

export type StoryEntry =
  | { kind: "image"; src: string; alt: string; title?: string; fit?: "contain" | "cover" }
  | { kind: "spread"; src: string; alt: string; title?: string }
  | { kind: "text"; eyebrow?: string; title: string; body: string }
  | { kind: "placeholder"; title: string; note?: string; spread?: boolean }
  | { kind: "contents" }
  | { kind: "blank" };

export interface StorybookConfig {
  // Page proportions, width by height. 8.5 by 11 opens to an 11 by 17 spread.
  page: { width: number; height: number };
  cover: { title: string; subtitle: string; mark: string };
  entries: StoryEntry[];
}

export const storybook: StorybookConfig = {
  page: { width: 8.5, height: 11 },
  cover: { title: "Armaan Kazi", subtitle: "Architecture Portfolio", mark: "أك" },
  entries: [
    { kind: "text", eyebrow: "Portfolio", title: "Architecture", body: "Selected work. This book is being assembled, and the pages that follow are placeholders for drawings, models, and photographs still to come." },
    { kind: "contents" },
    { kind: "placeholder", title: "Project 01", note: "Plans, sections, and a statement" },
    { kind: "placeholder", title: "Project 01, drawings" },
    { kind: "placeholder", title: "Project 02", note: "A full spread drawing", spread: true },
    { kind: "placeholder", title: "Project 03", note: "Models and photographs" },
    { kind: "placeholder", title: "Project 03, details" },
    { kind: "placeholder", title: "Project 04" },
    { kind: "placeholder", title: "Project 04, process" },
    { kind: "placeholder", title: "Sketches" },
  ],
};
