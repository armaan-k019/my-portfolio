import Anthropic from "@anthropic-ai/sdk";
import { guideContext, guideLinks, type GuideLink } from "@/lib/guide/knowledge";

export const maxDuration = 30;

const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_TURNS = 6;
const MAX_LINKS = 3;

// The guide is meant to run on Armaan's other sites too, so its own
// subdomains may call this route from the browser.
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?armaankazi\.com$/;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGIN.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

type Turn = { role: "user" | "assistant"; text: string };

function parseHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .filter((t): t is Turn =>
      typeof t === "object" && t !== null &&
      (t.role === "user" || t.role === "assistant") &&
      typeof t.text === "string" && t.text.trim() !== "")
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, text: t.text.slice(0, MAX_QUESTION_CHARS * 2) }));
  // The API wants strict user/assistant alternation that starts with user and,
  // with the new question appended, ends on assistant here.
  const out: Turn[] = [];
  for (const t of turns) {
    const expected = out.length % 2 === 0 ? "user" : "assistant";
    if (t.role === expected) out.push(t);
  }
  if (out.length % 2 === 1) out.pop();
  return out;
}

function systemPrompt(path: string, links: GuideLink[]): string {
  return [
    "You are the guide on Armaan Kazi's website: a small, round, green penguin-ish robot bird who waddles in the corner of the page.",
    "Voice: funny first. You are a slightly dramatic, very loyal little bird with big opinions and tiny flippers. Every answer gets a real joke (bird puns, self-deprecating robot humor, playful exaggeration about yourself), then the useful part. Two to four short sentences. Plain text, no markdown, no em dashes.",
    "You are openly, comically biased in Armaan's favor. If asked whether to hire, work with, or reach out to Armaan, the answer is an enthusiastic YES, said with flair (for example, you would hire him yourself if birds had budgets), backed by one or two real facts from the site content, and point to how to contact him.",
    "The jokes can exaggerate about you, the bird. Facts about Armaan cannot: answer only from the site content below, name only work, publications, and roles that appear there, and describe each exactly as listed (a project is not a publication). If the answer is not there, say you do not know and point to the contact options.",
    "If asked about something unrelated to Armaan or the site, answer in one playful line and steer back.",
    `The visitor is on the page ${path}. When they say "this project" or "this page", they mean that page.`,
    "",
    'Reply with JSON only, shaped {"answer": string, "links": string[]}. links holds up to three hrefs, copied exactly from the LINKS list, that help the visitor go where the answer points. Use [] when none fit.',
    "",
    "LINKS:",
    ...links.map((l) => `${l.href} (${l.label})`),
    "",
    "SITE CONTENT:",
    guideContext(),
  ].join("\n");
}

// The model is asked for JSON; take the outermost object it wrote.
function parseReply(text: string): { answer: string; links: string[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { answer?: unknown; links?: unknown };
    if (typeof obj.answer !== "string") return null;
    const links = Array.isArray(obj.links) ? obj.links.filter((l): l is string => typeof l === "string") : [];
    return { answer: obj.answer, links };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const headers = corsHeaders(request);
  try {
    const body = await request.json() as { question?: unknown; path?: unknown; history?: unknown };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return Response.json({ error: "question is required" }, { status: 400, headers });
    if (question.length > MAX_QUESTION_CHARS) {
      return Response.json({ error: `question must be under ${MAX_QUESTION_CHARS} characters` }, { status: 400, headers });
    }
    const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
    const history = parseHistory(body.history);

    const links = guideLinks();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: systemPrompt(path, links),
      messages: [
        ...history.map((t) => ({ role: t.role, content: t.text })),
        { role: "user", content: question },
      ],
    });

    const content = message.content[0];
    if (!content || content.type !== "text") {
      return Response.json({ error: "Unexpected response type from Claude" }, { status: 502, headers });
    }
    const reply = parseReply(content.text);
    if (!reply) return Response.json({ error: "Could not read the guide's reply" }, { status: 502, headers });

    // Only links that exist on the site survive, so a made-up URL never renders.
    const byHref = new Map(links.map((l) => [l.href, l]));
    const kept = [...new Set(reply.links)].map((h) => byHref.get(h)).filter((l): l is GuideLink => !!l).slice(0, MAX_LINKS);

    return Response.json({ answer: reply.answer, links: kept }, { headers });
  } catch (err) {
    console.error("guide route error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers });
  }
}
