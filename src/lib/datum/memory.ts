// Supabase access for Site Memory: the client singleton, the offline guard,
// site records, layer results, and the per IP rate limit.
// SPEC.md section 13. Key values are never logged and never returned.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import {
  MEMORY_OFFLINE_COOLDOWN_MS,
  MEMORY_TIMEOUT_MS,
  RATE_LIMIT_PER_DAY,
} from "./constants";
import { publicPoint, siteKey as siteKeyOf } from "./geo";
import type {
  LayerEnvelope,
  LayerName,
  MemoryStatus,
  SiteRecord,
} from "./types";

// ─── Client singleton ────────────────────────────────────────────────────────

let client: SupabaseClient | null = null;
let clientResolved = false;

/**
 * The service side client. Returns null when the project is not configured, so
 * every caller falls back to the in memory path rather than throwing.
 */
export function getClient(): SupabaseClient | null {
  if (clientResolved) return client;
  clientResolved = true;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    client = null;
    return client;
  }
  client = createClient(url, secret, { auth: { persistSession: false } });
  return client;
}

/** Test seam: inject a fake client and reset the offline guard. */
export function setClientForTests(fake: SupabaseClient | null): void {
  client = fake;
  clientResolved = true;
  status = "online";
  offlineUntil = 0;
  localSites.clear();
  localRateLimits.clear();
}

// ─── Offline guard ───────────────────────────────────────────────────────────

let status: MemoryStatus = "online";
let offlineUntil = 0;

export function memoryStatus(): MemoryStatus {
  if (status === "offline" && Date.now() >= offlineUntil) {
    status = "online";
  }
  return status;
}

function goOffline(): void {
  status = "offline";
  offlineUntil = Date.now() + MEMORY_OFFLINE_COOLDOWN_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Site Memory timed out.")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Run one Supabase operation with a 3 s timeout and a single retry. Any failure
 * flips the module to offline for 60 s and resolves undefined, so callers use
 * their in memory fallback instead of surfacing an error.
 */
export async function withMemory<T>(
  op: (db: SupabaseClient) => Promise<T>,
): Promise<T | undefined> {
  if (memoryStatus() === "offline") return undefined;
  const db = getClient();
  if (!db) {
    goOffline();
    return undefined;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await withTimeout(op(db), MEMORY_TIMEOUT_MS);
    } catch {
      if (attempt === 1) {
        goOffline();
        return undefined;
      }
    }
  }
  return undefined;
}

// ─── IP hashing ──────────────────────────────────────────────────────────────

/** Fixed application salt. Raw IPs are never stored or logged. */
const IP_SALT = "datum.site-memory.v1";

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}${IP_SALT}`).digest("hex");
}

/** The first entry of x-forwarded-for, or a stable placeholder. */
export function clientIpFrom(headerValue: string | null): string {
  if (!headerValue) return "unknown";
  const first = headerValue.split(",")[0].trim();
  return first.length > 0 ? first : "unknown";
}

// ─── Sites ───────────────────────────────────────────────────────────────────

const localSites = new Map<string, SiteRecord>();

function localSiteId(key: string): string {
  return `local-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

export function isLocalSiteId(id: string): boolean {
  return id.startsWith("local-");
}

export interface SiteInput {
  lat: number;
  lng: number;
  locality?: string | null;
  tractGeoid?: string | null;
  isTest?: boolean;
}

export async function findSite(key: string): Promise<SiteRecord | null> {
  const row = await withMemory(async (db) => {
    const { data, error } = await db
      .from("sites")
      .select("*")
      .eq("site_key", key)
      .maybeSingle();
    if (error) throw new Error("sites lookup failed");
    return (data as SiteRecord | null) ?? null;
  });
  if (row !== undefined) return row;
  return localSites.get(key) ?? null;
}

