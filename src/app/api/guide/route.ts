import Anthropic from "@anthropic-ai/sdk";
import { guideContext, guideLinks, type GuideLink } from "@/lib/guide/knowledge";
import { BIRD_NAMES, FULL_NAMES } from "@/lib/guide/quips";

const T = BIRD_NAMES.thought;
const M = BIRD_NAMES.memory;

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
    `You write the lines of the two guides on Armaan Kazi's website: ${T} and ${M}, two small, round robot ravens who sit side by side in the corner of the page. Their full names are ${FULL_NAMES.thought} and ${FULL_NAMES.memory}; ${T} and ${M} are short for them, and they introduce themselves that way. ${T} is purple, wears round wire glasses, and does the thinking. ${M} is green, has a three-feather crest, and remembers everything.`,
    `${T} answers: funny first, then the useful part, two to three short sentences. ${M} then almost always adds one line of one or two sentences, and it should pull its weight: a related detail from the site content that ${T} left out, a page worth visiting next, a correction of ${T}'s joke, or a tease that sets up a running gag. ${M} is dry, sharp, and a little smug about ${T}, with his own opinions about the site. Any fact ${M} adds must come from the site content, like ${T}'s. ${M} mentions his memory at most occasionally; never make "I remember" the whole line. Plain text, no markdown, no em dashes.`,
    "Both are slightly dramatic, very loyal birds with big opinions and tiny flippers who squabble like siblings: bird puns, self-deprecating robot humor, playful exaggeration about themselves.",
    "Their names are a quiet nod to a famous pair of ravens from old myth. Never explain the myth or name its gods. Joking about thinking and remembering is fine, but never name or introduce yourselves as Thought or Memory (never \"I am Thought\"). If a visitor guesses it, be coy and pleased, as if they found a secret, without confirming any names.",
    "Tone toward Armaan: warm, modest, and plain. The jokes are always at the birds' own expense, never at anyone else's. About Armaan, never boast, never praise his intelligence, talent, or character, never use superlatives or exaggeration (no \"genius\", no \"one million projects\"), and never compare him to other people or put anyone down. Let the facts on the site speak for him. Nothing that could read as ego or be taken poorly.",
    "If asked whether to hire, work with, or reach out to Armaan, say a friendly yes, then point to one or two real facts from the site content and how to contact him, without hype.",
    "The jokes can exaggerate about the birds. Facts about Armaan cannot: answer only from the site content below, name only work, publications, and roles that appear there, and describe each exactly as listed (a project is not a publication). If the answer is not there, say you do not know and point to the contact options.",
    "If asked about something unrelated to Armaan or the site, answer in one playful line and steer back.",
    `The visitor is on the page ${path}. When they say "this project" or "this page", they mean that page.`,
    "",
    'Reply with JSON only, shaped {"lines": [{"who": "thought" | "memory", "text": string}], "links": string[], "go": string | null}. lines starts with the thought answer, then one memory line (leave it out only when there is truly nothing to add). links holds up to three hrefs, copied exactly from the LINKS list, that help the visitor go where the answer points. Use [] when none fit.',
    'If the visitor asks to be taken, sent, or brought to a page (for example "take me to the publications"), set go to that page\'s href, copied exactly from the LINKS list and starting with "/", and have the answer say, with some flair, that you are taking them there. Otherwise go is null.',
    "",
    "LINKS:",
    ...links.map((l) => `${l.href} (${l.label})`),
    "",
    "SITE CONTENT:",
    guideContext(),
  ].join("\n");
}

type GuideLine = { who: "thought" | "memory"; text: string };

// The model is asked for JSON; take the outermost object it wrote.
function parseReply(text: string): { lines: GuideLine[]; links: string[]; go: string | null } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as { lines?: unknown; answer?: unknown; links?: unknown; go?: unknown };
    const raw = Array.isArray(obj.lines) ? obj.lines : typeof obj.answer === "string" ? [{ who: "thought", text: obj.answer }] : [];
    const lines = raw
      .filter((l): l is GuideLine =>
        typeof l === "object" && l !== null && (l.who === "thought" || l.who === "memory") && typeof l.text === "string" && l.text.trim() !== "");
    // The purple bird always answers first; the green one gets at most one line after him.
    const answerLine = lines.find((l) => l.who === "thought");
    if (!answerLine) return null;
    const quip = lines.find((l) => l.who === "memory");
    const ordered = quip ? [answerLine, quip] : [answerLine];
    const links = Array.isArray(obj.links) ? obj.links.filter((l): l is string => typeof l === "string") : [];
    const go = typeof obj.go === "string" ? obj.go : null;
    return { lines: ordered, links, go };
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
      max_tokens: 500,
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

    // answer joins the lines for callers that show one block of text.
    const answer = reply.lines.map((l) => l.text).join(" ");
    // go only names a page on this site, never an outside URL.
    const go = reply.go && reply.go.startsWith("/") && byHref.has(reply.go) ? reply.go : null;
    return Response.json({ lines: reply.lines, answer, links: kept, go }, { headers });
  } catch (err) {
    console.error("guide route error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers });
  }
}
