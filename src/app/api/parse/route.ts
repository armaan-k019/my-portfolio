import Anthropic from "@anthropic-ai/sdk";
import { parseHeuristic, type ParsedShape } from "@/app/demos/rho/trajectory/parse-heuristic";

// Prompt 6, Part B: the single LLM call in the whole feature. It parses messy
// resume and LinkedIn text into our structured role-and-claims shape. It does
// NOT score anything; scores are computed downstream by real math and
// embeddings. The key is read server-side only and never reaches the client.
// With no key (or on any failure) it falls back to a local heuristic parser so
// the input still works, flagged as "basic" mode.

export const maxDuration = 30;

const SYSTEM_PROMPT = `You parse hiring documents into structured JSON. You are given resume text and optional LinkedIn text for one candidate.

Return ONLY a JSON object, no preamble and no markdown fences, in exactly this shape:
{
  "name": string,
  "roles": [ { "title": string, "startDate": "YYYY-MM", "endDate": "YYYY-MM" | null, "bullets": string[] } ],
  "claims": string[],
  "evidence": string[],
  "education": { "school": string | null, "gpa": number | null, "major": string | null }
}

Rules:
- "roles" comes from the resume, ordered oldest to newest. Use null endDate for a current role. If a month is unknown use "01".
- "claims" are the candidate's self-asserted accomplishment statements from the RESUME (the bullets and impact lines).
- "evidence" are corroborating statements from the LINKEDIN text only (recommendations, posts, role confirmations). If no LinkedIn text is given, return an empty array.
- "education" is from the resume. Use null for any field not stated. Do not infer a GPA or school that is not written.
- Do not invent facts. Do not score anything. Output JSON only.`;

interface ParseBody {
  resume?: string;
  linkedin?: string;
}

function coerce(shape: Partial<ParsedShape>): ParsedShape {
  const roles = Array.isArray(shape.roles) ? shape.roles : [];
  const edu = (shape.education ?? {}) as { school?: unknown; gpa?: unknown; major?: unknown };
  return {
    name: typeof shape.name === "string" && shape.name.trim() ? shape.name.trim() : "Pasted candidate",
    roles: roles
      .filter((r) => r && typeof r.title === "string")
      .map((r) => ({
        title: String(r.title),
        startDate: typeof r.startDate === "string" ? r.startDate : "2022-01",
        endDate: r.endDate === null || typeof r.endDate === "string" ? r.endDate : null,
        bullets: Array.isArray(r.bullets) ? r.bullets.map(String) : [],
      })),
    claims: Array.isArray(shape.claims) ? shape.claims.map(String) : [],
    evidence: Array.isArray(shape.evidence) ? shape.evidence.map(String) : [],
    education: {
      school: typeof edu.school === "string" ? edu.school : undefined,
      gpa: typeof edu.gpa === "number" ? edu.gpa : undefined,
      major: typeof edu.major === "string" ? edu.major : undefined,
    },
  };
}

export async function POST(request: Request) {
  let resume = "";
  let linkedin = "";
  try {
    const body = (await request.json()) as ParseBody;
    resume = (body.resume ?? "").slice(0, 8000);
    linkedin = (body.linkedin ?? "").slice(0, 8000);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!resume.trim()) {
    return Response.json({ error: "Paste some resume text to add a candidate." }, { status: 400 });
  }

  // No key: local heuristic, basic mode.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      parsed: parseHeuristic(resume, linkedin),
      mode: "basic",
      note: "Parsing in basic mode. Set ANTHROPIC_API_KEY for AI parsing.",
    });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    let message: Anthropic.Message;
    try {
      message = await client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `RESUME:\n${resume}\n\nLINKEDIN:\n${linkedin || "(none provided)"}`,
            },
          ],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No text in model response.");

    let raw = textBlock.text.trim();
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    const parsed = coerce(JSON.parse(raw) as Partial<ParsedShape>);
    if (parsed.roles.length === 0 && parsed.claims.length === 0) throw new Error("Empty parse.");

    return Response.json({ parsed, mode: "ai" });
  } catch (err) {
    // Graceful fallback: never block the demo on a model or parse failure.
    console.error("parse route fell back to heuristic:", err);
    return Response.json({
      parsed: parseHeuristic(resume, linkedin),
      mode: "basic",
      note: "AI parse was unavailable, using the basic parser.",
    });
  }
}
