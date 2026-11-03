// Shared by the page, the label route, and scripts/goodfire-cache.mjs: which
// features get labeled, the prompt Claude sees, how its reply is parsed, and
// the plain-code score for each label on held-out sentences. Type-only
// imports, so Node can load this file with type stripping.

export const MODEL = "claude-sonnet-4-6";
export const MAX_FEATURES = 12;
export const TOP_EXAMPLES = 6;
export const QUIET_EXAMPLES = 3;
const MIN_FIRES = 3;

export interface FeatureCard {
  id: number;
  top: string[]; // training sentences with the highest activation, best first
  quiet: string[]; // training sentences where the feature is zero
}

export interface FeatureLabel {
  id: number;
  label: string;
  cues: string[];
}

export interface Score {
  hits: number;
  misses: number;
  falseAlarms: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export const SYSTEM_PROMPT = `You label features of a sparse autoencoder trained on sentence embeddings. For each feature you get the training sentences where it fires hardest and a few where it does not fire.

Return JSON only, no markdown fences:
{"labels": [{"id": number, "label": string, "cues": [string]}]}

- One entry per feature, in the order given.
- label: what the top sentences share and the quiet ones lack. At most 4 words, lowercase.
- cues: 3 to 8 single lowercase words. A sentence that contains any cue should be one this feature fires on. Plain code will test the cues on sentences you have not seen, so prefer words that generalize over words copied from one example.

Use only the sentences given. If a feature has no clear pattern, say so in the label ("no clear pattern") and still give your best cues. Do not use em dashes.`;

// Features worth labeling: those that fire on at least MIN_FIRES training
// sentences, most frequent first. activations[i][j] is feature j on sentence i.
export function pickFeatures(trainTexts: string[], activations: Float64Array[], k: number): FeatureCard[] {
  const cards: (FeatureCard & { fires: number })[] = [];
  for (let j = 0; j < k; j++) {
    const order = trainTexts.map((_, i) => i).sort((a, b) => activations[b][j] - activations[a][j] || a - b);
    const fires = order.filter((i) => activations[i][j] > 0).length;
    if (fires < MIN_FIRES) continue;
    const zero = order.filter((i) => activations[i][j] === 0);
    const step = Math.max(1, Math.floor(zero.length / QUIET_EXAMPLES));
    const quiet = zero.filter((_, n) => (n + j) % step === 0).slice(0, QUIET_EXAMPLES);
    cards.push({
      id: j,
      fires,
      top: order.slice(0, Math.min(TOP_EXAMPLES, fires)).map((i) => trainTexts[i]),
      quiet: quiet.map((i) => trainTexts[i]),
    });
  }
  cards.sort((a, b) => b.fires - a.fires || a.id - b.id);
  return cards.slice(0, MAX_FEATURES).map(({ id, top, quiet }) => ({ id, top, quiet }));
}

export function buildPrompt(cards: FeatureCard[]): string {
  return cards
    .map(
      (c) =>
        `FEATURE ${c.id}\nfires on:\n${c.top.map((t) => `- ${t}`).join("\n")}\ndoes not fire on:\n${c.quiet.map((t) => `- ${t}`).join("\n")}`,
    )
    .join("\n\n");
}

const CUE = /^[a-z']{2,20}$/;

export function parseLabels(text: string, ids: number[]): FeatureLabel[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { labels?: unknown };
    if (!Array.isArray(raw.labels)) return null;
    const out: FeatureLabel[] = [];
    for (const item of raw.labels) {
      const x = item as Record<string, unknown>;
      if (!x || typeof x.id !== "number" || !ids.includes(x.id) || typeof x.label !== "string" || !Array.isArray(x.cues)) continue;
      if (out.some((o) => o.id === x.id)) continue;
      const cues = x.cues
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.trim().toLowerCase())
        .filter((c) => CUE.test(c))
        .slice(0, 8);
      out.push({ id: x.id, label: x.label.trim().toLowerCase().slice(0, 40), cues });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

// A cue matches a word exactly, or as a prefix when it is 4 letters or more
// ("rain" matches "raining", "he" does not match "help").
export function matchedCue(text: string, cues: string[]): string | null {
  const ws = words(text);
  for (const c of cues) if (ws.some((w) => w === c || (c.length >= 4 && w.startsWith(c)))) return c;
  return null;
}

// A held-out sentence counts as active when the feature is above a quarter
// of its highest training activation.
export function activeThreshold(trainMax: number): number {
  return trainMax * 0.25;
}

export function scoreLabel(cues: string[], texts: string[], acts: number[], threshold: number): Score {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  texts.forEach((t, i) => {
    const active = acts[i] > threshold;
    const predicted = matchedCue(t, cues) !== null;
    if (active && predicted) hits++;
    else if (active) misses++;
    else if (predicted) falseAlarms++;
  });
  const precision = hits + falseAlarms ? hits / (hits + falseAlarms) : null;
  const recall = hits + misses ? hits / (hits + misses) : null;
  const f1 = recall === null ? null : (2 * hits) / (2 * hits + misses + falseAlarms);
  return { hits, misses, falseAlarms, precision, recall, f1 };
}
