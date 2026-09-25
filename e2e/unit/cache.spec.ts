import { test, expect } from "@playwright/test";
import {
  CACHE_SIZE_WARN_BYTES,
  cached,
  clearMemoryCache,
  createMemoryCacheApi,
  createSupabaseCacheApi,
  type CacheClient,
} from "../../src/lib/datum/cache";
import type { CacheEntry } from "../../src/lib/datum/types";

const NOW = () => new Date("2026-09-22T12:00:00.000Z");

interface FakeRow {
  cache_key: string;
  source: string;
  url: string;
  http_status: number;
  body: unknown;
  fetched_at: string;
  expires_at: string;
}

/** Only the methods createSupabaseCacheApi calls. */
function fakeClient() {
  const rows = new Map<string, FakeRow>();
  const client: CacheClient = {
    from() {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                gt(_expires: string, atIso: string) {
                  return {
                    async maybeSingle() {
                      const row = rows.get(value);
                      if (!row || row.expires_at <= atIso) {
                        return { data: null, error: null };
                      }
                      return { data: row, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        async upsert(row: Record<string, unknown>) {
          rows.set(String(row.cache_key), row as unknown as FakeRow);
          return { error: null };
        },
      };
    },
  };
  return { client, rows };
}

test("a producer failure writes nothing to the cache", async () => {
  const { client, rows } = fakeClient();
  const ctx = { cache: createSupabaseCacheApi(client, NOW), now: NOW };

  const error = await cached(
    "fema:33.775,-84.392",
    2_592_000,
    async () => {
      throw new Error("FEMA refused the connection");
    },
    ctx,
  ).catch((e: Error) => e);

  expect(error).toBeInstanceOf(Error);
  expect(rows.size).toBe(0);
});

test("a non cacheable success is returned but not written", async () => {
  const { client, rows } = fakeClient();
  const ctx = { cache: createSupabaseCacheApi(client, NOW), now: NOW };

  const result = await cached(
    "overpass:33.775,-84.392",
    2_592_000,
    async () => ({
      source: "overpass",
      url: "https://overpass-api.de/api/interpreter",
      status: 200,
      body: { elements: [] },
      cacheable: false,
    }),
    ctx,
  );

  expect(result.cached).toBe(false);
  expect(rows.size).toBe(0);
});

test("a cacheable success is written once and read back on the second call", async () => {
  const { client, rows } = fakeClient();
  const ctx = { cache: createSupabaseCacheApi(client, NOW), now: NOW };
  let produced = 0;

  const producer = async () => {
    produced += 1;
    return {
      source: "usgs_epqs",
      url: "https://epqs.nationalmap.gov/v1/json?x=-84.392&y=33.775",
      status: 200,
      body: { value: "281.726" },
      cacheable: true,
    };
  };

  const first = await cached("usgs_epqs:33.775,-84.392", 31_536_000, producer, ctx);
  expect(first.cached).toBe(false);
  expect(rows.size).toBe(1);

  const second = await cached("usgs_epqs:33.775,-84.392", 31_536_000, producer, ctx);
  expect(second.cached).toBe(true);
  expect(second.entry.body).toEqual({ value: "281.726" });
  expect(produced).toBe(1);
});

test("the in memory fallback honours the same TTL", async () => {
  clearMemoryCache();
  let clock = new Date("2026-09-22T12:00:00.000Z").getTime();
  const now = () => new Date(clock);
  const api = createMemoryCacheApi(now);
  const entry: CacheEntry = {
    source: "openmeteo",
    url: "https://archive-api.open-meteo.com/v1/archive",
    httpStatus: 200,
    body: { timezone: "America/New_York" },
    fetchedAt: now().toISOString(),
  };

  await api.set("openmeteo:33.8,-84.4", entry, 60);
  expect(await api.get("openmeteo:33.8,-84.4")).toEqual(entry);

  clock += 61_000;
  expect(await api.get("openmeteo:33.8,-84.4")).toBeNull();
});

test("a body above the 3 MB threshold is flagged and warned about once", async () => {
  const { client, rows } = fakeClient();
  const ctx = { cache: createSupabaseCacheApi(client, NOW), now: NOW };

  // 3.1 MB of payload (3.1 x 1024 x 1024 bytes), past the 3 MB threshold.
  const bigBody = { elements: ["x".repeat(Math.round(3.1 * 1024 * 1024))] };

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  let result;
  try {
    result = await cached(
      "overpass:33.775,-84.392",
      2_592_000,
      async () => ({
        source: "overpass",
        url: "https://overpass-api.de/api/interpreter?data=secret",
        status: 200,
        body: bigBody,
        cacheable: true,
      }),
      ctx,
    );
  } finally {
    console.warn = originalWarn;
  }

  expect(result.sizeWarning).toBe(true);
  expect(result.entry.bodyBytes).toBeGreaterThan(CACHE_SIZE_WARN_BYTES);
  expect(result.entry.bodyBytes).toBe(Buffer.byteLength(JSON.stringify(bigBody)));
  expect(rows.size).toBe(1);

  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("overpass");
  expect(warnings[0]).toContain(String(result.entry.bodyBytes));
  // The URL and its query string never reach the log line.
  expect(warnings[0]).not.toContain("secret");
  expect(warnings[0]).not.toContain("http");
});

test("a small body records its size and raises no warning", async () => {
  const { client } = fakeClient();
  const ctx = { cache: createSupabaseCacheApi(client, NOW), now: NOW };

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  let result;
  try {
    result = await cached(
      "usgs_epqs:33.775,-84.392",
      31_536_000,
      async () => ({
        source: "usgs_epqs",
        url: "https://epqs.nationalmap.gov/v1/json",
        status: 200,
        body: { value: "281.726" },
        cacheable: true,
      }),
      ctx,
    );
  } finally {
    console.warn = originalWarn;
  }

  expect(result.sizeWarning).toBe(false);
  expect(result.entry.bodyBytes).toBe(19);
  expect(warnings).toEqual([]);
});
