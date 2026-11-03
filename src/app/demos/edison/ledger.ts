// Shared types and pure functions for the Hypothesis Ledger demo. The page and
// the API route both import from here, so the quote check runs the same way on
// the server (before a result is returned) and in the browser (when merging).

export interface Paper {
  id: string;
  title: string;
  year: number | null;
  url: string;
  abstract: string;
}

export type Stance = "supports" | "contradicts";

export interface Evidence {
  paperId: string;
  quote: string;
  stance: Stance;
  verified: boolean;
  round: number;
}

export interface Hypothesis {
  id: string;
  statement: string;
  evidence: Evidence[];
}

export interface Ledger {
  rounds: string[];
  papers: Record<string, Paper>;
  hypotheses: Hypothesis[];
}

// What the route returns for one round: the papers it found, and Claude's
// proposed changes with every quote already checked against its abstract.
export interface RoundResult {
  papers: Paper[];
  updates: { id: string; statement: string; evidence: Omit<Evidence, "round">[] }[];
  next: string;
  source: "openalex" | "semantic_scholar";
}

export const SAMPLE_QUESTION = "Does metformin extend lifespan in mammals?";
export const MAX_HYPOTHESES = 5;
export const MAX_QUESTION_CHARS = 200;
export const MIN_QUOTE_CHARS = 20;

export const EMPTY_LEDGER: Ledger = { rounds: [], papers: {}, hypotheses: [] };

// Lowercase, unify quote marks and dashes, collapse whitespace. Enough to
// forgive formatting differences without forgiving changed words.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// A quote counts only if it appears word for word in the paper's abstract.
export function verifyQuote(quote: string, abstract: string): boolean {
  const q = normalize(quote).replace(/^["'.\s]+|["'.\s]+$/g, "");
  if (q.length < MIN_QUOTE_CHARS) return false;
  return normalize(abstract).includes(q);
}

// Rebuild an abstract from OpenAlex's inverted index ({word: [positions]}).
export function abstractFromIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const p of positions) words[p] = word;
  }
  return words.filter((w) => w !== undefined).join(" ");
}

export interface Tally {
  supports: number;
  contradicts: number;
  unverified: number;
}

export function tally(h: Hypothesis): Tally {
  const t: Tally = { supports: 0, contradicts: 0, unverified: 0 };
  for (const e of h.evidence) {
    if (!e.verified) t.unverified += 1;
    else t[e.stance] += 1;
  }
  return t;
}

// Apply one round to the ledger. Existing hypotheses keep their evidence and
// gain new entries; an update with an unknown id becomes a new hypothesis.
// Duplicate quotes from the same paper are dropped.
export function applyRound(ledger: Ledger, question: string, result: RoundResult): Ledger {
  const round = ledger.rounds.length + 1;
  const papers = { ...ledger.papers };
  for (const p of result.papers) papers[p.id] = p;

  const hypotheses = ledger.hypotheses.map((h) => ({ ...h, evidence: [...h.evidence] }));
  for (const u of result.updates) {
    let h = hypotheses.find((x) => x.id === u.id);
    if (!h) {
      if (hypotheses.length >= MAX_HYPOTHESES) continue;
      h = { id: `H${hypotheses.length + 1}`, statement: u.statement, evidence: [] };
      hypotheses.push(h);
    }
    for (const e of u.evidence) {
      const seen = h.evidence.some((x) => x.paperId === e.paperId && normalize(x.quote) === normalize(e.quote));
      if (!seen) h.evidence.push({ ...e, round });
    }
  }
  return { rounds: [...ledger.rounds, question], papers, hypotheses };
}
