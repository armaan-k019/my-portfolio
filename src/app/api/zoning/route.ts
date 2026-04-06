import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// ─── Types ─────────────────────────────────────────────────────────────────────

type ZoneType =
  | "residential"
  | "commercial"
  | "industrial"
  | "mixed"
  | "agricultural"
  | "institutional"
  | "unknown";

interface ZoneResult {
  zoneCode: string;
  zoneName: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function inferZoneType(code: string): ZoneType {
  const c = code.toUpperCase();
  if (c.startsWith("R") && !c.startsWith("RE") && !c.includes("RESEARCH")) return "residential";
  if (c.includes("RES")) return "residential";
  if (c.startsWith("C") || c.includes("COM") || c.startsWith("B") || c.startsWith("NC") || c.startsWith("NB"))
    return "commercial";
  if (c.startsWith("I") || c.includes("IND") || c.startsWith("LI") || c.startsWith("HI")) return "industrial";
  if (c.includes("MU") || c.includes("MX") || c.includes("MIXED")) return "mixed";
  if (c.includes("AG") || c.includes("FARM")) return "agricultural";
  if (c.includes("INST") || c.includes("PF") || c.startsWith("P-") || c.startsWith("CF")) return "institutional";
  return "unknown";
}

function osmLanduseToZoneType(landuse: string): ZoneType {
  const l = landuse.toLowerCase();
  if (l === "residential") return "residential";
  if (l === "commercial" || l === "retail") return "commercial";
  if (l === "industrial") return "industrial";
  if (l === "mixed") return "mixed";
  if (l === "farmland" || l === "farm" || l === "greenfield" || l === "orchard") return "agricultural";
  if (l === "institutional" || l === "civic" || l === "religious" || l === "education") return "institutional";
  if (l === "construction") return "unknown";
  return "unknown";
}

// ─── Source 0: Reverse geocode ──────────────────────────────────────────────────

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
  let url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parse: (data: any) => ZoneResult | null;

  if (city.includes("atlanta")) {
    url =
      `https://gis.atlantaga.gov/arcgis/rest/services/PLAN_zoning/MapServer/0/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects&outFields=ZONING,ZONING_DESC,OVERLAY&f=json`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      const features = data.features ?? [];
      if (!features.length) return null;
      const a = features[0].attributes;
      return { zoneCode: a.ZONING ?? "Unknown", zoneName: a.ZONING_DESC ?? a.ZONING ?? "Unknown" };
    };
  } else if (city.includes("new york") || city.includes("brooklyn") || city.includes("manhattan") || city.includes("bronx") || city.includes("queens")) {
    url =
      `https://data.cityofnewyork.us/resource/7t3b-ywvw.json` +
      `?$where=within_circle(the_geom,${lat},${lng},100)&$limit=1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      if (!Array.isArray(data) || !data.length) return null;
      const r = data[0];
      const code = r.zonedist1 ?? r.zone_dist ?? "Unknown";
      return { zoneCode: code, zoneName: code };
    };
  } else if (city.includes("chicago")) {
    url =
      `https://data.cityofchicago.org/resource/p8va-airx.json` +
      `?$where=within_circle(the_geom,${lat},${lng},100)&$limit=1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      if (!Array.isArray(data) || !data.length) return null;
      const code = data[0].zone_class ?? "Unknown";
      return { zoneCode: code, zoneName: code };
    };
  } else if (city.includes("los angeles") || city.includes("la") || city.includes("santa monica")) {
    url =
      `https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/General_Plan_Land_Use/FeatureServer/0/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&outFields=*&f=json`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      const features = data.features ?? [];
      if (!features.length) return null;
      const a = features[0].attributes;
      const code = a.LAND_USE ?? a.ZONE ?? a.GPLU ?? "Unknown";
      const name = a.LAND_USE_LABEL ?? a.DESCRIPTION ?? code;
      return { zoneCode: code, zoneName: name };
    };
  } else {
    // Generic Census TIGER PUMA fallback
    url =
      `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&outFields=*&f=json`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse = (data: any) => {
      const features = data.features ?? [];
      if (!features.length) return null;
      const a = features[0].attributes;
      const code = a.PUMACE10 ?? a.NAME10 ?? "Unknown";
      const name = a.NAMELSAD10 ?? code;
      return { zoneCode: code, zoneName: name };
    };
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return parse(data);
  } catch {
    return null;
  }
}

// ─── Source 2: Regrid parcel API ───────────────────────────────────────────────

async function fetchRegrid(lat: number, lng: number): Promise<ZoneResult | null> {
  const apiKey = process.env.REGRID_API_KEY;
  if (!apiKey) return null;

  try {
    const url =
      `https://app.regrid.com/api/v1/parcel?lat=${lat}&lon=${lng}` +
      `&token=${apiKey}&fields=zoning,zoning_description,landuse`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as Record<string, any>;
    const parcel = data.results?.[0]?.fields as Record<string, string> | undefined;
    if (!parcel) return null;
    const zoneCode = parcel.zoning ?? parcel.landuse ?? null;
    if (!zoneCode) return null;
    return { zoneCode, zoneName: parcel.zoning_description ?? zoneCode };
  } catch {
    return null;
  }
}

