import { NextRequest } from 'next/server';
import { runPipeline } from '@/lib/jeeves/agent/orchestrator';
import { getOrCreateSession, createSessionId } from '@/lib/jeeves/sessions';
import { ChatRequest, Persona, SSEEvent } from '@/lib/jeeves/types/index';

export const runtime = 'nodejs';
export const maxDuration = 180; // 3 minutes

export async function POST(req: NextRequest) {
  let body: { message?: string; sessionId?: string; personaOverride?: Persona };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { message, sessionId, personaOverride } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'message is required and must be a non-empty string' }), { status: 400 });
  }

  const validPersonas: Array<NonNullable<Persona>> = ['sales', 'product', 'executive'];
  const persona: Persona = personaOverride && validPersonas.includes(personaOverride as NonNullable<Persona>)
    ? (personaOverride as NonNullable<Persona>)
    : null;

  const sid = sessionId && typeof sessionId === 'string' ? sessionId : createSessionId();
  const session = getOrCreateSession(sid);

  const chatRequest: ChatRequest = {
    message: message.trim(),
    sessionId: sid,
    personaOverride: persona,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Keep-alive ping every 15 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15_000);

      function sendSSE(event: SSEEvent): void {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected
        }
      }

      try {
        const result = await runPipeline(chatRequest, session, sendSSE);
        sendSSE({ type: 'reply_complete', data: result });
      } catch (err) {
        console.error('[JeevesAPI] Unhandled pipeline error:', err);
        sendSSE({ type: 'error', message: 'An unexpected server error occurred. Please try again.' });
      } finally {
        clearInterval(pingInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Session-Id': sid,
    },
  });
}
