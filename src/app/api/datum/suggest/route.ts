// GET /api/datum/suggest. SPEC.md section 7.
// A thin Photon proxy: the browser never calls Photon directly, so the Datum
// User-Agent and the seven day cache apply to every suggestion.

import { NextResponse } from "next/server";
import { MAX_GEOCODE_QUERY_LENGTH } from "@/lib/datum/constants";
import { isSourceError } from "@/lib/datum/http";
import { buildSourceContext } from "@/lib/datum/layers";
import { suggest } from "@/lib/datum/sources/photon";

export const maxDuration = 15;

/** SPEC section 3: the field debounces at 300 ms and asks from three characters. */
const MIN_QUERY_LENGTH = 3;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q");
  if (!query || query.trim().length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: {
          code: "bad_request",
          message: `q must be at least ${MIN_QUERY_LENGTH} characters.`,
        },
      },
      { status: 400 },
    );
  }
  // An address is never this long. The cap keeps an attacker chosen string out
  // of the upstream request and out of api_cache.
  if (query.trim().length > MAX_GEOCODE_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: {
          code: "bad_request",
          message: `q must be at most ${MAX_GEOCODE_QUERY_LENGTH} characters.`,
        },
      },
      { status: 400 },
    );
  }

  try {
    const suggestions = await suggest(query, buildSourceContext());
    return NextResponse.json({ suggestions });
  } catch (raw) {
    // Suggestions are a convenience and a failure must not block the submit
    // path, so this stays a 200. It carries the reason, so the field can say
    // the suggester is down rather than showing "no matches" for a query that
    // was never asked.
    const code = isSourceError(raw) ? raw.code : "upstream_error";
    return NextResponse.json({
      suggestions: [],
      unavailable: {
        code,
        message:
          "Address suggestions are unavailable right now. Type the full address and submit it.",
      },
    });
  }
}
