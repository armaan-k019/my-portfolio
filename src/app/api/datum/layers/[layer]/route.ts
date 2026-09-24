// GET /api/datum/layers/[layer]. SPEC.md section 7.
// One handler for all nine layers. Dispatches through the layer registry and
// stores every envelope that is worth remembering.

import { NextResponse } from "next/server";
import { scheduleAfter } from "@/lib/datum/after";
import { SITE_FREE_LAYER_WINDOW_MS } from "@/lib/datum/constants";
import {
  LAYER_PARAMS,
  LAYER_RESULT_TTL_SECONDS,
  buildSourceContext,
  layerFetchers,
} from "@/lib/datum/layers";
import {
  clientIpFrom,
  getSiteById,
  hashIp,
  isLocalSiteId,
  peekRateLimit,
  storeLayerResult,
  verifyLocalSiteId,
} from "@/lib/datum/memory";
import { isValidSiteClass } from "@/lib/datum/sources/usgsSeismic";
import { isLayerName, type LayerEnvelope, type LayerInput } from "@/lib/datum/types";

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

  // Resolving the site and peeking at the rate limit are the two things that
  // must both pass before any upstream is asked, and neither needs the other's
  // answer, so they run together. The site lookup is a database round trip; the
  // peek is a database round trip at most once a minute per IP (memoised in
  // memory.ts). The fetcher, and with it the api_cache read, starts only after
  // both have resolved and passed.
  const local = isLocalSiteId(siteId);
  const ipHash = hashIp(clientIpFrom(request.headers.get("x-forwarded-for")));
  const resolution = Promise.all([
    local ? verifyLocalSiteId(siteId) : getSiteById(siteId),
    peekRateLimit(ipHash),
  ]);

  const params: Record<string, string> = {};
  for (const name of LAYER_PARAMS[layer]) {
    const value = query.get(name);
    if (value !== null) params[name] = value;
  }

  // An unsupported site class is a bad request, not an unavailable layer: no
  // upstream is asked and the panel is not told a source failed.
  // An absent or blank siteClass is the documented default, not a bad value.
  const siteClass = params.siteClass?.trim() ?? "";
  const siteClassValid = siteClass.length === 0 || isValidSiteClass(siteClass);

  const [resolved, rate] = await resolution;

  function rateLimited() {
    return NextResponse.json(
      { error: { code: "rate_limited", resetAt: rate.resetAt } },
      { status: 429 },
    );
  }

  let lat: number;
  let lng: number;

  if (local) {
    // A local id is the offline fallback the site route hands out when Site
    // Memory is down. It carries its own point and an HMAC over that point and
    // the day, so it is accepted whatever memoryStatus says now: memory can
    // come back online mid analysis, and the later layers of that analysis must
    // still resolve. Anything forged or stale fails here.
    // The two resolvers return different shapes; the key name tells them apart.
    const verified = resolved && "siteKey" in resolved ? resolved : null;
    if (!verified) {
      return badRequest("Unknown site.");
    }
    lat = verified.lat;
    lng = verified.lng;
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return badRequest("lat must be a number between -90 and 90.");
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return badRequest("lng must be a number between -180 and 180.");
    }

    // The site route charges the daily cap, and a local id never passes through
    // it, so this path would otherwise drive every upstream uncounted. The peek
    // never increments: the count belongs to the analysis, not to the layer.
    if (!rate.allowed) return rateLimited();
  } else {
    const site = resolved && "site_key" in resolved ? resolved : null;
    if (!site) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Unknown site." } },
        { status: 404 },
      );
    }
    lat = site.lat;
    lng = site.lng;

    // SPEC section 13 exempts layer calls for a site created in the last 24
    // hours, and only those. An older id is a saved link, so it is subject to
    // the cap like anything else.
    const createdAt = Date.parse(site.created_at);
    const older =
      Number.isFinite(createdAt) &&
      Date.now() - createdAt > SITE_FREE_LAYER_WINDOW_MS;
    if (older && !rate.allowed) return rateLimited();
  }

  if (!siteClassValid) {
    return badRequest("siteClass must be one of A, B, C, D, or E.");
  }

  const input: LayerInput = { lat, lng, siteId, params };
  const envelope: LayerEnvelope<unknown> = await layerFetchers[layer](
    input,
    buildSourceContext(),
  );

  const worthStoring =
    envelope.status !== "unavailable" ||
    envelope.unavailable?.code === "no_coverage";
  if (worthStoring) {
    // Never a floating promise and never awaited: `after` runs the write once
    // the response is sent and keeps the instance alive for it.
    scheduleAfter(async () => {
      try {
        await storeLayerResult(
          siteId,
          layer,
          envelope,
          LAYER_RESULT_TTL_SECONDS[layer],
        );
      } catch (error) {
        console.error(`[datum] layer_results write failed for ${layer}`, error);
      }
    });
  }

  return NextResponse.json(envelope);
}
