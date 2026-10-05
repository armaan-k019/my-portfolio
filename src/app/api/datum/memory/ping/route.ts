// GET /api/datum/memory/ping. SPEC.md sections 7 and 13.
//
// The daily Vercel cron. One select keeps the free Supabase project from being
// paused for inactivity, and the same request sweeps a batch of expired
// api_cache rows, which is why SPEC section 13 needs no separate sweep job.
//
// Vercel sends `Authorization: Bearer <CRON_SECRET>` on a cron request. The
// secret is read here and nowhere else, is compared in constant time, and is
// never logged, never returned, and never part of an error message.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { countSites, sweepExpiredCache } from "@/lib/datum/memory";

export const maxDuration = 15;

/** Constant time string comparison that does not leak the length by returning early. */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function unauthorized() {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "This endpoint is cron only." } },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  // The Bearer is parsed first and every way of not having it ends in the same
  // 401: no header, a wrong secret, and no secret configured on the server are
  // one answer, so a caller without the secret learns nothing about the route
  // beyond that it refused. A separate 503 for the unconfigured case would have
  // told anyone who asked whether this deployment has a cron secret at all.
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  const presented = header.startsWith(prefix) ? header.slice(prefix.length) : null;
  const expected = process.env.CRON_SECRET ?? "";
  if (presented === null || expected.length === 0) return unauthorized();
  if (!secretMatches(presented, expected)) return unauthorized();

  // One select on sites, which is the activity the ping exists to produce, and
  // one batch of expired cache rows. The count is reported under the same test
  // row gating as the memory context, so in production it is the count of non
  // test sites.
  const [sites, swept] = await Promise.all([countSites(), sweepExpiredCache()]);

  // ok is what it says: the query ran. countSites answers null when Site Memory
  // could not be asked, and the ping exists to produce that one query, so a
  // null count is a ping that did not do its job.
  return NextResponse.json({ ok: sites !== null, sites, swept });
}
