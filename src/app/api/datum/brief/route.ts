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
  mergeLayers,
  parseClientLayers,
} from "@/lib/datum/brief/store";
import { getSiteById, isLocalSiteId, verifyLocalSiteId } from "@/lib/datum/memory";

export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 900;

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
  // cannot ask for a brief about a point it did not analyse.
  const local = isLocalSiteId(siteId);
  const resolved = local ? await verifyLocalSiteId(siteId) : await getSiteById(siteId);
  if (!resolved) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Unknown site." } },
      { status: 404 },
    );
  }
  const site = { lat: resolved.lat, lng: resolved.lng };

  // The stored envelopes are the server's own record. The client always sends
  // its copy as well, because with Site Memory offline nothing was stored.
  const stored = await loadStoredLayers(siteId);
  const layers = mergeLayers(stored, parseClientLayers(body.layers));

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
