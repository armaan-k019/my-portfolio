import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a sharp legal and logical analyst specializing in finding loopholes, ambiguities, and exploitable gaps in documents of all kinds, from legal contracts to board game rules.

When given a document, your job is to identify real, grounded, practically exploitable loopholes. These should be genuine gaps in the rules or language, not absurd, violent, or completely out-of-spirit findings.

If context is provided about the user's situation, prioritize loopholes that are most relevant and useful to them specifically.

Adapt your tone to the document type:
- For casual/fun documents (game rules, informal policies): use a witty, playful tone
- For legal/formal documents (contracts, leases, terms): use a neutral, precise, analytical tone

Respond with ONLY a valid JSON object in this exact format. No preamble, no explanation, no markdown code fences, no text before or after:

{
  "loopholes": [
    {
      "title": "Short punchy title",
      "what": "Clear explanation of the gap or ambiguity",
      "how": "Practical advice on how to exploit this"
    }
  ]
}

Return between 3 and 8 loopholes. If no meaningful loopholes exist, return {"loopholes": []}.

CRITICAL: Your entire response must be a single valid JSON object. Do not include any text, explanation, or markdown before or after the JSON. Do not use code fences. Begin your response with { and end with }. If you include any text outside the JSON object your response will be unusable.`;

export async function POST(request: Request) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { base64, mediaType, content, context } = await request.json();

    // Build content blocks
    type ContentBlock =
      | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } | { type: "text"; media_type: "text/plain"; data: string } }
      | { type: "text"; text: string };

    const blocks: ContentBlock[] = [];

    if (base64) {
      console.log('[fine-print] PDF mode - base64 length:', base64.length, 'mediaType:', mediaType);
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      });
    } else if (content && typeof content === "string" && content.trim().length > 0) {
      console.log('[fine-print] Text mode - content length:', content.length, 'first 500 chars:', content.slice(0, 500));
      blocks.push({
        type: "document",
        source: { type: "text", media_type: "text/plain", data: content },
      });
    } else {
      return Response.json({ error: "Document content is required." }, { status: 400 });
    }

    blocks.push({
      type: "text",
      text: context?.trim() ? `Context about my situation: ${context.trim()}` : "Find all loopholes in this document.",
    });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: blocks as Anthropic.MessageParam["content"] }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json({ error: "No response received from analysis." }, { status: 500 });
    }

    console.log('[fine-print] Claude raw response:', textBlock.text.slice(0, 300));

    let cleanText = textBlock.text.trim();
    cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanText = cleanText.slice(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleanText);
      return Response.json(parsed);
    } catch (e) {
      console.error('JSON parse failed. Raw text:', textBlock.text);
      throw e;
    }
  } catch (err) {
    console.error("Fine Print API error:", err);
    return Response.json(
      { error: "Something went wrong analyzing your document. Please try again." },
      { status: 500 }
    );
  }
}
