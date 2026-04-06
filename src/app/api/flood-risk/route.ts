import { NextResponse } from "next/server";

export const maxDuration = 30;

interface FemaFeature {
  attributes: { FLD_ZONE: string; ZONE_SUBTY: string; SFHA_TF: string };
  geometry?: { rings: number[][][] };
}

function classifyZone(zone: string, subtype: string, sfha: boolean) {
  const z = (zone ?? "X").toUpperCase().trim();
  const st = (subtype ?? "").toUpperCase();

  // Coastal high hazard
  if (z === "VE" || z === "V" || z.startsWith("V1")) {
    return {
      isHighRisk: true,
      isModerateRisk: false,
      isMinimalRisk: false,
      zoneName: "Coastal High Hazard Area",
      description:
        "This location is in a coastal high hazard area subject to wave action — the highest FEMA flood risk designation. Flood insurance is required for federally-backed mortgages.",
    };
  }
  // SFHA zones (A-series)
  if (sfha || z === "A" || z.startsWith("AE") || z === "AO" || z === "AH" || z === "AR" || z === "A99" || (z.length > 1 && z.startsWith("A"))) {
    return {
      isHighRisk: true,
      isModerateRisk: false,
      isMinimalRisk: false,
      zoneName: "Special Flood Hazard Area",
      description:
        "This location falls within the 100-year floodplain — areas with a 1% annual chance of flooding. Flood insurance is typically required for federally-backed mortgages here.",
    };
  }
  // X shaded = 500-year
  if (z === "X" && (st.includes("500") || st.includes("SHADED"))) {
    return {
      isHighRisk: false,
      isModerateRisk: true,
      isMinimalRisk: false,
      zoneName: "Moderate Flood Hazard (500-year)",
      description:
        "This location is in the 500-year floodplain with a 0.2% annual chance of flooding. Flood insurance is not required but is recommended for protection against moderate risk.",
    };
  }
  // Undetermined
  if (z === "D") {
    return {
      isHighRisk: false,
      isModerateRisk: false,
      isMinimalRisk: false,
      zoneName: "Undetermined Risk",
      description:
        "Flood hazard has not been determined for this area. Contact local floodplain management authorities for specific risk information.",
    };
  }
  // Zone X unshaded = minimal
  return {
    isHighRisk: false,
    isModerateRisk: false,
    isMinimalRisk: true,
    zoneName: "Minimal Flood Hazard",
    description:
      "This location is outside the 500-year floodplain and carries minimal flood risk. Flood insurance is not required but may be available at low cost.",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const d = 0.05;
  const base = "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query";
  const pointUrl =
    `${base}?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json`;
  const areaUrl =
    `${base}?geometry=${lng - d},${lat - d},${lng + d},${lat + d}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=true&f=json`;

  try {
    const [pointRes, areaRes] = await Promise.allSettled([
      fetch(pointUrl, { signal: AbortSignal.timeout(15000) }),
      fetch(areaUrl, { signal: AbortSignal.timeout(15000) }),
    ]);

    let zoneAtLocation = "X";
    let subtype = "";
    let sfha = false;

    if (pointRes.status === "fulfilled" && pointRes.value.ok) {
      const data = await pointRes.value.json() as { features?: FemaFeature[] };
      const features = data.features ?? [];
      if (features.length > 0) {
        zoneAtLocation = features[0].attributes.FLD_ZONE ?? "X";
        subtype = features[0].attributes.ZONE_SUBTY ?? "";
        sfha = features[0].attributes.SFHA_TF === "T";
      }
    }

    const classification = classifyZone(zoneAtLocation, subtype, sfha);

    let nearbyZones: { zone: string; subtype: string; sfha: boolean; rings: number[][][] }[] = [];
    if (areaRes.status === "fulfilled" && areaRes.value.ok) {
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
    return NextResponse.json({ error: "Failed to fetch flood data" }, { status: 500 });
  }
}
