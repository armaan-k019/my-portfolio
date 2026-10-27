// Unit checks for the storybook page layout: numbering, spread alignment,
// padding, and the contents built from titled entries.

import { test, expect } from "@playwright/test";
import { facingPages, flippedForPage, leafCount, paginate } from "../../src/lib/storybook/paginate";
import { storybook } from "../../content/storybook";

test("pages are numbered in reading order from 1", () => {
  const { sides } = paginate([{ kind: "blank" }, { kind: "blank" }]);
  expect(sides.map((s) => s.number)).toEqual([1, 2]);
});

test("an odd page count is padded to whole sheets", () => {
  const { sides } = paginate([{ kind: "placeholder", title: "A" }]);
  expect(sides).toHaveLength(2);
  expect(sides[1].kind).toBe("blank");
});

test("a spread starting on a right page is pushed to the next left page", () => {
  const { sides, sections } = paginate([{ kind: "spread", src: "/x.jpg", alt: "x", title: "Site" }]);
  expect(sides.map((s) => s.kind)).toEqual(["blank", "image", "image", "blank"]);
  expect(sides[1]).toMatchObject({ number: 2, half: "left" });
  expect(sides[2]).toMatchObject({ number: 3, half: "right" });
  expect(sections).toEqual([{ title: "Site", page: 2 }]);
});

test("a spread already on a left page needs no blank", () => {
  const { sides } = paginate([{ kind: "blank" }, { kind: "placeholder", title: "P", spread: true }]);
  expect(sides.map((s) => s.kind)).toEqual(["blank", "placeholder", "placeholder", "blank"]);
});

test("the contents page lists every titled entry with its page", () => {
  const { sides } = paginate([
    { kind: "contents" },
    { kind: "image", src: "/a.jpg", alt: "a", title: "First" },
    { kind: "image", src: "/b.jpg", alt: "b" },
    { kind: "text", title: "Second", body: "..." },
  ]);
  const contents = sides[0];
  expect(contents.kind).toBe("contents");
  if (contents.kind === "contents") expect(contents.items).toEqual([{ title: "First", page: 2 }, { title: "Second", page: 4 }]);
});

test("turning to a page puts it on the correct side", () => {
  const total = 12;
  for (let page = 1; page <= total; page++) {
    const facing = facingPages(flippedForPage(page), total);
    expect(page % 2 === 1 ? facing.right : facing.left).toBe(page);
  }
});

test("covers face the reader when the book is shut", () => {
  expect(facingPages(0, 12)).toEqual({ left: null, right: null });
  expect(facingPages(leafCount(12), 12)).toEqual({ left: null, right: null });
  expect(facingPages(1, 12)).toEqual({ left: null, right: 1 });
});

test("the shipped storybook paginates to whole sheets", () => {
  const { sides } = paginate(storybook.entries);
  expect(sides.length % 2).toBe(0);
});
