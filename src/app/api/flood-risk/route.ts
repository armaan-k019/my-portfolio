import { NextResponse } from "next/server";
import { classifyZone } from "./classify";

export const maxDuration = 60;

interface FemaFeature {
  attributes: { FLD_ZONE: string; ZONE_SUBTY: string; SFHA_TF: string };
  geometry?: { rings: number[][][] };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const d = 0.05;
  const base = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";
  const pointUrl =
    `${base}?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json`;
  const areaUrl =
    `${base}?geometry=${lng - d},${lat - d},${lng + d},${lat + d}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=true&f=json`;

  const UNAVAILABLE_MESSAGE =
    "Flood data unavailable: the FEMA service could not be reached. Verify with FEMA's Flood Map Service Center.";

  try {
    const [pointRes, areaRes] = await Promise.allSettled([
      fetch(pointUrl, { signal: AbortSignal.timeout(15000) }),
      fetch(areaUrl, { signal: AbortSignal.timeout(15000) }),
    ]);

    if (pointRes.status !== "fulfilled" || !pointRes.value.ok) {
      console.error(
        "flood-risk: point query failed:",
        pointRes.status === "fulfilled" ? `HTTP ${pointRes.value.status}` : pointRes.reason
      );
      return NextResponse.json({ error: UNAVAILABLE_MESSAGE });
    }

    let zoneAtLocation = "X";
    let subtype = "";
    let sfha = false;

    try {
      const data = await pointRes.value.json() as { features?: FemaFeature[] };
      const features = data.features ?? [];
      if (features.length > 0) {
        zoneAtLocation = features[0].attributes.FLD_ZONE ?? "X";
        subtype = features[0].attributes.ZONE_SUBTY ?? "";
        sfha = features[0].attributes.SFHA_TF === "T";
      }
    } catch (err) {
      console.error("flood-risk: point response unparseable:", err);
      return NextResponse.json({ error: UNAVAILABLE_MESSAGE });
    }

    const classification = classifyZone(zoneAtLocation, subtype, sfha);

    let nearbyZones: { zone: string; subtype: string; sfha: boolean; rings: number[][][] }[] = [];
    if (areaRes.status === "fulfilled" && areaRes.value.ok) {
      try {
        const data = await areaRes.value.json() as { features?: FemaFeature[] };
        nearbyZones = (data.features ?? [])
          .filter((f) => f.geometry?.rings)
          .slice(0, 60)
          .map((f) => ({
            zone: f.attributes.FLD_ZONE ?? "X",
            subtype: f.attributes.ZONE_SUBTY ?? "",
            sfha: f.attributes.SFHA_TF === "T",
            rings: f.geometry!.rings,
          }));
      } catch (err) {
        console.error("flood-risk: area response unparseable:", err);
      }
    }

    return NextResponse.json({
      zoneAtLocation,
      zoneName: classification.zoneName,
      isHighRisk: classification.isHighRisk,
      isModerateRisk: classification.isModerateRisk,
      isMinimalRisk: classification.isMinimalRisk,
      description: classification.description,
      sfha,
      nearbyZones,
    });
  } catch (err) {
    console.error("flood-risk error:", err);
    return NextResponse.json({ error: UNAVAILABLE_MESSAGE }, { status: 500 });
  }
}
