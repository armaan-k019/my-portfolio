// Reading the stored layer envelopes for the brief. SPEC.md sections 12, 13.
//
// The brief prefers the copy in `layer_results`, which the layer routes wrote
// through `after()`. When Site Memory is offline there is no stored copy, and
// the client's own envelopes are the fallback. memory.ts is not changed here:
// this module only reads through its client and its timeout wrapper.

import { getClient, isLocalSiteId, withMemory } from "../memory";
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
    out[name as LayerName] = candidate;
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
