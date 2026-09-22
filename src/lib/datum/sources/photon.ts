// Photon address suggestions. SPEC section 7 "suggest", PHASE-1 step 1.9.
// Suggestions only. A submit is geocoded by Nominatim, never by Photon: Photon
// mis-resolves the Miami test intersection (see the recorded fixture).

import {
  SOURCE_TIMEOUT_MS,
  TTL_SECONDS,
  resolveBaseUrl,
} from "../constants";
import { cached } from "../cache";
import { SourceError, fetchWithPolicy } from "../http";
import type { SourceContext, Suggestion } from "../types";

/** SPEC section 7: at most six suggestions reach the client. */
export const SUGGEST_LIMIT = 6;

/** Lowercase with collapsed spaces, so the cache key is stable. */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The fields kept from a Photon feature. Everything else is dropped. */
interface TrimmedFeature {
  name: string | null;
  housenumber: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
}

interface TrimmedPhoton {
  features: TrimmedFeature[];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Keep only the properties the label needs plus the point. The raw Photon
 * response carries extents, osm ids, and country data the sheet never cites.
 */
function trimPhoton(raw: unknown): TrimmedPhoton {
  if (!raw || typeof raw !== "object") {
    throw new SourceError("parse_error", "Photon returned a body that is not an object.", {
      source: "photon",
    });
  }
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) {
    throw new SourceError("parse_error", "Photon returned no feature collection.", {
      source: "photon",
    });
  }

  const out: TrimmedFeature[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const properties = (feature as { properties?: unknown }).properties;
    const geometry = (feature as { geometry?: unknown }).geometry;
    if (!properties || typeof properties !== "object") continue;
    if (!geometry || typeof geometry !== "object") continue;

    const coordinates = (geometry as { coordinates?: unknown }).coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const p = properties as Record<string, unknown>;
    out.push({
      name: text(p.name),
      housenumber: text(p.housenumber),
      street: text(p.street),
      city: text(p.city),
      state: text(p.state),
      postcode: text(p.postcode),
      lat,
      lng,
    });
  }
  return { features: out };
}

/** "Techwood Drive Northwest, Atlanta, Georgia, 30313". */
function labelOf(feature: TrimmedFeature): string {
  const address = [feature.housenumber, feature.street]
    .filter((part): part is string => part !== null)
    .join(" ");
  const head = feature.name !== null ? feature.name : address;
  return [head, feature.city, feature.state, feature.postcode]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(", ");
}

/**
 * Address suggestions, at most six. Cache key `photon:<normalized query>`,
 * TTL TTL_SECONDS.photonSuggest. Throws SourceError; the suggest route answers
 * with an empty list rather than an error page.
 */
export async function suggest(
  query: string,
  ctx: SourceContext,
): Promise<Suggestion[]> {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return [];

  const base = resolveBaseUrl("photon", ctx);
  const url = `${base}/?q=${encodeURIComponent(query.trim())}&limit=${SUGGEST_LIMIT}&lang=en`;

  const result = await cached(
    `photon:${normalized}`,
    TTL_SECONDS.photonSuggest,
    async () => {
      const response = await fetchWithPolicy(
        url,
        { method: "GET" },
        {
          timeoutMs: SOURCE_TIMEOUT_MS.photon,
          retries: 1,
          retryOn: [502, 503, 504],
          source: "photon",
        },
        ctx,
      );
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new SourceError("parse_error", "Photon returned a body that is not JSON.", {
          source: "photon",
        });
      }
      return {
        source: "photon",
        url,
        status: response.status,
        body: trimPhoton(body),
        cacheable: true,
      };
    },
    ctx,
  );

  const trimmed = result.entry.body as TrimmedPhoton;
  const suggestions: Suggestion[] = [];
  for (const feature of trimmed.features) {
    if (suggestions.length >= SUGGEST_LIMIT) break;
    const label = labelOf(feature);
    if (label.length === 0) continue;
    suggestions.push({ label, lat: feature.lat, lng: feature.lng });
  }
  return suggestions;
}
