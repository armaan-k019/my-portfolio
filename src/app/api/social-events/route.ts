import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

interface SocialEvent {
  hasEvent: boolean;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  theme: string | null;
  type: 'party' | 'social' | 'official' | 'popup' | 'sports' | 'other';
  description: string;
  sourceAccount: string;
  postUrl: string;
}

// In-memory cache, 2-hour TTL
let socialCache: { data: SocialEvent[]; expiresAt: number } | null = null;

const ACCOUNTS = [
  "georgiatech", "gt_studentcenter", "gtdining", "gtcampusrec", "gtunionboard",
  "gt_ifc", "gtpanhellenic",
  "gtsigchi", "gtatl", "gt_sga",
];

export async function GET(): Promise<Response> {
  // Check cache
  if (socialCache && socialCache.expiresAt > Date.now()) {
    return Response.json({ events: socialCache.data });
  }

  const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
  if (!APIFY_TOKEN) return Response.json({ events: [] });

  try {
    // Start Apify run
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${APIFY_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernames: ACCOUNTS,
          resultsLimit: 15,
          proxy: { useApifyProxy: true },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runData = await runRes.json() as any;
    const datasetId = runData.data?.defaultDatasetId;
    if (!datasetId) return Response.json({ events: [] });

    // Wait for run to finish (poll up to 12s)
    const runId = runData.data?.id;
    let finished = false;
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/runs/${runId}?token=${APIFY_TOKEN}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusData = await statusRes.json() as any;
      if (statusData.data?.status === "SUCCEEDED") { finished = true; break; }
    }
    if (!finished) return Response.json({ events: [] });

    // Get results
    const resultsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&limit=150`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts = await resultsRes.json() as any[];

    // Process each post with Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const events: SocialEvent[] = [];

    for (const post of posts.slice(0, 30)) {
      const caption = post.caption?.slice(0, 500) || "";
      const imageUrl = post.displayUrl || post.thumbnailUrl;

      const content: Anthropic.MessageParam["content"] = imageUrl
        ? [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: `Account: @${post.ownerUsername}\nCaption: ${caption}\n\nExtract any event if present.` }
          ]
        : `Account: @${post.ownerUsername}\nCaption: ${caption}\n\nExtract any event if present.`;

      try {
        const msg = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 256,
          system: `You are scanning Georgia Tech social media posts for upcoming events. Extract any events, parties, social gatherings, or pop-ups mentioned in the post caption or visible in the image.

Return a JSON object:
{ "hasEvent": boolean, "title": string, "date": string|null, "time": string|null, "location": string|null, "theme": string|null, "type": "party"|"social"|"official"|"popup"|"sports"|"other", "description": string, "sourceAccount": string, "postUrl": string }

If no clear event, return {"hasEvent": false}. Respond ONLY with valid JSON.`,
          messages: [{ role: "user", content }],
        });
        const text = msg.content.find(b => b.type === "text");
        if (!text || text.type !== "text") continue;
        let raw = text.text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
        const s = raw.indexOf("{"); const e2 = raw.lastIndexOf("}");
        if (s !== -1 && e2 !== -1) raw = raw.slice(s, e2 + 1);
        const parsed = JSON.parse(raw) as SocialEvent;
        if (parsed.hasEvent) {
          events.push({ ...parsed, postUrl: post.url || (post.shortCode ? `https://instagram.com/p/${post.shortCode}` : "") });
        }
      } catch { continue; }
    }

    // Cache for 2 hours
    socialCache = { data: events, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
    return Response.json({ events });
  } catch {
    return Response.json({ events: [] });
  }
}
