// GET /api/datum/memory/map. SPEC.md sections 7 and 13.
//
// The analyzed sites as public points. Only the 2 dp snapped point leaves the
// server: never the confirmed point, never the site key, never the row id, and
// never anything that could be walked back to an address.

import { NextResponse } from "next/server";
import { publicSites, type PublicSite } from "@/lib/datum/memory";

export const maxDuration = 15;

/** Five minutes, per instance. The map changes only when a site is analyzed. */
const CACHE_MS = 5 * 60 * 1000;

let cached: { sites: PublicSite[]; until: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cached && cached.until > now) {
    return NextResponse.json({ sites: cached.sites });
  }

  const sites = await publicSites();
  // An empty answer is not cached: Site Memory being offline for one request
  // must not blank the map for the next five minutes.
  if (sites.length > 0) cached = { sites, until: now + CACHE_MS };

  return NextResponse.json({ sites });
}
