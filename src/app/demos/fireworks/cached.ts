import type { ClaudePick } from "./spec";

// Claude's pick per workload and temperature, keyed "domain@temperature"
// (for example "json@0.7"), stored so visitors see it without waiting on a
// live call. Empty until filled from a real response. To fill one, run
// `npm run dev` with ANTHROPIC_API_KEY set, then:
//
//   curl -s -X POST localhost:3000/api/demos/fireworks/pick \
//     -H 'content-type: application/json' -d '{"domain":"json","temperature":0.7}'
//
// and paste the returned `pick` object under its key. Never write one by
// hand: the page labels these as Claude's output.
export const CACHED_PICKS: Partial<Record<string, ClaudePick>> = {};
