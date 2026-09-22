// The layer registry. The per layer route dispatches through this map, so the
// six parallel module agents replace file bodies under sources/ and the four
// computation modules without ever editing this file.

import { TTL_SECONDS } from "./constants";
import { fetchCensus } from "./sources/census";
import { fetchFlood } from "./sources/fema";
import { fetchOsm } from "./sources/overpass";
import { fetchClimate } from "./sources/openMeteo";
import { fetchSeismic } from "./sources/usgsSeismic";
import { fetchSoil } from "./sources/usdaSoil";
import { fetchTopo } from "./sources/usgsElevation";
import { fetchSun } from "./solar";
import { fetchWalkshed } from "./walkshed";
import type { LayerFetcher, LayerName } from "./types";

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
