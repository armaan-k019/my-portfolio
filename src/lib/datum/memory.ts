// Supabase access for Site Memory: the client singleton, the offline guard,
// site records, layer results, and the per IP rate limit.
// SPEC.md section 13. Key values are never logged and never returned.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  MEMORY_OFFLINE_COOLDOWN_MS,
  MEMORY_TIMEOUT_MS,
  PEEK_MEMO_MAX,
  RATE_LIMIT_PEEK_MEMO_MS,
  RATE_LIMIT_PER_DAY,
} from "./constants";
import type { CitationCheck } from "./brief/citations";
import { publicPoint, siteKey as siteKeyOf } from "./geo";
import {
  METRICS_MIN_PRESENT,
  METRIC_LAYERS,
  PERCENTILE_METRICS,
  PERCENTILE_MIN_SITES,
  VECTOR_LENGTH,
  closestComponents,
  maskedDistance,
  matchPercent,
  presentCount,
} from "./metrics";
import type { MetricName } from "./metrics";
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

/**
 * Test seam: inject a fake client and reset the offline guard. Inert in
 * production, so nothing that reaches a deployed build can swap the client out
 * from under Site Memory.
 */
export function setClientForTests(fake: SupabaseClient | null): void {
  if (process.env.NODE_ENV === "production") return;
  client = fake;
  clientResolved = true;
  status = "online";
  offlineUntil = 0;
  localSites.clear();
  seenSites.clear();
  localRateLimits.clear();
  peekMemo.clear();
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
 *
 * `retry: false` is for an operation that is not safe to repeat. The rate limit
 * increment is one such: a timeout can fire on a call the database has already
 * committed, and a retry would then charge the same request twice. Those
 * operations get one attempt and fall back on failure.
 */
export async function withMemory<T>(
  op: (db: SupabaseClient) => Promise<T>,
  options?: { retry?: boolean },
): Promise<T | undefined> {
  if (memoryStatus() === "offline") return undefined;
  const db = getClient();
  if (!db) {
    goOffline();
    return undefined;
  }
  const attempts = options?.retry === false ? 1 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await withTimeout(op(db), MEMORY_TIMEOUT_MS);
    } catch {
      if (attempt === attempts - 1) {
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

/**
 * The offline site rows this instance holds, keyed the way the table is now
 * keyed: (site_key, is_test) is unique since migration 0002, so a test row and
 * a real row may sit at the same rounded point and the local map has to be able
 * to hold both.
 */
const localSites = new Map<string, SiteRecord>();

/**
 * The composite key of the unique constraint, as one map key. Named for the
 * site map rather than just "localKey", because the rate limit path has a local
 * variable of that name.
 */
function localSiteMapKey(key: string, isTest: boolean): string {
  return `${key}|${isTest ? "test" : "live"}`;
}

/**
 * Database site rows this instance has already seen, keyed by site id.
 *
 * Site Memory can flip offline in the middle of an analysis (observed twice in
 * six runs on a slow link, PROGRESS.md fourth round). The layer routes resolve
 * their site by id on every call, so the flip turned a site the instance had
 * just created into a 404 and the run died halfway through. Remembering the row
 * lets the run finish on data the instance has already read from the database.
 *
 * Residual, deliberately not fixed here: an instance that never saw the row
 * still answers null while the guard is tripped. Serving a row this process
 * never read would mean inventing one, so a cold instance waits out the 60 s
 * cool down instead.
 */
const seenSites = new Map<string, SiteRecord>();

/** Bounded the same way as the peek memo: cleared whole at the bound. */
function remember(record: SiteRecord): void {
  if (seenSites.size >= PEEK_MEMO_MAX) seenSites.clear();
  seenSites.set(record.id, record);
}

const LOCAL_ID_PREFIX = "local-";
const LOCAL_ID_SIG_LENGTH = 32;
const DAY_MS = 86_400_000;

let localIdSecret: string | null = null;

/**
 * The signing key for local site ids. Read once, never logged, never returned.
 *
 * When SUPABASE_SECRET_KEY is absent Site Memory is not configured at all, so
 * there is no project behind the id to protect. The fallback is nonetheless a
 * fresh 32 random bytes, generated once per process, never a fixed constant: a
 * constant in the source is a published signing key, and anyone could then mint
 * an id for any point and spend layer calls without passing the site route.
 *
 * The cost of a per process key is that an id issued in the unconfigured
 * configuration does not verify after a cold start. That is the behaviour the
 * in memory site map already has, since it is per instance too, so an id whose
 * signature survived would have found no row to resolve against anyway.
 */
function localIdKey(): string {
  if (localIdSecret !== null) return localIdSecret;
  const secret = process.env.SUPABASE_SECRET_KEY;
  localIdSecret =
    secret && secret.length > 0 ? secret : randomBytes(32).toString("hex");
  return localIdSecret;
}

function localIdSignature(key: string, day: string): string {
  return createHmac("sha256", localIdKey())
    .update(`${key}|${day}`)
    .digest("hex")
    .slice(0, LOCAL_ID_SIG_LENGTH);
}

/**
 * The offline site id: `local-<siteKey>-<sig>`, where sig is the first 32 hex
 * characters of HMAC-SHA256 over `<siteKey>|<UTC day>`. The point travels
 * inside the id, so the layer route does not have to trust a query string, and
 * the signature means an id can only come from the site route, which charges
 * the daily cap before it issues one.
 *
 * `now` is a test seam for the day rollover; callers pass nothing.
 */
export function issueLocalSiteId(key: string, now: Date = new Date()): string {
  return `${LOCAL_ID_PREFIX}${key}-${localIdSignature(key, utcDay(now))}`;
}

export function isLocalSiteId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

/**
 * The inverse of issueLocalSiteId. Returns the site key and the point it
 * encodes, or null for anything forged, tampered with, or older than
 * yesterday. Yesterday is accepted so an analysis started before UTC midnight
 * still resolves its layers afterwards.
 */
export function verifyLocalSiteId(
  id: string,
): { siteKey: string; lat: number; lng: number } | null {
  if (!isLocalSiteId(id)) return null;
  const body = id.slice(LOCAL_ID_PREFIX.length);
  // The site key itself contains hyphens for southern and western points, so
  // the signature is taken from the last one.
  const cut = body.lastIndexOf("-");
  if (cut <= 0) return null;
  const key = body.slice(0, cut);
  const signature = body.slice(cut + 1);
  if (!/^[0-9a-f]{32}$/.test(signature)) return null;

  const parts = key.split(",");
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Only the canonical 3 dp spelling verifies, so one point has one id.
  if (siteKeyOf(lat, lng) !== key) return null;

  const now = Date.now();
  const days = [utcDay(new Date(now)), utcDay(new Date(now - DAY_MS))];
  if (!days.some((day) => localIdSignature(key, day) === signature)) return null;

  return { siteKey: key, lat, lng };
}

export interface SiteInput {
  lat: number;
  lng: number;
  locality?: string | null;
  tractGeoid?: string | null;
  isTest?: boolean;
}

/**
 * The row for one point, under the composite key migration 0002 made unique.
 * `site_key` alone is no longer unique, so a lookup that named only the key
 * could return a test row to a real analysis and the other way round.
 */
export async function findSite(
  key: string,
  isTest = false,
): Promise<SiteRecord | null> {
  const row = await withMemory(async (db) => {
    const { data, error } = await db
      .from("sites")
      .select("*")
      .eq("site_key", key)
      .eq("is_test", isTest)
      .maybeSingle();
    if (error) throw new Error("sites lookup failed");
    return (data as SiteRecord | null) ?? null;
  });
  if (row !== undefined) return row;
  return localSites.get(localSiteMapKey(key, isTest)) ?? null;
}

export async function getOrCreateSite(input: SiteInput): Promise<SiteRecord> {
  const key = siteKeyOf(input.lat, input.lng);
  const pub = publicPoint(input.lat, input.lng);
  const nowIso = new Date().toISOString();

  const isTest = input.isTest === true;

  const existing = await findSite(key, isTest);
  if (existing) return await reuseSite(existing, input);

  // The row is created with an upsert on the composite unique key migration
  // 0002 introduced, so a concurrent create of the same point resolves in the
  // database rather than in a second round trip. A column is written only when
  // this request has a value for it: a locality already on the row must not be
  // replaced with the null of a request whose reverse lookup failed.
  const row: Record<string, unknown> = {
    site_key: key,
    lat: input.lat,
    lng: input.lng,
    public_lat: pub.lat,
    public_lng: pub.lng,
    is_test: isTest,
  };
  if (typeof input.locality === "string") row.locality = input.locality;
  if (typeof input.tractGeoid === "string") row.tract_geoid = input.tractGeoid;

  const inserted = await withMemory(async (db) => {
    const { data, error } = await db
      .from("sites")
      .upsert(row, { onConflict: "site_key,is_test" })
      .select("*")
      .single();
    if (error) {
      // A concurrent request inserted the same (site_key, is_test) between the lookup
      // above and this insert. Losing that race is not a failure of Site
      // Memory, so it must not flip the module offline and must not fall back
      // to a local id: the winner's row is the row this request wants.
      if (isUniqueViolation(error)) return RACED;
      throw new Error("sites upsert failed");
    }
    return data as SiteRecord;
  });
  if (inserted === RACED) {
    const winner = await findSite(key, isTest);
    if (winner) return await reuseSite(winner, input);
  } else if (inserted) {
    remember(inserted);
    return inserted;
  }

  const fallback: SiteRecord = {
    id: issueLocalSiteId(key),
    site_key: key,
    lat: input.lat,
    lng: input.lng,
    public_lat: pub.lat,
    public_lng: pub.lng,
    locality: input.locality ?? null,
    tract_geoid: input.tractGeoid ?? null,
    is_test: isTest,
    created_at: nowIso,
    last_analyzed_at: nowIso,
    analysis_count: 1,
    schema_version: 1,
  };
  localSites.set(localSiteMapKey(key, isTest), fallback);
  return fallback;
}

/** The sentinel a lost insert race returns, distinct from a row and from undefined. */
const RACED = Symbol("sites insert raced");

/** Postgres unique violation, as Supabase reports it on the error object. */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "23505";
}

/**
 * An existing row is touched and returned. A row that predates a locality or a
 * tract this request now has gets them written back in the same update: the
 * first analysis of a point can run before the Census geocoder has answered,
 * and without this the columns stay null for the life of the row.
 */
async function reuseSite(existing: SiteRecord, input: SiteInput): Promise<SiteRecord> {
  const backfill: { locality?: string; tract_geoid?: string } = {};
  if (existing.locality === null && typeof input.locality === "string") {
    backfill.locality = input.locality;
  }
  if (existing.tract_geoid === null && typeof input.tractGeoid === "string") {
    backfill.tract_geoid = input.tractGeoid;
  }
  await touchSite(existing.id, backfill);
  const updated = { ...existing, ...backfill };
  if (!isLocalSiteId(updated.id)) remember(updated);
  return updated;
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
  if (row === undefined) {
    // Offline, or the guard is in its cool down. A row this instance has
    // already read is served rather than a null, so a flip in the middle of an
    // analysis does not turn the remaining layer calls into 404s.
    return seenSites.get(id) ?? null;
  }
  if (row) remember(row);
  return row;
}

export async function touchSite(
  id: string,
  patch?: { locality?: string; tract_geoid?: string },
): Promise<void> {
  if (isLocalSiteId(id)) {
    for (const record of localSites.values()) {
      if (record.id === id) {
        record.last_analyzed_at = new Date().toISOString();
        record.analysis_count += 1;
        if (patch?.locality !== undefined) record.locality = patch.locality;
        if (patch?.tract_geoid !== undefined) record.tract_geoid = patch.tract_geoid;
      }
    }
    return;
  }
  await withMemory(async (db) => {
    const { error } = await db
      .from("sites")
      .update({ last_analyzed_at: new Date().toISOString(), ...patch })
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

/**
 * Peek results, per hashed IP, for RATE_LIMIT_PEEK_MEMO_MS. The layer routes
 * peek on every call, and a peek is a read of one row that changes only when
 * the site route increments, so a warm layer request should not pay a round
 * trip for it. An increment on this instance clears the entry.
 *
 * The accepted cost (owner, fourth round, PROGRESS.md): an IP that has just hit
 * the cap can keep making layer calls for up to one minute, on this instance.
 */
const peekMemo = new Map<string, { result: RateLimitResult; until: number }>();

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
 * The increment goes through the `rate_limit_hit` SQL function from migration
 * 0001, which is one `insert ... on conflict do update set count = count + 1
 * returning count`, so two concurrent requests cannot both read the same count.
 * The peek is a plain select and writes nothing.
 */
export async function checkRateLimit(
  ipHash: string,
  options?: { increment?: boolean },
): Promise<RateLimitResult> {
  const increment = options?.increment !== false;
  const now = new Date();
  const day = utcDay(now);
  const localKey = `${ipHash}:${day}`;

  const remote = await withMemory(
    async (db) => {
      if (!increment) {
        const { data, error } = await db
          .from("rate_limits")
          .select("count")
          .eq("ip_hash", ipHash)
          .eq("day", day)
          .maybeSingle();
        if (error) throw new Error("rate_limits read failed");
        return (data as { count: number } | null)?.count ?? 0;
      }
      const { data, error } = await db.rpc("rate_limit_hit", {
        p_ip_hash: ipHash,
        p_day: day,
      });
      if (error) throw new Error("rate_limits increment failed");
      // The function returns the new count, so the first hit of a day is 1 and
      // nothing it can legitimately return is below that. Anything else (null,
      // a string, an empty array from a shape change) is a failure, not a zero:
      // Number(null) is 0, which would read as "no requests spent" and disable
      // the cap silently. Throwing sends this through the in memory counter
      // instead, whose failure mode is "allow" by design (SPEC section 13,
      // paused database, item 3): the cap survives per instance, and a paused
      // project never turns into a hard refusal for a real visitor.
      if (typeof data !== "number" || data < 1) {
        throw new Error("rate_limits increment failed");
      }
      return data;
    },
    // One attempt: see withMemory. A retried increment can double charge.
    { retry: !increment },
  );

  let count: number;
  if (remote !== undefined) {
    count = remote;
  } else {
    const current = localRateLimits.get(localKey) ?? 0;
    count = increment ? current + 1 : current;
    if (increment) localRateLimits.set(localKey, count);
  }

  // A peek is only ever as fresh as the last increment, so the memo for this
  // hash is dropped here rather than left to expire.
  if (increment) peekMemo.delete(ipHash);

  return {
    allowed: count <= RATE_LIMIT_PER_DAY,
    count,
    remaining: Math.max(0, RATE_LIMIT_PER_DAY - count),
    resetAt: nextUtcMidnight(now),
    limit: RATE_LIMIT_PER_DAY,
  };
}

/**
 * checkRateLimit with `increment: false`, memoised per hashed IP for 60 s. This
 * is what the layer routes call: they peek on every request and never charge,
 * so repeating the read for the same IP inside a minute buys nothing.
 *
 * `nowMs` is a test seam for the expiry; callers pass nothing.
 */
export async function peekRateLimit(
  ipHash: string,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const memo = peekMemo.get(ipHash);
  if (memo && memo.until > nowMs) return memo.result;
  const result = await checkRateLimit(ipHash, { increment: false });
  // Bounded: the memo has no eviction of its own, so it is cleared whole at
  // PEEK_MEMO_MAX. Losing it costs one read per hashed IP, never correctness.
  if (peekMemo.size >= PEEK_MEMO_MAX) peekMemo.clear();
  peekMemo.set(ipHash, {
    result,
    until: nowMs + RATE_LIMIT_PEEK_MEMO_MS,
  });
  return result;
}

// ─── Site metrics, percentiles, and similarity (SPEC section 14) ─────────────

/**
 * Whether test rows count towards percentiles, similar sites, and the public
 * map. The same two conditions the source overrides use (SPEC section 15): the
 * flag alone is not enough, so the map is inert in any production build. In
 * production this is always false and `is_test` rows are always excluded.
 */
export function includeTestSites(): boolean {
  return (
    process.env.DATUM_INCLUDE_TEST_SITES === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

/**
 * How many rows a similarity search reads. The vectors are fourteen doubles, so
 * a few thousand of them is a small payload and the distance loop over them is
 * trivial. The cap exists so the query can never grow without bound.
 */
export const SIMILAR_CANDIDATE_CAP = 2000;

/** How many points the public map returns, newest analysis first. */
const PUBLIC_SITES_CAP = 500;

/** What one writeMetrics call did, for the route that asked for it. */
export type MetricsWrite = "written" | "skipped" | "unavailable";

/** The outcome of one writeMetrics call, with why it was skipped. */
export interface MetricsWriteResult {
  write: MetricsWrite;
  /**
   * Why the write was skipped, for whoever reads the result. Never copy, never
   * rendered, and null on a write that happened or on a Site Memory failure.
   */
  reason: string | null;
}

/**
 * Write the named values, the vector, the mask and the timestamp onto the site
 * row.
 *
 * Only the components that were measured are stored in `metrics`. An absent one
 * is left out of the jsonb entirely rather than stored as `null`, because
 * `metric_percentile` selects on `metrics ? metric`: a stored null would join
 * the population for that metric and never satisfy `v < value`, which would
 * drag every percentile down by the count of the sites that could not measure
 * it.
 *
 * The four columns move together or not at all. `metrics`, `metrics_vector`,
 * `metrics_mask` and `metrics_at` describe one computation, so a partial update
 * would leave an older vector standing beside a newer mask with a timestamp
 * saying both were measured at once, and "sites like this" would then place the
 * site by entries nothing in the row still supports.
 *
 * A computation that produced no named value at all is not written, because an
 * empty jsonb would replace a good row with a record of the run where every
 * layer happened to fail. Neither is a computation with fewer than
 * METRICS_MIN_PRESENT components present when the row already holds one that
 * has at least that many: an ineligible measurement never overwrites an
 * eligible one. Both rules are the same rule, that a failed measurement never
 * overwrites a successful one.
 */
export async function writeMetrics(
  siteId: string,
  named: Record<string, number | null>,
  vector: number[],
  mask: number,
): Promise<MetricsWriteResult> {
  if (isLocalSiteId(siteId)) {
    return { write: "skipped", reason: "a local site has no row to write to" };
  }
  const metrics: Record<string, number> = {};
  for (const [name, value] of Object.entries(named)) {
    if (typeof value === "number" && Number.isFinite(value)) metrics[name] = value;
  }
  if (Object.keys(metrics).length === 0) {
    return { write: "skipped", reason: "the computation produced no named value" };
  }

  // An ineligible computation has to know what the row already holds before it
  // can write anything, because the four columns go together.
  if (presentCount(mask) < METRICS_MIN_PRESENT) {
    const stored = await withMemory(async (db) => {
      const { data, error } = await db
        .from("sites")
        .select("metrics_mask")
        .eq("id", siteId)
        .maybeSingle();
      if (error) throw new Error("sites metrics mask lookup failed");
      const row = (data as { metrics_mask: unknown } | null) ?? null;
      return { mask: parseMask(row === null ? null : row.metrics_mask) };
    });
    if (stored === undefined) return { write: "unavailable", reason: null };
    if (presentCount(stored.mask) >= METRICS_MIN_PRESENT) {
      return {
        write: "skipped",
        reason: "would replace an eligible vector with fewer than ten measures",
      };
    }
  }

  const update: Record<string, unknown> = {
    metrics,
    // pgvector's text input form. PostgREST sends the column as a string and
    // casts it, so the array is serialized rather than sent as JSON.
    metrics_vector: JSON.stringify(vector),
    metrics_mask: mask,
    metrics_at: new Date().toISOString(),
  };
  const written = await withMemory(async (db) => {
    const { error } = await db.from("sites").update(update).eq("id", siteId);
    if (error) throw new Error("sites metrics write failed");
    return true;
  });
  return written === true
    ? { write: "written", reason: null }
    : { write: "unavailable", reason: null };
}

/**
 * How many sites Site Memory holds, under the same test row gating. Null when
 * Site Memory could not answer: an offline project has no count, and reporting
 * zero would read as "no site has ever been analyzed".
 *
 * Only analyzed sites count. A row is created the moment a point is confirmed
 * and `metrics_at` is written only when a computation lands, so a site that was
 * abandoned before any layer answered sits in the table with no metrics at all.
 * Counting it would make the panel say Site Memory holds more analyses than it
 * can place anything against.
 */
export async function countSites(): Promise<number | null> {
  const count = await withMemory(async (db) => {
    let query = db
      .from("sites")
      .select("id", { count: "exact", head: true })
      .not("metrics_at", "is", null);
    if (!includeTestSites()) query = query.eq("is_test", false);
    const { count: rows, error } = await query;
    if (error) throw new Error("sites count failed");
    // A successful head count is a number. Anything else is a shape change,
    // not an empty table, and must not be read as one.
    if (typeof rows !== "number") throw new Error("sites count failed");
    return rows;
  });
  return count === undefined ? null : count;
}

export interface PercentileEntry {
  metric: string;
  label: string;
  /** 0 to 100, already rounded. */
  percentile: number;
  /** How many analyzed sites measured this metric, from metric_percentile. */
  n: number;
}

/**
 * One percentile metric and the population behind it, including the metrics
 * that have no percentile yet.
 *
 * The population is per metric, not per site: `metric_percentile` counts the
 * sites that measured that one metric, which is smaller than the site count
 * whenever a layer failed for somebody. The sentence about needing ten sites is
 * about this number, so it has to travel with the metric rather than be read
 * off a count of rows.
 */
export interface MetricPopulation {
  metric: string;
  label: string;
  /** 0 to 100 rounded, or null when fewer than ten sites measured the metric. */
  percentile: number | null;
  n: number;
}

/**
 * The percentile of this site's named values among the analyzed population,
 * for the six metrics SPEC section 14 lists. A metric with fewer than ten sites
 * behind it is left out, which is what `metric_percentile` enforces in SQL.
 *
 * Two paths, one rule. In production the SQL helper answers, exactly as SPEC
 * section 14 says. `metric_percentile` hard codes `is_test = false`, so when
 * DATUM_INCLUDE_TEST_SITES is on there is no function to call and the same
 * arithmetic runs here over one select of the metrics column. The deviation is
 * confined to the test path; the production path is the helper.
 */
export async function percentiles(
  named: Record<string, number | null>,
): Promise<{ entries: MetricPopulation[] | null; truncated: boolean }> {
  const wanted = PERCENTILE_METRICS.filter(
    (entry) => typeof named[entry.metric] === "number",
  );
  if (wanted.length === 0) return { entries: [], truncated: false };

  if (includeTestSites()) {
    const rows = await withMemory(async (db) => {
      const { data, error } = await db
        .from("sites")
        .select("metrics")
        .not("metrics", "is", null)
        // Newest analysis first, so the rows the cap keeps are a defined set
        // rather than whatever order the planner happened to return.
        .order("metrics_at", { ascending: false })
        .limit(SIMILAR_CANDIDATE_CAP);
      if (error) throw new Error("sites metrics read failed");
      return (data ?? []) as Array<{ metrics: Record<string, unknown> | null }>;
    });
    if (!rows) return { entries: null, truncated: false };
    const out: MetricPopulation[] = [];
    for (const entry of wanted) {
      const value = named[entry.metric] as number;
      const population: number[] = [];
      for (const row of rows) {
        const candidate = row.metrics ? row.metrics[entry.metric] : undefined;
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          population.push(candidate);
        }
      }
      // The same per metric n the SQL helper reports: the sites that measured
      // this metric, not the sites that exist.
      const n = population.length;
      const below = population.filter((other) => other < value).length;
      out.push({
        metric: entry.metric,
        label: entry.label,
        percentile: n < PERCENTILE_MIN_SITES ? null : Math.round((below / n) * 100),
        n,
      });
    }
    return { entries: out, truncated: rows.length === SIMILAR_CANDIDATE_CAP };
  }

  const results = await Promise.all(
    wanted.map(async (entry) => {
      const value = named[entry.metric] as number;
      const rows = await withMemory(async (db) => {
        const { data, error } = await db.rpc("metric_percentile", {
          metric: entry.metric,
          value,
        });
        if (error) throw new Error("metric_percentile failed");
        return (data ?? []) as Array<{ percentile: number | null; n: number }>;
      });
      const first = rows?.[0];
      if (!first || typeof first.n !== "number") return null;
      const found: MetricPopulation = {
        metric: entry.metric,
        label: entry.label,
        percentile:
          typeof first.percentile === "number"
            ? Math.round(first.percentile * 100)
            : null,
        n: first.n,
      };
      return found;
    }),
  );
  const answered = results.filter(
    (entry): entry is MetricPopulation => entry !== null,
  );
  // Every metric failing to answer is a failed read, not an empty population.
  // The SQL helper counts the whole table, so this path reads nothing capped.
  return {
    entries: answered.length === 0 ? null : answered,
    truncated: false,
  };
}

export interface SimilarSite {
  locality: string | null;
  publicLat: number;
  publicLng: number;
  /** round((1 - d / sqrt(14)) * 100) on the scaled distance, SPEC section 14. */
  match: number;
  /** The three shared components that differ least, closest first. */
  closest: string[];
  /**
   * How many components the two sites both measured, which is the k of the
   * masked distance. Data, not copy: it is here so the basis of a match is
   * visible to whoever reads the response.
   */
  sharedComponents: number;
}

interface VectorRow {
  locality: string | null;
  public_lat: number;
  public_lng: number;
  metrics_vector: unknown;
  metrics_mask: unknown;
}

/**
 * A stored `metrics_mask`, or 0 when the column holds nothing readable. Zero is
 * no component present, which is the only safe reading of a mask that is not a
 * number: it excludes the row from every comparison rather than inventing one.
 */
function parseMask(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}

/** pgvector comes back over PostgREST as its text form, "[1,2,3]". */
function parseVector(value: unknown): number[] | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length !== VECTOR_LENGTH) return null;
  const out: number[] = [];
  for (const entry of parsed) {
    const n = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

/**
 * The nearest sites by the masked distance of SPEC section 14.
 *
 * The `<->` operator is not used while masks exist, because pgvector would
 * compare the placeholder entries of absent components as if they were
 * measurements. The candidate vectors and their masks are read in one capped
 * select and the distance is computed here, over the components both sites
 * measured; a candidate with fewer than METRICS_MIN_PRESENT of its own, or
 * fewer than that in common with the query site, is not compared at all.
 */
export async function similarSites(
  vector: number[],
  mask: number,
  siteId: string,
  limit = 5,
): Promise<{ sites: SimilarSite[] | null; truncated: boolean }> {
  const rows = await withMemory(async (db) => {
    let query = db
      .from("sites")
      .select("locality, public_lat, public_lng, metrics_vector, metrics_mask")
      .not("metrics_vector", "is", null)
      .neq("id", siteId);
    if (!includeTestSites()) query = query.eq("is_test", false);
    const { data, error } = await query
      // Newest analysis first. Without an order the cap keeps an arbitrary
      // subset, so the same site could match different neighbours on two
      // consecutive requests.
      .order("metrics_at", { ascending: false })
      .limit(SIMILAR_CANDIDATE_CAP);
    if (error) throw new Error("sites similarity read failed");
    return (data ?? []) as VectorRow[];
  });
  // A failed read is not an empty neighbourhood. Null means Site Memory could
  // not be asked, which the panel says out loud; an empty array would show as
  // "nothing is like this site", which nobody established.
  if (!rows) return { sites: null, truncated: false };

  const scored: Array<{
    row: VectorRow;
    other: number[];
    distance: number;
    shared: number;
    sharedCount: number;
  }> = [];
  for (const row of rows) {
    const other = parseVector(row.metrics_vector);
    if (!other) continue;
    const otherMask = parseMask(row.metrics_mask);
    // A candidate that measured fewer than ten of its own components is not a
    // site anything is placed against (SPEC section 14).
    if (presentCount(otherMask) < METRICS_MIN_PRESENT) continue;
    const scaled = maskedDistance(vector, mask, other, otherMask);
    if (scaled === null) continue;
    scored.push({
      row,
      other,
      distance: scaled.distance,
      shared: scaled.shared,
      sharedCount: scaled.sharedCount,
    });
  }
  scored.sort((left, right) => left.distance - right.distance);

  // The row id never leaves this function. SPEC section 14 displays a locality,
  // a match percent and the closest components, and an id would be a handle on
  // somebody else's analysis that the display has no use for.
  return {
    sites: scored.slice(0, limit).map((entry) => ({
      locality: entry.row.locality,
      publicLat: entry.row.public_lat,
      publicLng: entry.row.public_lng,
      match: matchPercent(entry.distance),
      closest: closestComponents(vector, entry.other, entry.shared),
      sharedComponents: entry.sharedCount,
    })),
    truncated: rows.length === SIMILAR_CANDIDATE_CAP,
  };
}

export interface PublicSite {
  publicLat: number;
  publicLng: number;
  locality: string | null;
  analyzedAt: string;
}

/**
 * The analyzed sites as public points only. The confirmed point, the site key,
 * and the row id never leave this function: the map shows the 2 dp snapped
 * point, which is about a kilometre, and nothing that could be walked back to
 * an address (SPEC section 13, standing decisions).
 *
 * Analyzed means `metrics_at` is set. A row exists from the moment a point is
 * confirmed, so without the filter the map plots points nobody ever got a
 * result for, and the count beside it disagrees with the pins.
 */
export async function publicSites(): Promise<PublicSite[]> {
  const rows = await withMemory(async (db) => {
    let query = db
      .from("sites")
      .select("public_lat, public_lng, locality, last_analyzed_at")
      .not("metrics_at", "is", null);
    if (!includeTestSites()) query = query.eq("is_test", false);
    const { data, error } = await query
      .order("last_analyzed_at", { ascending: false })
      .limit(PUBLIC_SITES_CAP);
    if (error) throw new Error("public sites read failed");
    return (data ?? []) as Array<{
      public_lat: number;
      public_lng: number;
      locality: string | null;
      last_analyzed_at: string;
    }>;
  });
  if (!rows) return [];
  return rows.map((row) => ({
    publicLat: row.public_lat,
    publicLng: row.public_lng,
    locality: row.locality,
    analyzedAt: row.last_analyzed_at,
  }));
}

// ─── Stored briefs (SPEC section 13, table `briefs`) ─────────────────────────

export interface StoredBrief {
  model: string;
  text: string;
  citations: Record<string, unknown>;
}

/**
 * The brief already written for this site and this input hash, or null. The
 * hash covers the serialized layer data, so a brief is replayed only while the
 * numbers it was written from are the numbers the sheet is showing.
 */
export async function findBrief(
  siteId: string,
  inputHash: string,
): Promise<StoredBrief | null> {
  if (isLocalSiteId(siteId)) return null;
  const row = await withMemory(async (db) => {
    const { data, error } = await db
      .from("briefs")
      .select("model, text, citations")
      .eq("site_id", siteId)
      .eq("input_hash", inputHash)
      .maybeSingle();
    if (error) throw new Error("briefs lookup failed");
    return (data as StoredBrief | null) ?? null;
  });
  return row ?? null;
}

/**
 * The stored citation verdicts of one brief, or null when the payload cannot be
 * read.
 *
 * The row was written by the brief route from a CitationCheck, but a shape
 * change must never be able to turn an unreadable payload into a passing
 * verdict: an empty invalidCitations and a zero uncited count is exactly what a
 * brief that passed its checks looks like, and reading that out of a row nobody
 * could parse would be a verdict the server never reached. Null instead, and
 * the caller treats it as a cache miss and writes a new brief from the model.
 *
 * It lives here rather than in the route because a route file may export only
 * handlers and config, and a verdict this load bearing is worth testing
 * directly rather than through a stream.
 */
export function storedBriefCheck(
  citations: Record<string, unknown>,
): CitationCheck | null {
  const strings = (value: unknown): string[] | null =>
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
      ? (value as string[])
      : null;
  const count = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  const invalidCitations = strings(citations.invalidCitations);
  const validCitations = strings(citations.validCitations);
  const uncitedNumericSentences = count(citations.uncitedNumericSentences);
  const valueMatchedSentences = count(citations.valueMatchedSentences);
  if (
    invalidCitations === null ||
    validCitations === null ||
    uncitedNumericSentences === null ||
    valueMatchedSentences === null
  ) {
    return null;
  }
  return {
    invalidCitations,
    validCitations,
    uncitedNumericSentences,
    valueMatchedSentences,
  };
}

/**
 * Store a brief that passed its citation checks. A brief that failed them is
 * never stored, so a replay can never serve text the server has already judged
 * unverified (PHASE-3 step 3.4).
 */
export async function storeBrief(
  siteId: string,
  inputHash: string,
  model: string,
  text: string,
  citations: Record<string, unknown>,
): Promise<boolean> {
  if (isLocalSiteId(siteId)) return false;
  const written = await withMemory(async (db) => {
    const { error } = await db
      .from("briefs")
      .upsert(
        { site_id: siteId, input_hash: inputHash, model, text, citations },
        { onConflict: "site_id,input_hash" },
      );
    if (error) throw new Error("briefs write failed");
    return true;
  });
  return written === true;
}

// ─── Memory context (SPEC section 14, PHASE-3 step 3.3) ──────────────────────

/**
 * The copy for the states that have no numbers to show.
 *
 * The offline line and the "sites like this" line are verbatim from SPEC
 * sections 13 and 14. The percentile line has no sentence in the spec; it
 * follows the same register and is recorded as new user facing copy.
 */
export const MEMORY_COPY = {
  offline: "Site Memory is offline; this analysis will not be saved.",
  /** Verbatim from SPEC section 14 as amended 2026-09-25. */
  needsTenMeasures:
    "Sites like this needs at least ten measures; <layers or components> were unavailable.",
  notEnoughSites:
    "Percentiles need ten analyzed sites; Site Memory holds <n> so far.",
};

export interface MemoryContext {
  memoryStatus: MemoryStatus;
  /** Analyzed sites under the current test row gating, null when offline. */
  n: number | null;
  percentiles: PercentileEntry[] | null;
  similar: SimilarSite[] | null;
  /**
   * The components this site could not measure, in vector order. Data, not
   * copy: the panel does not render it, and it says which measures are behind
   * the sentence rather than leaving a reader to infer them.
   */
  missing: string[];
  reasonIfNull: string | null;
  /**
   * True when a capped read came back full, so the population behind the
   * numbers is a slice of the analyzed sites rather than all of them. Not copy
   * and not rendered: it is here so the condition is visible to whoever reads
   * the response rather than silent.
   */
  truncated: boolean;
}

/** The computed metrics of one analysis, or null when there is no metrics row. */
export interface SiteMetrics {
  named: Record<string, number | null>;
  vector: number[];
  /** Bit i set when component i was measured (SPEC section 14). */
  mask: number;
  missing: string[];
}

/** The stored metrics of one site, or null when there are none to read. */
export async function readMetrics(
  siteId: string,
): Promise<{
  named: Record<string, number | null>;
  vector: number[] | null;
  mask: number;
} | null> {
  if (isLocalSiteId(siteId)) return null;
  const row = await withMemory(async (db) => {
    const { data, error } = await db
      .from("sites")
      .select("metrics, metrics_vector, metrics_mask")
      .eq("id", siteId)
      .maybeSingle();
    if (error) throw new Error("sites metrics lookup failed");
    return (
      (data as
        | { metrics: unknown; metrics_vector: unknown; metrics_mask: unknown }
        | null) ?? null
    );
  });
  if (!row || !row.metrics || typeof row.metrics !== "object") return null;
  const named: Record<string, number | null> = {};
  for (const [name, value] of Object.entries(row.metrics as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) named[name] = value;
  }
  return {
    named,
    vector: parseVector(row.metrics_vector),
    mask: parseMask(row.metrics_mask),
  };
}

/** The distinct layers behind a set of missing metric components. */
function layersBehind(missing: string[]): string[] {
  const out: string[] = [];
  for (const metric of missing) {
    const layer = METRIC_LAYERS[metric as MetricName];
    if (layer && !out.includes(layer)) out.push(layer);
  }
  return out;
}

/**
 * Percentiles and similar sites for one analysis, with a sentence for whatever
 * could not be shown. Nothing here invents a number: a percentile appears only
 * when its metric has ten analyzed sites behind it, and "sites like this"
 * appears only when this site measured at least ten of the fourteen components
 * (SPEC section 14).
 */
export async function buildMemoryContext(
  siteId: string,
  metrics: SiteMetrics | null,
): Promise<MemoryContext> {
  const offlineContext = (): MemoryContext => ({
    memoryStatus: "offline",
    n: null,
    percentiles: null,
    similar: null,
    missing: metrics ? [...metrics.missing] : [],
    reasonIfNull: MEMORY_COPY.offline,
    truncated: false,
  });

  if (memoryStatus() === "offline" || getClient() === null) return offlineContext();

  // No metrics row is not a site with fourteen unavailable components. It is a
  // site nobody has computed metrics for yet, which POST is what fills in, so
  // there is nothing to place and nothing to explain: naming every layer as
  // unavailable would report a failure that has not happened.
  if (metrics === null) {
    const n = await countSites();
    if (memoryStatus() === "offline") return offlineContext();
    return {
      memoryStatus: "online",
      n,
      percentiles: null,
      similar: null,
      missing: [],
      reasonIfNull: null,
      truncated: false,
    };
  }

  const { named, vector, mask, missing } = metrics;
  // Ten of the fourteen is what makes a site comparable at all. Below it the
  // site is not placed, and the sentence below says so.
  const eligible = presentCount(mask) >= METRICS_MIN_PRESENT;

  const [n, population, similar] = await Promise.all([
    countSites(),
    percentiles(named),
    eligible
      ? similarSites(vector, mask, siteId)
      : Promise.resolve({ sites: null, truncated: false }),
  ]);
  const populations = population.entries;

  // A percentile is shown when its own metric has ten sites behind it, so the
  // entries are the populations that answered with one.
  const entries: PercentileEntry[] = (populations ?? [])
    .filter((entry) => entry.percentile !== null)
    .map((entry) => ({
      metric: entry.metric,
      label: entry.label,
      percentile: entry.percentile as number,
      n: entry.n,
    }));

  // The count read can itself be what trips the offline guard.
  if (memoryStatus() === "offline") return offlineContext();

  const reasons: string[] = [];
  // The sentence is about the population behind a percentile, so it takes the
  // largest per metric n this site has, which is the most any one of its
  // metrics was measured against. The count of site rows is a different number
  // (a site whose climate layer failed is a row that measured none of these)
  // and it has its own line in the panel.
  if (entries.length === 0 && populations !== null && populations.length > 0) {
    const measured = populations.reduce((best, entry) => Math.max(best, entry.n), 0);
    reasons.push(MEMORY_COPY.notEnoughSites.replace("<n>", String(measured)));
  }
  if (!eligible) {
    reasons.push(
      MEMORY_COPY.needsTenMeasures.replace(
        "<layers or components>",
        layersBehind(missing).join(", "),
      ),
    );
  }

  return {
    memoryStatus: "online",
    n,
    percentiles: entries.length > 0 ? entries : null,
    similar: similar.sites,
    missing: [...missing],
    reasonIfNull: reasons.length > 0 ? reasons.join(" ") : null,
    truncated: population.truncated || similar.truncated,
  };
}

// ─── Expired cache sweep (SPEC section 13, the daily ping) ───────────────────

/** How many expired api_cache rows one ping removes. */
export const CACHE_SWEEP_BATCH = 500;

/**
 * Delete up to CACHE_SWEEP_BATCH expired api_cache rows and report how many
 * went. PostgREST cannot put a limit on a delete, so the batch is selected
 * first and deleted by key. Returns null when Site Memory could not answer.
 */
export async function sweepExpiredCache(
  limit = CACHE_SWEEP_BATCH,
): Promise<number | null> {
  const swept = await withMemory(async (db) => {
    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from("api_cache")
      .select("cache_key")
      .lt("expires_at", nowIso)
      .limit(limit);
    if (error) throw new Error("api_cache sweep select failed");
    const keys = ((data ?? []) as Array<{ cache_key: string }>).map(
      (row) => row.cache_key,
    );
    if (keys.length === 0) return 0;
    const { error: deleteError } = await db
      .from("api_cache")
      .delete()
      .in("cache_key", keys);
    if (deleteError) throw new Error("api_cache sweep delete failed");
    return keys.length;
  });
  return swept === undefined ? null : swept;
}
