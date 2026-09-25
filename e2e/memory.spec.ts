// Phase 3 acceptance: Site Memory. PHASE-3-memory.md step 3.6.
//
// Start the server yourself; playwright.config.ts reuses an existing one on
// port 3000. Two server shapes, and the spec runs one set of tests or the
// other depending on which one is up.
//
//   normal run   DATUM_ALLOW_TEST_FLAG=1 DATUM_INCLUDE_TEST_SITES=1 \
//                CRON_SECRET=<a value> npm run start
//                then  DATUM_E2E_DB=1 CRON_SECRET=<the same value> \
//                      npx playwright test e2e/memory.spec.ts
//
//   offline run  the same, plus SUPABASE_URL=http://127.0.0.1:9
//                then  DATUM_E2E_OFFLINE=1 npx playwright test e2e/memory.spec.ts
//
// Everything that needs migration 0002 skips with a named reason until
// DATUM_E2E_DB=1 and the migration is applied, the way Phase 1 did it: the
// probe below asks the database for the columns rather than trusting the flag.
//
// The twelve seed analyses are driven through the routes rather than the
// browser. They produce exactly the rows the browser flow produces, one
// x-forwarded-for can be set on every request so the run has its own daily
// counter, and twelve browser runs would spend most of an hour repainting
// panels this file never looks at. The browser is used where it is the point:
// the Atlanta screenshot and the offline run.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { seedSites, type SeedSite } from "./fixtures/seed-sites";
import { siteKey } from "../src/lib/datum/geo";
import { LAYER_NAMES } from "../src/lib/datum/types";
import { getClient, hashIp } from "../src/lib/datum/memory";

const OUT_DIR = path.join(__dirname, "..", "docs", "datum", "screenshots", "phase-3");

const OFFLINE_RUN = process.env.DATUM_E2E_OFFLINE === "1";
const DB_FLAG = process.env.DATUM_E2E_DB === "1";

const LAYER_TIMEOUT_MS = 90_000;
const SETTLE_TIMEOUT_MS = 180_000;

/**
 * One synthetic client IP per run, in RFC 1918 space, exactly as
 * e2e/rate-limit.spec.ts does it. Twelve seed analyses spend twelve of the
 * twenty daily uncached analyses, and the layers and sheet specs may already
 * have spent some from this machine's real address today, so the run needs a
 * counter of its own or it would fail on a rate limit that has nothing to do
 * with Site Memory.
 */
const SYNTHETIC_IP = [
  10,
  Math.floor(Math.random() * 256),
  Math.floor(Math.random() * 256),
  1 + Math.floor(Math.random() * 254),
].join(".");

const HEADERS = { "x-forwarded-for": SYNTHETIC_IP };

interface SiteResponse {
  siteId?: string;
  locality?: string | null;
  memoryStatus?: string;
  analysisCount?: number;
  error?: { code?: string };
}

interface ContextResponse {
  memoryStatus?: string;
  n?: number | null;
  percentiles?: Array<{ metric: string; label: string; percentile: number }> | null;
  similar?: Array<{
    locality: string | null;
    publicLat: number;
    publicLng: number;
    match: number;
    closest: string[];
  }> | null;
  reasonIfNull?: string | null;
}

/** siteId per slug, filled by the seed test and read by the ones after it. */
const analysed = new Map<string, string>();
/** Which seed sites ended with a vector, for the run log. */
const vectorless: string[] = [];

// ─── Migration probe ─────────────────────────────────────────────────────────

let migrationState: { ok: boolean; reason: string } | null = null;

/**
 * Whether the assertions that need migration 0002 can run. Asks the database
 * for one of the columns the migration adds rather than trusting a flag, so a
 * run with DATUM_E2E_DB=1 against a project that has not had 0002 applied skips
 * with the truth rather than failing.
 */
async function migrationReady(): Promise<{ ok: boolean; reason: string }> {
  if (migrationState) return migrationState;
  if (!DB_FLAG) {
    migrationState = {
      ok: false,
      reason: "DATUM_E2E_DB is not 1, so the database backed assertions are skipped",
    };
    return migrationState;
  }
  const client = getClient();
  if (!client) {
    migrationState = {
      ok: false,
      reason: "no Supabase client in the test process (SUPABASE_URL or the secret key is unset)",
    };
    return migrationState;
  }
  const { error } = await client.from("sites").select("metrics, metrics_vector").limit(1);
  migrationState = error
    ? {
        ok: false,
        reason:
          "migration 0002_memory_pgvector.sql is not applied: sites.metrics could not be selected",
      }
    : { ok: true, reason: "" };
  return migrationState;
}

