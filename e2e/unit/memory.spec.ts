import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkRateLimit,
  clientIpFrom,
  getOrCreateSite,
  hashIp,
  isLocalSiteId,
  memoryStatus,
  setClientForTests,
  withMemory,
} from "../../src/lib/datum/memory";

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
  } as unknown as SupabaseClient;
}

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

test("the offline fallback serves a local- prefixed site id", async () => {
  setClientForTests(rejectingClient());
  const site = await getOrCreateSite({
    lat: 33.7751258,
    lng: -84.391975,
    locality: "Atlanta, Georgia",
    isTest: true,
  });
  expect(isLocalSiteId(site.id)).toBe(true);
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
