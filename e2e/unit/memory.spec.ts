import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkRateLimit,
  clientIpFrom,
  getOrCreateSite,
  getSiteById,
  hashIp,
  isLocalSiteId,
  issueLocalSiteId,
  memoryStatus,
  peekRateLimit,
  setClientForTests,
  verifyLocalSiteId,
  withMemory,
  writeMetrics,
} from "../../src/lib/datum/memory";
import {
  PEEK_MEMO_MAX,
  RATE_LIMIT_PEEK_MEMO_MS,
} from "../../src/lib/datum/constants";

/** A client whose every query rejects, which is what a paused project looks like. */
function rejectingClient(): SupabaseClient {
  const fail = () => Promise.reject(new Error("connection refused"));
  return {
    from() {
      const chain = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        upsert: () => fail(),
        eq: () => chain,
        maybeSingle: () => fail(),
        single: () => fail(),
      };
      return chain;
    },
    rpc: fail,
  } as unknown as SupabaseClient;
}

/**
 * A client that records what the rate limit path calls. `rate_limit_hit` is the
 * atomic increment from migration 0001, so an increment is one rpc call and no
 * select at all; a peek is a select and no rpc.
 */
function recordingClient() {
  const calls: string[] = [];
  let count = 0;
  const client = {
    from(table: string) {
      const chain = {
        select: () => {
          calls.push(`select:${table}`);
          return chain;
        },
        upsert: () => {
          calls.push(`upsert:${table}`);
          return Promise.resolve({ error: null });
        },
        eq: () => chain,
        async maybeSingle() {
          return { data: count === 0 ? null : { count }, error: null };
        },
      };
      return chain;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push(`rpc:${name}`);
      expect(Object.keys(args).sort()).toEqual(["p_day", "p_ip_hash"]);
      count += 1;
      return { data: count, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls: () => calls };
}

test("an increment is one rate_limit_hit rpc call with no select before it", async () => {
  const { client, calls } = recordingClient();
  setClientForTests(client);
  const ipHash = hashIp("192.0.2.11");

  const first = await checkRateLimit(ipHash);
  expect(calls()).toEqual(["rpc:rate_limit_hit"]);
  expect(first.count).toBe(1);
  expect(first.allowed).toBe(true);

  const second = await checkRateLimit(ipHash);
  expect(calls()).toEqual(["rpc:rate_limit_hit", "rpc:rate_limit_hit"]);
  expect(second.count).toBe(2);
  expect(calls().filter((call) => call.startsWith("upsert:"))).toEqual([]);
  setClientForTests(null);
});

test("a peek reads the count without calling the rpc", async () => {
  const { client, calls } = recordingClient();
  setClientForTests(client);
  const ipHash = hashIp("192.0.2.12");

  await checkRateLimit(ipHash);
  const peek = await checkRateLimit(ipHash, { increment: false });
  expect(peek.count).toBe(1);
  expect(calls()).toEqual(["rpc:rate_limit_hit", "select:rate_limits"]);
  expect(calls().filter((call) => call === "rpc:rate_limit_hit")).toHaveLength(1);
  setClientForTests(null);
});

/**
 * A client whose `rate_limit_hit` answers with something that is not a count.
 * `Number(null)` is 0, so before the guard this read as "nothing spent today"
 * and quietly disabled the cap; now it throws and the local counter takes over.
 */
function badRpcClient(data: unknown) {
  let rpcCalls = 0;
  const client = {
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        async maybeSingle() {
          return { data: null, error: null };
        },
      };
      return chain;
    },
    async rpc() {
      rpcCalls += 1;
      return { data, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, rpcCalls: () => rpcCalls };
}

test("a null rpc result is a failure, not a zero, and the local counter takes over", async () => {
  const { client, rpcCalls } = badRpcClient(null);
  setClientForTests(client);
  const ipHash = hashIp("192.0.2.31");

  const first = await checkRateLimit(ipHash);
  // 1, from the in memory fallback, not 0 from Number(null).
  expect(first.count).toBe(1);
  expect(first.allowed).toBe(true);
  expect(memoryStatus()).toBe("offline");

  // And the fallback keeps counting, so the cap still exists per instance.
  const second = await checkRateLimit(ipHash);
  expect(second.count).toBe(2);
  expect(rpcCalls()).toBe(1);
  setClientForTests(null);
});

test("the increment is attempted once, never retried", async () => {
  // A timeout can fire on an increment the database already committed, so the
  // retry that every other operation gets would charge the request twice.
  const { client, rpcCalls } = badRpcClient(undefined);
  setClientForTests(client);
  await checkRateLimit(hashIp("192.0.2.32"));
  expect(rpcCalls()).toBe(1);
  setClientForTests(null);
});

// ─── the peek memo ───────────────────────────────────────────────────────────
//
// The layer routes peek on every call and never increment, so the read is
// memoised per hashed IP for RATE_LIMIT_PEEK_MEMO_MS. The accepted cost: an IP
// that has just hit the cap can keep making layer calls for up to a minute.

test("the memo serves a second peek inside the window with no client call", async () => {
  const { client, calls } = recordingClient();
  setClientForTests(client);
  const ipHash = hashIp("192.0.2.41");

  const first = await peekRateLimit(ipHash);
  expect(calls()).toEqual(["select:rate_limits"]);
  const second = await peekRateLimit(ipHash);
  expect(calls()).toEqual(["select:rate_limits"]);
  expect(second).toEqual(first);

  // A different hash is a different entry, so it still reads.
  await peekRateLimit(hashIp("192.0.2.42"));
  expect(calls()).toEqual(["select:rate_limits", "select:rate_limits"]);
  setClientForTests(null);
});

test("an increment clears the memo for that hash", async () => {
  const { client, calls } = recordingClient();
  setClientForTests(client);
  const ipHash = hashIp("192.0.2.43");

  await peekRateLimit(ipHash);
  await checkRateLimit(ipHash);
  const after = await peekRateLimit(ipHash);
  expect(calls()).toEqual([
    "select:rate_limits",
    "rpc:rate_limit_hit",
    "select:rate_limits",
  ]);
  expect(after.count).toBe(1);
  setClientForTests(null);
});

test("a peek past the window reads the client again", async () => {
  const { client, calls } = recordingClient();
  setClientForTests(client);
  const ipHash = hashIp("192.0.2.44");
  const now = Date.now();

  await peekRateLimit(ipHash, now);
  await peekRateLimit(ipHash, now + RATE_LIMIT_PEEK_MEMO_MS - 1);
  expect(calls()).toEqual(["select:rate_limits"]);

  await peekRateLimit(ipHash, now + RATE_LIMIT_PEEK_MEMO_MS + 1);
  expect(calls()).toEqual(["select:rate_limits", "select:rate_limits"]);
  setClientForTests(null);
});

test("a rejecting client flips Site Memory offline", async () => {
  setClientForTests(rejectingClient());
  expect(memoryStatus()).toBe("online");
  const result = await withMemory(async (db) =>
    db.from("sites").select("*").eq("site_key", "33.775,-84.392").maybeSingle(),
  );
  expect(result).toBeUndefined();
  expect(memoryStatus()).toBe("offline");
  setClientForTests(null);
});

test("the offline fallback serves a signed local site id", async () => {
  setClientForTests(rejectingClient());
  const site = await getOrCreateSite({
    lat: 33.7751258,
    lng: -84.391975,
    locality: "Atlanta, Georgia",
    isTest: true,
  });
  expect(isLocalSiteId(site.id)).toBe(true);
  expect(site.id).toMatch(/^local-33\.775,-84\.392-[0-9a-f]{32}$/);
  expect(verifyLocalSiteId(site.id)).toEqual({
    siteKey: "33.775,-84.392",
    lat: 33.775,
    lng: -84.392,
  });
  expect(site.site_key).toBe("33.775,-84.392");
  expect(site.public_lat).toBe(33.78);
  expect(site.analysis_count).toBe(1);

  const again = await getOrCreateSite({ lat: 33.7751258, lng: -84.391975 });
  expect(again.id).toBe(site.id);
  setClientForTests(null);
});

test("the rate limit fallback refuses the 21st chargeable analysis", async () => {
  setClientForTests(rejectingClient());
  const ipHash = hashIp("203.0.113.7");
  let last = await checkRateLimit(ipHash);
  for (let i = 2; i <= 20; i++) {
    last = await checkRateLimit(ipHash);
    expect(last.allowed).toBe(true);
  }
  expect(last.count).toBe(20);
  expect(last.remaining).toBe(0);

  const over = await checkRateLimit(ipHash);
  expect(over.allowed).toBe(false);
  expect(over.count).toBe(21);
  expect(over.resetAt.endsWith("T00:00:00.000Z")).toBe(true);
  setClientForTests(null);
});

test("a re-open peeks without spending a request", async () => {
  setClientForTests(rejectingClient());
  const ipHash = hashIp("198.51.100.4");
  await checkRateLimit(ipHash);
  const peek = await checkRateLimit(ipHash, { increment: false });
  expect(peek.count).toBe(1);
  const peekAgain = await checkRateLimit(ipHash, { increment: false });
  expect(peekAgain.count).toBe(1);
  setClientForTests(null);
});

test("hashIp is a stable sha256 hex digest and clientIpFrom takes the first entry", () => {
  const a = hashIp("203.0.113.7");
  expect(a).toMatch(/^[0-9a-f]{64}$/);
  expect(hashIp("203.0.113.7")).toBe(a);
  expect(hashIp("203.0.113.8")).not.toBe(a);
  expect(a).not.toContain("203.0.113.7");

  expect(clientIpFrom("203.0.113.7, 70.41.3.18")).toBe("203.0.113.7");
  expect(clientIpFrom(null)).toBe("unknown");
});

// ─── signed local site ids ───────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const ATLANTA_KEY = "33.775,-84.392";

test("a local site id verifies whatever Site Memory is doing now", async () => {
  setClientForTests(rejectingClient());
  const id = issueLocalSiteId(ATLANTA_KEY);
  await withMemory(async (db) => db.from("sites").select("*").maybeSingle());
  expect(memoryStatus()).toBe("offline");
  expect(verifyLocalSiteId(id)?.siteKey).toBe(ATLANTA_KEY);

  // The cool down ends and the module reports online again. The id issued
  // during the outage still resolves, which is the whole point of signing it.
  setClientForTests(null);
  expect(memoryStatus()).toBe("online");
  expect(verifyLocalSiteId(id)?.siteKey).toBe(ATLANTA_KEY);
});

test("a forged or tampered local site id does not verify", () => {
  const id = issueLocalSiteId(ATLANTA_KEY);
  const signature = id.slice(id.lastIndexOf("-") + 1);

  // A signature altered by one character.
  const flipped = signature.startsWith("0") ? "1" : "0";
  expect(verifyLocalSiteId(`${id.slice(0, -signature.length)}${flipped}${signature.slice(1)}`)).toBeNull();

  // The same signature carried over to a different point.
  expect(verifyLocalSiteId(`local-25.801,-80.189-${signature}`)).toBeNull();

  // An id with no signature at all, which is what the old format amounted to.
  expect(verifyLocalSiteId("local-0123456789abcdef01234567")).toBeNull();
  expect(verifyLocalSiteId(`local-${ATLANTA_KEY}`)).toBeNull();

  // A non canonical spelling of the same point.
  expect(verifyLocalSiteId(`local-33.7750,-84.392-${signature}`)).toBeNull();

  // Not a local id at all.
  expect(verifyLocalSiteId("11111111-1111-1111-1111-111111111111")).toBeNull();
});

test("yesterday's signature verifies and the day before does not", () => {
  const now = Date.now();
  expect(
    verifyLocalSiteId(issueLocalSiteId(ATLANTA_KEY, new Date(now - DAY_MS)))
      ?.siteKey,
  ).toBe(ATLANTA_KEY);
  expect(
    verifyLocalSiteId(issueLocalSiteId(ATLANTA_KEY, new Date(now - 2 * DAY_MS))),
  ).toBeNull();
});

// ─── Site rows: insert races, locality write back, and the offline flip ──────

interface FakeSiteRow {
  id: string;
  site_key: string;
  lat: number;
  lng: number;
  public_lat: number;
  public_lng: number;
  locality: string | null;
  tract_geoid: string | null;
  is_test: boolean;
  created_at: string;
  last_analyzed_at: string;
  analysis_count: number;
  schema_version: number;
}

function siteRow(overrides: Partial<FakeSiteRow> = {}): FakeSiteRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    site_key: "33.775,-84.392",
    lat: 33.7751258,
    lng: -84.391975,
    public_lat: 33.78,
    public_lng: -84.39,
    locality: null,
    tract_geoid: null,
    is_test: true,
    created_at: "2026-09-25T00:00:00.000Z",
    last_analyzed_at: "2026-09-25T00:00:00.000Z",
    analysis_count: 1,
    schema_version: 1,
    ...overrides,
  };
}

