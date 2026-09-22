// POST /api/datum/site. SPEC.md section 7.
// Creates or fetches the site record, applies the per IP rate limit, and
// returns the locality and tract when those lookups answer.

import { NextResponse, type NextRequest } from "next/server";
import { siteKey as siteKeyOf } from "@/lib/datum/geo";
import { buildSourceContext } from "@/lib/datum/layers";
import {
  checkRateLimit,
  clientIpFrom,
  findSite,
  getOrCreateSite,
  hashIp,
  memoryStatus,
} from "@/lib/datum/memory";
import { lookupTract } from "@/lib/datum/sources/census";
import { reverseLocality } from "@/lib/datum/sources/nominatim";
import { RATE_LIMIT_FREE_REOPEN_DAYS } from "@/lib/datum/constants";
import type { CensusTract } from "@/lib/datum/types";

export const maxDuration = 15;

interface SiteRequestBody {
  lat?: unknown;
  lng?: unknown;
  isTest?: unknown;
}

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "bad_request", message } },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  let body: SiteRequestBody;
  try {
    body = (await request.json()) as SiteRequestBody;
  } catch {
    return badRequest("The request body is not JSON.");
  }

  const lat = typeof body.lat === "number" ? body.lat : Number.NaN;
  const lng = typeof body.lng === "number" ? body.lng : Number.NaN;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return badRequest("lat must be a number between -90 and 90.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return badRequest("lng must be a number between -180 and 180.");
  }

  const allowTestFlag = process.env.DATUM_ALLOW_TEST_FLAG === "1";
  const isTest = allowTestFlag && body.isTest === true;

  const key = siteKeyOf(lat, lng);
  const ipHash = hashIp(clientIpFrom(request.headers.get("x-forwarded-for")));

  // Re-opening a site analyzed in the last 30 days is free (SPEC section 13).
  const existing = await findSite(key);
  const freeWindowMs = RATE_LIMIT_FREE_REOPEN_DAYS * 86_400_000;
  const chargeable =
    !existing ||
    Date.now() - new Date(existing.last_analyzed_at).getTime() > freeWindowMs;

  const rate = await checkRateLimit(ipHash, { increment: chargeable });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", resetAt: rate.resetAt } },
      { status: 429 },
    );
  }

  const ctx = buildSourceContext();

  let locality: string | null = existing?.locality ?? null;
  if (!locality) {
    try {
      locality = await reverseLocality(lat, lng, ctx);
    } catch {
      locality = null;
    }
  }

  let tract: CensusTract | null = null;
  try {
    tract = await lookupTract(lat, lng, ctx);
  } catch {
    tract = null;
  }

  const site = await getOrCreateSite({
    lat,
    lng,
    locality,
    tractGeoid: tract ? tract.geoid : existing?.tract_geoid ?? null,
    isTest,
  });

  return NextResponse.json({
    siteId: site.id,
    siteKey: site.site_key,
    locality: site.locality ?? locality,
    tract: tract
      ? {
          geoid: tract.geoid,
          state: tract.state,
          county: tract.county,
          tract: tract.tract,
          areaLandM2: tract.areaLandM2,
        }
      : null,
    memoryStatus: memoryStatus(),
    rateLimit: { remaining: rate.remaining },
  });
}
