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
import { publicPoint, siteKey as siteKeyOf } from "./geo";
import {
  METRIC_LAYERS,
  PERCENTILE_METRICS,
  PERCENTILE_MIN_SITES,
  VECTOR_LENGTH,
  closestComponents,
  l2Distance,
  matchPercent,
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

const localSites = new Map<string, SiteRecord>();

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
  if (existing) return await reuseSite(existing, input);

  const inserted = await withMemory(async (db) => {
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
    if (error) {
      // A concurrent request inserted the same site_key between the lookup
      // above and this insert. Losing that race is not a failure of Site
      // Memory, so it must not flip the module offline and must not fall back
      // to a local id: the winner's row is the row this request wants.
      if (isUniqueViolation(error)) return RACED;
      throw new Error("sites insert failed");
    }
    return data as SiteRecord;
  });
  if (inserted === RACED) {
    const winner = await findSite(key);
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
    is_test: input.isTest === true,
    created_at: nowIso,
    last_analyzed_at: nowIso,
    analysis_count: 1,
    schema_version: 1,
  };
  localSites.set(key, fallback);
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
const SIMILAR_CANDIDATE_CAP = 2000;

/** How many points the public map returns, newest analysis first. */
const PUBLIC_SITES_CAP = 500;

/**
 * Write the named values and the vector onto the site row.
 *
 * Only the named values that have one are stored. A null is left out of the
 * jsonb entirely rather than stored as `null`, because `metric_percentile`
 * selects on `metrics ? metric`: a stored null would join the population for
 * that metric and never satisfy `v < value`, which would drag every percentile
 * down by the count of the sites that could not measure it.
 */
export async function writeMetrics(
  siteId: string,
  named: Record<string, number | null>,
  vector: number[] | null,
): Promise<boolean> {
  if (isLocalSiteId(siteId)) return false;
  const metrics: Record<string, number> = {};
  for (const [name, value] of Object.entries(named)) {
    if (typeof value === "number" && Number.isFinite(value)) metrics[name] = value;
  }
  const written = await withMemory(async (db) => {
    const { error } = await db
      .from("sites")
      .update({
        metrics,
        // pgvector's text input form. PostgREST sends the column as a string
        // and casts it, so the array is serialized rather than sent as JSON.
        metrics_vector: vector === null ? null : JSON.stringify(vector),
        metrics_at: new Date().toISOString(),
      })
      .eq("id", siteId);
    if (error) throw new Error("sites metrics write failed");
    return true;
  });
  return written === true;
}

/**
 * How many sites Site Memory holds, under the same test row gating. Null when
 * Site Memory could not answer: an offline project has no count, and reporting
 * zero would read as "no site has ever been analyzed".
 */
export async function countSites(): Promise<number | null> {
  const count = await withMemory(async (db) => {
    let query = db.from("sites").select("id", { count: "exact", head: true });
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
): Promise<PercentileEntry[]> {
  const wanted = PERCENTILE_METRICS.filter(
    (entry) => typeof named[entry.metric] === "number",
  );
  if (wanted.length === 0) return [];

  if (includeTestSites()) {
    const rows = await withMemory(async (db) => {
      const { data, error } = await db
        .from("sites")
        .select("metrics")
        .not("metrics", "is", null)
        .limit(SIMILAR_CANDIDATE_CAP);
      if (error) throw new Error("sites metrics read failed");
      return (data ?? []) as Array<{ metrics: Record<string, unknown> | null }>;
    });
    if (!rows) return [];
    const out: PercentileEntry[] = [];
    for (const entry of wanted) {
      const value = named[entry.metric] as number;
      const population: number[] = [];
      for (const row of rows) {
        const candidate = row.metrics ? row.metrics[entry.metric] : undefined;
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          population.push(candidate);
        }
      }
      if (population.length < PERCENTILE_MIN_SITES) continue;
      const below = population.filter((other) => other < value).length;
      out.push({
        metric: entry.metric,
        label: entry.label,
        percentile: Math.round((below / population.length) * 100),
      });
    }
    return out;
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
      if (!first || typeof first.percentile !== "number") return null;
      const found: PercentileEntry = {
        metric: entry.metric,
        label: entry.label,
        percentile: Math.round(first.percentile * 100),
      };
      return found;
    }),
  );
  return results.filter((entry): entry is PercentileEntry => entry !== null);
}

export interface SimilarSite {
  siteId: string;
  locality: string | null;
  publicLat: number;
  publicLng: number;
  /** round((1 - d / sqrt(14)) * 100), SPEC section 14. */
  match: number;
  /** The three components that differ least, closest first. */
  closest: string[];
}

