import type { Explanation } from "./probe";

// Claude's explanation per sample, stored so visitors see it without waiting
// on a live call (and without an error first if that call fails). Empty until
// filled from a real response. To fill one, run `npm run dev` with
// ANTHROPIC_API_KEY set, then:
//
//   curl -s -X POST localhost:3000/api/demos/thinking-machines/explain \
//     -H 'content-type: application/json' -d '{"sample":"tie"}'
//
// and paste the returned `explanation` object under its sample id. Never write
// one by hand: the page labels these as Claude's output.
export const CACHED_EXPLANATIONS: Partial<Record<string, Explanation>> = {};
