// STUB: replaced by the Phase 1 module agent for photon.
// Owner: module G (geocoding). SPEC section 7 "suggest", PHASE-1 step 1.9.

import { SourceError } from "../http";
import type { SourceContext, Suggestion } from "../types";

/**
 * Address suggestions, at most 6. Cache key `photon:<normalized query>`,
 * TTL TTL_SECONDS.photonSuggest. Throws SourceError; the suggest route answers
 * with an empty list rather than an error page.
 */
export async function suggest(
  _query: string,
  _ctx: SourceContext,
): Promise<Suggestion[]> {
  throw new SourceError("upstream_error", "not implemented", {
    source: "photon",
  });
}