/**
 * A `sites` table that answers selects, records updates, and can be told to
 * reject an insert with the Postgres unique violation code or to start failing
 * every call, which is what the offline flip looks like from here.
 */
function sitesClient(options?: {
  rows?: FakeSiteRow[];
  /** A row that "another request" inserted; the insert then loses the race. */
  raceWinner?: FakeSiteRow;
}) {
  const rows = [...(options?.rows ?? [])];
  const updates: Array<Record<string, unknown>> = [];
  let inserts = 0;
  let failing = false;

  const client = {
    from() {
      let mode: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const filters: Array<[string, unknown]> = [];

      const match = () =>
        rows.find((row) =>
          filters.every(
            ([column, value]) => (row as unknown as Record<string, unknown>)[column] === value,
          ),
        ) ?? null;

      const chain = {
        select() {
          if (mode !== "insert") mode = "select";
          return chain;
        },
        insert(row: Record<string, unknown>) {
          mode = "insert";
          payload = row;
          return chain;
        },
        update(row: Record<string, unknown>) {
          mode = "update";
          payload = row;
          return chain;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return chain;
        },
        async maybeSingle() {
          if (failing) throw new Error("connection refused");
          return { data: match(), error: null };
        },
        async single() {
          if (failing) throw new Error("connection refused");
          if (mode === "insert") {
            inserts += 1;
            if (options?.raceWinner) {
              // The winner is visible from now on, exactly as it would be.
              if (!rows.includes(options.raceWinner)) rows.push(options.raceWinner);
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            const created = siteRow(payload as Partial<FakeSiteRow>);
            rows.push(created);
            return { data: created, error: null };
          }
          return { data: match(), error: null };
        },
        // touchSite awaits the update directly, with no terminal method.
        then(
          resolve: (value: { error: unknown }) => void,
          reject: (reason: unknown) => void,
        ) {
          if (failing) {
            reject(new Error("connection refused"));
            return;
          }
          if (mode === "update") {
            updates.push(payload);
            const row = match();
            if (row) Object.assign(row, payload);
          }
          resolve({ error: null });
        },
      };
      return chain;
    },
    rpc: async () => ({ data: 1, error: null }),
  } as unknown as SupabaseClient;

  return {
    client,
    rows,
    updates,
    inserts: () => inserts,
    breakNow: () => {
      failing = true;
    },
  };
}

test("a lost insert race re-reads the winner instead of issuing a local id", async () => {
  const winner = siteRow({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
  const fake = sitesClient({ raceWinner: winner });
  setClientForTests(fake.client);

  const site = await getOrCreateSite({ lat: 33.7751258, lng: -84.391975, isTest: true });

  expect(fake.inserts()).toBe(1);
  expect(site.id).toBe(winner.id);
  expect(isLocalSiteId(site.id)).toBe(false);
  // Losing a race is not a failure of Site Memory, so the guard stays online.
  expect(memoryStatus()).toBe("online");
  setClientForTests(null);
});

test("the re-read after a race touches the winner exactly once", async () => {
  const winner = siteRow({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
  const fake = sitesClient({ raceWinner: winner });
  setClientForTests(fake.client);

  await getOrCreateSite({ lat: 33.7751258, lng: -84.391975, isTest: true });

  expect(fake.updates).toHaveLength(1);
  expect(fake.updates[0]).toHaveProperty("last_analyzed_at");
  setClientForTests(null);
});

test("a null locality and tract are written back when the input supplies them", async () => {
  const existing = siteRow({ locality: null, tract_geoid: null });
  const fake = sitesClient({ rows: [existing] });
  setClientForTests(fake.client);

  const site = await getOrCreateSite({
    lat: 33.7751258,
    lng: -84.391975,
    locality: "Atlanta, Georgia",
    tractGeoid: "13121001100",
    isTest: true,
  });

  expect(fake.updates).toHaveLength(1);
  expect(fake.updates[0].locality).toBe("Atlanta, Georgia");
  expect(fake.updates[0].tract_geoid).toBe("13121001100");
  // The row the caller gets back carries what was just written.
  expect(site.locality).toBe("Atlanta, Georgia");
  expect(site.tract_geoid).toBe("13121001100");
  setClientForTests(null);
});

test("a locality already on the row is never overwritten by a later input", async () => {
  const existing = siteRow({ locality: "Atlanta, Georgia", tract_geoid: "13121001100" });
  const fake = sitesClient({ rows: [existing] });
  setClientForTests(fake.client);

  const site = await getOrCreateSite({
    lat: 33.7751258,
    lng: -84.391975,
    locality: "Somewhere Else",
    tractGeoid: "99999999999",
    isTest: true,
  });

  expect(fake.updates).toHaveLength(1);
  expect(fake.updates[0]).not.toHaveProperty("locality");
  expect(fake.updates[0]).not.toHaveProperty("tract_geoid");
  expect(site.locality).toBe("Atlanta, Georgia");
  setClientForTests(null);
});

test("a touch with nothing to backfill writes only last_analyzed_at", async () => {
  const existing = siteRow({ locality: null });
  const fake = sitesClient({ rows: [existing] });
  setClientForTests(fake.client);

  await getOrCreateSite({ lat: 33.7751258, lng: -84.391975, isTest: true });

  expect(Object.keys(fake.updates[0])).toEqual(["last_analyzed_at"]);
  setClientForTests(null);
});

test("a database site id keeps working through an offline flip mid analysis", async () => {
  const existing = siteRow({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
  const fake = sitesClient({ rows: [existing] });
  setClientForTests(fake.client);

  const first = await getSiteById(existing.id);
  expect(first?.id).toBe(existing.id);

  // Site Memory flips offline part way through the run. The layer routes go on
  // resolving the same id rather than answering 404.
  fake.breakNow();
  const during = await getSiteById(existing.id);
  expect(memoryStatus()).toBe("offline");
  expect(during?.id).toBe(existing.id);
  setClientForTests(null);
});

test("a site created on this instance survives the flip too", async () => {
  const fake = sitesClient();
  setClientForTests(fake.client);

  const created = await getOrCreateSite({ lat: 33.7751258, lng: -84.391975, isTest: true });
  fake.breakNow();

  expect(await getSiteById(created.id)).toEqual(created);
  setClientForTests(null);
});

test("a cold instance that never saw the row still answers null", async () => {
  // The residual recorded in memory.ts: nothing is invented for a row this
  // process has not read.
  setClientForTests(rejectingClient());
  expect(await getSiteById("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBeNull();
  setClientForTests(null);
});

test("the remembered rows are dropped by the test seam", async () => {
  const existing = siteRow({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
  const fake = sitesClient({ rows: [existing] });
  setClientForTests(fake.client);
  await getSiteById(existing.id);

  setClientForTests(rejectingClient());
  expect(await getSiteById(existing.id)).toBeNull();
  setClientForTests(null);
});

// ─── The fallback signing key ────────────────────────────────────────────────

test("the fallback local id signing key is not a fixed constant in the source", async () => {
  // The retired fallback. An id signed with a published constant could be
  // minted by anyone for any point, without passing the site route.
  const retired = "datum.local-site-id.unconfigured";
  const key = "33.775,-84.392";
  const day = new Date().toISOString().slice(0, 10);
  const forged = createHmac("sha256", retired)
    .update(`${key}|${day}`)
    .digest("hex")
    .slice(0, 32);

  const id = issueLocalSiteId(key);
  expect(id.endsWith(forged)).toBe(false);
  // It still verifies inside this process, which is all a per instance map needs.
  expect(verifyLocalSiteId(id)).toEqual({ siteKey: key, lat: 33.775, lng: -84.392 });
});

test("the signing key is stable within the process", () => {
  const key = "33.775,-84.392";
  expect(issueLocalSiteId(key)).toBe(issueLocalSiteId(key));
});

// ─── The peek memo is bounded ────────────────────────────────────────────────

test("the peek memo is cleared at PEEK_MEMO_MAX rather than growing forever", async () => {
  const { client, calls } = recordingClient();
  setClientForTests(client);
  const watched = hashIp("198.51.100.4");

  await peekRateLimit(watched);
  const afterFirst = calls().length;
  await peekRateLimit(watched);
  expect(calls().length, "the second peek is memoised").toBe(afterFirst);

  // Fill the memo past its bound with distinct hashes.
  for (let i = 0; i < PEEK_MEMO_MAX; i++) {
    await peekRateLimit(hashIp(`10.0.0.${i}`));
  }

  // The watched entry went with the clear, so this peek pays for a read again.
  await peekRateLimit(watched);
  expect(calls().length).toBeGreaterThan(afterFirst);
  setClientForTests(null);
});

// ─── writeMetrics: the three columns move together ───────────────────────────

/**
 * A `sites` table for the metrics write: it answers the pre-read with whatever
 * row it was given and records the update payload, so a test can see exactly
 * which columns went.
 */
function metricsClient(options?: {
  storedRow?: { metrics_vector: unknown } | null;
  failRead?: boolean;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const reads: string[] = [];

  const client = {
    from(table: string) {
      let mode: "select" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const chain = {
        select(columns: string) {
          mode = "select";
          reads.push(`${table}:${columns}`);
          return chain;
        },
        update(row: Record<string, unknown>) {
          mode = "update";
          payload = row;
          return chain;
        },
        eq: () => chain,
        async maybeSingle() {
          if (options?.failRead) {
            return { data: null, error: { message: "read failed" } };
          }
          return { data: options?.storedRow ?? null, error: null };
        },
        then(resolve: (value: { error: unknown }) => void) {
          if (mode === "update") updates.push(payload);
          resolve({ error: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  return { client, updates, reads: () => reads };
}

const SITE_ID = "11111111-2222-3333-4444-555555555555";
const VECTOR = Array.from({ length: 14 }, (_, i) => i / 14);

test("a fresh row gets the metrics, the vector and the timestamp in one update", async () => {
  const fake = metricsClient();
  setClientForTests(fake.client);

  const result = await writeMetrics(SITE_ID, { reliefM: 0.4, sds: 0.1 }, VECTOR);

  expect(result).toEqual({ write: "written", reason: null });
  expect(fake.updates).toHaveLength(1);
  const update = fake.updates[0];
  expect(Object.keys(update).sort()).toEqual([
    "metrics",
    "metrics_at",
    "metrics_vector",
  ]);
  expect(update.metrics).toEqual({ reliefM: 0.4, sds: 0.1 });
  expect(update.metrics_vector).toBe(JSON.stringify(VECTOR));
  // A computation that has a vector needs no pre-read: it replaces all three.
  expect(fake.reads()).toEqual([]);
  setClientForTests(null);
});

test("a computation with no vector never lands beside a stored one", async () => {
  const fake = metricsClient({ storedRow: { metrics_vector: JSON.stringify(VECTOR) } });
  setClientForTests(fake.client);

  const result = await writeMetrics(SITE_ID, { reliefM: 0.9 }, null);

  expect(result).toEqual({
    write: "skipped",
    reason: "would replace a complete vector with none",
  });
  // Nothing was written, so the row keeps the complete computation it had.
  expect(fake.updates).toEqual([]);
  expect(fake.reads()).toEqual(["sites:metrics_vector"]);
  setClientForTests(null);
});

test("a row with no stored vector takes the metrics and a null vector together", async () => {
  const fake = metricsClient({ storedRow: { metrics_vector: null } });
  setClientForTests(fake.client);

  const result = await writeMetrics(SITE_ID, { reliefM: 0.9 }, null);

  expect(result).toEqual({ write: "written", reason: null });
  expect(fake.updates).toHaveLength(1);
  expect(Object.keys(fake.updates[0]).sort()).toEqual([
    "metrics",
    "metrics_at",
    "metrics_vector",
  ]);
  expect(fake.updates[0].metrics_vector).toBeNull();
  setClientForTests(null);
});

test("a stored row with no vector gains one when the computation has all fourteen", async () => {
  const fake = metricsClient({ storedRow: { metrics_vector: null } });
  setClientForTests(fake.client);

  const result = await writeMetrics(SITE_ID, { reliefM: 0.9 }, VECTOR);

  expect(result).toEqual({ write: "written", reason: null });
  expect(fake.updates[0].metrics_vector).toBe(JSON.stringify(VECTOR));
  setClientForTests(null);
});

test("a pre-read that fails is unavailable rather than a write with no vector", async () => {
  const fake = metricsClient({ failRead: true });
  setClientForTests(fake.client);

  const result = await writeMetrics(SITE_ID, { reliefM: 0.9 }, null);

  expect(result).toEqual({ write: "unavailable", reason: null });
  expect(fake.updates).toEqual([]);
  setClientForTests(null);
});
