import Anthropic from "@anthropic-ai/sdk";
import { EvalError, firstTerms, parseExpr, parseSequence } from "@/app/demos/harmonic/math";
import { MAX_SOURCE_CHARS, type Conjecture } from "@/app/demos/harmonic/samples";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You propose conjectures about an integer sequence. A brute-force search will then try to break each one on small cases, so every conjecture needs a check the search can run.

Write each check as one expression in this language, true when the conjecture holds at index n:
- n (the index), a(expr) (a term), integer literals
- + - * / (floor division) % (non-negative remainder) ^ (power)
- == != < <= > >= && || ! and -> (implication, lowest precedence)
- isPrime(x), isSquare(x), gcd(x, y), divides(d, x), abs(x), digitSum(x), min(x, y), max(x, y)
Nothing else: no other variables, no quantifiers, no decimals. Guard terms before the first index, for example "n > 0 -> a(n) > a(n-1)".

Return JSON only, no markdown fences:
{"conjectures": [{"claim": string, "check": string}]}

- Exactly 4 conjectures, each consistent with every term shown.
- claim: plain English, at most 12 words.
- Mix them: some you expect to hold, and at least one bold one that fits the terms shown but might fail later.
- Do not use em dashes; use commas, periods, or parentheses.`;

// Per-instance cache: the same definition gets the same conjectures while the
// function is warm, instead of a new call per click.
const cache = new Map<string, Conjecture[]>();
const CACHE_LIMIT = 50;

function parseConjectures(text: string): Conjecture[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { conjectures?: unknown };
    if (!Array.isArray(raw.conjectures)) return [];
    return raw.conjectures
      .flatMap((c) => {
        const x = c as Record<string, unknown>;
        if (!x || typeof x.claim !== "string" || typeof x.check !== "string" || x.check.length > 160) return [];
        try {
          parseExpr(x.check); // drop any check the search could not run
        } catch {
          return [];
        }
        return [{ claim: x.claim.trim().slice(0, 120), check: x.check.trim() }];
      })
      .slice(0, 4);
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  let source = "";
  try {
    const body = (await request.json()) as { source?: unknown };
    if (typeof body.source === "string") source = body.source.trim();
  } catch {
    // fall through to the check below
  }
  if (!source || source.length > MAX_SOURCE_CHARS) {
    return Response.json({ error: `Send a sequence definition under ${MAX_SOURCE_CHARS} characters.` }, { status: 400 });
  }

  let def;
  try {
    def = parseSequence(source);
  } catch (e) {
    return Response.json({ error: e instanceof EvalError ? e.message : "Could not read that sequence." }, { status: 400 });
  }
  const { terms, error } = firstTerms(def, 16);
  if (error || terms.length < 4) {
    return Response.json({ error: error ?? "Give at least 4 terms." }, { status: 400 });
  }

  const key = source.replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit) return Response.json({ conjectures: hit });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Claude is offline right now." }, { status: 503 });
  }

  const prompt = `Definition: ${source}\nFirst terms, from a(${def.start}): ${terms.join(", ")}`;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      },
      { signal: AbortSignal.timeout(28000) },
    );
    const text = message.content.find((b) => b.type === "text");
    const conjectures = text && text.type === "text" ? parseConjectures(text.text) : [];
    if (conjectures.length === 0) {
      return Response.json({ error: "Claude returned no checkable conjectures. Try again." }, { status: 502 });
    }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, conjectures);
    return Response.json({ conjectures });
  } catch (err) {
    console.error("harmonic conjecture:", err);
    return Response.json({ error: "Claude could not be reached. Try again." }, { status: 502 });
  }
}
