import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import {
  abstractFromIndex,
  MAX_HYPOTHESES,
  MAX_QUESTION_CHARS,
  verifyQuote,
  type Paper,
  type RoundResult,
  type Stance,
} from "@/app/demos/edison/ledger";

export const maxDuration = 60;

const PAPERS_PER_ROUND = 8;
const ABSTRACT_CHARS = 1800;
const FETCH_TIMEOUT_MS = 12000;

const SYSTEM_PROMPT = `You keep a hypothesis ledger for one research question. You get the question, this round's search, the hypotheses already on the ledger with their evidence counts, and new paper abstracts, each with an id.

Return JSON only, no markdown fences:
{"updates": [{"id": string, "statement": string, "evidence": [{"paperId": string, "quote": string, "stance": "supports" | "contradicts"}]}], "next": string}

- updates: evidence from these abstracts for existing hypotheses (use their id and repeat their statement), plus new hypotheses only where the abstracts suggest one the ledger lacks (id "new"). The ledger holds at most ${MAX_HYPOTHESES} hypotheses in total.
- statement: a testable claim, at most 16 words.
- evidence: at most 2 entries per hypothesis per round. quote must be copied word for word from that paper's abstract, 8 to 30 words, with no ellipses or edits. A program checks every quote against the abstract and marks any that do not match.
- stance: whether the quoted passage supports or contradicts the statement. Skip passages that are only related.
- next: the one search query (at most 10 words) whose results would best separate the current hypotheses.

Use only the abstracts given. Do not invent papers, findings, or numbers. Do not use em dashes; use commas, periods, or parentheses.`;

// Per-instance cache so the sample question, which every visitor loads, is
// answered once per warm function rather than once per page view.
const cache = new Map<string, RoundResult>();
const CACHE_LIMIT = 50;

interface LedgerSummary {
  id: string;
  statement: string;
  supports: number;
  contradicts: number;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "armaankazi.com demo (hypothesis ledger)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

async function fromOpenAlex(query: string): Promise<Paper[]> {
  const params = new URLSearchParams({
    search: query,
    filter: "has_abstract:true",
    per_page: "25",
    select: "id,doi,title,publication_year,abstract_inverted_index",
  });
  const json = (await getJson(`https://api.openalex.org/works?${params}`)) as {
    results?: {
      id?: string;
      doi?: string | null;
      title?: string | null;
      publication_year?: number | null;
      abstract_inverted_index?: Record<string, number[]> | null;
    }[];
  };
  return (json.results ?? []).flatMap((w) => {
    const abstract = abstractFromIndex(w.abstract_inverted_index);
    if (!w.id || !w.title || abstract.length < 200) return [];
    const id = w.id.replace("https://openalex.org/", "");
    return [{ id, title: w.title, year: w.publication_year ?? null, url: w.doi ?? w.id, abstract }];
  });
}

async function fromSemanticScholar(query: string): Promise<Paper[]> {
  const params = new URLSearchParams({ query, limit: "25", fields: "title,abstract,year,url" });
  const json = (await getJson(`https://api.semanticscholar.org/graph/v1/paper/search?${params}`)) as {
    data?: { paperId?: string; title?: string; abstract?: string | null; year?: number | null; url?: string }[];
  };
  return (json.data ?? []).flatMap((p) => {
    if (!p.paperId || !p.title || !p.abstract || p.abstract.length < 200) return [];
    return [{ id: `S${p.paperId.slice(0, 10)}`, title: p.title, year: p.year ?? null, url: p.url ?? "", abstract: p.abstract }];
  });
}

// OpenAlex first, Semantic Scholar if OpenAlex fails or finds nothing new.
async function findPapers(query: string, seen: Set<string>): Promise<{ papers: Paper[]; source: RoundResult["source"] }> {
  const pick = (ps: Paper[]) => ps.filter((p) => !seen.has(p.id)).slice(0, PAPERS_PER_ROUND);
  try {
    const papers = pick(await fromOpenAlex(query));
    if (papers.length > 0) return { papers, source: "openalex" };
  } catch (err) {
    console.error("edison openalex:", err);
  }
  return { papers: pick(await fromSemanticScholar(query)), source: "semantic_scholar" };
}

function cleanLedger(raw: unknown): LedgerSummary[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HYPOTHESES) return null;
  const out: LedgerSummary[] = [];
  for (const item of raw) {
    const x = item as Record<string, unknown>;
    if (!x || typeof x.id !== "string" || typeof x.statement !== "string") return null;
    out.push({
      id: x.id.slice(0, 4),
      statement: x.statement.slice(0, 200),
      supports: Number(x.supports) || 0,
      contradicts: Number(x.contradicts) || 0,
    });
  }
  return out;
}

