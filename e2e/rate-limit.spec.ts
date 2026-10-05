// Step 1.10 rate limit run. The cap is 20 uncached analyses per IP per UTC day
// (SPEC section 13, RATE_LIMIT_PER_DAY). Twenty one site creations from twenty
// one distinct points must end in a 429 carrying resetAt.
//
// The spec isolates itself with a synthetic client IP generated once per run
// (owner decision d, 2026-09-24): every request carries it in x-forwarded-for,
// and the site route hashes the first entry of that header
// (src/app/api/datum/site/route.ts, clientIpFrom in src/lib/datum/memory.ts),
// so the counter this run exercises is its own. Before that the counter was
// shared with the layers spec and with every earlier run of the day, and the
// first attempt on 2026-09-24 failed because the layers spec had already spent
// three of the twenty.
//
// The 21 points are randomised per run as well, within a fixed rural cell, so a
// site row left behind by an earlier run cannot make one of this run's requests
// free (a re-open inside 30 days is not charged).
//
// With DATUM_E2E_DB=1 the run deletes its own rate_limits row and its own 21
// site rows at the end. The SQL fallback is in e2e/README.md.

import { test, expect } from "@playwright/test";
import { siteKey } from "../src/lib/datum/geo";
import { getClient, hashIp } from "../src/lib/datum/memory";

const LIMIT = 20;

/**
 * A random address in 10.0.0.0/8, generated once per run. RFC 1918 space, so it
 * can never collide with a real client, and a fresh one each run means a fresh
 * daily counter without touching the table first.
 */
const SYNTHETIC_IP = [
  10,
  Math.floor(Math.random() * 256),
  Math.floor(Math.random() * 256),
  1 + Math.floor(Math.random() * 254),
].join(".");

/** The header every request in this spec sends. */
const HEADERS = { "x-forwarded-for": SYNTHETIC_IP };

/**
 * The cell the run's points are drawn from: empty rangeland in western Kansas,
 * well clear of the three test sites in e2e/fixtures/sites.ts and of the forced
 * failure points. Nothing here depends on what is on the ground; it only has to
 * be somewhere no other spec analyses.
 */
const CELL = { lat: 38.0, lng: -101.0, span: 0.4 };

/**
 * The base point, randomised once per run. Every request must create a new site
 * row to be chargeable (a re-open inside 30 days is free and would not move the
 * counter), and a fixed ladder of points meant a row left behind by an earlier
 * run made one of this run's requests free. A random base makes that collision
 * as unlikely as the synthetic IP does.
 */
const BASE = {
  lat: Number((CELL.lat + Math.random() * CELL.span).toFixed(3)),
  lng: Number((CELL.lng + Math.random() * CELL.span).toFixed(3)),
};

/** Twenty one points, one per third decimal step north of the base. */
function pointFor(index: number): { lat: number; lng: number } {
  return {
    lat: Number((BASE.lat + index * 0.001).toFixed(3)),
    lng: BASE.lng,
  };
}

/** The site keys this run generates, which is what its cleanup deletes. */
function siteKeysThisRun(): string[] {
  const keys: string[] = [];
  for (let index = 0; index <= LIMIT; index++) {
    const point = pointFor(index);
    keys.push(siteKey(point.lat, point.lng));
  }
  return keys;
}

interface RateLimitError {
  error?: { code?: string; resetAt?: string };
  rateLimit?: { remaining: number };
}

/**
 * Remove what this run created: its own counter row, found with the same hash
 * the route computes, and its own 21 site rows, found by the site keys it
 * generated (layer_results follow by cascade). Scoped to those keys rather than
 * to every is_test row, so a run cannot delete another spec's sites.
 * Prints counts only, never the URL and never the key.
 */
async function cleanup(): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("rate limit cleanup: no Supabase client in the test process, skipped");
    return;
  }
  const ipHash = hashIp(SYNTHETIC_IP);
  const limits = await client
    .from("rate_limits")
    .delete({ count: "exact" })
    .eq("ip_hash", ipHash);
  const sites = await client
    .from("sites")
    .delete({ count: "exact" })
    .in("site_key", siteKeysThisRun());
  console.log(
    `rate limit cleanup: rate_limits rows deleted ${limits.count ?? 0}` +
      `${limits.error ? " (error)" : ""}, own sites deleted ${sites.count ?? 0}` +
      `${sites.error ? " (error)" : ""}`,
  );
}

test("datum site: the twenty first analysis of the day is rate limited", async ({
  request,
}) => {
  test.setTimeout(15 * 60 * 1000);
  console.log(`rate limit: synthetic client IP ends .${SYNTHETIC_IP.split(".")[3]}`);

  try {
    for (let index = 0; index < LIMIT; index++) {
      const point = pointFor(index);
      const response = await request.post("/api/datum/site", {
        data: { ...point, isTest: true },
        headers: HEADERS,
        timeout: 60_000,
      });
      expect(
        response.status(),
        `site creation ${index + 1} of ${LIMIT + 1} should be allowed`,
      ).toBe(200);
      const body = (await response.json()) as RateLimitError;
      // 19 down to 0 across the twenty allowed requests, exactly.
      expect(
        body.rateLimit?.remaining,
        `site creation ${index + 1} should report the remaining budget`,
      ).toBe(LIMIT - index - 1);
    }

    const last = pointFor(LIMIT);
    const response = await request.post("/api/datum/site", {
      data: { ...last, isTest: true },
      headers: HEADERS,
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
  } finally {
    if (process.env.DATUM_E2E_DB === "1") await cleanup();
  }
});
