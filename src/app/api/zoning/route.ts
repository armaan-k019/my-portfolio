import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 30;

type ZoneType =
  | "residential"
  | "commercial"
  | "industrial"
  | "mixed"
  | "agricultural"
  | "institutional"
  | "unknown";

interface ZoneResult {
  zoneCode: string | null;
  zoneName: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function inferZoneType(code: string): ZoneType {
  const c = code.toUpperCase();
  if ((c.startsWith("R") && !c.startsWith("RE") && !c.includes("RESEARCH")) || c.includes("RES"))
    return "residential";
  if (c.startsWith("C") || c.includes("COM") || c.startsWith("B") || c.startsWith("NC") || c === "NB")
    return "commercial";
  if (c.startsWith("I") || c.includes("IND") || c.startsWith("LI") || c.startsWith("HI"))
    return "industrial";
  if (c.includes("MU") || c.includes("MX") || c.includes("MIXED")) return "mixed";
  if (c.includes("AG") || c.includes("FARM")) return "agricultural";
  if (c.includes("INST") || c.includes("PF") || c.startsWith("P-") || c.startsWith("CF"))
    return "institutional";
  return "unknown";
}

function osmTagToZoneType(tags: Record<string, string>): ZoneType {
  const landuse = tags.landuse?.toLowerCase() ?? "";
  const amenity = tags.amenity?.toLowerCase() ?? "";
  if (landuse === "residential") return "residential";
  if (landuse === "commercial" || landuse === "retail") return "commercial";
  if (landuse === "industrial") return "industrial";
  if (landuse === "mixed") return "mixed";
  if (landuse === "farmland" || landuse === "farm" || landuse === "greenfield" || landuse === "orchard")
    return "agricultural";
  if (landuse === "institutional" || landuse === "civic" || landuse === "education")
    return "institutional";
  if (amenity === "school" || amenity === "hospital" || amenity === "university" || amenity === "college")
    return "institutional";
  if (landuse === "construction") return "unknown";
  return "unknown";
}

function osmTagToZoneName(tags: Record<string, string>): string {
  const landuse = tags.landuse?.toLowerCase() ?? "";
  const names: Record<string, string> = {
    residential: "Residential",
    commercial: "Commercial",
    retail: "Commercial / Retail",
    industrial: "Industrial",
    mixed: "Mixed Use",
    farmland: "Agricultural",
    farm: "Agricultural",
    greenfield: "Agricultural",
    institutional: "Institutional",
    civic: "Institutional / Civic",
    education: "Institutional / Education",
    construction: "Under Development",
  };
  return names[landuse] ?? (tags.amenity ? `${tags.amenity} (Institutional)` : "Unclassified");
}

// ─── Source 0: Reverse geocode ────────────────────────────────────────────────

async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ city: string; cityDisplay: string; state: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "UrbanGPT/1.0", "Accept-Language": "en" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as Record<string, any>;
    const addr = data.address ?? {};
    const cityDisplay: string = addr.city ?? addr.town ?? addr.village ?? addr.county ?? "";
    const state: string = addr.state ?? "";
    return { city: cityDisplay.toLowerCase(), cityDisplay, state };
  } catch {
    return { city: "", cityDisplay: "", state: "" };
  }
}

// ─── Source 1: City ArcGIS / open data endpoints ─────────────────────────────

