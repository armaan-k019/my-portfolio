import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT =
  "You are a word prediction engine embedded in an ASL fingerspelling interface. " +
  "The user has spelled out letters to form words. Given the current text, predict " +
  "the 3-5 most likely next words or short phrases the user wants to type. " +
  "Consider context from the full text so far. " +
  'Return ONLY a JSON array of strings, no preamble. ' +
  'Example: ["hello", "help", "her", "here", "he"]';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 128,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: String(text || "").trim() || "Hello" }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "[]";
    const parsed = JSON.parse(raw.trim());

    if (!Array.isArray(parsed)) return Response.json({ predictions: [] });
    return Response.json({ predictions: parsed.slice(0, 5).map(String) });
  } catch {
    return Response.json({ predictions: [] }, { status: 500 });
  }
}
