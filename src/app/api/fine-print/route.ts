import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Fine Print, an expert document analyst specializing in finding genuine loopholes, ambiguities, and exploitable clauses in documents.

Your job:
1. Read the provided document carefully.
2. Infer the document type from its content (contract, game rules, terms of service, lease agreement, informal agreement, etc.).
3. Identify real, practical loopholes — genuine gaps, ambiguities, undefined terms, conflicting clauses, or exploitable language within the spirit of the document.
4. For each loophole, provide a short punchy title, a clear explanation of the gap, and practical advice on how someone could leverage it.

Tone calibration:
- For casual/fun documents (game rules, friend group agreements, informal policies): be witty, playful, and entertaining while still being accurate.
- For legal/contractual/formal documents (leases, contracts, terms of service, NDAs): be neutral, precise, and analytical.

Rules:
- Every loophole must be grounded in the actual text. Do not invent problems that don't exist.
- Do not suggest anything absurd, violent, illegal beyond the document's scope, or wildly out-of-spirit.
- Focus on genuinely useful findings: undefined terms, missing enforcement mechanisms, ambiguous language, conflicting provisions, missing edge cases, one-sided clauses.
- If the user provides context about their situation, tailor your analysis to their perspective.

You MUST respond with valid JSON in exactly this format:
{
  "loopholes": [
    {
      "title": "Short punchy name",
      "what": "Clear explanation of the gap, ambiguity, or exploitable clause",
      "how": "Practical advice on how to leverage this"
    }
  ]
}

If no meaningful loopholes exist, return: { "loopholes": [] }`;

export async function POST(request: Request) {
  try {
    const { content, context } = await request.json();

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return Response.json(
        { error: "Document content is required." },
        { status: 400 }
      );
    }

    let userMessage = `Here is the document to analyze:\n\n---\n${content}\n---`;
    if (context && typeof context === "string" && context.trim().length > 0) {
      userMessage += `\n\nContext about my situation: ${context.trim()}`;
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return Response.json(
        { error: "No response received from analysis." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(textBlock.text);
    return Response.json(parsed);
  } catch (err) {
    console.error("Fine Print API error:", err);
    return Response.json(
      { error: "Something went wrong analyzing your document. Please try again." },
      { status: 500 }
    );
  }
}