export async function getOrCreateSite(input: SiteInput): Promise<SiteRecord> {
  const key = siteKeyOf(input.lat, input.lng);
  const pub = publicPoint(input.lat, input.lng);
  const nowIso = new Date().toISOString();

  const existing = await findSite(key);
  if (existing) {
    await touchSite(existing.id);
    return existing;
  }

  const row = await withMemory(async (db) => {
    const { data, error } = await db
      .from("sites")
      .insert({
        site_key: key,
        lat: input.lat,
        lng: input.lng,
        public_lat: pub.lat,
        public_lng: pub.lng,
        locality: input.locality ?? null,
        tract_geoid: input.tractGeoid ?? null,
        is_test: input.isTest === true,
      })
      .select("*")
      .single();
    if (error) throw new Error("sites insert failed");
    return data as SiteRecord;
  });
  if (row) return row;

  const fallback: SiteRecord = {
    id: localSiteId(key),
    site_key: key,
    lat: input.lat,
    lng: input.lng,
    public_lat: pub.lat,
    public_lng: pub.lng,
    locality: input.locality ?? null,
    tract_geoid: input.tractGeoid ?? null,
    is_test: input.isTest === true,
    created_at: nowIso,
    last_analyzed_at: nowIso,
    analysis_count: 1,
    schema_version: 1,
  };
  localSites.set(key, fallback);
  return fallback;
}

export async function getSiteById(id: string): Promise<SiteRecord | null> {
  if (isLocalSiteId(id)) {
    for (const record of localSites.values()) {
      if (record.id === id) return record;
    }
    return null;
  }
  const row = await withMemory(async (db) => {
    const { data, error } = await db
      .from("sites")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("sites lookup failed");
    return (data as SiteRecord | null) ?? null;
  });
  return row ?? null;
}

export async function touchSite(id: string): Promise<void> {
  if (isLocalSiteId(id)) {
    for (const record of localSites.values()) {
      if (record.id === id) {
        record.last_analyzed_at = new Date().toISOString();
        record.analysis_count += 1;
      }
    }
    return;
  }
  await withMemory(async (db) => {
    const { error } = await db
      .from("sites")
      .update({ last_analyzed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("sites touch failed");
    return true;
  });
}

// ─── Layer results ───────────────────────────────────────────────────────────

/** Only ok, partial, and no_coverage envelopes reach this (SPEC section 13). */
export async function storeLayerResult(
  siteId: string,
  layer: LayerName,
  envelope: LayerEnvelope<unknown>,
  ttlSeconds: number,
): Promise<void> {
  if (isLocalSiteId(siteId)) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await withMemory(async (db) => {
    const { error } = await db.from("layer_results").upsert(
      {
        site_id: siteId,
        layer,
        status: envelope.status,
        envelope,
        computed_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: "site_id,layer" },
    );
    if (error) throw new Error("layer_results write failed");
    return true;
  });
}

// ─── Rate limit ──────────────────────────────────────────────────────────────

const localRateLimits = new Map<string, number>();

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: string;
  limit: number;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function nextUtcMidnight(now: Date): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

/**
 * The 20 uncached analyses per IP per day cap. Pass `increment: false` to peek,
 * which is what a re-open of an already analyzed site does: re-opens are free
 * (SPEC section 13).
 *
 * Deviation: the spec writes this as one `insert ... on conflict do update set
 * count = count + 1 returning count`. PostgREST cannot express an incrementing
 * upsert without a SQL function, and migration 0001 is fixed by the spec, so
 * this reads then writes. The window is one request wide on a 20 per day cap.
 */
export async function checkRateLimit(
  ipHash: string,
  options?: { increment?: boolean },
): Promise<RateLimitResult> {
  const increment = options?.increment !== false;
  const now = new Date();
  const day = utcDay(now);
  const localKey = `${ipHash}:${day}`;

  const remote = await withMemory(async (db) => {
    const { data, error } = await db
      .from("rate_limits")
      .select("count")
      .eq("ip_hash", ipHash)
      .eq("day", day)
      .maybeSingle();
    if (error) throw new Error("rate_limits read failed");
    const current = (data as { count: number } | null)?.count ?? 0;
    if (!increment) return current;
    const next = current + 1;
    const { error: writeError } = await db
      .from("rate_limits")
      .upsert({ ip_hash: ipHash, day, count: next }, { onConflict: "ip_hash,day" });
    if (writeError) throw new Error("rate_limits write failed");
    return next;
  });

  let count: number;
  if (remote !== undefined) {
    count = remote;
  } else {
    const current = localRateLimits.get(localKey) ?? 0;
    count = increment ? current + 1 : current;
    if (increment) localRateLimits.set(localKey, count);
  }

  return {
    allowed: count <= RATE_LIMIT_PER_DAY,
    count,
    remaining: Math.max(0, RATE_LIMIT_PER_DAY - count),
    resetAt: nextUtcMidnight(now),
    limit: RATE_LIMIT_PER_DAY,
  };
}
