#!/usr/bin/env node
// One time script: generate a Marble world for every preloaded text and print
// the PRELOADED_WORLDS object to paste into preloaded-worlds.ts.
//
//   WORLDLABS_API_KEY=... ANTHROPIC_API_KEY=... node src/app/demos/world-labs/populate-worlds.mjs [--model marble-1.1] [--only babel,diomira]
//
// Steps per text: ask Claude for the reading (same system prompt the page uses,
// so the cached reading matches live behaviour), send reading.marble_prompt to
// Marble, poll until done, collect world id, viewer url, and thumbnail.
// Polling is free; generation is 150 credits per world on the draft model.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : "marble-1.0-draft";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

const WL = process.env.WORLDLABS_API_KEY;
const AN = process.env.ANTHROPIC_API_KEY;
if (!WL || !AN) {
  console.error("Set WORLDLABS_API_KEY and ANTHROPIC_API_KEY.");
  process.exit(1);
}

// Pull the texts and the system prompt out of the TS sources without a build step.
const textsSrc = readFileSync(join(here, "preloaded-texts.ts"), "utf8");
const texts = [...textsSrc.matchAll(/id: ("[^"]+"),\s*title: ("(?:[^"\\]|\\.)*"),[\s\S]*?excerpt: ("(?:[^"\\]|\\.)*"),/g)].map((m) => ({
  id: JSON.parse(m[1]),
  title: JSON.parse(m[2]),
  excerpt: JSON.parse(m[3]),
}));
const routeSrc = readFileSync(join(here, "../../api/demos/world-labs/extract-dna/reader.ts"), "utf8");
const SYSTEM_PROMPT = routeSrc.match(/SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];

async function read(text) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AN, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1800,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `TEXT:\n\n${text}` }],
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const raw = j.content.find((c) => c.type === "text").text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(raw);
}

async function generate(displayName, prompt) {
  const r = await fetch("https://api.worldlabs.ai/marble/v1/worlds:generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "WLT-Api-Key": WL },
    body: JSON.stringify({ display_name: displayName, model, world_prompt: { type: "text", text_prompt: prompt } }),
  });
  if (!r.ok) throw new Error(`Marble ${r.status}: ${await r.text()}`);
  return (await r.json()).operation_id;
}

async function poll(opId) {
  for (let i = 0; i < 120; i++) {
    const r = await fetch(`https://api.worldlabs.ai/marble/v1/operations/${opId}`, { headers: { "WLT-Api-Key": WL } });
    if (!r.ok) throw new Error(`Marble poll ${r.status}: ${await r.text()}`);
    const o = await r.json();
    if (o.done) {
      if (o.error) throw new Error(`Generation failed: ${JSON.stringify(o.error)}`);
      return o.response;
    }
    await new Promise((res) => setTimeout(res, 10000));
  }
  throw new Error("Timed out after 20 minutes");
}

const out = {};
await Promise.all(
  texts
    .filter((t) => !only || only.includes(t.id))
    .map(async (t) => {
      try {
        console.error(`[${t.id}] reading with Claude`);
        const reading = await read(t.excerpt);
        console.error(`[${t.id}] sending to Marble (${model})`);
        const opId = await generate(`Ekphrasis: ${t.title}`, reading.marble_prompt);
        console.error(`[${t.id}] operation ${opId}, polling`);
        const world = await poll(opId);
        out[t.id] = {
          text_id: t.id,
          world_id: world.id,
          marble_url: world.world_marble_url,
          thumbnail_url: world.assets?.thumbnail_url ?? null,
          created_at: new Date().toISOString(),
          reading,
        };
        console.error(`[${t.id}] done: ${world.world_marble_url}`);
      } catch (e) {
        console.error(`[${t.id}] FAILED: ${e.message}`);
      }
    })
);

console.log("// Paste over PRELOADED_WORLDS in preloaded-worlds.ts");
console.log("export const PRELOADED_WORLDS: Record<string, PreloadedWorld> = " + JSON.stringify(out, null, 2) + ";");
