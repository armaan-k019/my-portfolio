// The `after` seam.
//
// Next's `after()` is the platform guarantee that a callback runs once the
// response has been sent: on a serverless instance the execution context can be
// frozen the moment the response goes out, so a floating promise is not a
// guarantee at all, and awaiting the write puts a round trip in front of every
// response.
//
// The seam lives here rather than in the route file because a route module may
// only export route fields: exporting a helper from a route passes the default
// build and fails `next build --webpack` (see docs/datum/PROGRESS.md, Phase 0
// addendum). Unit tests call the route function directly, outside a Next
// request context, where the real `after()` throws, so they inject a scheduler.

import { after } from "next/server";

export type AfterCallback = () => void | Promise<void>;
export type AfterScheduler = (callback: AfterCallback) => void;

const nextAfter: AfterScheduler = (callback) => {
  after(callback);
};

let scheduler: AfterScheduler = nextAfter;

/** Schedule work for after the response is sent. */
export function scheduleAfter(callback: AfterCallback): void {
  scheduler(callback);
}

/**
 * Test seam: pass null to restore Next's own `after`. Inert in production, so
 * nothing that reaches a deployed build can take the scheduler away from Next.
 */
export function setAfterForTests(fn: AfterScheduler | null): void {
  if (process.env.NODE_ENV === "production") return;
  scheduler = fn ?? nextAfter;
}
