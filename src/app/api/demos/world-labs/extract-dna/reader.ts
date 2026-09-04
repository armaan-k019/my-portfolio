import type { Reading, SpatialDNA, Annotation } from "@/app/demos/world-labs/types";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

export const SYSTEM_PROMPT = `You are extracting the spatial DNA of a literary passage. Given a text, identify the sensory and spatial qualities that would be needed to construct a walkable 3D environment matching its atmosphere. Focus on what is implied, not just what is stated explicitly.

You read the way an architect reads a brief: for materiality, scale, light, mood, composition, temperature, and sound. Most texts do not say "lit by warm afternoon light through leaded windows"; you infer it from the surrounding language and you say that you inferred it.

Rules:
- Do not use em dashes anywhere in your output. Use commas, periods, or colons.
- Base every field on evidence in the text, or explicitly flag it as an inference. Cite specific words or phrases from the text that support your choice for at least three fields, by quoting them inside the relevant notes field.
- The key_interpretive_choice field is where you flag one place where you filled in what the text did not say. This is the interpretive move that makes Ekphrasis interesting. Be specific about what the text left open and what you decided.
- Each annotation must cite an exact phrase or word from the source text in text_evidence. If you cannot cite specific text evidence for a choice, do not include that annotation. Produce between three and five annotations.
- The marble_prompt is one paragraph of 60 to 120 words describing a single explorable scene for a text to 3D world model. Write it as concrete physical description in the present tense: what is here, what it is made of, how it is lit, how big it is, where the viewer stands. No character names, no narrative, no abstractions, no quotation marks. It must follow from the DNA you extracted, not from the raw text.
- Return valid JSON only, matching the schema exactly. No markdown fences, no commentary before or after.

Schema:
{
  "dna": {
    "materiality": { "primary_materials": string[], "surface_qualities": string },
    "scale": { "dominant_scale": "intimate" | "domestic" | "monumental" | "vast" | "cosmic", "ceiling_or_sky": string, "notes": string },
    "light": { "source": string, "intensity": "dim" | "muted" | "even" | "bright" | "harsh", "color_temperature": "warm" | "neutral" | "cool" | "shifting", "notes": string },
    "mood": { "primary_emotion": string, "atmosphere": string },
    "composition": { "orientation": string, "density": "sparse" | "moderate" | "dense" | "overwhelming", "notes": string },
    "temperature": { "thermal": "cold" | "cool" | "temperate" | "warm" | "hot", "humidity_impression": string },
    "sound_implied": string,
    "key_interpretive_choice": string
  },
  "annotations": [ { "choice": string, "reasoning": string, "text_evidence": string } ],
  "marble_prompt": string
}`;

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function isReading(x: unknown): x is Reading {
  if (!x || typeof x !== "object") return false;
  const r = x as Partial<Reading>;
  const d = r.dna as Partial<SpatialDNA> | undefined;
  return !!(
    d &&
    d.materiality &&
    d.scale &&
    d.light &&
    d.mood &&
    d.composition &&
    d.temperature &&
    Array.isArray(r.annotations) &&
    typeof r.marble_prompt === "string"
  );
}

export async function readText(text: string): Promise<{ reading?: Reading; error?: string; status: number }> {
  if (!API_KEY) {
    return { error: "Claude is not configured on this deployment, so the passage cannot be read yet.", status: 502 };
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1800,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `TEXT:\n\n${text}` }],
    }),
  });

  if (res.status === 401) {
    return { error: "Claude rejected the API key. The reading is unavailable until the key is rotated.", status: 502 };
  }
  if (!res.ok) {
    return { error: `Claude returned ${res.status}. Try again in a moment.`, status: 502 };
  }

  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const raw = data.content.find((c) => c.type === "text")?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    console.error("extract-dna: unparseable JSON", raw.slice(0, 400));
    return { error: "Claude returned something that was not a reading. Try again.", status: 502 };
  }
  if (!isReading(parsed)) {
    console.error("extract-dna: schema mismatch", JSON.stringify(parsed).slice(0, 400));
    return { error: "Claude returned an incomplete reading. Try again.", status: 502 };
  }
  // Drop annotations that failed to cite evidence; the prompt forbids them but be safe.
  const annotations = (parsed.annotations as Annotation[]).filter(
    (a) => a && typeof a.text_evidence === "string" && a.text_evidence.trim().length > 0
  );
  return { reading: { ...parsed, annotations }, status: 200 };
}

