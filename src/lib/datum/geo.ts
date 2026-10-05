// Local tangent plane projection and small geodesy helpers.
// PHASE-1-data.md step 1.2, SPEC.md section 10 (projection).

import type { LatLng, LocalPoint } from "./types";

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG_EQUATOR = 111320;
const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Metres east and north of the origin. SPEC section 10:
 * x = (lng - lng0) * cos(lat0) * 111320, y = (lat - lat0) * 110574.
 */
export function toLocal(lat: number, lng: number, origin: LatLng): LocalPoint {
  const x = (lng - origin.lng) * Math.cos(toRad(origin.lat)) * M_PER_DEG_LNG_EQUATOR;
  const y = (lat - origin.lat) * M_PER_DEG_LAT;
  return [x, y];
}

/** Exact inverse of toLocal for the same origin. */
export function fromLocal(x: number, y: number, origin: LatLng): LatLng {
  const lat = origin.lat + y / M_PER_DEG_LAT;
  const lng =
    origin.lng + x / (Math.cos(toRad(origin.lat)) * M_PER_DEG_LNG_EQUATOR);
  return { lat, lng };
}

/** Great circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** Axis aligned bounding box of the square of half width radiusM about origin. */
export function bboxAround(origin: LatLng, radiusM: number): BBox {
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLng =
    radiusM / (Math.cos(toRad(origin.lat)) * M_PER_DEG_LNG_EQUATOR);
  return {
    minLat: origin.lat - dLat,
    minLng: origin.lng - dLng,
    maxLat: origin.lat + dLat,
    maxLng: origin.lng + dLng,
  };
}

/** Shoelace area in square metres of a ring of local points. Always positive. */
export function ringAreaM2(ring: LocalPoint[]): number {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** "<lat>,<lng>" rounded to dp decimal places, for cache keys. */
export function roundKey(lat: number, lng: number, dp: number): string {
  return `${lat.toFixed(dp)},${lng.toFixed(dp)}`;
}

/** The sites.site_key value: 3 decimal places, about 100 m. */
export function siteKey(lat: number, lng: number): string {
  return roundKey(lat, lng, 3);
}

/** The public, coarsened point stored on the sites row (about 1 km). */
export function publicPoint(lat: number, lng: number): LatLng {
  return {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100,
  };
}
