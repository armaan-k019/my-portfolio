#!/usr/bin/env node
/*
  Generate the preloaded Marble worlds for the World Labs demo (Ekphrasis).

  WHAT IT DOES
    For every text in src/app/demos/world-labs/preloaded-texts.ts:
      1. asks Claude (claude-sonnet-4-6) for the spatial reading, using the
         exact system prompt the runtime route uses (read from reader.ts), so
         the cached reading matches what a live call would produce
      2. sends reading.marble_prompt to the World Labs Marble API
      3. polls the operation until the world is done (5 to 10 minutes each,
         all texts run in parallel)
      4. writes the world id, viewer url, thumbnail, and the reading into
         src/app/demos/world-labs/preloaded-worlds.ts, replacing placeholders

  ENV VARS (read from .env.local in the repo root, or the environment)
    WORLDLABS_API_KEY   platform.worldlabs.ai/api-keys, needs API credits
    ANTHROPIC_API_KEY   console.anthropic.com

  RUN
    node scripts/generate-preloaded-worlds.mjs
    node scripts/generate-preloaded-worlds.mjs --model marble-1.1   (full quality, 1500 credits each)
    node scripts/generate-preloaded-worlds.mjs --only babel,diomira
    node scripts/generate-preloaded-worlds.mjs --force               (regenerate even if cached)

  TIME AND COST
    Roughly 5 to 10 minutes total because texts run in parallel (a serial run
    would be 5 to 10 minutes times the number of texts). Draft model is 150
    credits per world, about 0.12 USD; six texts is 900 credits.

  IF IT FAILS PARTWAY
    The script is idempotent. Texts that already have a real world_id in
    preloaded-worlds.ts are skipped on the next run, so just run it again and
    only the failed texts are regenerated. A single failed text is logged and
    the rest continue. If Marble returns a response shape the script does not
    recognise it prints the raw body and exits without writing anything.
*/

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_DIR = join(ROOT, "src/app/demos/world-labs");
const TEXTS_PATH = join(DEMO_DIR, "preloaded-texts.ts");
const WORLDS_PATH = join(DEMO_DIR, "preloaded-worlds.ts");
const READER_PATH = join(ROOT, "src/app/api/demos/world-labs/extract-dna/reader.ts");

const MARBLE_BASE = "https://api.worldlabs.ai/marble/v1";
const CLAUDE_MODEL = "claude-sonnet-4-6";
const POLL_MS = 10000;
const POLL_LIMIT = 120; // 20 minutes
const PENDING = "pending-generation";

// ---- env ------------------------------------------------------------------
const envFile = join(ROOT, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const WL = process.env.WORLDLABS_API_KEY;
const AN = process.env.ANTHROPIC_API_KEY;
if (!AN) fail("ANTHROPIC_API_KEY is not set (checked .env.local and the environment).");
if (!WL) fail("WORLDLABS_API_KEY is not set (checked .env.local and the environment).");

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const model = flag("--model") ?? "marble-1.0-draft";
const only = flag("--only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const force = args.includes("--force");

// ---- inputs ---------------------------------------------------------------
const textsSrc = readFileSync(TEXTS_PATH, "utf8");
const texts = [...textsSrc.matchAll(/id: ("[^"]+"),\s*title: ("(?:[^"\\]|\\.)*"),[\s\S]*?excerpt: ("(?:[^"\\]|\\.)*"),/g)].map((m) => ({
  id: JSON.parse(m[1]),
  title: JSON.parse(m[2]),
  excerpt: JSON.parse(m[3]),
}));
if (texts.length === 0) fail(`No texts parsed from ${TEXTS_PATH}`);

const readerSrc = readFileSync(READER_PATH, "utf8");
const promptMatch = readerSrc.match(/SYSTEM_PROMPT = `([\s\S]*?)`;/);
if (!promptMatch) fail(`Could not find SYSTEM_PROMPT in ${READER_PATH}`);
const SYSTEM_PROMPT = promptMatch[1];

const existing = readExistingWorlds();

// ---- helpers --------------------------------------------------------------
function fail(msg, code = 1) {
  console.error(`\nERROR: ${msg}`);
  process.exit(code);
}
function log(id, msg) {
  console.log(`[${id}] ${msg}`);
}

function readExistingWorlds() {
  if (!existsSync(WORLDS_PATH)) return {};
  const src = readFileSync(WORLDS_PATH, "utf8");
  const m = src.match(/PRELOADED_WORLDS: Record<string, PreloadedWorld> = (\{[\s\S]*?\n\});/);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {}; // placeholder file uses the PENDING constant, not JSON
  }
}

