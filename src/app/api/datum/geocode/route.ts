// POST /api/datum/geocode. SPEC.md section 7.
// One Nominatim search per submit, behind a one request per second token
// bucket. Photon is never used here: it mis-resolves the Miami test
// intersection, which is why the confirm step exists.

import { NextResponse, type NextRequest } from "next/server";
import { MAX_GEOCODE_QUERY_LENGTH } from "@/lib/datum/constants";
import { buildSourceContext } from "@/lib/datum/layers";
import { geocode, takeNominatimToken } from "@/lib/datum/sources/nominatim";
import { isSourceError } from "@/lib/datum/http";

export const maxDuration = 15;

interface GeocodeRequestBody {
  q?: unknown;
}

export async function POST(request: NextRequest) {
  let body: GeocodeRequestBody;
  try {
    body = (await request.json()) as GeocodeRequestBody;
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "The request body is not JSON." } },
      { status: 400 },
    );
  }

  const query = typeof body.q === "string" ? body.q.trim() : "";
  if (query.length === 0) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "q is required." } },
      { status: 400 },
    );
  }
  // An address is never this long. The cap keeps an attacker chosen string out
  // of the upstream request and out of api_cache.
  if (query.length > MAX_GEOCODE_QUERY_LENGTH) {
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

  if (!takeNominatimToken(Date.now())) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: "Geocoding is limited to one request per second. Try again.",
        },
      },
      { status: 429 },
    );
  }

  try {
    const result = await geocode(query, buildSourceContext());
    if (!result) {
      return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (raw) {
    const code = isSourceError(raw) ? raw.code : "upstream_error";
    return NextResponse.json(
      {
        error: {
          code,
          message: "The address could not be geocoded. Try again in a moment.",
        },
      },
      { status: code === "rate_limited" ? 429 : 502 },
    );
  }
}
