// api_cache reads and writes with an in memory fallback.
// SPEC.md section 13. Only cacheable results are written: ok, partial, and
// no_coverage. Timeouts, 5xx, parse errors, and rate limits are never cached,
// so a retry is never served a cached failure.

import type { CacheApi, CacheEntry, SourceContext } from "./types";

export type { CacheApi, CacheEntry } from "./types";

// ─── The producer contract ───────────────────────────────────────────────────

export interface CacheProducerResult {
  source: string;
  url: string;
  status: number;
  /** The trimmed payload, not the raw response. */
  body: unknown;
  /** True only for ok, partial, and no_coverage. */
  cacheable: boolean;
}

export interface CachedResult {
  entry: CacheEntry;
  cached: boolean;
  /** True when the serialized body passed CACHE_SIZE_WARN_BYTES. */
  sizeWarning: boolean;
}

/**
 * The size a single cached body may reach before it is flagged (owner decision
 * 3, 2026-09-24). Atlanta's trimmed Overpass payload is about 1.42 MB, so this
 * is roughly twice the worst case seen and catches a payload that has grown
 * past what the free tier database can hold at scale.
 */
export const CACHE_SIZE_WARN_BYTES = 3_145_728;

/**
 * Read `key` from the cache, or run the producer and write it when the producer
 * reports a cacheable result. A producer that throws writes nothing and the
 * error propagates to the source module, which turns it into an unavailable
 * envelope.
 */
export async function cached(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<CacheProducerResult>,
  ctx: Pick<SourceContext, "cache" | "now">,
): Promise<CachedResult> {
  const hit = await ctx.cache.get(key).catch(() => null);
  if (hit) {
    return {
      entry: hit,
      cached: true,
      sizeWarning:
        typeof hit.bodyBytes === "number" &&
        hit.bodyBytes > CACHE_SIZE_WARN_BYTES,
    };
  }

  const produced = await producer();
  const entry: CacheEntry = {
    source: produced.source,
    url: produced.url,
    httpStatus: produced.status,
    body: produced.body,
    fetchedAt: ctx.now().toISOString(),
  };
  let sizeWarning = false;
  if (produced.cacheable) {
    // Measured on the trimmed body that is actually stored, not the response.
    // JSON.stringify returns undefined for undefined and for a bare function or
    // symbol; there is no size to report for those, so bodyBytes stays absent
    // rather than being recorded as the zero bytes of an empty string.
    const serialized = JSON.stringify(produced.body);
    if (serialized !== undefined) {
      entry.bodyBytes = Buffer.byteLength(serialized);
      sizeWarning = entry.bodyBytes > CACHE_SIZE_WARN_BYTES;
    }
    if (sizeWarning) {
      // The source and the size only. A cache key or URL can carry a query
      // string with a coordinate in it, which does not belong in a log line.
      console.warn(
        `[datum] cached payload from ${produced.source} is ${entry.bodyBytes} bytes, above the ${CACHE_SIZE_WARN_BYTES} byte threshold`,
      );
    }
    await ctx.cache.set(key, entry, ttlSeconds).catch(() => undefined);
  }
  return { entry, cached: false, sizeWarning };
}

// ─── In memory fallback ──────────────────────────────────────────────────────

interface MemoryRecord {
  entry: CacheEntry;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryRecord>();

/** Test seam. Not used in production code paths. */
export function clearMemoryCache(): void {
  memoryStore.clear();
}

export function createMemoryCacheApi(now: () => Date): CacheApi {
  return {
    async get(key: string): Promise<CacheEntry | null> {
      const record = memoryStore.get(key);
      if (!record) return null;
      if (record.expiresAt <= now().getTime()) {
        memoryStore.delete(key);
        return null;
      }
      return record.entry;
    },
    async set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void> {
      memoryStore.set(key, {
        entry,
        expiresAt: now().getTime() + ttlSeconds * 1000,
      });
    },
  };
}

// ─── Supabase backed cache ───────────────────────────────────────────────────

interface CacheRow {
  source: string;
  url: string;
  http_status: number;
  body: unknown;
  fetched_at: string;
}

/**
 * The narrow slice of the Supabase client that the cache uses. Declared here so
 * the unit tests can pass a fake object with only these methods.
 */
export interface CacheClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        gt(
          column: string,
          value: string,
        ): {
          maybeSingle(): Promise<{ data: CacheRow | null; error: unknown }>;
        };
      };
    };
    upsert(
      row: Record<string, unknown>,
      options: { onConflict: string },
    ): Promise<{ error: unknown }>;
  };
}

export function createSupabaseCacheApi(
  client: CacheClient,
  now: () => Date,
): CacheApi {
  return {
    async get(key: string): Promise<CacheEntry | null> {
      const { data, error } = await client
        .from("api_cache")
        .select("source,url,http_status,body,fetched_at")
        .eq("cache_key", key)
        .gt("expires_at", now().toISOString())
        .maybeSingle();
      if (error || !data) return null;
      return {
        source: data.source,
        url: data.url,
        httpStatus: data.http_status,
        body: data.body,
        fetchedAt: data.fetched_at,
      };
    },
    async set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void> {
      const expiresAt = new Date(now().getTime() + ttlSeconds * 1000);
      await client.from("api_cache").upsert(
        {
          cache_key: key,
          source: entry.source,
          url: entry.url,
          http_status: entry.httpStatus,
          body: entry.body,
          fetched_at: entry.fetchedAt,
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: "cache_key" },
      );
    },
  };
}

/**
 * The cache the routes use: Supabase when memory is online, the per instance
 * Map with the same TTLs when it is not, and the Map again whenever a Supabase
 * call fails (SPEC section 13, paused database).
 */
export function createCacheApi(
  client: CacheClient | null,
  now: () => Date,
): CacheApi {
  const fallback = createMemoryCacheApi(now);
  if (!client) return fallback;
  const remote = createSupabaseCacheApi(client, now);
  return {
    async get(key: string): Promise<CacheEntry | null> {
      try {
        const hit = await remote.get(key);
        if (hit) return hit;
      } catch {
        // fall through to the in memory cache
      }
      return fallback.get(key);
    },
    async set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void> {
      await fallback.set(key, entry, ttlSeconds);
      try {
        await remote.set(key, entry, ttlSeconds);
      } catch {
        // the in memory copy is already written
      }
    },
  };
}
