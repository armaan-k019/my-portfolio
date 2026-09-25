// Unit checks for the run guard that keeps a late response from a previous
// analysis out of the current one. SPEC.md sections 3 and 7.

import { test, expect } from "@playwright/test";
import { createRunGuard } from "../../src/app/projects/datum/analysis";

test("a fresh guard has no run in progress", () => {
  const guard = createRunGuard();
  expect(guard.current()).toBe(0);
});

test("begin returns a new id every time", () => {
  const guard = createRunGuard();
  const first = guard.begin();
  const second = guard.begin();
  expect(second).not.toBe(first);
  expect(guard.current()).toBe(second);
});

test("the run that begin returned is current", () => {
  const guard = createRunGuard();
  const run = guard.begin();
  expect(guard.isCurrent(run)).toBe(true);
});

test("a previous run is not current once another begins", () => {
  const guard = createRunGuard();
  const stale = guard.begin();
  guard.begin();
  expect(guard.isCurrent(stale)).toBe(false);
});

test("a run captured before any begin is stale once a run starts", () => {
  const guard = createRunGuard();
  const captured = guard.current();
  guard.begin();
  expect(guard.isCurrent(captured)).toBe(false);
});

test("two guards do not share their counter", () => {
  const one = createRunGuard();
  const other = createRunGuard();
  one.begin();
  one.begin();
  const run = other.begin();
  expect(one.isCurrent(run)).toBe(false);
  expect(other.isCurrent(run)).toBe(true);
});

/**
 * The shape the hook relies on: a layer fetch captures the id at entry and
 * checks it before it writes. A confirm or a reset in between bumps the guard,
 * so the late write is dropped and only the new run's write lands.
 */
test("a late write from the previous run is dropped and the new one lands", () => {
  const guard = createRunGuard();
  const written: string[] = [];
  const write = (value: string, run: number) => {
    if (!guard.isCurrent(run)) return;
    written.push(value);
  };

  const firstRun = guard.begin();
  const secondRun = guard.begin(); // the visitor confirmed a new point
  write("from the first run", firstRun);
  write("from the second run", secondRun);

  expect(written).toEqual(["from the second run"]);
});

test("a reset drops a response that arrives after it", () => {
  const guard = createRunGuard();
  const written: string[] = [];
  const run = guard.begin();
  guard.begin(); // reset
  if (guard.isCurrent(run)) written.push("late");
  expect(written).toEqual([]);
});
