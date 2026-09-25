// The site brief prompt, input serializer, and citation validator.
// SPEC.md section 12.
//
// Erasable TypeScript only. Do not use the "@/" alias inside src/lib/datum.

import { createHash } from "node:crypto";
import { LAYER_NAMES, type LayerEnvelope, type LayerName } from "../types";

/**
 * The system prompt. SPEC section 12 fixes the contract; this is the text that
 * implements it. Changing any numbered rule changes the contract, and the
 * citation validator below is written against these rules.
 */
export const SYSTEM_PROMPT = `You write the site brief on an architectural site analysis sheet. Your reader is a working architect starting schematic design.

Write exactly five sections, in this order, each heading on its own line and nothing else on that line:
Ground
Climate and sun
Context and access
Risk
What is missing

Rules, all binding:

1. About 350 words in total and never more than 420. Short paragraphs, plain sentences. All five sections must be present and finished: a brief that stops mid sentence is a failure, so keep the earlier sections tight enough to reach the last one.
2. Every sentence that states a fact about the site ends with one or more citations of the form [layer.path.to.field], copied character for character from the keys of the input JSON. A sentence with a number in it and no citation is a failure.
3. Use only what is in the input. Never mention the neighbourhood, the city, the address, history, reputation, nearby landmarks, or anything you know from outside this input. You do not know where this site is beyond its latitude and longitude.
4. Quote numbers exactly as the input gives them, with their units. Do not round further, do not convert, do not average, do not infer a value the input does not carry.
5. A layer whose status is unavailable has no data and no citable fields. Name it in "What is missing" in plain words with its reason, cite nothing for it (there is no field to cite, so never write something like [flood.status]), and reason about it no further. Never estimate or fill a gap.
6. No headings other than the five above. No markdown, no bullet lists, no bold. No em dashes: use periods, commas, colons, or parentheses.
7. Say what each fact means for a design decision (orientation, massing, entry level, envelope, ground floor program, structure, stormwater), but only where the data supports it.`;

// ─── Input serializer ────────────────────────────────────────────────────────

/** Keys that must never appear in the serialized input (SPEC section 12). */
export const FORBIDDEN_KEYS = ["locality", "address", "displayName", "city"];

/**
 * Paths whose values are drawing geometry. The brief never cites a coordinate
 * and sending them would spend the whole context on numbers nobody reads.
 */
const GEOMETRY_SEGMENTS = [
  "ring",
  "rings",
  "line",
  "lines",
  "bands",
  "geometry",
  "samples",
  "values",
  "margins",
];

/** Longer arrays collapse to a count and a range rather than every element. */
const MAX_VALUES_PER_PATH = 16;

/**
 * Layers whose `name` fields are OpenStreetMap labels: building names and
 * transit stop names. A short bucket does not collapse to a count, so in a
 * sparse frame those strings would reach the model whole, and SPEC section 12
 * forbids it: a stop called "Peachtree Center Station" tells the model where
 * the site is, which is the one thing the serializer exists to withhold. The
 * skip is scoped to these layers so the soil series name and the tract name,
 * which are data and are citable, are untouched.
 */
const NAME_SKIP_LAYERS = new Set<LayerName>(["osm", "walkshed"]);

function isGeometryPath(path: string): boolean {
  const segments = path.split(/[.[]/);
  return segments.some((segment) => GEOMETRY_SEGMENTS.includes(segment));
}

/**
 * True when any segment of the path is a forbidden key. SPEC section 12 says
 * the input carries no address, no locality and no city, and the serializer is
 * the only place that can hold that line: a source that starts returning a
 * `locality` or a `displayName` inside its data would otherwise send it to the
 * model. This is a structural skip next to the geometry and OSM name skips, not
 * a test of the current shape of any source.
 */
function isForbiddenPath(path: string): boolean {
  const segments = path.split(/[.[\]]/);
  return segments.some((segment) => FORBIDDEN_KEYS.includes(segment));
}

/** True when this layer's path is an OSM label rather than a measurement. */
function isSkippedName(layer: LayerName, path: string): boolean {
  if (!NAME_SKIP_LAYERS.has(layer)) return false;
  return path.split(/[.[\]]/).includes("name");
}

function flatten(
  value: unknown,
  prefix: string,
  out: Map<string, unknown[]>,
): void {
  if (Array.isArray(value)) {
    const path = `${prefix}[]`;
    for (const item of value) flatten(item, path, out);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
      flatten(child, prefix ? `${prefix}.${name}` : name, out);
    }
    return;
  }
  if (!prefix) return;
  const bucket = out.get(prefix);
  if (bucket) bucket.push(value);
  else out.set(prefix, [value]);
}

