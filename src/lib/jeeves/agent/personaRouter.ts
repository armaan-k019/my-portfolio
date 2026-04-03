import { Persona, SessionState } from '../types/index';

export const PERSONA_LABELS: Record<NonNullable<Persona>, string> = {
  sales: 'Sales / GTM',
  product: 'Product & Strategy',
  executive: 'Executive',
};

export function getPersonaSelectionPrompt(): string {
  return "Before I dive in - what perspective should I look at this from?";
}

export function getPersonaAcknowledgment(persona: Persona, competitorName: string | null): string {
  if (!persona) return '';
  const label = PERSONA_LABELS[persona];
  const competitorPart = competitorName ? ` about how **${competitorName}** stacks up` : '';
  return `Got it. From a **${label}** perspective, here's what you need to know${competitorPart}:\n\n---\n\n`;
}

export function resolvePersona(personaOverride: Persona | undefined, session: SessionState): Persona {
  if (personaOverride) return personaOverride;
  if (session.persona) return session.persona;
  return null;
}

export function applyPersonaToSession(session: SessionState, persona: Persona): void {
  session.persona = persona;
}

export function getPersonaLabel(persona: Persona): string {
  if (!persona) return 'General';
  return PERSONA_LABELS[persona];
}