// ─── Driving one analysis through the routes ─────────────────────────────────

/**
 * Create the site, fire the nine layers the way SPEC section 7 says the client
 * does, then ask memory/context to compute and store the metrics. Returns the
 * site id and the context, with nothing asserted: Overpass and FEMA are allowed
 * to fail and the caller decides what that means.
 */
async function analyseSite(
  request: APIRequestContext,
  site: SeedSite,
): Promise<{ siteId: string; context: ContextResponse; failed: string[] }> {
  const created = await request.post("/api/datum/site", {
    data: { lat: site.lat, lng: site.lng, isTest: true },
    headers: HEADERS,
    timeout: 60_000,
  });
  const body = (await created.json()) as SiteResponse;
  expect(
    created.status(),
    `${site.slug}: the site route should answer 200, not ${body.error?.code ?? created.status()}`,
  ).toBe(200);
  const siteId = body.siteId ?? "";
  expect(siteId.length, `${site.slug}: the site route should return a site id`).toBeGreaterThan(0);

  const failed: string[] = [];
  async function layer(name: string): Promise<void> {
    const response = await request.get(
      `/api/datum/layers/${name}?site=${encodeURIComponent(siteId)}`,
      { headers: HEADERS, timeout: LAYER_TIMEOUT_MS },
    );
    const envelope = (await response.json()) as { status?: string };
    if (response.status() !== 200 || envelope.status === "unavailable") {
      failed.push(name);
    }
  }

  const independent = LAYER_NAMES.filter(
    (name) => name !== "osm" && name !== "walkshed",
  ).map((name) => layer(name));
  const osm = layer("osm");
  independent.push(osm);
  await osm;
  independent.push(layer("walkshed"));
  await Promise.all(independent);

  const context = await request.post("/api/datum/memory/context", {
    data: { siteId },
    headers: HEADERS,
    timeout: 60_000,
  });
  expect(context.status(), `${site.slug}: memory/context should answer 200`).toBe(200);
  return { siteId, context: (await context.json()) as ContextResponse, failed };
}

// ─── Step 3.6 item 1: the twelve seed analyses ───────────────────────────────

test.describe.configure({ mode: "serial" });

test("datum memory: the twelve seed sites are analyzed and their metrics stored", async ({
  request,
}) => {
  test.skip(OFFLINE_RUN, "the offline run has no database to seed");
  // Gated like every other database backed assertion. Without 0002 the metrics
  // write fails, which trips the offline guard for sixty seconds and turns the
  // rest of the run into local site ids, so seeding before the migration would
  // report a failure of Site Memory rather than of the migration.
  const gate = await migrationReady();
  test.skip(!gate.ok, gate.reason);
  test.setTimeout(45 * 60 * 1000);
  console.log(`memory seed: synthetic client IP ends .${SYNTHETIC_IP.split(".")[3]}`);

  for (const site of seedSites) {
    const { siteId, context, failed } = await analyseSite(request, site);
    analysed.set(site.slug, siteId);

    const hasVector = Array.isArray(context.similar);
    if (!hasVector) vectorless.push(site.slug);
    console.log(
      `memory seed: ${site.slug} (${site.character}) ` +
        `layers unavailable [${failed.join(", ") || "none"}] ` +
        `vector ${hasVector ? "yes" : "no"} ` +
        `reason ${context.reasonIfNull ?? "none"}`,
    );

    expect(
      context.memoryStatus,
      `${site.slug}: Site Memory should be online for a seeded analysis`,
    ).toBe("online");
  }

  expect(
    analysed.size,
    "all twelve seed sites should reach a stored analysis",
  ).toBe(seedSites.length);
  console.log(
    `memory seed: ${seedSites.length - vectorless.length} of ${seedSites.length} sites got a vector` +
      `${vectorless.length > 0 ? `; no vector for ${vectorless.join(", ")}` : ""}`,
  );
});

// ─── Step 3.6 item 2: the Atlanta context ────────────────────────────────────

