import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkRateLimit,
  clientIpFrom,
  getOrCreateSite,
  hashIp,
  isLocalSiteId,
  issueLocalSiteId,
  memoryStatus,
  peekRateLimit,
  setClientForTests,
  verifyLocalSiteId,
  withMemory,
} from "../../src/lib/datum/memory";
import { RATE_LIMIT_PEEK_MEMO_MS } from "../../src/lib/datum/constants";

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