function render(question: string, search: string, ledger: LedgerSummary[], papers: Paper[]): string {
  const hyps = ledger.length
    ? ledger.map((h) => `${h.id}: ${h.statement} (supports ${h.supports}, contradicts ${h.contradicts})`).join("\n")
    : "(empty)";
  const abstracts = papers
    .map((p) => `[${p.id}] ${p.title} (${p.year ?? "n.d."})\n${p.abstract.slice(0, ABSTRACT_CHARS)}`)
    .join("\n\n");
  return `QUESTION\n${question}\n\nSEARCH THIS ROUND\n${search}\n\nLEDGER\n${hyps}\n\nABSTRACTS\n${abstracts}`;
}

function parse(text: string, papers: Paper[]): Pick<RoundResult, "updates" | "next"> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { updates?: unknown; next?: unknown };
    if (!Array.isArray(raw.updates)) return null;
    const byId = new Map(papers.map((p) => [p.id, p]));
    const updates = raw.updates.flatMap((u) => {
      const x = u as { id?: unknown; statement?: unknown; evidence?: unknown };
      if (typeof x?.id !== "string" || typeof x.statement !== "string" || !Array.isArray(x.evidence)) return [];
      const evidence = x.evidence.slice(0, 2).flatMap((e) => {
        const y = e as { paperId?: unknown; quote?: unknown; stance?: unknown };
        const paper = typeof y?.paperId === "string" ? byId.get(y.paperId) : undefined;
        if (!paper || typeof y.quote !== "string" || (y.stance !== "supports" && y.stance !== "contradicts")) return [];
        const quote = y.quote.trim().slice(0, 300);
        return [{ paperId: paper.id, quote, stance: y.stance as Stance, verified: verifyQuote(quote, paper.abstract) }];
      });
      return [{ id: x.id.slice(0, 4), statement: x.statement.trim().slice(0, 200), evidence }];
    });
    const next = typeof raw.next === "string" ? raw.next.trim().slice(0, 120) : "";
    return { updates, next };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let question = "";
  let search = "";
  let ledger: LedgerSummary[] | null = null;
  let seen = new Set<string>();
  try {
    const body = (await request.json()) as { question?: unknown; search?: unknown; ledger?: unknown; seen?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
    search = typeof body.search === "string" ? body.search.trim() : question;
    ledger = cleanLedger(body.ledger);
    if (Array.isArray(body.seen)) seen = new Set(body.seen.filter((s): s is string => typeof s === "string").slice(0, 200));
  } catch {
    // fall through to the check below
  }
  if (!question || !search || question.length > MAX_QUESTION_CHARS || search.length > MAX_QUESTION_CHARS || !ledger) {
    return Response.json({ error: `Keep the question and search under ${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
  }

  const key = createHash("sha256")
    .update(JSON.stringify([question, search, ledger, [...seen].sort()]))
    .digest("hex");
  const hit = cache.get(key);
  if (hit) return Response.json({ result: hit });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The ledger is offline right now." }, { status: 503 });
  }

  let found: Awaited<ReturnType<typeof findPapers>>;
  try {
    found = await findPapers(search, seen);
  } catch (err) {
    console.error("edison papers:", err);
    return Response.json({ error: "The paper search could not be reached. Try again." }, { status: 502 });
  }
  if (found.papers.length === 0) {
    return Response.json({ error: "No new papers with abstracts matched that search." }, { status: 404 });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: render(question, search, ledger, found.papers) }],
      },
      { signal: AbortSignal.timeout(45000) },
    );
    const text = message.content.find((b) => b.type === "text");
    const parsed = text && text.type === "text" ? parse(text.text, found.papers) : null;
    if (!parsed) {
      return Response.json({ error: "The ledger returned nothing usable. Try again." }, { status: 502 });
    }
    const result: RoundResult = { papers: found.papers, ...parsed, source: found.source };
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, result);
    return Response.json({ result });
  } catch (err) {
    console.error("edison round:", err);
    return Response.json({ error: "Claude could not be reached. Try again." }, { status: 502 });
  }
}