// ─── Source 3: OSM landuse (always-works fallback) ─────────────────────────────

async function fetchOSMLanduse(
  lat: number,
  lng: number
): Promise<{ landuse: string } | null> {
  const query =
    `[out:json][timeout:10];` +
    `(way["landuse"](around:200,${lat},${lng});` +
    `relation["landuse"](around:200,${lat},${lng}););` +
    `out body;`;

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
      const data = await res.json() as { elements: { tags?: { landuse?: string } }[] };
      const elements = data.elements ?? [];
      if (!elements.length) continue;
      const landuse = elements[0].tags?.landuse;
      if (!landuse) continue;
      return { landuse };
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

  // Kick off reverse geocode and OSM in parallel immediately
  const [geoRes, osmRes] = await Promise.allSettled([
    reverseGeocode(lat, lng),
    fetchOSMLanduse(lat, lng),
  ]);

  const geo =
    geoRes.status === "fulfilled"
      ? geoRes.value
      : { city: "", cityDisplay: "", state: "" };
  const osm = osmRes.status === "fulfilled" ? osmRes.value : null;

  // Try ArcGIS and Regrid in parallel (Regrid skipped if no key)
  const [arcgisRes, regridRes] = await Promise.allSettled([
    fetchArcGIS(lat, lng, geo.city),
    fetchRegrid(lat, lng),
  ]);

  const arcgis = arcgisRes.status === "fulfilled" ? arcgisRes.value : null;
  const regrid = regridRes.status === "fulfilled" ? regridRes.value : null;

  // Best available data
  const primary: ZoneResult | null = arcgis ?? regrid;

  const zoneCode = primary?.zoneCode ?? (osm ? `OSM: ${osm.landuse}` : "Unknown");
  const zoneName = primary?.zoneName ?? (osm ? osm.landuse : "Unknown");

  let zoneType = inferZoneType(primary?.zoneCode ?? "");
  if (zoneType === "unknown" && osm) {
    zoneType = osmLanduseToZoneType(osm.landuse);
  }

  const municipality =
    geo.cityDisplay && geo.state ? `${geo.cityDisplay}, ${geo.state}` : geo.cityDisplay || "";

  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `${geo.cityDisplay || "local"} zoning code ordinance`
  )}`;

  const dataSource = arcgis ? "arcgis" : regrid ? "regrid" : osm ? "osm" : "none";

  // Claude AI summary
  let aiSummary = "";
  let aiDesignNote = "";
  try {
    const client = new Anthropic();
    const context = [
      primary ? `Zone: ${zoneCode} (${zoneName})` : null,
      osm ? `OSM land use: ${osm.landuse}` : null,
      `Zone type: ${zoneType}`,
      municipality ? `Municipality: ${municipality}` : null,
      `Data source: ${dataSource}`,
    ]
      .filter(Boolean)
      .join("\n");

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Zoning data for an architectural site analysis tool:\n${context}\n\nReturn ONLY raw JSON with no markdown:\n{"aiSummary":"2-sentence plain English summary of permitted uses and key land use context","aiDesignNote":"1-2 sentence design implication for architects"}`,
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
    if (primary) {
      aiSummary = `${zoneCode} — ${zoneName}.`;
    } else if (osm) {
      aiSummary = `Land use data from OpenStreetMap indicates this area is classified as ${osm.landuse}.`;
    } else {
      aiSummary = "Zoning information is not available for this location from free sources.";
    }
  }

  return NextResponse.json({
    zoneCode,
    zoneName,
    zoneType,
    permittedUses: [],
    developmentStandards: {
      maxHeightFt: null,
      maxHeightStories: null,
      minLotSqFt: null,
      maxFAR: null,
      minSetbackFrontFt: null,
      minSetbackSideFt: null,
      minSetbackRearFt: null,
      minParkingSpaces: null,
      maxLotCoverage: null,
    },
    municipality,
    aiSummary,
    aiDesignNote,
    sourceUrl: googleSearchUrl,
    dataSource,
  });
}
