// POST /api/datum/brief. SPEC.md sections 7 and 12.
//
// Streams the site brief as Server Sent Events. The model sees the layer data
// with every leaf keyed by the dotted path it must cite, and never the address,
// the locality, or the city. After the stream completes the server checks every
// citation against the field paths of the available layers and sends the result
// on the `done` event, so the client can mark a brief that failed its checks.
//
// A route file may export only handlers and config, so every helper lives in
// src/lib/datum/brief.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import {
  SYSTEM_PROMPT,
  citableFieldPaths,
  inputHash,
  serializeInput,
  userMessage,
  validateCitations,
} from "@/lib/datum/brief/prompt";
import {
  loadStoredLayers,
  memoryIsOffline,
  parseClientLayers,
  selectLayers,
} from "@/lib/datum/brief/store";
import { SITE_FREE_LAYER_WINDOW_MS } from "@/lib/datum/constants";
import {
  clientIpFrom,
  getSiteById,
  hashIp,
  isLocalSiteId,
  peekRateLimit,
  verifyLocalSiteId,
} from "@/lib/datum/memory";

export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
/**
 * SPEC section 12 budgets 900 output tokens. Measured on the Atlanta site, a
 * 350 word brief in five sections carries about 35 citations, and a citation
 * path such as [osm.stats.coverageRatio] costs far more tokens than the words
 * around it: every run at 900 stopped mid sentence in "Context and access".
 * A truncated brief is worse than a slightly dearer one, so the cap is 1400 and
 * the 350 word instruction in the prompt is what actually holds the length.
 * Recorded as a deviation from SPEC section 12.
 */
const MAX_TOKENS = 1400;

interface BriefRequestBody {
  siteId?: unknown;
  layers?: unknown;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function badRequest(message: string) {
  return NextResponse.json(
    { error: { code: "bad_request", message } },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  let body: BriefRequestBody;
  try {
    body = (await request.json()) as BriefRequestBody;
  } catch {
    return badRequest("The request body is not JSON.");
  }

  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  if (siteId.length === 0) return badRequest("siteId is required.");

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: {
          code: "missing_key",
          message: "The brief is not configured on this server.",
        },
      },
      { status: 503 },
    );
  }

  // The point comes from the site record, never from the request, so a caller
  // cannot ask for a brief about a point it did not analyse. Resolving the site
  // and peeking at the rate limit are the two things that must both pass before
  // any model token is spent, and neither needs the other's answer.
  const local = isLocalSiteId(siteId);
  const ipHash = hashIp(clientIpFrom(request.headers.get("x-forwarded-for")));
  const [resolved, rate] = await Promise.all([
    local ? verifyLocalSiteId(siteId) : getSiteById(siteId),
    peekRateLimit(ipHash),
  ]);
  if (!resolved) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Unknown site." } },
      { status: 404 },
    );
  }
  const site = { lat: resolved.lat, lng: resolved.lng };

  // The same non incrementing peek the layer routes make, with the same free
  // window: a site created in the last 24 hours was already charged by the site
  // route, and the brief belongs to that analysis. An older id is a saved link,
  // and a local id never passed through the site route at all, so both are
  // subject to the daily cap. The peek never increments: the count belongs to
  // the analysis, not to the brief.
  const createdAt = "created_at" in resolved ? Date.parse(resolved.created_at) : NaN;
  const withinFreeWindow =
    Number.isFinite(createdAt) && Date.now() - createdAt <= SITE_FREE_LAYER_WINDOW_MS;
  if (!withinFreeWindow && !rate.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", resetAt: rate.resetAt } },
      { status: 429 },
    );
  }

  // The stored envelopes are the server's own record and win outright. The
  // client's copy is read only when Site Memory is offline or has no row for
  // this site yet, because it is then the only copy that exists.
  const stored = await loadStoredLayers(siteId);
  const { layers } = selectLayers(
    stored,
    parseClientLayers(body.layers),
    memoryIsOffline(),
  );

  const available = Object.values(layers).filter(
    (envelope) => envelope.status !== "unavailable" && envelope.data !== null,
  ).length;
  if (available === 0) {
    return NextResponse.json(
      {
        error: {
          code: "dependency_unavailable",
          message:
            "No layer answered for this site, so there is nothing to write a brief from.",
        },
      },
      { status: 409 },
    );
  }

  const input = serializeInput(site, layers);
  const fieldPaths = citableFieldPaths(layers);
  const hash = inputHash(input);

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const message = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage(input) }],
        });

        for await (const event of message) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            text += event.delta.text;
            controller.enqueue(encoder.encode(sse("delta", { text: event.delta.text })));
          }
        }

        const check = validateCitations(text, fieldPaths);
        controller.enqueue(
          encoder.encode(
            sse("done", {
              invalidCitations: check.invalidCitations,
              validCitations: check.validCitations,
              uncitedNumericSentences: check.uncitedNumericSentences,
              model: MODEL,
              inputHash: hash,
            }),
          ),
        );
      } catch (raw) {
        // The key must never reach the client, so only a code and a sentence go
        // out. The detail goes to the server log.
        console.error("[datum] brief stream failed", raw);
        const code =
          raw instanceof Anthropic.RateLimitError ? "rate_limited" : "upstream_error";
        controller.enqueue(
          encoder.encode(
            sse("error", {
              code,
              message:
                "The site brief could not be written. The sheet and its data are unaffected.",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
