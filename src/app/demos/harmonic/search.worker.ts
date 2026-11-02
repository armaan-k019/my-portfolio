// Runs each check against the sequence, in the visitor's browser, and posts
// one outcome per check. The search stops at the first failing n.

import { MAX_CASES } from "./samples";
import { parseExpr, parseSequence, search, type Outcome } from "./math";

export interface SearchRequest {
  source: string;
  checks: string[];
}

export type SearchMessage = { i: number; outcome: Outcome } | { error: string };

const BUDGET_MS = 1500;

// The DOM lib types `self` as a Window; inside a worker it is the worker scope.
const scope = self as unknown as {
  onmessage: (e: MessageEvent<SearchRequest>) => void;
  postMessage: (m: SearchMessage) => void;
};

scope.onmessage = (e) => {
  const post = (m: SearchMessage) => scope.postMessage(m);
  let def;
  try {
    def = parseSequence(e.data.source);
  } catch (err) {
    post({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  e.data.checks.forEach((check, i) => {
    let outcome: Outcome;
    try {
      outcome = search(def, parseExpr(check), { maxCases: MAX_CASES, budgetMs: BUDGET_MS });
    } catch (err) {
      outcome = { status: "error", n: null, message: err instanceof Error ? err.message : String(err) };
    }
    post({ i, outcome });
  });
};
