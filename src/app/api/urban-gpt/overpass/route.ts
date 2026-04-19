import { NextRequest, NextResponse } from "next/server";
import type { OverpassPoint } from "../route";

export const maxDuration = 30;

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const OVERPASS_CAP = 50;
const OVERPASS_MAX_RADIUS = 8045;
const OVERPASS_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function makeQuery(body: string): string {
  return `[out:json][timeout:13];\n(\n${body}\n);\nout center;`;
}

function buildQuery(category: string, lat: number, lng: number, R: number): string | null {
  switch (category) {
    case "transit":
      return makeQuery(`
  node["highway"="bus_stop"](around:${R},${lat},${lng});
  node["railway"="station"](around:${R},${lat},${lng});
  node["amenity"="subway_entrance"](around:${R},${lat},${lng});`);
    case "parks":
      return makeQuery(`
  node["leisure"="park"](around:${R},${lat},${lng});
  way["leisure"="park"](around:${R},${lat},${lng});
  node["leisure"="playground"](around:${R},${lat},${lng});`);
    case "dining":
      return makeQuery(`
  node["amenity"="restaurant"](around:${R},${lat},${lng});
  node["amenity"="cafe"](around:${R},${lat},${lng});
  node["amenity"="fast_food"](around:${R},${lat},${lng});
  node["amenity"="bar"](around:${R},${lat},${lng});`);
    case "schools":
      return makeQuery(`
  node["amenity"="school"](around:${R},${lat},${lng});
  node["amenity"="university"](around:${R},${lat},${lng});
  node["amenity"="college"](around:${R},${lat},${lng});`);
    case "health":
      return makeQuery(`
  node["amenity"="hospital"](around:${R},${lat},${lng});
  node["amenity"="pharmacy"](around:${R},${lat},${lng});
  node["amenity"="clinic"](around:${R},${lat},${lng});
  node["amenity"="doctors"](around:${R},${lat},${lng});`);
    default:
      return null;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const radius = parseFloat(searchParams.get("radius") ?? "");
  const category = searchParams.get("category") ?? "";

  if (isNaN(lat) || isNaN(lng) || isNaN(radius) || !category) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const R = Math.min(Math.round(radius), OVERPASS_MAX_RADIUS);
  const query = buildQuery(category, lat, lng, R);
  if (!query) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  };

  let sawRateLimit = false;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(endpoint, fetchOptions, OVERPASS_TIMEOUT_MS);
      if (res.status === 429) {
        sawRateLimit = true;
        continue;
      }
      if (!res.ok) continue;

      const json = await res.json() as {
        elements?: Array<{
          id: number; lat?: number; lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }>;
      };

      const points: OverpassPoint[] = [];
      const seen = new Set<number>();
      for (const el of json.elements ?? []) {
        if (seen.has(el.id)) continue;
        seen.add(el.id);
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        if (elLat === undefined || elLon === undefined) continue;
        points.push({ id: el.id, lat: elLat, lon: elLon, name: el.tags?.name ?? "" });
        if (points.length >= OVERPASS_CAP) break;
      }

      return NextResponse.json({ points, rateLimited: false, timeout: false });
    } catch {
      // next endpoint
    }
  }

  if (sawRateLimit) {
    return NextResponse.json({ points: [], rateLimited: true, timeout: false });
  }
  return NextResponse.json({ points: [], rateLimited: false, timeout: true });
}
