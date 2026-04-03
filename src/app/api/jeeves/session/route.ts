import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateSession, getSession, createSessionId } from '@/lib/jeeves/sessions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    const newId = createSessionId();
    return NextResponse.json({ sessionId: newId, persona: null });
  }
  const session = getSession(sessionId);
  return NextResponse.json({ sessionId, persona: session?.persona ?? null });
}

export async function POST(req: NextRequest) {
  let body: { sessionId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, action } = body;

  if (action === 'reset' && sessionId) {
    const session = getSession(sessionId);
    if (session) {
      session.persona = null;
      session.pendingQuery = null;
    }
  }

  if (action === 'create' || !sessionId) {
    const newId = createSessionId();
    getOrCreateSession(newId);
    return NextResponse.json({ sessionId: newId, persona: null });
  }

  return NextResponse.json({ success: true });
}
