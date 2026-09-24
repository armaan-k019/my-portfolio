// GET /api/datum/layers/[layer]. SPEC.md section 7.
// One handler for all nine layers. Dispatches through the layer registry and
// stores every envelope that is worth remembering.

import { NextResponse } from "next/server";
import {
  LAYER_PARAMS,
  LAYER_RESULT_TTL_SECONDS,
  buildSourceContext,
  layerFetchers,
} from "@/lib/datum/layers";
import {
  checkRateLimit,
  clientIpFrom,
  getSiteById,
  hashIp,
  isLocalSiteId,
  memoryStatus,
  storeLayerResult,
} from "@/lib/datum/memory";
import { isValidSiteClass } from "@/lib/datum/sources/usgsSeismic";
import { isLayerName, type LayerInput } from "@/lib/datum/types";

export const maxDuration = 60;

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "bad_request", message } },
    { status: 400 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ layer: string }> },
) {
  const { layer } = await context.params;
  if (!isLayerName(layer)) {
    return NextResponse.json(
      { error: { code: "not_found", message: `Unknown layer "${layer}".` } },
      { status: 404 },
    );
  }

  const query = new URL(request.url).searchParams;
  const siteId = query.get("site");
  if (!siteId) {
    return badRequest("site is required.");
  }

  let lat: number;
  let lng: number;

  if (isLocalSiteId(siteId)) {
    // A local id is the offline fallback the site route hands out when Site
    // Memory is down. While memory is online every real site has a stored row,
    // so a local id is a caller inventing a site id rather than using one.
    if (memoryStatus() !== "offline") {
      return badRequest("Unknown site.");
    }

    // The point travels on the query string, so it is range checked here the
    // way the site route checks the body it stores.
    const rawLat = query.get("lat");
    const rawLng = query.get("lng");
    if (rawLat === null || rawLng === null) {
      return badRequest("lat and lng are required for a local site id.");
    }
    // Number("") and Number(null) are both 0, which would silently analyse a
    // point in the Gulf of Guinea, so the raw strings are checked first.
    lat = Number(rawLat.trim() === "" ? Number.NaN : rawLat);
    lng = Number(rawLng.trim() === "" ? Number.NaN : rawLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return badRequest("lat must be a number between -90 and 90.");
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return badRequest("lng must be a number between -180 and 180.");
    }

    // The site route charges the daily cap, and a local id never passes through
    // it, so this path would otherwise drive every upstream uncounted. Peek
    // without incrementing: the count belongs to the analysis, not the layer.
    const ipHash = hashIp(clientIpFrom(request.headers.get("x-forwarded-for")));
    const rate = await checkRateLimit(ipHash, { increment: false });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: { code: "rate_limited", resetAt: rate.resetAt } },
        { status: 429 },
      );
    }
  } else {
    const site = await getSiteById(siteId);
    if (!site) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Unknown site." } },
        { status: 404 },
      );
    }
    lat = site.lat;
    lng = site.lng;
  }

  const params: Record<string, string> = {};
  for (const name of LAYER_PARAMS[layer]) {
    const value = query.get(name);
    if (value !== null) params[name] = value;
  }

  // An unsupported site class is a bad request, not an unavailable layer: no
  // upstream is asked and the panel is not told a source failed.
  // An absent or blank siteClass is the documented default, not a bad value.
  const siteClass = params.siteClass?.trim() ?? "";
  if (siteClass.length > 0 && !isValidSiteClass(siteClass)) {
    return badRequest("siteClass must be one of A, B, C, D, or E.");
  }

  const input: LayerInput = { lat, lng, siteId, params };
  const envelope = await layerFetchers[layer](input, buildSourceContext());

  const worthStoring =
    envelope.status !== "unavailable" ||
    envelope.unavailable?.code === "no_coverage";
  if (worthStoring) {
    await storeLayerResult(
      siteId,
      layer,
      envelope,
      LAYER_RESULT_TTL_SECONDS[layer],
    );
  }

  return NextResponse.json(envelope);
}
