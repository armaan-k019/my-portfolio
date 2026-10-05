// Unit checks for the sheet layout, text helpers, and SVG builders.
// Playwright without a browser: only `test` and `expect`, no page fixture.
// PHASE-2-sheet.md steps 2.1 and 2.2.

import { test, expect } from "@playwright/test";
import {
  GROUP_ORDER,
  PAGE_H,
  PAGE_W,
  ZONES,
  planPx,
  walkPx,
  zoneInsidePage,
  zonesOverlap,
} from "../../src/lib/datum/sheet/layout";
import { escapeXml, wrapText } from "../../src/lib/datum/sheet/text";

// ─── Step 2.1: layout and text ───────────────────────────────────────────────

test("sheet layout: every zone lies inside the page", () => {
  for (const [id, zone] of Object.entries(ZONES)) {
    expect(zoneInsidePage(zone), `${id} should lie inside the page`).toBe(true);
  }
  expect(PAGE_W).toBe(2592);
  expect(PAGE_H).toBe(1728);
});

test("sheet layout: no two zones overlap", () => {
  const entries = Object.entries(ZONES);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, a] = entries[i];
      const [idB, b] = entries[j];
      expect(zonesOverlap(a, b), `${idA} and ${idB} should not overlap`).toBe(
        false,
      );
    }
  }
});

test("sheet layout: every top level group but the frame has a zone", () => {
  for (const id of GROUP_ORDER) {
    if (id === "sheet-frame") continue;
    expect(ZONES[id], `${id} should have a zone`).toBeDefined();
  }
  // Every zone belongs to a group, so nothing is drawn off the group list.
  for (const id of Object.keys(ZONES)) {
    expect(GROUP_ORDER, `${id} should be a top level group`).toContain(id);
  }
});

test("sheet layout: the plan scales match SPEC section 10", () => {
  // 1 in = 200 ft, so 200 ft (60.96 m) is exactly 72 pt.
  expect(planPx(60.96)).toBeCloseTo(72, 6);
  // 1 in = 800 ft, so the 800 m frame is 13.12 in and the 2.4 km walk extent
  // is 9.84 in.
  expect(planPx(800) / 72).toBeCloseTo(13.12, 2);
  expect(walkPx(2400) / 72).toBeCloseTo(9.84, 2);
});

test("sheet text: escapeXml round trips the five significant characters", () => {
  expect(escapeXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
  expect(escapeXml("plain text")).toBe("plain text");
});

test("sheet text: wrapText respects the width and never drops a word", () => {
  const source =
    "The site sits on a gentle north facing slope with no mapped flood hazard.";
  const lines = wrapText(source, 100, 8);
  // 100 pt at 8 pt and 0.5 em per glyph is 25 characters per line.
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(25);
  expect(lines.join(" ").replace(/\s+/g, " ")).toBe(source);
});

test("sheet text: wrapText hard splits a word longer than the line", () => {
  const lines = wrapText("a".repeat(60), 100, 8);
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(25);
  expect(lines.join("")).toBe("a".repeat(60));
});
