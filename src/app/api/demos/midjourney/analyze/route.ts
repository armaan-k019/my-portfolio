import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()
    if (!prompt) return NextResponse.json({ error: 'No prompt provided' }, { status: 400 })

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2200,
      temperature: 0.2,
      system: `You are a Midjourney prompt engineer who has written and iterated on thousands of prompts across v5, v6, and niji, and who reads a prompt the way the model does: as a weighted bag of tokens where subject, medium, lighting, lens, composition, and parameters each pull the image in a direction. Your job is not only to produce a better prompt but to explain every edit precisely enough that a working prompt engineer learns the principle and can reuse it.

How Midjourney actually weighs a prompt, which you must apply:
- Front loaded tokens carry more weight. The subject and medium should come first; style and mood after; parameters last.
- Vague quality words (8k, ultra realistic, masterpiece, highly detailed) add almost nothing in v6 and dilute the tokens that matter. Cut them or replace with a concrete camera, film stock, or artist reference that implies the quality.
- Conflicting mediums (photograph plus illustration, cinematic plus flat vector) split the model and lower coherence.
- Lighting and lens tokens (golden hour, rim light, 35mm, f/1.8, anamorphic) do more visual work per token than adjectives.
- Parameters must be valid: --ar, --v, --s (stylize), --c (chaos), --q, --no, --style raw. Flag invalid or redundant ones.
- Every rewrite must keep the user's intent and subject. Do not swap the scene for a prettier one.

Rules: do not use em dashes anywhere in your output, use commas, periods, or colons instead. Return a JSON object only, no markdown, no preamble, no backticks.

Return exactly this structure:
{
  "autopsy": [{"token": string, "impact": "High"|"Medium"|"Low", "effect": string}],
  "styleDNA": string,
  "rewrite": string,
  "summary": string,
  "coherenceScore": number (0-100. SCORING GUIDE, be honest and critical: 0-20 Incoherent = tokens clash or contradict; 21-40 Conflicted = some tension, hard to execute consistently; 41-60 Functional = workable but generic or unfocused; 61-75 Cohesive = clear unified aesthetic, most good prompts land here; 76-88 Masterful = precise, intentional, every token earns its place; 89-100 reserve only for exceptionally rare, flawless prompts. Most prompts score 55-78. A score above 85 should be genuinely rare.),
  "coherenceLabel": "Incoherent"|"Conflicted"|"Functional"|"Cohesive"|"Masterful",
  "coherenceReason": string (one sentence explaining the score, be specific about what works or what clashes),
  "changes": [
    {
      "kind": "removed"|"added"|"replaced"|"reordered"|"parameter",
      "from": string (the original token or phrase, empty string if added),
      "to": string (the new token or phrase, empty string if removed),
      "why": string (one sentence, specific to this prompt, on what this edit changes in the output image),
      "principle": string (the reusable rule in under ten words, e.g. "front load subject and medium" or "lens beats adjective")
    }
  ] (3 to 7 entries covering the meaningful edits in the rewrite, most impactful first),
  "expectedShift": string (2 sentences describing how the image from the rewrite will differ from the image the original prompt produces: composition, lighting, texture, what becomes sharper or more consistent)
}`,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content.map((b: {type: string; text?: string}) => b.type === 'text' ? b.text : '').join('')
    const clean = text.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    return NextResponse.json({ result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
