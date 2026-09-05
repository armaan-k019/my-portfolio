// Cached Marble worlds for the preloaded texts.
//
// Every preloaded text has a world generated ONCE and stored here, so picking a
// preloaded text shows its world instantly. Live generation only happens for
// text the user pastes.
//
// HOW TO POPULATE THIS FILE (one time, after WORLDLABS_API_KEY exists):
//
//   1. Get an API key at https://platform.worldlabs.ai/api-keys and buy API
//      credits at https://platform.worldlabs.ai/billing. API credits are
//      separate from Marble app credits. The draft model costs 150 credits per
//      world (about $0.12); six worlds is under a dollar.
//   2. Make sure ANTHROPIC_API_KEY is also set, because the script first asks
//      Claude for each text's reading so the Marble prompt is the interpreted
//      one, not the raw excerpt.
//   3. From the repo root run:
//        node scripts/generate-preloaded-worlds.mjs
//      It reads both keys from .env.local, submits one generation per text,
//      polls until each is done (5 to 10 minutes, run in parallel), and
//      rewrites this file with the results. Add --model marble-1.1 for full
//      quality instead of draft.
//   4. Commit this file, deploy.
//   5. Smoke test: each preloaded text should show its world with no spinner.
//
// A value of "pending-generation" for world_id means the world has not been
// generated yet; the page shows Claude's reading and a placeholder for the
// world in that case.

import type { Reading, WorldRecord } from "./types";

export const PENDING = "pending-generation";

export interface PreloadedWorld extends WorldRecord {
  text_id: string;
  // The reading is cached too so preloaded texts do not need a Claude call.
  // Null until populated; the page falls back to a live call.
  reading: Reading | null;
}

export const PRELOADED_WORLDS: Record<string, PreloadedWorld> = {
  babel: { text_id: "babel", world_id: PENDING, marble_url: "", thumbnail_url: null, created_at: "", reading: null },
  diomira: { text_id: "diomira", world_id: PENDING, marble_url: "", thumbnail_url: null, created_at: "", reading: null },
  masque: { text_id: "masque", world_id: PENDING, marble_url: "", thumbnail_url: null, created_at: "", reading: null },
  wallpaper: { text_id: "wallpaper", world_id: PENDING, marble_url: "", thumbnail_url: null, created_at: "", reading: null },
  listing: { text_id: "listing", world_id: PENDING, marble_url: "", thumbnail_url: null, created_at: "", reading: null },
  attic: { text_id: "attic", world_id: PENDING, marble_url: "", thumbnail_url: null, created_at: "", reading: null },
};

export function getPreloadedWorld(textId: string): PreloadedWorld | null {
  const w = PRELOADED_WORLDS[textId];
  if (!w || w.world_id === PENDING) return null;
  return w;
}
