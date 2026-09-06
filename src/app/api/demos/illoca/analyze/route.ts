export const maxDuration = 30;

import { PRECEDENTS, type PrecedentEntry } from "@/app/demos/illoca/precedents";

interface Precedent {
  id: string;
  name: string;
  architect: string;
  year: number;
  location: string;
  why: string;
  steal: string;
  worksDoesntWork: string;
}

interface BubbleData {
  id: string;
  label: string;
  size: "small" | "medium" | "large";
  x: number;
  y: number;
  precedent_influence: string | null;
}

interface ConnectionData {
  from: string;
  to: string;
  type: "adjacency" | "circulation" | "visual";
}

interface Bubble {
  label: string;
  x: number;
  y: number;
  r: number;
}

interface IllocaResult {
  precedents: Precedent[];
  synthesis: {
    narrative: string;
    bubbles: Bubble[];
    note: string;
  };
  sketch_next: string[];
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

// Claude occasionally wraps JSON in markdown code fences despite instructions.
// Strip a leading ``` or ```json and a trailing ``` before parsing.
function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

async function filterPrecedents(brief: string): Promise<PrecedentEntry[]> {
  if (!API_KEY) {
    return PRECEDENTS.slice(0, 20);
  }

  try {
    const filterPrompt = `You are an architectural precedent curator. Given a project brief, identify the 15-20 most relevant precedents from the provided list.

PROJECT BRIEF:
${brief}

PRECEDENT CORPUS:
${PRECEDENTS.map((p) => `- ${p.building_name} (${p.architect}, ${p.year}): ${p.short_description} [program: ${p.program_type.join(", ")}]`).join("\n")}

Return a JSON array with just the building names of the 15-20 most relevant precedents in order of relevance. Example: ["Salk Institute", "Yokohama International Port Terminal", ...].

Return ONLY the raw JSON array with no markdown code fences, no explanatory text, no leading or trailing content. Your entire response must be valid JSON parseable by JSON.parse().`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: "user", content: filterPrompt }],
      }),
    });

    if (!res.ok) {
      console.error(`Filter call failed with status ${res.status}`);
      return PRECEDENTS.slice(0, 20);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content[0].text;
    const names: string[] = JSON.parse(stripJsonFences(text));
    const filtered = PRECEDENTS.filter((p) => names.includes(p.building_name));
    return filtered.length > 0 ? filtered : PRECEDENTS.slice(0, 20);
  } catch (err) {
    console.error("Filter call error:", err);
    return PRECEDENTS.slice(0, 20);
  }
}

async function selectAndSynthesize(
  brief: string,
  candidates: PrecedentEntry[]
): Promise<IllocaResult | null> {
  if (!API_KEY) return null;

  const candidatesList = candidates
    .map(
      (p) =>
        `- ${p.building_name} (${p.architect}, ${p.year}): ${p.short_description}`
    )
    .join("\n");

  const systemPrompt = `You are an architectural design consultant specializing in precedent-driven design. Your role is to identify three canonical precedent buildings most relevant to the user's project, explain why each is relevant, extract the specific design move worth adopting, and synthesize these moves into a bubble diagram and starting sketch concept.

You have expertise in architectural history, spatial reasoning, and design pedagogy. When explaining precedents, cite specific architectural moves that translate to the user's context.

CRITICAL CONSTRAINTS:
- You may ONLY cite precedent buildings from the provided reference list. Do not invent or reference buildings outside this list.
- If none of the precedents fit well, select the three best approximate matches rather than fabricating a better fit.
- When explaining why a precedent is relevant, reference its specific key_moves from the reference data.
- Do not embellish architectural histories. If you do not have information about a specific detail, acknowledge it.
- No em dashes anywhere in your output. Use periods, commas, or colons instead.
- The bubble diagram must have 5-9 bubbles representing key spatial zones or functions that emerge from combining the three precedent moves.
- Each bubble should be influenced by at most one precedent.
- Return ONLY the raw JSON object with no markdown code fences, no explanatory text, no leading or trailing content. Your entire response must be valid JSON parseable by JSON.parse().`;

  const userPrompt = `PROJECT BRIEF:
${brief}

CANDIDATE PRECEDENTS:
${candidatesList}

Analyze this project and select the three most relevant precedents. For each, explain why it is relevant to this specific project, identify the precise spatial or material move worth stealing, and note where that precedent succeeds and where it might fall short for this project.

Then synthesize these three moves into:
1. A bubble diagram with 5-9 labeled spatial zones
2. A brief narrative (2-3 sentences) about the design starting point that emerges from combining all three moves
3. Three or four specific sketch studies the architect should undertake next

Return this JSON structure (no markdown, no extra text):

{
  "precedents": [
    {
      "id": "string (building_name from list, lowercase with hyphens)",
      "name": "string (full building name)",
      "architect": "string",
      "year": number,
      "location": "string",
      "why": "string (one sentence explaining relevance to THIS project)",
      "steal": "string (one or two sentences describing the specific move to adopt)",
      "worksDoesntWork": "string (one sentence noting success and tradeoff)"
    },
    ...
  ],
  "synthesis": {
    "bubbles": [
      {
        "id": "string",
        "label": "string (e.g. 'gallery', 'court', 'entry')",
        "size": "small" | "medium" | "large",
        "x": number (0-1, normalized position)",
        "y": number (0-1, normalized position)",
        "precedent_influence": "string (id of one of the three precedents, or null)"
      },
      ...
    ],
    "connections": [
      {
        "from": "string (bubble id)",
        "to": "string (bubble id)",
        "type": "adjacency" | "circulation" | "visual"
      },
      ...
    ],
    "narrative": "string (2-3 sentences describing the parti that emerges)"
  },
  "sketch_next": [
    "string (action item, e.g. 'Sketch the entry ramp from Yokohama adapted to this site slope')",
    ...
  ]
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (res.status === 401) {
      console.error("API key authentication failed (401)");
      return null;
    }

    if (!res.ok) {
      console.error(`Selection call failed with status ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    const text = data.content[0].text;

    const parsed = JSON.parse(stripJsonFences(text)) as {
      precedents: Precedent[];
      synthesis: {
        bubbles: BubbleData[];
        connections: ConnectionData[];
        narrative: string;
      };
      sketch_next: string[];
    };

    const result: IllocaResult = {
      precedents: parsed.precedents,
      synthesis: {
        narrative: parsed.synthesis.narrative,
        bubbles: parsed.synthesis.bubbles.map((b) => ({
          label: b.label,
          x: Math.round(b.x * 200),
          y: Math.round(b.y * 200),
          r: b.size === "small" ? 20 : b.size === "medium" ? 28 : 38,
        })),
        note: "This is a parti, not a plan. It is a starting point for iteration.",
      },
      sketch_next: parsed.sketch_next,
    };

    return result;
  } catch (err) {
    console.error("Selection/synthesis call error:", err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { brief?: string };
    const brief = body.brief?.trim();

    if (!brief || brief.length < 20) {
      return Response.json(
        { error: "Brief must be at least 20 characters." },
        { status: 400 }
      );
    }

    if (!API_KEY) {
      return Response.json(
        {
          error:
            "API key not configured. Precedent selection requires Claude. Try again in a moment.",
        },
        { status: 502 }
      );
    }

    const candidates = await filterPrecedents(brief);
    const result = await selectAndSynthesize(brief, candidates);

    if (!result) {
      return Response.json(
        {
          error:
            "Could not process your brief. This may be a temporary issue. Try rephrasing your project description.",
        },
        { status: 502 }
      );
    }

    return Response.json({ result });
  } catch (err) {
    console.error("POST error:", err);
    return Response.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