/**
 * Leaf numbers are rounded to four decimals before they are sent. The brief is
 * told to quote what it is given exactly, and 79.66248616336355 degrees is not
 * a number anyone writes on a drawing. Four decimals is finer than any of these
 * sources measures, so nothing meaningful is lost.
 */
function roundLeaf(value: unknown): unknown {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return Math.round(value * 10_000) / 10_000;
}

/** Summarise a bucket that is too long to send in full. */
function summarise(values: unknown[]): unknown {
  const numbers = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (numbers.length === values.length && numbers.length > 0) {
    return {
      count: numbers.length,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
    };
  }
  return { count: values.length };
}

/**
 * One layer's leaf values, keyed by the dotted path the brief must cite, which
 * is the layer name plus the envelope's own field path.
 */
export function flattenLayer(
  layer: LayerName,
  data: unknown,
): Record<string, unknown> {
  const buckets = new Map<string, unknown[]>();
  flatten(data, "", buckets);
  const fields: Record<string, unknown> = {};
  for (const [path, values] of buckets) {
    if (isGeometryPath(path)) continue;
    if (isSkippedName(layer, path)) continue;
    if (isForbiddenPath(path)) continue;
    const key = `${layer}.${path}`;
    if (values.length === 1) fields[key] = roundLeaf(values[0]);
    else if (values.length <= MAX_VALUES_PER_PATH) fields[key] = values.map(roundLeaf);
    else fields[key] = summarise(values);
  }
  return fields;
}

export interface BriefInputSite {
  lat: number;
  lng: number;
}

export interface BriefInput {
  /** Only the point. No address, no locality, no city (SPEC section 12). */
  site: { latitude: number; longitude: number };
  layers: Record<
    string,
    | { status: "ok" | "partial"; fields: Record<string, unknown>; missing?: string[] }
    | { status: "unavailable"; reason: string }
  >;
}

/**
 * The JSON the model sees. Available layers carry their leaf values keyed by
 * the dotted path; unavailable layers carry only a status and a reason. The
 * site is referred to as "the site" and is never named.
 */
export function serializeInput(
  site: BriefInputSite,
  layers: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
): BriefInput {
  const out: BriefInput["layers"] = {};
  for (const layer of LAYER_NAMES) {
    const envelope = layers[layer];
    if (!envelope) {
      out[layer] = {
        status: "unavailable",
        reason: "This layer was not requested for this site.",
      };
      continue;
    }
    if (envelope.status === "unavailable" || envelope.data === null) {
      out[layer] = {
        status: "unavailable",
        reason:
          envelope.unavailable?.message ?? "This layer returned no usable data.",
      };
      continue;
    }
    const entry: {
      status: "ok" | "partial";
      fields: Record<string, unknown>;
      missing?: string[];
    } = {
      status: envelope.status === "partial" ? "partial" : "ok",
      fields: flattenLayer(layer, envelope.data),
    };
    if (envelope.partial) entry.missing = envelope.partial.missing;
    out[layer] = entry;
  }
  return {
    site: { latitude: site.lat, longitude: site.lng },
    layers: out,
  };
}

/**
 * Every path the brief is allowed to cite: exactly the keys the serializer
 * sent, and nothing else.
 *
 * The allowlist is built from the `flattenLayer` output rather than from the
 * envelope's own `fieldPaths` list. The two differ: `fieldPaths` includes the
 * geometry, OSM name and forbidden key paths the serializer skips, and it
 * carries uncollapsed array paths the model never saw. A path the model was not
 * given is not something it can copy character for character, so accepting it
 * would only let an invented citation through the check. The two site keys are
 * added because the serializer sends them under `site` (SPEC section 12: the
 * coordinates are part of the input because the sun path depends on them).
 */
export function citableFieldPaths(
  layers: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
): string[] {
  const paths = new Set<string>();
  paths.add("site.latitude");
  paths.add("site.longitude");
  for (const layer of LAYER_NAMES) {
    const envelope = layers[layer];
    if (!envelope || envelope.status === "unavailable" || envelope.data === null) {
      continue;
    }
    for (const key of Object.keys(flattenLayer(layer, envelope.data))) {
      paths.add(key);
    }
  }
  return [...paths].sort();
}

/** A stable hash of the input, so a repeat with the same data is recognisable. */
export function inputHash(input: BriefInput): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
}

/** The user message: the input JSON and nothing else. */
export function userMessage(input: BriefInput): string {
  return `Site data:\n\n${JSON.stringify(input, null, 1)}`;
}

// ─── Citation validation ─────────────────────────────────────────────────────
//
// The validator lives in ./citations so the browser can import it: this module
// uses node:crypto for the input hash, and a client bundle cannot follow that.

export {
  briefFailedChecks,
  buildValueIndex,
  validateCitations,
  type CitationCheck,
  type ValueIndex,
} from "./citations";