test("datum memory: the Atlanta context carries percentiles and either matches or a reason", async ({
  request,
}) => {
  test.skip(OFFLINE_RUN, "the offline run has no stored context");
  const gate = await migrationReady();
  test.skip(!gate.ok, gate.reason);

  const siteId = analysed.get("atlanta");
  expect(siteId, "the seed test should have analyzed Atlanta").toBeTruthy();

  const response = await request.get(
    `/api/datum/memory/context?site=${encodeURIComponent(siteId!)}`,
    { headers: HEADERS, timeout: 60_000 },
  );
  expect(response.status(), "memory/context GET should answer 200").toBe(200);
  const context = (await response.json()) as ContextResponse;

  expect(context.memoryStatus, "Site Memory should be online").toBe("online");
  expect(context.n, "the analyzed population").toBeGreaterThanOrEqual(10);

  const percentiles = context.percentiles ?? [];
  expect(
    percentiles.length,
    `at least three percentile sentences, got ${percentiles.length}`,
  ).toBeGreaterThanOrEqual(3);
  for (const entry of percentiles) {
    expect(entry.percentile, `${entry.metric} percentile floor`).toBeGreaterThanOrEqual(0);
    expect(entry.percentile, `${entry.metric} percentile ceiling`).toBeLessThanOrEqual(100);
    expect(entry.label.length, `${entry.metric} carries a sentence`).toBeGreaterThan(0);
  }
  console.log(
    `memory context: n ${context.n}, ` +
      percentiles.map((entry) => `${entry.label} ${entry.percentile}%`).join("; "),
  );

  if (context.similar) {
    expect(context.similar.length, "at most five similar sites").toBeLessThanOrEqual(5);
    for (const similar of context.similar) {
      expect(similar.match, "match floor").toBeGreaterThanOrEqual(0);
      expect(similar.match, "match ceiling").toBeLessThanOrEqual(100);
      expect(similar.closest.length, "the closest components").toBeGreaterThan(0);
      // SPEC section 14 displays a locality, a match percent and the closest
      // components. Nothing that identifies or locates another analysis more
      // finely than the snapped point may ride along with them.
      const keys = Object.keys(similar as Record<string, unknown>).sort();
      expect(keys, "the similar entry carries the display fields and nothing else").toEqual([
        "closest",
        "locality",
        "match",
        "publicLat",
        "publicLng",
      ]);
      for (const forbidden of ["siteId", "lat", "lng", "site_key"]) {
        expect(
          forbidden in (similar as Record<string, unknown>),
          `a similar site never carries ${forbidden}`,
        ).toBe(false);
      }
    }
    console.log(
      `memory similar: ${context.similar
        .map((entry) => `${entry.locality ?? "unnamed"} ${entry.match}%`)
        .join("; ")}`,
    );
  } else {
    // The alternative SPEC section 14 allows: no vector, and a sentence saying
    // which layers are behind that.
    expect(
      context.reasonIfNull ?? "",
      "with no matches the context must say why",
    ).toContain("Sites like this needs all layers");
    console.log(`memory similar: none, reason "${context.reasonIfNull}"`);
  }
});

// ─── Step 3.6 item 3: the public map ─────────────────────────────────────────

test("datum memory: the map returns snapped public points and nothing finer", async ({
  request,
}) => {
  test.skip(OFFLINE_RUN, "the offline run has no stored sites");
  const gate = await migrationReady();
  test.skip(!gate.ok, gate.reason);

  const response = await request.get("/api/datum/memory/map", { timeout: 60_000 });
  expect(response.status(), "memory/map should answer 200").toBe(200);
  const body = (await response.json()) as {
    sites?: Array<Record<string, unknown>>;
  };
  const sites = body.sites ?? [];
  expect(sites.length, "at least the twelve seed sites").toBeGreaterThanOrEqual(10);

  for (const site of sites) {
    expect(
      Object.keys(site).sort(),
      "the map carries the snapped point and nothing else",
    ).toEqual(["analyzedAt", "locality", "publicLat", "publicLng"]);
    expect("lat" in site, "the confirmed latitude never leaves the server").toBe(false);
    expect("lng" in site, "the confirmed longitude never leaves the server").toBe(false);
    for (const key of ["publicLat", "publicLng"] as const) {
      const value = site[key];
      expect(typeof value, `${key} is a number`).toBe("number");
      const decimals = String(value).split(".")[1] ?? "";
      expect(
        decimals.length,
        `${key} ${String(value)} is snapped to at most two decimals`,
      ).toBeLessThanOrEqual(2);
    }
  }
  console.log(`memory map: ${sites.length} public points`);
});

// ─── Step 3.6 item 4: the Atlanta page with the panel and the map ────────────

