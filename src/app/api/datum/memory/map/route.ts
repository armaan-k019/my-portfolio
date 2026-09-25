// GET /api/datum/memory/map. SPEC.md sections 7 and 13.
//
// The analyzed sites as public points. Only the 2 dp snapped point leaves the
// server: never the confirmed point, never the site key, never the row id, and
// never anything that could be walked back to an address.

import { NextResponse } from "next/server";
import { memoryStatus, publicSites, type PublicSite } from "@/lib/datum/memory";

export const maxDuration = 15;

/** Five minutes, per instance. The map changes only when a site is analyzed. */
const CACHE_MS = 5 * 60 * 1000;

let cached: { sites: PublicSite[]; until: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cached && cached.until > now) {
    // The points are the cached ones; the status is the live one. Serving
    // "online" beside them would report a database that may have gone away
    // since the read, which is a claim nothing checked.
    return NextResponse.json({ sites: cached.sites, memoryStatus: memoryStatus() });
  }

  const sites = await publicSites();
  // An empty answer is not cached: Site Memory being offline for one request
  // must not blank the map for the next five minutes.
  if (sites.length > 0) cached = { sites, until: now + CACHE_MS };

  // The status travels with the points so the map can tell "nobody has been
  // analyzed" from "the database could not be asked". An empty list from an
  // offline read is not a count of zero.
  return NextResponse.json({ sites, memoryStatus: memoryStatus() });
}
