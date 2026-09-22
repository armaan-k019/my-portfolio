// STUB: replaced by the Phase 1 module agent for fema.
// Owner: module D (flood). SPEC section 9 "flood", PHASE-1 step 1.6.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "../constants";
import { unavailable } from "../http";
import type {
  FloodClass,
  FloodData,
  LayerFetcher,
  LocalPoint,
} from "../types";

/** Classification is by fields, never by guess (SPEC section 9). */
export function classifyZone(
  _zone: string | null,
  _subtype: string | null,
  _sfhaTf: string | null,
): FloodClass {
  throw new Error("not implemented");
}

/**
 * Clip a ring to the 800 m frame before it is cached. PROGRESS.md Phase 0
 * finding: the unclipped Miami envelope is about 17 MB.
 */
export function clipRingToFrame(
  _ring: LocalPoint[],
  _halfSizeM: number,
): LocalPoint[] {
  throw new Error("not implemented");
}

export const fetchFlood: LayerFetcher<FloodData> = async (_input, ctx) =>
  unavailable(
    "flood",
    {
      name: SOURCE_DISPLAY_NAMES.fema,
      url: resolveBaseUrl("fema", ctx),
      licence: SOURCE_LICENCES.fema,
      cached: false,
    },
    "upstream_error",
    "not implemented",
    { now: ctx.now },
  );