test("datum memory: the Atlanta page shows the memory panel and the sites map", async ({
  page,
}) => {
  test.skip(OFFLINE_RUN, "the offline run takes its own screenshot");
  const gate = await migrationReady();
  test.skip(!gate.ok, gate.reason);
  test.setTimeout(10 * 60 * 1000);

  const atlanta = seedSites.find((site) => site.slug === "atlanta")!;
  await runInBrowser(page, atlanta);

  await expect(
    page.locator("[data-datum-memory]"),
    "the Site Memory panel is on the page",
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator("[data-datum-sites-map]"),
    "the analyzed sites map is on the page",
  ).toBeVisible({ timeout: 60_000 });

  // The panel resolves its context and the map its points before the shot, so
  // the screenshot is of the finished state rather than of two loading lines.
  await page
    .waitForSelector("[data-memory-count], [data-memory-reason]", { timeout: 60_000 })
    .catch(() => null);
  await page.waitForSelector("[data-sites-count]", { timeout: 60_000 }).catch(() => null);
  await page.waitForTimeout(3_000);

  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(OUT_DIR, "atlanta-memory.png"),
    fullPage: true,
  });
});

// ─── Step 3.6 item 5: the brief replay ───────────────────────────────────────

test("datum memory: the second Atlanta brief is the stored one", async ({ request }) => {
  test.skip(OFFLINE_RUN, "the offline run stores no brief");
  const gate = await migrationReady();
  test.skip(!gate.ok, gate.reason);
  test.setTimeout(6 * 60 * 1000);

  const siteId = analysed.get("atlanta");
  expect(siteId, "the seed test should have analyzed Atlanta").toBeTruthy();

  const first = await readBrief(request, siteId!);
  if (first.done === null) {
    console.log(`brief replay: the first brief did not complete (${first.error ?? "no done event"})`);
    test.skip(true, "the first brief did not complete, so there is nothing to replay");
  }

  const second = await readBrief(request, siteId!);
  expect(second.done, "the second request should complete").not.toBeNull();

  if (first.done!.uncitedNumericSentences > 0 || first.done!.invalidCitations.length > 2) {
    // A brief that failed its checks is deliberately never stored, so the
    // second request writes a new one. That is the rule under test, not a
    // failure of it.
    expect(second.done!.cached, "a failed brief is never replayed").toBe(false);
    console.log("brief replay: the first brief failed its checks, so it was not stored");
    return;
  }

  expect(second.done!.cached, "the second done event should be the stored brief").toBe(true);
  expect(second.text, "the replayed text is the stored text").toBe(first.text);
  expect(first.done!.cached, "the first brief was written, not replayed").toBe(false);
  console.log(
    `brief replay: ${first.text.length} characters, ${first.done!.validCitations.length} valid citations, replayed identically`,
  );
});

interface DoneEvent {
  invalidCitations: string[];
  validCitations: string[];
  uncitedNumericSentences: number;
  cached: boolean;
}

/** POST the brief and drain the event stream into its text and its done event. */
async function readBrief(
  request: APIRequestContext,
  siteId: string,
): Promise<{ text: string; done: DoneEvent | null; error: string | null }> {
  const response = await request.post("/api/datum/brief", {
    data: { siteId },
    headers: HEADERS,
    timeout: 180_000,
  });
  if (response.status() !== 200) {
    return { text: "", done: null, error: `HTTP ${response.status()}` };
  }
  const raw = await response.text();

  let text = "";
  let done: DoneEvent | null = null;
  let error: string | null = null;
  for (const record of raw.split("\n\n")) {
    let name = "message";
    let payload = "";
    for (const line of record.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) payload += line.slice(5).trim();
    }
    if (payload.length === 0) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (name === "delta" && typeof data.text === "string") text += data.text;
    else if (name === "done") {
      done = {
        invalidCitations: Array.isArray(data.invalidCitations)
          ? (data.invalidCitations as string[])
          : [],
        validCitations: Array.isArray(data.validCitations)
          ? (data.validCitations as string[])
          : [],
        uncitedNumericSentences:
          typeof data.uncitedNumericSentences === "number"
            ? data.uncitedNumericSentences
            : 0,
        cached: data.cached === true,
      };
    } else if (name === "error") {
      error = typeof data.message === "string" ? data.message : "the brief failed";
    }
  }
  return { text, done, error };
}

// ─── Step 3.6 item 6: the daily ping ─────────────────────────────────────────

