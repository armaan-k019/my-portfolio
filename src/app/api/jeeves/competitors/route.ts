import { NextResponse } from 'next/server';
import { getCompetitorNames } from '@/lib/jeeves/config/competitors';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(getCompetitorNames());
}