async function readWithClaude(text) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AN, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1800,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `TEXT:\n\n${text}` }],
    }),
  });
  if (!r.ok) throw new Error(`Claude returned ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const raw = (j.content.find((c) => c.type === "text")?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const reading = JSON.parse(raw);
  if (!reading?.dna || !Array.isArray(reading.annotations) || typeof reading.marble_prompt !== "string") {
    throw new Error(`Claude returned an incomplete reading: ${raw.slice(0, 300)}`);
  }
  return reading;
}

async function startWorld(displayName, prompt) {
  const r = await fetch(`${MARBLE_BASE}/worlds:generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "WLT-Api-Key": WL },
    body: JSON.stringify({ display_name: displayName, model, world_prompt: { type: "text", text_prompt: prompt } }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Marble worlds:generate returned ${r.status}: ${body.slice(0, 400)}`);
  let j;
  try { j = JSON.parse(body); } catch { unexpected("worlds:generate", body); }
  if (!j.operation_id) unexpected("worlds:generate", body);
  return j.operation_id;
}

async function pollWorld(opId, id) {
  for (let i = 0; i < POLL_LIMIT; i++) {
    const r = await fetch(`${MARBLE_BASE}/operations/${opId}`, { headers: { "WLT-Api-Key": WL } });
    const body = await r.text();
    if (!r.ok) throw new Error(`Marble operations/${opId} returned ${r.status}: ${body.slice(0, 400)}`);
    let o;
    try { o = JSON.parse(body); } catch { unexpected("operations/{id}", body); }
    if (o.done) {
      if (o.error) throw new Error(`Marble generation failed: ${JSON.stringify(o.error)}`);
      const w = o.response;
      if (!w?.id || !w?.world_marble_url) unexpected("operations/{id} (done)", body);
      return w;
    }
    if (i % 6 === 0 && i > 0) log(id, `still generating (${Math.round((i * POLL_MS) / 60000)} min)`);
    await new Promise((res) => setTimeout(res, POLL_MS));
  }
  throw new Error("Timed out after 20 minutes of polling");
}

function unexpected(endpoint, body) {
  console.error(`\nMarble API returned an unexpected response shape from ${endpoint}. Raw body:\n${body.slice(0, 2000)}\n`);
  console.error("Aborting without writing preloaded-worlds.ts. Check the current World Labs API docs and update this script.");
  process.exit(2);
}

function writeWorldsFile(worlds) {
  const ordered = {};
  for (const t of texts) {
    ordered[t.id] = worlds[t.id] ?? {
      text_id: t.id, world_id: PENDING, marble_url: "", thumbnail_url: null, created_at: "", reading: null,
    };
  }
  const out = `// Cached Marble worlds for the preloaded texts. GENERATED FILE.
//
// Regenerate with:  node scripts/generate-preloaded-worlds.mjs
// (see the header of that script for env vars, options, and cost).
//
// Every preloaded text has a world generated once and stored here, along with
// the Claude reading that produced its Marble prompt, so picking a preloaded
// text makes no API calls. A world_id of "${PENDING}" means that text
// has not been generated yet; the page falls back to a live reading and shows
// a placeholder for the world.

import type { Reading, WorldRecord } from "./types";

export const PENDING = "${PENDING}";

export interface PreloadedWorld extends WorldRecord {
  text_id: string;
  reading: Reading | null;
}

export const PRELOADED_WORLDS: Record<string, PreloadedWorld> = ${JSON.stringify(ordered, null, 2)};

export function getPreloadedWorld(textId: string): PreloadedWorld | null {
  const w = PRELOADED_WORLDS[textId];
  if (!w || w.world_id === PENDING) return null;
  return w;
}
`;
  writeFileSync(WORLDS_PATH, out);
}

// ---- main -----------------------------------------------------------------
const targets = texts.filter((t) => !only || only.includes(t.id));
const results = { ...existing };
let generated = 0, skipped = 0, failed = 0;
const started = Date.now();
console.log(`Model ${model}. ${targets.length} text(s). Output: ${WORLDS_PATH}\n`);

await Promise.all(
  targets.map(async (t) => {
    if (!force && existing[t.id] && existing[t.id].world_id && existing[t.id].world_id !== PENDING) {
      log(t.id, `already cached (${existing[t.id].world_id}), skipping. Use --force to regenerate.`);
      skipped++;
      return;
    }
    try {
      log(t.id, `Extracting DNA for "${t.title}"...`);
      const reading = await readWithClaude(t.excerpt);
      log(t.id, `Extracting DNA for "${t.title}"... done`);
      log(t.id, `Generating world for "${t.title}"... (5 to 10 min)`);
      const opId = await startWorld(`Ekphrasis: ${t.title}`, reading.marble_prompt);
      log(t.id, `operation ${opId}`);
      const world = await pollWorld(opId, t.id);
      results[t.id] = {
        text_id: t.id,
        world_id: world.id,
        marble_url: world.world_marble_url,
        thumbnail_url: world.assets?.thumbnail_url ?? null,
        created_at: new Date().toISOString(),
        reading,
      };
      generated++;
      log(t.id, `World ready: ${world.id}`);
      writeWorldsFile(results); // save progress after each success
    } catch (e) {
      failed++;
      log(t.id, `FAILED: ${e.message}`);
    }
  })
);

writeWorldsFile(results);
const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\nDone in ${mins} min. generated=${generated} skipped=${skipped} failed=${failed}. Wrote ${WORLDS_PATH}`);
if (failed > 0) process.exit(1);
