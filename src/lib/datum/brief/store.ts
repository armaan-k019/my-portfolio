// Reading the stored layer envelopes for the brief. SPEC.md sections 12, 13.
//
// The brief prefers the copy in `layer_results`, which the layer routes wrote
// through `after()`. When Site Memory is offline there is no stored copy, and
// the client's own envelopes are the fallback. memory.ts is not changed here:
// this module only reads through its client and its timeout wrapper.

import { fieldPathsOf } from "../http";
import { getClient, isLocalSiteId, memoryStatus, withMemory } from "../memory";
import { LAYER_NAMES, type LayerEnvelope, type LayerName } from "../types";

interface LayerResultRow {
  layer: string;
  envelope: LayerEnvelope<unknown>;
  expires_at: string;
}

/**
 * The envelopes stored for this site that have not expired. Returns an empty
 * map when memory is offline, when the id is a local one (which has no row), or
 * when nothing has been stored yet.
 */
export async function loadStoredLayers(
  siteId: string,
): Promise<Partial<Record<LayerName, LayerEnvelope<unknown>>>> {
  const out: Partial<Record<LayerName, LayerEnvelope<unknown>>> = {};
  if (isLocalSiteId(siteId) || !getClient()) return out;

  const rows = await withMemory(async (db) => {
    const { data, error } = await db
      .from("layer_results")
      .select("layer, envelope, expires_at")
      .eq("site_id", siteId)
      .gt("expires_at", new Date().toISOString());
    if (error) throw new Error("layer_results read failed");
    return (data ?? []) as LayerResultRow[];
  });

  for (const row of rows ?? []) {
    if ((LAYER_NAMES as string[]).includes(row.layer) && row.envelope) {
      out[row.layer as LayerName] = row.envelope;
    }
  }
  return out;
}

/**
 * True when Site Memory cannot answer, so nothing was stored for this analysis
 * and the client's own envelopes are the only copy that exists. This is the one
 * condition that admits them (SPEC section 12).
 */
export function memoryIsOffline(): boolean {
  return getClient() === null || memoryStatus() === "offline";
}

/** A value that looks enough like an envelope to serialize and cite. */
function isEnvelopeLike(value: unknown): value is LayerEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LayerEnvelope<unknown>>;
  return (
    typeof candidate.layer === "string" &&
    typeof candidate.status === "string" &&
    Array.isArray(candidate.fieldPaths) &&
    "data" in candidate
  );
}

/**
 * The envelopes the client sent on the request body. They are the offline
 * fallback, so they are validated in shape before anything reads them: the
 * client can send whatever it likes and the citation check has to mean
 * something.
 */
export function parseClientLayers(
  value: unknown,
): Partial<Record<LayerName, LayerEnvelope<unknown>>> {
  const out: Partial<Record<LayerName, LayerEnvelope<unknown>>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [name, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!(LAYER_NAMES as string[]).includes(name)) continue;
    if (!isEnvelopeLike(candidate)) continue;
    if (candidate.layer !== name) continue;
    // fieldPaths is what the citation check validates against, so a client copy
    // of it would let the caller decide which citations are valid and the check
    // would mean nothing. It is recomputed from the data the same way the layer
    // routes compute it.
    out[name as LayerName] = {
      ...candidate,
      fieldPaths: candidate.data === null ? [] : fieldPathsOf(candidate.data),
    };
  }
  return out;
}

/**
 * The stored copy wins where it exists, because it is the server's own record
 * of what the sources answered. The client's copy fills the rest.
 */
export function mergeLayers(
  stored: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
  fromClient: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
): Partial<Record<LayerName, LayerEnvelope<unknown>>> {
  const out: Partial<Record<LayerName, LayerEnvelope<unknown>>> = {};
  for (const layer of LAYER_NAMES) {
    const chosen = stored[layer] ?? fromClient[layer];
    if (chosen) out[layer] = chosen;
  }
  return out;
}

/**
 * Which envelopes the brief is written from. The stored copy is the server's
 * own record of what the sources answered, so when Site Memory is up and it has
 * rows for this site, that record is the whole answer and the client's body is
 * ignored: otherwise a caller could hand the model any numbers it liked and the
 * brief would cite them as measurements.
 *
 * The client's copy is admitted in exactly two cases: Site Memory is offline,
 * so nothing was stored, or memory is up but has no row for this site yet,
 * which is the same situation one moment earlier.
 */
export function selectLayers(
  stored: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
  fromClient: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
  offline: boolean,
): {
  layers: Partial<Record<LayerName, LayerEnvelope<unknown>>>;
  usedClientLayers: boolean;
} {
  const storedCount = Object.keys(stored).length;
  if (!offline && storedCount > 0) {
    return { layers: mergeLayers(stored, {}), usedClientLayers: false };
  }
  return {
    layers: mergeLayers(stored, fromClient),
    usedClientLayers: Object.keys(fromClient).length > 0,
  };
}
