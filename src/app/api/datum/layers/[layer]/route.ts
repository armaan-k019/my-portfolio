// GET /api/datum/layers/[layer]. SPEC.md section 7.
// One handler for all nine layers. Dispatches through the layer registry and
// stores every envelope that is worth remembering.

import { NextResponse, type NextRequest } from "next/server";
import { siteKey as siteKeyOf } from "@/lib/datum/geo";
import {
  LAYER_PARAMS,
  LAYER_RESULT_TTL_SECONDS,
  buildSourceContext,
  layerFetchers,
} from "@/lib/datum/layers";
import { getSiteById, isLocalSiteId, storeLayerResult } from "@/lib/datum/memory";
import { isLayerName, type LayerInput } from "@/lib/datum/types";

export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ layer: string }> },
) {
  const { layer } = await context.params;
  if (!isLayerName(layer)) {
    return NextResponse.json(
      { error: { code: "not_found", message: `Unknown layer "${layer}".` } },
      { status: 404 },
    );
  }

  const query = request.nextUrl.searchParams;
  const siteId = query.get("site");
  if (!siteId) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "site is required." } },
      { status: 400 },
    );
  }

  let lat: number;
  let lng: number;

  if (isLocalSiteId(siteId)) {
    // Site Memory is offline, so the point travels on the query string.
    lat = Number(query.get("lat"));
    lng = Number(query.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        {
          error: {
            code: "bad_request",
            message: "lat and lng are required for a local site id.",
          },
        },
        { status: 400 },
      );
    }
    const expected = `local-`;
    if (!siteId.startsWith(expected) || siteKeyOf(lat, lng).length === 0) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Invalid site." } },
        { status: 400 },
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