async function fetchArcGIS(lat: number, lng: number, city: string): Promise<ZoneResult | null> {
  let url: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parse: (data: any) => ZoneResult | null = () => null;

  if (city.includes("atlanta")) {
    url =
      `https://gis.atlantaga.gov/arcgis/rest/services/PLAN_zoning/MapServer/0/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects&outFields=*&f=json`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      const features = data.features ?? [];
      if (!features.length) return null;
      const a = features[0].attributes;
      return { zoneCode: a.ZONING ?? null, zoneName: a.ZONING_DESC ?? a.ZONING ?? "Unknown" };
    };
  } else if (
    city.includes("new york") ||
    city.includes("brooklyn") ||
    city.includes("manhattan") ||
    city.includes("bronx") ||
    city.includes("queens") ||
    city.includes("staten island")
  ) {
    url = `https://data.cityofnewyork.us/resource/7t3b-ywvw.json?$where=within_circle(the_geom,${lat},${lng},100)&$limit=1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      if (!Array.isArray(data) || !data.length) return null;
      const code = data[0].zonedist1 ?? data[0].zone_dist ?? null;
      return { zoneCode: code, zoneName: code ?? "Unknown" };
    };
  } else if (city.includes("chicago")) {
    url = `https://data.cityofchicago.org/resource/p8va-airx.json?$where=within_circle(the_geom,${lat},${lng},100)&$limit=1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      if (!Array.isArray(data) || !data.length) return null;
      const code = data[0].zone_class ?? null;
      return { zoneCode: code, zoneName: code ?? "Unknown" };
    };
  } else if (city.includes("los angeles") || city.includes("santa monica") || city.includes("west hollywood")) {
    url =
      `https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/General_Plan_Land_Use/FeatureServer/0/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&outFields=*&f=json`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      const features = data.features ?? [];
      if (!features.length) return null;
      const a = features[0].attributes;
      const code = a.LAND_USE ?? a.ZONE ?? a.GPLU ?? null;
      return { zoneCode: code, zoneName: a.LAND_USE_LABEL ?? a.DESCRIPTION ?? code ?? "Unknown" };
    };
  } else if (city.includes("san francisco") || city.includes("sf")) {
    url = `https://data.sfgov.org/resource/xvjh-uu28.json?$where=within_circle(the_geom,${lat},${lng},100)&$limit=1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      if (!Array.isArray(data) || !data.length) return null;
      const code = data[0].zoning_sim ?? data[0].zoning ?? null;
      const name = data[0].zoning_full ?? data[0].zoning_sim ?? code ?? "Unknown";
      return { zoneCode: code, zoneName: name };
    };
  } else if (city.includes("seattle")) {
    url =
      `https://gisdata.seattle.gov/server/rest/services/COS/Seattle_Zoning/MapServer/0/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&outFields=*&f=json`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      const features = data.features ?? [];
      if (!features.length) return null;
      const a = features[0].attributes;
      const code = a.ZONENAME ?? a.ZONING ?? null;
      return { zoneCode: code, zoneName: code ?? "Unknown" };
    };
  } else if (city.includes("austin")) {
    url =
      `https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/Zoning_District/FeatureServer/0/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&outFields=*&f=json`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      const features = data.features ?? [];
      if (!features.length) return null;
      const a = features[0].attributes;
      const code = a.ZONING_TYPE ?? a.ZONE_TYPE ?? null;
      return { zoneCode: code, zoneName: a.ZONING_DESC ?? code ?? "Unknown" };
    };
  } else {
    return null; // unsupported city — go straight to OSM
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    return parse(data);
  } catch {
    return null;
  }
}

// ─── Source 2: OSM landuse ─────────────────────────────────────────────────────

