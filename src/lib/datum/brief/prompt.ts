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

1. About 350 words in total. Short paragraphs. Plain sentences.
2. Every sentence that states a fact about the site ends with one or more citations of the form [layer.path.to.field], copied character for character from the keys of the input JSON. A sentence with a number in it and no citation is a failure.
3. Use only what is in the input. Never mention the neighbourhood, the city, the address, history, reputation, nearby landmarks, or anything you know from outside this input. You do not know where this site is beyond its latitude and longitude.
4. Quote numbers exactly as the input gives them, with their units. Do not round further, do not convert, do not average, do not infer a value the input does not carry.
5. A layer whose status is unavailable has no data. Name it in "What is missing" with its reason and reason about it no further. Never estimate or fill a gap.
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

function isGeometryPath(path: string): boolean {
  const segments = path.split(/[.[]/);
  return segments.some((segment) => GEOMETRY_SEGMENTS.includes(segment));
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
    const key = `${layer}.${path}`;
    if (values.length === 1) fields[key] = values[0];
    else if (values.length <= MAX_VALUES_PER_PATH) fields[key] = values;
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

/** Every path the brief is allowed to cite, from the available layers. */
export function citableFieldPaths(
  layers: Partial<Record<LayerName, LayerEnvelope<unknown>>>,
): string[] {
  const paths = new Set<string>();
  for (const layer of LAYER_NAMES) {
    const envelope = layers[layer];
    if (!envelope || envelope.status === "unavailable" || envelope.data === null) {
      continue;
    }
    for (const path of envelope.fieldPaths) paths.add(`${layer}.${path}`);
    // The serializer sends collapsed array paths, so both forms are citable.
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

export interface CitationCheck {
  /** Every distinct citation the text carries that is not a data field. */
  invalidCitations: string[];
  /** Every distinct citation that matched a field path. */
  validCitations: string[];
  /** Sentences containing a digit and carrying no citation. */
  uncitedNumericSentences: number;
}

const CITATION = /\[([^\]\n]+)\]/g;
/** Protects a decimal point from the sentence splitter. */
const DECIMAL_MARK = "";

function sentencesOf(text: string): string[] {
  const guarded = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_MARK}$2`);
  return guarded
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.split(DECIMAL_MARK).join("."))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** The five section names never need a citation (SPEC section 12). */
const SECTION_NAMES = [
  "Ground",
  "Climate and sun",
  "Context and access",
  "Risk",
  "What is missing",
];

/**
 * Extract every `[...]` citation and check it against the field paths of the
 * available layers. A bracket may hold several comma separated paths.
 */
export function validateCitations(
  text: string,
  fieldPaths: string[],
): CitationCheck {
  const allowed = new Set(fieldPaths);
  const valid = new Set<string>();
  const invalid = new Set<string>();

  for (const match of text.matchAll(CITATION)) {
    for (const raw of match[1].split(",")) {
      const citation = raw.trim();
      if (citation.length === 0) continue;
      if (allowed.has(citation)) valid.add(citation);
      else invalid.add(citation);
    }
  }

  let uncited = 0;
  for (const sentence of sentencesOf(text)) {
    const bare = sentence.replace(/[:.]$/, "");
    if (SECTION_NAMES.includes(bare)) continue;
    if (!/\d/.test(sentence)) continue;
    if (/\[[^\]\n]+\]/.test(sentence)) continue;
    uncited += 1;
  }

  return {
    invalidCitations: [...invalid].sort(),
    validCitations: [...valid].sort(),
    uncitedNumericSentences: uncited,
  };
}

/**
 * SPEC section 12: more than two invalid citations, or any uncited numeric
 * sentence, and the client shows the unverified banner.
 */
export function briefFailedChecks(check: CitationCheck): boolean {
  return check.invalidCitations.length > 2 || check.uncitedNumericSentences > 0;
}