interface VectorRow {
  id: string;
  locality: string | null;
  public_lat: number;
  public_lng: number;
  metrics_vector: unknown;
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
 * The nearest sites by L2 distance over the metrics vector.
 *
 * SPEC section 14 writes this as `order by metrics_vector <-> $1 limit 5`.
 * PostgREST cannot express a vector operator and migration 0002 is fixed to the
 * SQL in SPEC section 13, which carries no similarity function, so the ordering
 * runs here over a capped select of the candidate vectors. The index in 0002
 * stays for the day a function is added; the result is the same ordering.
 */
export async function similarSites(
  vector: number[],
  siteId: string,
  limit = 5,
): Promise<SimilarSite[]> {
  const rows = await withMemory(async (db) => {
    let query = db
      .from("sites")
      .select("id, locality, public_lat, public_lng, metrics_vector")
      .not("metrics_vector", "is", null)
      .neq("id", siteId);
    if (!includeTestSites()) query = query.eq("is_test", false);
    const { data, error } = await query.limit(SIMILAR_CANDIDATE_CAP);
    if (error) throw new Error("sites similarity read failed");
    return (data ?? []) as VectorRow[];
  });
  if (!rows) return [];

  const scored: Array<{ row: VectorRow; other: number[]; distance: number }> = [];
  for (const row of rows) {
    const other = parseVector(row.metrics_vector);
    if (!other) continue;
    scored.push({ row, other, distance: l2Distance(vector, other) });
  }
  scored.sort((left, right) => left.distance - right.distance);

  return scored.slice(0, limit).map((entry) => ({
    siteId: entry.row.id,
    locality: entry.row.locality,
    publicLat: entry.row.public_lat,
    publicLng: entry.row.public_lng,
    match: matchPercent(entry.distance),
    closest: closestComponents(vector, entry.other),
  }));
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
 */
export async function publicSites(): Promise<PublicSite[]> {
  const rows = await withMemory(async (db) => {
    let query = db
      .from("sites")
      .select("public_lat, public_lng, locality, last_analyzed_at");
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
  needsAllLayers: "Sites like this needs all layers; <layers> were unavailable.",
  notEnoughSites:
    "Percentiles need ten analyzed sites; Site Memory holds <n> so far.",
};

export interface MemoryContext {
  memoryStatus: MemoryStatus;
  /** Analyzed sites under the current test row gating, null when offline. */
  n: number | null;
  percentiles: PercentileEntry[] | null;
  similar: SimilarSite[] | null;
  reasonIfNull: string | null;
}

/** The stored metrics of one site, or null when there are none to read. */
export async function readMetrics(
  siteId: string,
): Promise<{ named: Record<string, number | null>; vector: number[] | null } | null> {
  if (isLocalSiteId(siteId)) return null;
  const row = await withMemory(async (db) => {
    const { data, error } = await db
      .from("sites")
      .select("metrics, metrics_vector")
      .eq("id", siteId)
      .maybeSingle();
    if (error) throw new Error("sites metrics lookup failed");
    return (data as { metrics: unknown; metrics_vector: unknown } | null) ?? null;
  });
  if (!row || !row.metrics || typeof row.metrics !== "object") return null;
  const named: Record<string, number | null> = {};
  for (const [name, value] of Object.entries(row.metrics as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) named[name] = value;
  }
  return { named, vector: parseVector(row.metrics_vector) };
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
 * appears only when this site has all fourteen components.
 */
export async function buildMemoryContext(
  siteId: string,
  named: Record<string, number | null>,
  vector: number[] | null,
  missing: string[],
): Promise<MemoryContext> {
  if (memoryStatus() === "offline" || getClient() === null) {
    return {
      memoryStatus: "offline",
      n: null,
      percentiles: null,
      similar: null,
      reasonIfNull: MEMORY_COPY.offline,
    };
  }

  const [n, entries, similar] = await Promise.all([
    countSites(),
    percentiles(named),
    vector === null ? Promise.resolve(null) : similarSites(vector, siteId),
  ]);

  // The count read can itself be what trips the offline guard.
  if (memoryStatus() === "offline") {
    return {
      memoryStatus: "offline",
      n: null,
      percentiles: null,
      similar: null,
      reasonIfNull: MEMORY_COPY.offline,
    };
  }

  const reasons: string[] = [];
  // n is a number on this path: countSites returns null only when the read
  // failed, and a failed read trips the guard, which the branch above catches.
  if (entries.length === 0 && n !== null) {
    reasons.push(MEMORY_COPY.notEnoughSites.replace("<n>", String(n)));
  }
  if (vector === null) {
    reasons.push(
      MEMORY_COPY.needsAllLayers.replace("<layers>", layersBehind(missing).join(", ")),
    );
  }

  return {
    memoryStatus: "online",
    n,
    percentiles: entries.length > 0 ? entries : null,
    similar,
    reasonIfNull: reasons.length > 0 ? reasons.join(" ") : null,
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
