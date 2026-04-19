import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()
    if (!prompt) return NextResponse.json({ error: 'No prompt provided' }, { status: 400 })

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are an expert Midjourney prompt analyst. Analyze the prompt and return a JSON object only — no markdown, no preamble, no backticks.

Return exactly this structure:
{
  "autopsy": [{"token": string, "impact": "High"|"Medium"|"Low", "effect": string}],
  "styleDNA": string,
  "rewrite": string,
  "summary": string,
  "coherenceScore": number (0-100 — SCORING GUIDE, be honest and critical: 0-20 Incoherent = tokens clash or contradict; 21-40 Conflicted = some tension, hard to execute consistently; 41-60 Functional = workable but generic or unfocused; 61-75 Cohesive = clear unified aesthetic, most good prompts land here; 76-88 Masterful = precise, intentional, every token earns its place; 89-100 reserve only for exceptionally rare, flawless prompts. Most prompts score 55-78. A score above 85 should be genuinely rare.),
  "coherenceLabel": "Incoherent"|"Conflicted"|"Functional"|"Cohesive"|"Masterful",
  "coherenceReason": string (one sentence explaining the score, be specific about what works or what clashes)
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