test("datum memory: the ping refuses everything but the cron secret", async ({ request }) => {
  test.skip(OFFLINE_RUN, "the offline run cannot count sites");

  const secret = process.env.CRON_SECRET;

  const bare = await request.get("/api/datum/memory/ping", { timeout: 60_000 });
  if (!secret) {
    // Fail closed: with no secret configured the route answers nobody, so the
    // 401 and the 200 both need one.
    expect(bare.status(), "with no CRON_SECRET the route is unconfigured").toBe(503);
    test.skip(
      true,
      "CRON_SECRET is not set in the test process, so the 401 and 200 checks are skipped",
    );
    return;
  }

  expect(bare.status(), "a request with no Authorization header is refused").toBe(401);

  const wrong = await request.get("/api/datum/memory/ping", {
    headers: { authorization: "Bearer not-the-secret" },
    timeout: 60_000,
  });
  expect(wrong.status(), "a request with the wrong secret is refused").toBe(401);

  const authorised = await request.get("/api/datum/memory/ping", {
    headers: { authorization: `Bearer ${secret}` },
    timeout: 60_000,
  });
  expect(authorised.status(), "the cron request is allowed").toBe(200);
  const body = (await authorised.json()) as {
    ok?: boolean;
    sites?: number | null;
    swept?: number | null;
  };
  expect(body.ok, "the ping reports ok").toBe(true);
  console.log(`memory ping: sites ${body.sites}, swept ${body.swept}`);
});

// ─── Step 3.6 item 7: the offline run ────────────────────────────────────────

test("datum memory: an analysis completes with Site Memory offline", async ({ page }) => {
  test.skip(!OFFLINE_RUN, "set DATUM_E2E_OFFLINE=1 with a server pointed at a dead Supabase URL");
  test.setTimeout(15 * 60 * 1000);

  const serverErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });

  const atlanta = seedSites.find((site) => site.slug === "atlanta")!;
  await runInBrowser(page, atlanta);

  const panel = page.locator("[data-datum-memory]");
  await expect(panel, "the Site Memory panel is on the page").toBeVisible({
    timeout: 60_000,
  });
  await expect(panel, "the panel says Site Memory is offline").toContainText(
    "Site Memory is offline",
    { timeout: 60_000 },
  );

  // Export still works with no database behind it (SPEC section 13 item 3).
  const downloadPromise = page.waitForEvent("download");
  await page.click("[data-datum-export]");
  const download = await downloadPromise;
  const file = await download.path();
  expect(file, "the export produced a file").toBeTruthy();

  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(OUT_DIR, "atlanta-memory-offline.png"),
    fullPage: true,
  });

  expect(serverErrors, `no request should answer 5xx: ${serverErrors.join(", ")}`).toEqual([]);
});

// ─── The browser flow, trimmed from e2e/sheet.spec.ts ────────────────────────

/** Type the address, submit, confirm the point, and wait for every layer. */
async function runInBrowser(page: Page, site: SeedSite): Promise<void> {
  await page.goto("/projects/datum?test=1");

  const hydrated = page
    .waitForRequest((request) => request.url().includes("/api/datum/suggest"), {
      timeout: 30_000,
    })
    .catch(() => null);
  await page.fill("#datum-address", site.query);
  await hydrated;
  await page.waitForSelector("[data-datum-submit]:not([disabled])", { timeout: 60_000 });
  await page.press("#datum-address", "Enter");
  await page.waitForSelector("[data-datum-confirm]", { timeout: 60_000 });

  const lat = Number(await page.getAttribute("[data-confirm-lat]", "data-confirm-lat"));
  const lng = Number(await page.getAttribute("[data-confirm-lng]", "data-confirm-lng"));
  expect(Math.abs(lat - site.lat), `${site.slug}: confirmed latitude`).toBeLessThan(0.002);
  expect(Math.abs(lng - site.lng), `${site.slug}: confirmed longitude`).toBeLessThan(0.002);

  await page.click("text=Confirm and analyse");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-datum-sheet]")?.getAttribute("data-loading-count") ===
      "0",
    null,
    { timeout: SETTLE_TIMEOUT_MS },
  );
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * The seed site rows stay: they are the population the percentiles are drawn
 * from, they are all is_test, and the acceptance checks in PHASE-3-memory.md
 * are run against them. Only this run's own rate limit counter goes, found
 * with the same hash the routes compute. Counts only, never a URL or a key.
 */
test.afterAll(async () => {
  if (OFFLINE_RUN || !DB_FLAG) return;
  const client = getClient();
  if (!client) return;
  const { count, error } = await client
    .from("rate_limits")
    .delete({ count: "exact" })
    .eq("ip_hash", hashIp(SYNTHETIC_IP));
  console.log(
    `memory cleanup: rate_limits rows deleted ${count}${error ? " (error)" : ""}`,
  );

  // The keys this run seeded, so a later cleanup can scope its delete to them
  // rather than to every is_test row in the project. Written only when there
  // was a seed run: a skipped run has nothing to record.
  if (analysed.size === 0) return;
  const keys = seedSites.map((site) => siteKey(site.lat, site.lng));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "seed-site-keys.txt"), `${keys.join("\n")}\n`, "utf8");
});
