// GET /api/datum/suggest. SPEC.md section 7.
// A thin Photon proxy: the browser never calls Photon directly, so the Datum
// User-Agent and the seven day cache apply to every suggestion.

import { NextResponse, type NextRequest } from "next/server";
import { buildSourceContext } from "@/lib/datum/layers";
import { suggest } from "@/lib/datum/sources/photon";

export const maxDuration = 15;

/** SPEC section 3: the field debounces at 300 ms and asks from three characters. */
const MIN_QUERY_LENGTH = 3;

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
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

  try {
    const suggestions = await suggest(query, buildSourceContext());
    return NextResponse.json({ suggestions });
  } catch {
    // Suggestions are a convenience. A Photon failure must not block the
    // submit path, so the field simply shows nothing.
    return NextResponse.json({ suggestions: [] });
  }
}
