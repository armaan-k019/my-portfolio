// GET and POST /api/datum/memory/context. SPEC.md sections 7 and 14.
//
// POST computes the fourteen metrics from the envelopes already stored in
// layer_results, writes them onto the site row, and answers with the context.
// GET answers from what is stored without recomputing. The layer routes cannot
// do this work: each one sees its own layer and the vector needs all nine.
//
// A route file may export only handlers and config, so everything reusable
// lives in src/lib/datum.

import { NextResponse, type NextRequest } from "next/server";
import { loadStoredLayers } from "@/lib/datum/brief/store";
import { METRIC_NAMES, computeMetrics } from "@/lib/datum/metrics";
import {
  MEMORY_COPY,
  buildMemoryContext,
  getSiteById,
  isLocalSiteId,
  memoryStatus,
  readMetrics,
  writeMetrics,
  type MemoryContext,
} from "@/lib/datum/memory";

export const maxDuration = 15;

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "bad_request", message } },
    { status: 400 },
  );
}

/**
 * Which components a stored metrics row is short of. writeMetrics leaves a
 * null out of the jsonb, so a name that is absent is a name that had no value.
 */
function missingFrom(named: Record<string, number | null>): string[] {
  return METRIC_NAMES.filter((metric) => typeof named[metric] !== "number");
}

/** The answer when there is no stored analysis to place in a population. */
function offlineContext(): MemoryContext {
  return {
    memoryStatus: "offline",
    n: null,
    percentiles: null,
    similar: null,
    reasonIfNull: MEMORY_COPY.offline,
    truncated: false,
  };
}

/**
 * Confirm the site exists before anything is read or written for it. A local
 * id belongs to an analysis Site Memory never saw, so it has no row, no stored
 * layers, and no place in the population.
 */
async function resolve(siteId: string): Promise<"local" | "missing" | "found"> {
  if (isLocalSiteId(siteId)) return "local";
  const site = await getSiteById(siteId);
  if (site) return "found";
  // Offline is not the same as unknown: the guard can be tripped while the row
  // exists, and answering 404 would call a real site imaginary.
  return memoryStatus() === "offline" ? "local" : "missing";
}

export async function GET(request: NextRequest) {
  const siteId = new URL(request.url).searchParams.get("site");
  if (!siteId) return badRequest("site is required.");

  const state = await resolve(siteId);
  if (state === "missing") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Unknown site." } },
      { status: 404 },
    );
  }
  if (state === "local") return NextResponse.json(offlineContext());

  // A site with no metrics row yet is not an error, not an offline database,
  // and not fourteen unavailable components: POST is what fills the row in, and
  // until it has run there is nothing to place and nothing to explain. Null
  // says exactly that, and the context comes back with no percentiles and no
  // reason rather than with a sentence naming every layer.
  const stored = await readMetrics(siteId);
  const metrics =
    stored === null
      ? null
      : {
          named: stored.named,
          vector: stored.vector,
          missing: stored.vector === null ? missingFrom(stored.named) : [],
        };
  return NextResponse.json(await buildMemoryContext(siteId, metrics));
}

export async function POST(request: NextRequest) {
  let body: { siteId?: unknown };
  try {
    body = (await request.json()) as { siteId?: unknown };
  } catch {
    return badRequest("The request body is not JSON.");
  }
  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  if (siteId.length === 0) return badRequest("siteId is required.");

  const state = await resolve(siteId);
  if (state === "missing") {
    return NextResponse.json(
      { error: { code: "not_found", message: "Unknown site." } },
      { status: 404 },
    );
  }
  if (state === "local") return NextResponse.json(offlineContext());

  // The stored envelopes are the server's own record of what the sources
  // answered. Nothing on the request body reaches the metrics: a caller cannot
  // hand Site Memory numbers and have them enter everyone else's percentiles.
  const layers = await loadStoredLayers(siteId);
  const { named, vector, missing } = computeMetrics(layers);
  // What the write did travels with the answer: "skipped" is a computation with
  // nothing in it, which is left out rather than written over a good row, and
  // "unavailable" is Site Memory declining the write. Neither is copy, and the
  // panel does not read them.
  const metricsWrite = await writeMetrics(siteId, named, vector);

  const context = await buildMemoryContext(siteId, { named, vector, missing });
  return NextResponse.json({ ...context, metricsWrite });
}

