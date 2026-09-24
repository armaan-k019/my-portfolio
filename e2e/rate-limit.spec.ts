// Step 1.10 rate limit run. The cap is 20 uncached analyses per IP per UTC day
// (SPEC section 13, RATE_LIMIT_PER_DAY). Twenty one site creations from twenty
// one distinct points must end in a 429 carrying resetAt.
//
// Run this against a freshly started server: in the in memory fallback the
// counter lives in the server process, so a restart clears it. With Supabase
// online the counter is a row, and the cleanup SQL in e2e/README.md must be run
// before the spec can pass twice on the same day.

import { test, expect } from "@playwright/test";

const LIMIT = 20;

/**
 * Twenty one points near Atlanta, one per third decimal step, so every request
 * creates a new site row and is therefore chargeable. A re-open of a site
 * analyzed in the last 30 days is free and would not move the counter.
 */
function pointFor(index: number): { lat: number; lng: number } {
  return {
    lat: Number((33.776 + index * 0.001).toFixed(3)),
    lng: -84.392,
  };
}

interface RateLimitError {
  error?: { code?: string; resetAt?: string };
  rateLimit?: { remaining: number };
}

test("datum site: the twenty first analysis of the day is rate limited", async ({
  request,
}) => {
  test.setTimeout(15 * 60 * 1000);

  for (let index = 0; index < LIMIT; index++) {
    const point = pointFor(index);
    const response = await request.post("/api/datum/site", {
      data: { ...point, isTest: true },
      timeout: 60_000,
    });
    expect(
      response.status(),
      `site creation ${index + 1} of ${LIMIT + 1} should be allowed`,
    ).toBe(200);
    const body = (await response.json()) as RateLimitError;
    expect(
      body.rateLimit?.remaining,
      `site creation ${index + 1} should report the remaining budget`,
    ).toBe(LIMIT - index - 1);
  }

  const last = pointFor(LIMIT);
  const response = await request.post("/api/datum/site", {
    data: { ...last, isTest: true },
    timeout: 60_000,
  });
  expect(response.status(), "the twenty first site creation should be rate limited").toBe(429);

  const body = (await response.json()) as RateLimitError;
  expect(body.error?.code, "the 429 body should name the rate limit").toBe("rate_limited");
  expect(
    (body.error?.resetAt ?? "").length,
    "the 429 body should carry resetAt",
  ).toBeGreaterThan(0);
  expect(
    Number.isFinite(Date.parse(body.error?.resetAt ?? "")),
    "resetAt should be an ISO timestamp",
  ).toBe(true);
  expect(
    Date.parse(body.error?.resetAt ?? ""),
    "resetAt should be in the future",
  ).toBeGreaterThan(Date.now());

  console.log(`rate limit: 429 at request ${LIMIT + 1}, resetAt ${body.error?.resetAt}`);
});
