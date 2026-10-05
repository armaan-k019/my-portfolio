// Citation extraction and validation for the site brief. SPEC.md section 12.
//
// Separate from prompt.ts on purpose: prompt.ts hashes the input with
// node:crypto, which a client bundle cannot resolve, and the page needs these
// two functions to decide whether to show the unverified banner.
//
// Erasable TypeScript only. Do not use the "@/" alias inside src/lib/datum.

export interface CitationCheck {
  /** Every distinct citation the text carries that is not a data field. */
  invalidCitations: string[];
  /** Every distinct citation that matched a field path. */
  validCitations: string[];
  /**
   * Sentences that carry a number and failed the value aware check: no valid
   * citation of their own, and at least one number that does not trace to a
   * dataset value cited earlier in the brief.
   */
  uncitedNumericSentences: number;
  /**
   * Sentences that carry a number, carry no citation of their own, and passed
   * because every number in them restates a value cited earlier.
   */
  valueMatchedSentences: number;
}

/**
 * Every rendered form of a dataset value, mapped to the dotted paths that
 * render to it. Two paths can hold the same number, so the value is a set and
 * any one of its paths can carry the earlier citation.
 */
export type ValueIndex = Map<string, Set<string>>;

/**
 * A citation is `[layer.path]`, and an array path ends in `[]`, so the pattern
 * has to allow an empty bracket pair inside: `[topo.sections.ew[]]` is one
 * citation of `topo.sections.ew[]`, not a truncated `topo.sections.ew[`.
 */
const CITATION = /\[((?:[^[\]\n]|\[\])+)\]/g;
/**
 * Protects a decimal point from the sentence splitter. U+0001 is written as an
 * escape rather than as the literal byte: a raw control character in a source
 * file survives no round trip through a diff view, a copy and paste, or an
 * editor that strips it, and the sentence count would then change silently.
 */
const DECIMAL_MARK = "\u0001";

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

// ─── Debug log ───────────────────────────────────────────────────────────────

/**
 * The value aware check can pass a sentence that carries no bracket, so a false
 * pass has to be diagnosable (SPEC section 12). Every decision is logged, but
 * only when DATUM_DEBUG_CITATIONS=1, so a production run stays quiet. Nothing
 * but a sentence index, a number and a field path is ever written: no address,
 * no locality, no key.
 */
function debugEnabled(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.DATUM_DEBUG_CITATIONS === "1";
}

function debugDecision(message: string): void {
  if (!debugEnabled()) return;
  console.debug(`[datum] citation check ${message}`);
}

// ─── Value index ─────────────────────────────────────────────────────────────

