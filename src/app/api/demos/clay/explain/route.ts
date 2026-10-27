import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You explain one run of The Commons, an agent-based model of cold email. 1,200 prospects, 48 sellers. Each seller uses one of four strategies (Template, Personalized, Targeted, Targeted + personalized) and copies peers whose replies per dollar are higher. Prospects learn how often a personal-looking email is actually relevant; that belief is "trust". The two controls are the cost to make an email look personal and the cost of signal data to target it.

You get the two costs and a day-by-day sample of the run. Write what happened and why, in at most 110 words and two short paragraphs:
1. What happened: name the days where replies, trust, or the strategy mix turned, and give the numbers.
2. Why: the mechanism, in terms of what each strategy cost and what prospects learned.

Use only numbers that appear in the data. Do not invent days, figures, or causes outside the model. This is a model with assumed constants, not measured data; do not present it as evidence about real email. Plain prose, no headings, no lists. Do not use em dashes; use commas, periods, or parentheses.`;

interface Row {
  day: number;
  replies: number;
  trust: number;
  inbox: number;
  shares: number[];
}

interface Body {
  personalCost: number;
  targetCost: number;
  days: number;
  rows: Row[];
}

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function parse(body: unknown): Body | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isNum(b.personalCost) || !isNum(b.targetCost) || !isNum(b.days) || !Array.isArray(b.rows)) return null;
  if (b.rows.length < 2 || b.rows.length > 40) return null;
  const rows: Row[] = [];
  for (const r of b.rows) {
    if (!r || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    if (!isNum(o.day) || !isNum(o.replies) || !isNum(o.trust) || !isNum(o.inbox)) return null;
    if (!Array.isArray(o.shares) || o.shares.length !== 4 || !o.shares.every(isNum)) return null;
    rows.push({ day: o.day, replies: o.replies, trust: o.trust, inbox: o.inbox, shares: o.shares as number[] });
  }
  return { personalCost: b.personalCost, targetCost: b.targetCost, days: b.days, rows };
}

function table(b: Body): string {
  const head = "day | replies | trust | inbox | Template | Personalized | Targeted | Targeted+personalized";
  const lines = b.rows.map((r) =>
    [r.day, r.replies, `${Math.round(r.trust * 100)}%`, r.inbox.toFixed(1), ...r.shares].join(" | "),
  );
  return [
    `Personalization cost per email: $${b.personalCost}`,
    `Targeting cost per email: $${b.targetCost}`,
    `Days run: ${b.days}`,
    "",
    head,
    ...lines,
  ].join("\n");
}

export async function POST(request: Request) {
  let body: Body | null;
  try {
    body = parse(await request.json());
  } catch {
    body = null;
  }
  if (!body) return Response.json({ error: "Run the model for a few weeks first." }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The explainer is offline right now." }, { status: 503 });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: table(body) }],
      },
      { signal: AbortSignal.timeout(28000) },
    );
    const text = message.content.find((b) => b.type === "text");
    if (!text || text.type !== "text" || !text.text.trim()) {
      return Response.json({ error: "The explainer returned nothing. Try again." }, { status: 502 });
    }
    return Response.json({ text: text.text.trim() });
  } catch (err) {
    console.error("clay explain:", err);
    return Response.json({ error: "The explainer could not be reached. Try again." }, { status: 502 });
  }
}
