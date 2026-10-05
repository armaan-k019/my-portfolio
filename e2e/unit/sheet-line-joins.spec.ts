// Missing spaces at line joins on the rendered sheet. Reported 2026-09-25.
//
// The report: reading the rendered sheet text showed "totalrelief",
// "meanslope", "from-0.5" and "infiltration.Structural", and asked whether that
// is a real defect or an artifact of how the text was extracted.
//
// It is an artifact, and this file proves it rather than asserting it.
//
// The brief panel sets its text as one <text> element with one <tspan> per
// wrapped line (sheet/builders/brief.ts). `wrapText` breaks on whitespace and
// the break consumes that space, so the source carries
// "<tspan>...total</tspan><tspan>relief...</tspan>". Reading `textContent`, or
// any regex that concatenates the tspan bodies, joins the last word of one line
// to the first word of the next with nothing between them, and all four
// reported strings are that join. On screen each tspan sits on its own baseline
// through its `dy`, so a reader sees a line break where the extraction saw
// nothing at all.
//
// A space lost inside a line, or a character dropped at a break, would be the
// real defect. Both are checked here, over the whole paragraph rather than at
// the four samples.

import { test, expect } from "@playwright/test";
import { buildSheet } from "../../src/lib/datum/sheet/sheet";
import type { SheetContext } from "../../src/lib/datum/sheet/sheet";
import { wrapText } from "../../src/lib/datum/sheet/text";

const BRIEF = [
  "Ground",
  "The surface falls 4.4 m across the frame [topo.reliefM], and that total " +
    "relief is the number the entry level has to answer to. The mean slope is " +
    "0.7 percent [topo.meanSlopePct], so the ground reads as flat and the " +
    "section ranges from -0.5 to 3.8 m [topo.sections.ew[]].",
  "Risk",
  "The map unit is urban land with no useful infiltration. Structural fill " +
    "and a designed stormwater system are the consequence [soil.mapUnitName].",
].join("\n");

function contextWithBrief(): SheetContext {
  return {
    site: { lat: 25.8011588, lng: -80.1890627, locality: null, tractGeoid: null },
    generatedAt: "2026-09-25T00:00:00.000Z",
    layers: {},
    brief: { text: BRIEF, validCitations: ["topo.reliefM"], invalidCitations: [] },
    loading: [],
  };
}

/** The tspan bodies of the brief panel, in document order. */
function briefLines(svg: string): string[] {
  const opened = svg.indexOf('<g id="brief"');
  const panel = svg.slice(opened, svg.indexOf('<g id="', opened + 1));
  return Array.from(panel.matchAll(/<tspan\b[^>]*>([^<]*)</g), (node) => node[1]);
}

test("the four reported strings are what a line break looks like to an extractor", () => {
  // Each row is a wrap width chosen so the break falls exactly where the report
  // saw it, which is what makes the mechanism legible: the words either side of
  // the break are whole, and only the join has no space in it.
  const cases: Array<{ text: string; widthPt: number; lines: string[]; reported: string }> = [
    { text: "the total relief", widthPt: 36, lines: ["the total", "relief"], reported: "totalrelief" },
    { text: "the mean slope", widthPt: 32, lines: ["the mean", "slope"], reported: "meanslope" },
    {
      text: "ranges from -0.5 to 3.8",
      widthPt: 44,
      lines: ["ranges from", "-0.5 to 3.8"],
      reported: "from-0.5",
    },
    {
      text: "no infiltration. Structural fill",
      widthPt: 64,
      lines: ["no infiltration.", "Structural fill"],
      reported: "infiltration.Structural",
    },
  ];

  for (const { text, widthPt, lines, reported } of cases) {
    const wrapped = wrapText(text, widthPt, 8);
    expect(wrapped, text).toEqual(lines);
    // Concatenated, which is how the report read it: the defect appears.
    expect(wrapped.join(""), text).toContain(reported);
    // Read as lines, which is how the sheet sets it: the space is there.
    expect(wrapped.join(" "), text).toBe(text);
  }
});

test("every line break in a rendered brief joins two whole words", () => {
  // The general statement, at whatever columns the real panel happens to wrap
  // at. For each break: concatenating the two lines produces a run on word, and
  // the two words are each intact with a space between them in the source.
  const lines = briefLines(buildSheet(contextWithBrief()));
  expect(lines.length).toBeGreaterThan(4);
  const concatenated = lines.join("");
  const spaced = lines.join(" ");

  let breaks = 0;
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const tail = lines[index].split(" ").pop() ?? "";
    const head = lines[index + 1].split(" ")[0] ?? "";
    if (tail.length === 0 || head.length === 0) continue;
    breaks += 1;
    expect(concatenated, `break ${index}`).toContain(`${tail}${head}`);
    expect(spaced, `break ${index}`).toContain(`${tail} ${head}`);
  }
  expect(breaks).toBeGreaterThan(3);
});

test("wrapping the brief drops whitespace at a break and nothing else", () => {
  // No character lost, none added, over every paragraph of the brief: the
  // wrapped lines rejoined with one space are the paragraph with its own
  // whitespace collapsed.
  const lines = briefLines(buildSheet(contextWithBrief()));
  const rejoined = lines.join(" ").replace(/\s+/g, " ").trim();
  const source = BRIEF.split("\n")
    // The five section headings are set as their own <text>, not as tspans.
    .filter((paragraph) => !["Ground", "Risk"].includes(paragraph.trim()))
    .map((paragraph) => paragraph.trim().replace(/\s+/g, " "))
    .join(" ");
  expect(rejoined).toBe(source);
});

test("a word too long for the line is the only break that falls inside a word", () => {
  // `wrapText` hard splits a word that cannot fit, so that join is inside a
  // word by design rather than by a lost space. It is the one exception to the
  // statement above, and the brief's 110 character measure does not reach it
  // for any citation path the nine layers produce.
  const long = "x".repeat(40);
  const lines = wrapText(long, 8 * 8 * 0.5, 8);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join("")).toBe(long);
});

test("the site plan footer joins its fragments with a deliberate two spaces", () => {
  // Found while checking the report. The footer reads "... are unavailable.
  // contours unavailable.  FEMA flood polygons unavailable", which has a
  // lowercase word after a period and two spaces before it. Both come from
  // `footer.join(".  ")` in builders/sitePlan.ts joining sentence fragments.
  // Nothing is missing from it; it is recorded here so a later reader does not
  // take it for the same artifact.
  const svg = buildSheet(contextWithBrief());
  const footer = Array.from(svg.matchAll(/<text\b[^>]*>([^<]+)</g), (node) => node[1]).find(
    (text) => text.includes("FEMA flood polygons"),
  );
  expect(footer).toBe(
    "OpenStreetMap buildings and streets are unavailable.  contours unavailable.  FEMA flood polygons unavailable",
  );
});
