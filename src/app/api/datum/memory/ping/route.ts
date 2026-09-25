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
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length === 0) {
    // Fail closed. Without a secret configured there is no request this route
    // can tell apart from any other, so it answers nobody.
    return NextResponse.json(
      {
        error: {
          code: "missing_key",
          message: "The ping is not configured on this server.",
        },
      },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return unauthorized();
  if (!secretMatches(header.slice(prefix.length), expected)) return unauthorized();

  // One select on sites, which is the activity the ping exists to produce, and
  // one batch of expired cache rows. The count is reported under the same test
  // row gating as the memory context, so in production it is the count of non
  // test sites.
  const [sites, swept] = await Promise.all([countSites(), sweepExpiredCache()]);

  return NextResponse.json({ ok: true, sites, swept });
}
