// STUB: replaced by the Phase 1 module agent for usgsElevation.
// Owner: module B (topo). SPEC section 9 "topo", PHASE-1 step 1.4.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "../constants";
import { SourceError, unavailable } from "../http";
import type {
  LatLng,
  LayerFetcher,
  SourceContext,
  TopoData,
} from "../types";

/** EPQS point elevation in metres. Throws SourceError. */
export async function fetchPointElevation(
  _point: LatLng,
  _ctx: SourceContext,
): Promise<number> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "usgs_epqs",
  });
}

/**
 * 3DEP getSamples for one multipoint. The result is aligned with the input
 * order through `samples[i].locationId`; a missing sample is null.
 */
export async function fetchGridSamples(
  _points: LatLng[],
  _ctx: SourceContext,
): Promise<Array<number | null>> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "usgs_3dep",
  });
}

export const fetchTopo: LayerFetcher<TopoData> = async (_input, ctx) =>
  unavailable(
    "topo",
    {
      name: SOURCE_DISPLAY_NAMES.usgs_3dep,
      url: resolveBaseUrl("usgs_3dep", ctx),
      licence: SOURCE_LICENCES.usgs_3dep,
      cached: false,
    },
    "upstream_error",
    "not implemented",
    { now: ctx.now },
  );
