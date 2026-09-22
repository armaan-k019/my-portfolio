// Nominatim search and reverse. SPEC section 7 "geocode", PHASE-1 step 1.9.
// Policy: at most one request per second, descriptive User-Agent, no
// autocomplete. Suggestions come from Photon; this module runs once per submit.

import {
  SOURCE_TIMEOUT_MS,
  TTL_SECONDS,
  resolveBaseUrl,
} from "../constants";
import { cached } from "../cache";
import { SourceError, fetchWithPolicy } from "../http";
import { roundKey } from "../geo";
import type { GeocodeResult, SourceContext } from "../types";

/** The Nominatim usage policy: one request per second. */
export const NOMINATIM_MIN_INTERVAL_MS = 1_000;

// ─── The route token bucket (SPEC section 7) ─────────────────────────────────

let lastAdmittedAt = 0;

/**
 * One admitted geocode request per second per instance. The geocode route
 * answers 429 when this returns false. `nowMs` is a parameter so the unit test
 * does not depend on the wall clock.
 */
export function takeNominatimToken(nowMs: number): boolean {
  if (nowMs - lastAdmittedAt < NOMINATIM_MIN_INTERVAL_MS) return false;
  lastAdmittedAt = nowMs;
  return true;
}

// ─── Outbound pacing ─────────────────────────────────────────────────────────

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hold a submit until a full second has passed since the previous outbound
 * Nominatim call. Only cache misses reach this, so a warm request never waits.
 */
async function pace(): Promise<void> {
  const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/** Test seam. Not used in production code paths. */
export function resetNominatimRateState(): void {
  lastAdmittedAt = 0;
  lastRequestAt = 0;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readJson(
  url: string,
  ctx: SourceContext,
): Promise<{ status: number; body: unknown }> {
  await pace();
  const response = await fetchWithPolicy(
    url,
    { method: "GET" },
    {
      timeoutMs: SOURCE_TIMEOUT_MS.nominatim,
      retries: 1,
      retryOn: [502, 503, 504],
      source: "nominatim",
    },
    ctx,
  );
  try {
    return { status: response.status, body: await response.json() };
  } catch {
    throw new SourceError("parse_error", "Nominatim returned a body that is not JSON.", {
      source: "nominatim",
    });
  }
}

// ─── search ──────────────────────────────────────────────────────────────────

interface TrimmedPlace {
  lat: number;
  lng: number;
  displayName: string;
}

interface TrimmedSearch {
  places: TrimmedPlace[];
}

function trimSearch(raw: unknown): TrimmedSearch {
  if (!Array.isArray(raw)) {
    throw new SourceError("parse_error", "Nominatim search did not return an array.", {
      source: "nominatim",
    });
  }
  const places: TrimmedPlace[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const place = row as Record<string, unknown>;
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    const displayName = text(place.display_name);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (displayName === null) continue;
    places.push({ lat, lng, displayName });
  }
  return { places };
}

/**
 * One search per submit. Cache key `nominatim:<normalized query>`, TTL
 * TTL_SECONDS.nominatimSearch. Null means not found, which is not an error.
 * Throws SourceError.
 */
export async function geocode(
  query: string,
  ctx: SourceContext,
): Promise<GeocodeResult | null> {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return null;

  const base = resolveBaseUrl("nominatim", ctx);
  const url = `${base}/search?q=${encodeURIComponent(query.trim())}&format=jsonv2&limit=1&countrycodes=us`;

  const result = await cached(
    `nominatim:${normalized}`,
    TTL_SECONDS.nominatimSearch,
    async () => {
      const { status, body } = await readJson(url, ctx);
      // An empty result set is a real answer and is cached.
      return { source: "nominatim", url, status, body: trimSearch(body), cacheable: true };
    },
    ctx,
  );

  const trimmed = result.entry.body as TrimmedSearch;
  const first = trimmed.places[0];
  if (!first) return null;

  let locality: string | null = null;
  try {
    locality = await reverseLocality(first.lat, first.lng, ctx);
  } catch {
    // The coarse label is optional; the point and the display name are not.
    locality = null;
  }

  return {
    lat: first.lat,
    lng: first.lng,
    displayName: first.displayName,
    locality,
  };
}

// ─── reverse ─────────────────────────────────────────────────────────────────

interface TrimmedAddress {
  city: string | null;
  town: string | null;
  village: string | null;
  hamlet: string | null;
  municipality: string | null;
  county: string | null;
  state: string | null;
}

interface TrimmedReverse {
  address: TrimmedAddress;
}

function trimReverse(raw: unknown): TrimmedReverse {
  if (!raw || typeof raw !== "object") {
    throw new SourceError("parse_error", "Nominatim reverse returned a body that is not an object.", {
      source: "nominatim",
    });
  }
  const address = (raw as { address?: unknown }).address;
  const parts = (address && typeof address === "object" ? address : {}) as Record<
    string,
    unknown
  >;
  return {
    address: {
      city: text(parts.city),
      town: text(parts.town),
      village: text(parts.village),
      hamlet: text(parts.hamlet),
      municipality: text(parts.municipality),
      county: text(parts.county),
      state: text(parts.state),
    },
  };
}

/** "Atlanta, Georgia", or just the place, or just the state, or null. */
function localityOf(address: TrimmedAddress): string | null {
  const place =
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    address.county;
  const state = address.state;
  if (place === null && state === null) return null;
  return [place, state]
    .filter((part): part is string => part !== null)
    .join(", ");
}

/**
 * The coarse locality label from reverse at zoom 10, for example
 * "Atlanta, Georgia". Cache key `nominatim_reverse:<lat,lng at 3 dp>`, TTL
 * TTL_SECONDS.nominatimReverse. Throws SourceError; the site route tolerates
 * that and leaves locality null.
 */
export async function reverseLocality(
  lat: number,
  lng: number,
  ctx: SourceContext,
): Promise<string | null> {
  const base = resolveBaseUrl("nominatim", ctx);
  const url = `${base}/reverse?lat=${lat.toFixed(7)}&lon=${lng.toFixed(7)}&format=jsonv2&zoom=10`;

  const result = await cached(
    `nominatim_reverse:${roundKey(lat, lng, 3)}`,
    TTL_SECONDS.nominatimReverse,
    async () => {
      const { status, body } = await readJson(url, ctx);
      return { source: "nominatim", url, status, body: trimReverse(body), cacheable: true };
    },
    ctx,
  );

  const trimmed = result.entry.body as TrimmedReverse;
  return localityOf(trimmed.address);
}
