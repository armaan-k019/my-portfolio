// The layer registry. The per layer route dispatches through this map, so the
// six parallel module agents replace file bodies under sources/ and the four
// computation modules without ever editing this file.

import { createCacheApi, type CacheClient } from "./cache";
import { TTL_SECONDS, USER_AGENT } from "./constants";
import { getClient } from "./memory";
import { fetchCensus } from "./sources/census";
import { fetchFlood } from "./sources/fema";
import { fetchOsm } from "./sources/overpass";
import { fetchClimate } from "./sources/openMeteo";
import { fetchSeismic } from "./sources/usgsSeismic";
import { fetchSoil } from "./sources/usdaSoil";
import { fetchTopo } from "./sources/usgsElevation";
import { fetchSun } from "./solar";
import { fetchWalkshed } from "./walkshed";
import type { LayerFetcher, LayerName, SourceContext } from "./types";

export const layerFetchers: Record<LayerName, LayerFetcher<unknown>> = {
  sun: fetchSun,
  climate: fetchClimate,
  topo: fetchTopo,
  seismic: fetchSeismic,
  soil: fetchSoil,
  osm: fetchOsm,
  walkshed: fetchWalkshed,
  flood: fetchFlood,
  census: fetchCensus,
};

/** How long a stored layer_results row stays valid, per SPEC section 13. */
export const LAYER_RESULT_TTL_SECONDS: Record<LayerName, number> = {
  sun: TTL_SECONDS.openMeteo,
  climate: TTL_SECONDS.openMeteo,
  topo: TTL_SECONDS.usgsElevation,
  seismic: TTL_SECONDS.usgsSeismic,
  soil: TTL_SECONDS.usda,
  osm: TTL_SECONDS.overpass,
  walkshed: TTL_SECONDS.overpass,
  flood: TTL_SECONDS.fema,
  census: TTL_SECONDS.censusAcs,
};

/**
 * Which query parameters a layer accepts, beyond `site`. The route passes them
 * through to LayerInput.params unchanged.
 */
export const LAYER_PARAMS: Record<LayerName, string[]> = {
  sun: [],
  climate: [],
  topo: [],
  seismic: ["siteClass"],
  soil: [],
  osm: [],
  walkshed: [],
  flood: [],
  census: [],
};

/**
 * The SourceContext the routes hand to every fetcher. DATUM_SOURCE_OVERRIDES is
 * read only when DATUM_ALLOW_TEST_FLAG is "1" and NODE_ENV is not "production"
 * (SPEC section 15, owner decision 6 of 2026-09-24): both conditions, so the
 * map is inert in any production build whatever the flag says. CENSUS_API_KEY
 * is passed through ctx.env so no source module reads process.env directly.
 */
export function buildSourceContext(): SourceContext {
  let overrides: Record<string, string> = {};
  const overridesAllowed =
    process.env.DATUM_ALLOW_TEST_FLAG === "1" &&
    process.env.NODE_ENV !== "production";
  if (overridesAllowed && process.env.DATUM_SOURCE_OVERRIDES) {
    try {
      const parsed: unknown = JSON.parse(process.env.DATUM_SOURCE_OVERRIDES);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        overrides = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string")
            .map(([name, value]) => [name, String(value)]),
        );
      }
    } catch {
      overrides = {};
    }
  }
  const now = () => new Date();
  return {
    fetch: globalThis.fetch,
    cache: createCacheApi(getClient() as CacheClient | null, now),
    overrides,
    userAgent: USER_AGENT,
    now,
    env: { censusApiKey: process.env.CENSUS_API_KEY },
  };
}