/** The serializer's rounding (prompt.ts roundLeaf), repeated here on purpose. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** "7396" becomes "7,396"; "1234.5" becomes "1,234.5". */
function groupThousands(plain: string): string {
  const [whole, fraction] = plain.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign.length > 0 ? whole.slice(1) : whole;
  if (!/^\d+$/.test(digits) || digits.length < 4) return plain;
  const grouped = digits.replace(/\B(?=(\d{3})+$)/g, ",");
  return fraction === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`;
}

/**
 * The forms of one dataset value a sentence is allowed to write: the string the
 * serializer actually sent, its four decimal rounding with trailing zeros
 * stripped, the integer form when the value is whole, and the thousands
 * separated form. Nothing else is accepted: no unit conversion and no rounding
 * beyond what the serializer did.
 *
 * Both the sent string and the rounded one are indexed because the four decimal
 * backstop in prompt.ts applies only to the leaves it flattens. Since the
 * precision table (SPEC section 8 rule 7) the two forms are the same number for
 * every field it covers: the value is already rounded when it reaches the
 * serializer, so the string the model was sent is the string the brief may
 * quote, and rounding correctly is what passes rather than what fails.
 */
function renderedForms(value: number): string[] {
  const rounded = round4(value);
  const forms = new Set<string>();
  for (const written of [String(value), String(rounded)]) {
    forms.add(written);
    forms.add(groupThousands(written));
  }
  if (Number.isInteger(rounded)) forms.add(rounded.toFixed(0));
  return [...forms];
}

/**
 * True when this path's value is a percentage, so "6.2%" is one of its forms.
 *
 * Two spellings are in use. Most layers name the field `...Pct`, but the soil
 * components carry `soil.components[].percent`, and with only the `Pct` rule a
 * brief that restated a 97 as "97%" found no path for that form and the
 * sentence was reported as unmatched against a number the model was given.
 */
function isPercentPath(path: string): boolean {
  return /(?:pct|percent)(?:\[\])?$/i.test(path);
}

function put(index: ValueIndex, form: string, path: string): void {
  const paths = index.get(form);
  if (paths) paths.add(path);
  else index.set(form, new Set([path]));
}

/** Every finite number under one serialized field, whatever its shape. */
function eachNumber(value: unknown, visit: (found: number) => void): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) eachNumber(item, visit);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) {
      eachNumber(child, visit);
    }
  }
}

/**
 * The rendered forms of every numeric leaf in the serialized input, keyed by the
 * dotted path the brief would have to cite. Built from the same object prompt.ts
 * sends the model, after its rounding, so the index holds exactly what the model
 * read: a number the model was never given traces to nothing.
 */
export function buildValueIndex(input: unknown): ValueIndex {
  const index: ValueIndex = new Map();
  if (input === null || typeof input !== "object") return index;

  const add = (path: string, value: number): void => {
    for (const form of renderedForms(value)) {
      put(index, form, path);
      if (isPercentPath(path)) put(index, `${form}%`, path);
    }
  };

  const root = input as { site?: unknown; layers?: unknown };
  if (root.site !== null && typeof root.site === "object") {
    for (const [name, value] of Object.entries(root.site as Record<string, unknown>)) {
      eachNumber(value, (found) => add(`site.${name}`, found));
    }
  }
  if (root.layers === null || typeof root.layers !== "object") return index;
  for (const entry of Object.values(root.layers as Record<string, unknown>)) {
    if (entry === null || typeof entry !== "object") continue;
    const fields = (entry as { fields?: unknown }).fields;
    if (fields === null || typeof fields !== "object") continue;
    for (const [path, value] of Object.entries(fields as Record<string, unknown>)) {
      eachNumber(value, (found) => add(path, found));
    }
  }
  return index;
}

// ─── Numeric tokens ──────────────────────────────────────────────────────────

/**
 * A number as a sentence writes it: an optional minus sign, digits, optional
 * thousands groups, an optional decimal part, an optional percent sign. Ordinal
 * and count words ("first", "all twenty") carry no digits and are not numbers
 * here. The minus is read only at the start of a word, so "5-minute" and
 * "2023-2024" are not negative numbers, while "-7.05 C" is the value the data
 * carries.
 */
const NUMERIC_TOKEN = /(?:(?<=^|[\s([])-)?\d+(?:,\d{3})*(?:\.\d+)?%?/g;
/** A bare four digit year. A date is not a measurement. */
const YEAR = /^(?:1[89]|20)\d{2}$/;

/** Every number the sentence writes, with the citation brackets removed. */
function numericTokensOf(sentence: string): string[] {
  const prose = sentence.replace(CITATION, " ");
  return Array.from(prose.matchAll(NUMERIC_TOKEN), (match) => match[0]);
}

/**
 * The forms of a written number to look the index up by. A token that carries
 * a percent sign keeps it: the index only holds a "%" form under a path whose
 * value is a percentage (buildValueIndex adds it only for a Pct path), so a
 * written percentage can only ever match a percentage value. Stripping the
 * sign here to fall back to the bare form would let "20%" match a plain
 * buildingCount of 20, which is not the same claim.
 */
function candidateForms(token: string): string[] {
  const forms = new Set<string>([token]);
  forms.add(token.split(",").join(""));
  return [...forms];
}

/** The paths whose value renders to this written number, or null. */
function matchedPaths(values: ValueIndex, token: string): Set<string> | null {
  for (const form of candidateForms(token)) {
    const paths = values.get(form);
    if (paths) return paths;
  }
  return null;
}

/** The valid citations this one sentence carries, in order. */
function citationsIn(sentence: string, allowed: Set<string>): string[] {
  const found: string[] = [];
  for (const match of sentence.matchAll(CITATION)) {
    for (const raw of match[1].split(",")) {
      const citation = raw.trim();
      if (citation.length > 0 && allowed.has(citation)) found.push(citation);
    }
  }
  return found;
}

/**
 * Every distinct citation the text carries, in the order it first appears. The
 * page renders one chip per entry, so the order is the reading order of the
 * brief rather than an alphabetical list.
 */
export function extractCitations(text: string): string[] {
  const seen: string[] = [];
  const known = new Set<string>();
  for (const match of text.matchAll(CITATION)) {
    for (const raw of match[1].split(",")) {
      const citation = raw.trim();
      if (citation.length === 0 || known.has(citation)) continue;
      known.add(citation);
      seen.push(citation);
    }
  }
  return seen;
}

/**
 * Extract every `[...]` citation and check it against the field paths of the
 * available layers. A bracket may hold several comma separated paths.
 *
 * The numeric check is value aware (SPEC section 12, amended 2026-09-25). A
 * sentence that carries a number passes when it carries a valid citation of its
 * own, or when every number in it renders a value that is in the dataset and at
 * least one path holding that value was cited by a valid citation in an earlier
 * sentence of the same brief. Restating a number already cited is not
 * fabrication; a number that traces to nothing in the dataset is.
 *
 * `values` is the index of the serialized input the model was sent. Called
 * without it (the client, which only reports the server's verdict), no number
 * traces to anything, so every uncited numeric sentence fails.
 */
export function validateCitations(
  text: string,
  fieldPaths: string[],
  values: ValueIndex = new Map(),
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
  let valueMatched = 0;
  /** Valid citations from the sentences already read. The order is the rule. */
  const citedEarlier = new Set<string>();
  const sentences = sentencesOf(text);

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const bare = sentence.replace(/[:.]$/, "");
    if (SECTION_NAMES.includes(bare)) continue;

    const own = citationsIn(sentence, allowed);
    const tokens = numericTokensOf(sentence);

    if (own.length > 0) {
      if (tokens.length > 0) {
        debugDecision(`sentence=${index} cited=${own.join(",")}`);
      }
      for (const citation of own) citedEarlier.add(citation);
      continue;
    }
    if (tokens.length === 0) continue;

    let passes = true;
    for (const token of tokens) {
      const paths = matchedPaths(values, token);
      // A date is not a measurement: a bare year that is itself a dataset value
      // is read as a date and carries no claim of its own.
      if (YEAR.test(token) && paths !== null) {
        debugDecision(`sentence=${index} token=${token} skipped=date`);
        continue;
      }
      const earlier =
        paths === null
          ? null
          : ([...paths].find((path) => citedEarlier.has(path)) ?? null);
      debugDecision(
        `sentence=${index} token=${token} ` +
          `matched=${paths === null ? "none" : [...paths].join("|")} ` +
          `earlierCitation=${earlier ?? "no"}`,
      );
      if (earlier === null) passes = false;
    }
    if (passes) valueMatched += 1;
    else uncited += 1;
  }

  return {
    invalidCitations: [...invalid].sort(),
    validCitations: [...valid].sort(),
    uncitedNumericSentences: uncited,
    valueMatchedSentences: valueMatched,
  };
}

/**
 * SPEC section 12: more than two invalid citations, or any numeric sentence that
 * failed the value aware check, and the client shows the unverified banner. The
 * two fields are named rather than the whole check, so the client can ask the
 * question with what the `done` event gave it.
 */
export function briefFailedChecks(check: {
  invalidCitations: string[];
  uncitedNumericSentences: number;
}): boolean {
  return check.invalidCitations.length > 2 || check.uncitedNumericSentences > 0;
}
