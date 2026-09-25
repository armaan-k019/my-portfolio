// Unit checks for citation to panel mapping.

import { test, expect } from "@playwright/test";
import { panelForCitation } from "../../src/app/projects/datum/panels/CitationChips";

test("site.latitude maps to title-block", () => {
  expect(panelForCitation("site.latitude")).toBe("title-block");
});

test("site.longitude maps to title-block", () => {
  expect(panelForCitation("site.longitude")).toBe("title-block");
});

test("topo.reliefM maps to topography-section", () => {
  expect(panelForCitation("topo.reliefM")).toBe("topography-section");
});

test("an unknown layer maps to null", () => {
  expect(panelForCitation("unknown.field")).toBeNull();
});

test("climate.wind maps to wind-rose", () => {
  expect(panelForCitation("climate.wind.direction")).toBe("wind-rose");
});

test("climate.something else maps to climate", () => {
  expect(panelForCitation("climate.temperature")).toBe("climate");
});
