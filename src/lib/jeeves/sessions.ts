import { randomUUID } from 'crypto';
import { SessionState } from './types/index';

// In-memory session store shared across API route invocations (module-level singleton)
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

const sessions = new Map<string, SessionState>();

export function getOrCreateSession(sessionId: string): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }
  const session: SessionState = {
    persona: null,
    pendingQuery: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function createSessionId(): string {
  return randomUUID();
}

// Cleanup expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 30 * 60 * 1000);
