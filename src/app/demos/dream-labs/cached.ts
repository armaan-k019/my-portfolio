import type { Advice } from "./advice";

// Claude's advice per path and object width, keyed by adviceKey() in
// advice.ts, stored so visitors see it without waiting on a live call. Empty
// until filled from a real response. To fill the default path at 40 mm, run
// `npm run dev` with ANTHROPIC_API_KEY set, press "Ask Claude" on
// /demos/dream-labs, and copy the `key` and `advice` from the network
// response of /api/demos/dream-labs/advise. Never write one by hand: the page
// labels these as Claude's output.
export const CACHED_ADVICE: Partial<Record<string, Advice>> = {};
