import { test, expect } from "@playwright/test";
import {
  CACHE_SIZE_WARN_BYTES,
  cached,
  clearMemoryCache,
  createCacheApi,
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

// ─── The upsert error is surfaced ────────────────────────────────────────────

/** A client whose upsert always reports a failure the way Supabase does. */
function failingUpsertClient(message: string) {
  const { client } = fakeClient();
  const attempts: number[] = [];
  const wrapped: CacheClient = {
    from(table: string) {
      const real = client.from(table);
      return {
        select: real.select.bind(real),
        async upsert() {
          attempts.push(1);
          return { error: { message } };
        },
      };
    },
  };
  return { client: wrapped, attempts };
}

test("a failed api_cache upsert throws instead of passing silently", async () => {
  const { client, attempts } = failingUpsertClient("permission denied for table api_cache");
  const api = createSupabaseCacheApi(client, NOW);
  const entry: CacheEntry = {
    source: "usgs_epqs",
    url: "https://epqs.nationalmap.gov/v1/json",
    httpStatus: 200,
    body: { value: "281.726" },
    fetchedAt: NOW().toISOString(),
  };

  await expect(api.set("usgs_epqs:33.775,-84.392", entry, 60)).rejects.toThrow(
    /api_cache upsert failed/,
  );
  expect(attempts).toHaveLength(1);
});

test("the surfaced upsert error names the source and no URL or key", async () => {
  const { client } = failingUpsertClient("permission denied");
  const api = createSupabaseCacheApi(client, NOW);
  const entry: CacheEntry = {
    source: "overpass",
    url: "https://overpass-api.de/api/interpreter?data=secret",
    httpStatus: 200,
    body: {},
    fetchedAt: NOW().toISOString(),
  };

  const failure = await api
    .set("overpass:33.775,-84.392", entry, 60)
    .then(() => null)
    .catch((error: unknown) => String(error));
  expect(failure).toContain("overpass");
  expect(failure).toContain("permission denied");
  expect(failure).not.toContain("secret");
  expect(failure).not.toContain("33.775");
});

test("the wrapper keeps the in memory copy when the persistent write fails", async () => {
  clearMemoryCache();
  const { client } = failingUpsertClient("permission denied");
  const api = createCacheApi(client, NOW);
  const entry: CacheEntry = {
    source: "usgs_epqs",
    url: "https://epqs.nationalmap.gov/v1/json",
    httpStatus: 200,
    body: { value: "281.726" },
    fetchedAt: NOW().toISOString(),
  };

  // The wrapper swallows the failure, because the in memory copy is written.
  await api.set("usgs_epqs:33.775,-84.392", entry, 60);
  expect(await api.get("usgs_epqs:33.775,-84.392")).toEqual(entry);
  clearMemoryCache();
});

// ─── The size guard on a persistent hit ──────────────────────────────────────

test("a persistent hit measures its size, so the guard works on a cold instance", async () => {
  clearMemoryCache();
  const { client, rows } = fakeClient();
  const bigBody = { elements: ["x".repeat(Math.round(3.1 * 1024 * 1024))] };
  const expected = Buffer.byteLength(JSON.stringify(bigBody));

  // The row is in the database, written by some other instance: it carries no
  // bodyBytes, because api_cache has no such column.
  rows.set("overpass:33.775,-84.392", {
    cache_key: "overpass:33.775,-84.392",
    source: "overpass",
    url: "https://overpass-api.de/api/interpreter?data=secret",
    http_status: 200,
    body: bigBody,
    fetched_at: NOW().toISOString(),
    expires_at: new Date(NOW().getTime() + 60_000).toISOString(),
  });

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
      async () => {
        throw new Error("the producer must not run on a hit");
      },
      { cache: createSupabaseCacheApi(client, NOW), now: NOW },
    );
  } finally {
    console.warn = originalWarn;
  }

  expect(result.cached).toBe(true);
  expect(result.entry.bodyBytes).toBe(expected);
  expect(result.sizeWarning).toBe(true);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("overpass");
  expect(warnings[0]).not.toContain("secret");
});

test("a small persistent hit measures its size and raises no warning", async () => {
  const { client, rows } = fakeClient();
  const body = { value: "281.726" };
  rows.set("usgs_epqs:33.775,-84.392", {
    cache_key: "usgs_epqs:33.775,-84.392",
    source: "usgs_epqs",
    url: "https://epqs.nationalmap.gov/v1/json",
    http_status: 200,
    body,
    fetched_at: NOW().toISOString(),
    expires_at: new Date(NOW().getTime() + 60_000).toISOString(),
  });

  const result = await cached(
    "usgs_epqs:33.775,-84.392",
    31_536_000,
    async () => {
      throw new Error("the producer must not run on a hit");
    },
    { cache: createSupabaseCacheApi(client, NOW), now: NOW },
  );

  expect(result.cached).toBe(true);
  expect(result.entry.bodyBytes).toBe(Buffer.byteLength(JSON.stringify(body)));
  expect(result.sizeWarning).toBe(false);
});
