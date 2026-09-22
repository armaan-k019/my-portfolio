// STUB: replaced by the Phase 1 module agent for openMeteo.
// Owner: module A (sun and climate). SPEC section 9 "climate", PHASE-1 step 1.3.

import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  resolveBaseUrl,
} from "../constants";
import { SourceError, unavailable } from "../http";
import type {
  ClimateData,
  LayerFetcher,
  LayerInput,
  SourceContext,
} from "../types";

/** One hourly sample from the ERA5 archive, already converted to SI. */
export interface ArchiveHour {
  time: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  shortwaveWM2: number | null;
}

export interface ArchiveResponse {
  timezone: string;
  period: { start: string; end: string; years: number };
  hours: ArchiveHour[];
  url: string;
  cached: boolean;
}

/**
 * The shared archive fetch. Cache key `openmeteo:<lat,lng at 1 dp>:<period>`,
 * TTL TTL_SECONDS.openMeteo. Throws SourceError; the layer fetcher catches.
 */
export async function fetchArchive(
  _input: LayerInput,
  _ctx: SourceContext,
): Promise<ArchiveResponse> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "openmeteo",
  });
}

export const fetchClimate: LayerFetcher<ClimateData> = async (_input, ctx) =>
  unavailable(
    "climate",
    {
      name: SOURCE_DISPLAY_NAMES.openmeteo,
      url: resolveBaseUrl("openmeteo", ctx),
      licence: SOURCE_LICENCES.openmeteo,
      cached: false,
    },
    "upstream_error",
    "not implemented",
    { now: ctx.now },
  );
