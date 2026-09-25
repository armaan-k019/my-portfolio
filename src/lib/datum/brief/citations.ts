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
  /** Sentences containing a digit and carrying no citation. */
  uncitedNumericSentences: number;
}

/**
 * A citation is `[layer.path]`, and an array path ends in `[]`, so the pattern
 * has to allow an empty bracket pair inside: `[topo.sections.ew[]]` is one
 * citation of `topo.sections.ew[]`, not a truncated `topo.sections.ew[`.
 */
const CITATION = /\[((?:[^[\]\n]|\[\])+)\]/g;
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
    if (/\[(?:[^[\]\n]|\[\])+\]/.test(sentence)) continue;
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
