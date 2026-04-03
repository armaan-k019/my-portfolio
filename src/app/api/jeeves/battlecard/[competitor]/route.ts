import { NextRequest, NextResponse } from 'next/server';
import { getCacheEntry, refreshBattlecard } from '@/lib/jeeves/agent/battlecardCache';
import { generateContextualBattlecard } from '@/lib/jeeves/agent/battlecardGenerator';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BATTLECARD_STALE_MS = 24 * 60 * 60 * 1000;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ competitor: string }> }) {
  const { competitor } = await params;
  const competitorName = decodeURIComponent(competitor);
  const entry = getCacheEntry(competitorName);

  if (entry) {
    const age = Date.now() - entry.generatedAt;
    if (age > BATTLECARD_STALE_MS) {
      refreshBattlecard(competitorName).catch((err) => {
        console.error(`[BattlecardAPI] Background refresh failed for ${competitorName}:`, err);
      });
    }
    return NextResponse.json(entry.data);
  }

  try {
    const battlecard = await refreshBattlecard(competitorName);
    return NextResponse.json(battlecard);
  } catch (err) {
    console.error(`[BattlecardAPI] Generation failed for ${competitorName}:`, err);
    return NextResponse.json({ error: `Failed to generate battlecard for ${competitorName}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ competitor: string }> }) {
  const { competitor } = await params;
  const competitorName = decodeURIComponent(competitor);

  let body: { dealContext?: string; prospectDetails?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { dealContext, prospectDetails } = body;
  if (!dealContext || !prospectDetails) {
    return NextResponse.json({ error: 'dealContext and prospectDetails are required' }, { status: 400 });
  }

  try {
    const battlecard = await generateContextualBattlecard(competitorName, dealContext, prospectDetails);
    return NextResponse.json(battlecard);
  } catch (err) {
    console.error(`[BattlecardAPI] Contextual generation failed for ${competitorName}:`, err);
    return NextResponse.json({ error: 'Failed to generate contextual battlecard' }, { status: 500 });
  }
}