async function fetchOSMLanduse(
  lat: number,
  lng: number
): Promise<{ zoneType: ZoneType; zoneName: string } | null> {
  const query =
    `[out:json][timeout:10];` +
    `(way["landuse"](around:150,${lat},${lng});` +
    `relation["landuse"](around:150,${lat},${lng});` +
    `way["amenity"](around:150,${lat},${lng});` +
    `way["building"](around:150,${lat},${lng});` +
    `);out body;`;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: query,
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        elements: { tags?: Record<string, string> }[];
      };
      const elements = data.elements ?? [];
      if (!elements.length) continue;

      // Tally zone type votes
      const votes: Record<string, number> = {};
      for (const el of elements) {
        if (!el.tags) continue;
        const zt = osmTagToZoneType(el.tags);
        if (zt !== "unknown") votes[zt] = (votes[zt] ?? 0) + 1;
      }
      const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
      const zoneType: ZoneType = (winner?.[0] as ZoneType) ?? "unknown";

      // Get human-readable name from the winning element's tags
      const winnerEl = elements.find(
        (el) => el.tags && osmTagToZoneType(el.tags) === zoneType
      );
      const zoneName = winnerEl?.tags ? osmTagToZoneName(winnerEl.tags) : "Unknown";

      return { zoneType, zoneName };
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Main route ────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // Kick off geocode + OSM in parallel immediately
  const [geoRes, osmRes] = await Promise.allSettled([
    reverseGeocode(lat, lng),
    fetchOSMLanduse(lat, lng),
  ]);

  const geo =
    geoRes.status === "fulfilled"
      ? geoRes.value
      : { city: "", cityDisplay: "", state: "" };
  const osm = osmRes.status === "fulfilled" ? osmRes.value : null;

  // Try city ArcGIS endpoint
  const arcgis = await fetchArcGIS(lat, lng, geo.city);

  // Determine final values
  let zoneCode: string | null = arcgis?.zoneCode ?? null;
  let zoneName: string = arcgis?.zoneName ?? osm?.zoneName ?? "Unknown";
  let source: "arcgis" | "osm" = arcgis ? "arcgis" : "osm";
  let dataQuality: "official" | "estimated" = arcgis ? "official" : "estimated";

  let zoneType: ZoneType = "unknown";
  if (arcgis?.zoneCode) {
    zoneType = inferZoneType(arcgis.zoneCode);
  }
  if (zoneType === "unknown" && osm) {
    zoneType = osm.zoneType;
    if (!arcgis) zoneName = osm.zoneName;
  }

  const cityDisplay = geo.cityDisplay;
  const municipality = cityDisplay && geo.state ? `${cityDisplay}, ${geo.state}` : cityDisplay;

  const disclaimer =
    source === "arcgis"
      ? `Official zoning data from ${cityDisplay || "city"} GIS`
      : "Land use classification estimated from OpenStreetMap — verify with local municipal zoning code";

  const zoningCodeUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${cityDisplay || "local"} zoning code official`
  )}`;
  const gisUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${cityDisplay || "local"} GIS zoning map`
  )}`;

  // Claude AI analysis
  let aiSummary = "";
  let aiDesignNote = "";
  try {
    const client = new Anthropic();
    const context = [
      arcgis ? `Zone: ${zoneCode} (${zoneName})` : null,
      osm ? `OSM land use: ${osm.zoneName}` : null,
      `Zone type: ${zoneType}`,
      municipality ? `Municipality: ${municipality}` : null,
      `Data source: ${source}`,
    ]
      .filter(Boolean)
      .join("\n");

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 250,
      messages: [
        {
          role: "user",
          content: `Zoning data for an architectural site analysis tool:\n${context}\n\nReturn ONLY raw JSON with no markdown:\n{"aiSummary":"1-2 sentence plain English land use summary","aiDesignNote":"1 sentence design implication for architects"}`,
        },
      ],
    });
    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf("{");
    const parsed = JSON.parse(start >= 0 ? text.slice(start) : text) as {
      aiSummary: string;
      aiDesignNote: string;
    };
    aiSummary = parsed.aiSummary ?? "";
    aiDesignNote = parsed.aiDesignNote ?? "";
  } catch {
    aiSummary = arcgis
      ? `${zoneCode} — ${zoneName}.`
      : osm
      ? `This area is classified as ${osm.zoneName.toLowerCase()} based on OpenStreetMap land use data.`
      : "Zoning information is not available for this location from free sources.";
  }

  return NextResponse.json({
    zoneCode,
    zoneName,
    zoneType,
    source,
    city: municipality,
    dataQuality,
    disclaimer,
    aiSummary,
    aiDesignNote,
    zoningCodeUrl,
    gisUrl,
  });
}
