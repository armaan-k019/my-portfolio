// Trains the Goodfire demo's sample autoencoder (the page's default seed),
// asks Claude for labels with the same prompt the route uses, and saves the
// reply to src/app/api/demos/goodfire/label/cache.json. With a saved reply the
// sample page loads labels without a live call.
//
// Usage: ANTHROPIC_API_KEY=... node --experimental-strip-types scripts/goodfire-cache.mjs
// (Node 22.6 or later. The flag is the default from Node 23.6.)

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CONFIG, SaeTrainer, decodeVectors, encode } from "../src/app/demos/goodfire/sae.ts";
import { MODEL, SYSTEM_PROMPT, buildPrompt, parseLabels, pickFeatures } from "../src/app/demos/goodfire/labels.ts";

const root = new URL("..", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const corpus = read("src/app/demos/goodfire/corpus.json").sentences;
const vec = read("public/demos/goodfire/vectors.json");
const cachePath = new URL("src/app/api/demos/goodfire/label/cache.json", root);

const all = decodeVectors(vec.int8, vec.scale, (s) => new Uint8Array(Buffer.from(s, "base64")));
const d = vec.dims;
const train = corpus.map((s, i) => [s, i]).filter(([s]) => s.split === "train");
const X = new Float64Array(train.length * d);
train.forEach(([, i], r) => X.set(all.subarray(i * d, i * d + d), r * d));

const trainer = new SaeTrainer(X, train.length, d, DEFAULT_CONFIG);
while (!trainer.done) trainer.run(50);
const acts = train.map(([, i]) => encode(trainer.sae, all, i * d));
const cards = pickFeatures(train.map(([s]) => s.text), acts, DEFAULT_CONFIG.features);
const prompt = buildPrompt(cards);
const key = createHash("sha256").update(prompt).digest("hex");
console.log(`sample run: ${cards.length} features, prompt ${key.slice(0, 12)}`);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first.");
  process.exit(1);
}
const client = new Anthropic();
const message = await client.messages.create({
  model: MODEL,
  max_tokens: 1200,
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: prompt }],
});
const text = message.content.find((b) => b.type === "text");
const labels = text ? parseLabels(text.text, cards.map((c) => c.id)) : null;
if (!labels) {
  console.error("Claude returned nothing usable:", text?.text);
  process.exit(1);
}
writeFileSync(cachePath, JSON.stringify({ [key]: labels }, null, 1) + "\n");
console.log(`saved ${labels.length} labels for prompt ${key.slice(0, 12)}`);
for (const l of labels) console.log(`  F${l.id}: ${l.label} [${l.cues.join(", ")}]`);
