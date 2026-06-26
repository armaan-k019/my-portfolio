// Role Fit: semantic alignment between a candidate's demonstrated work and the
// pasted job description's requirements. This is NOT keyword matching. It embeds
// the JD requirement statements and the candidate work statements with the same
// client-side model used everywhere else (Xenova/all-MiniLM-L6-v2, no key) and
// scores fit as the aggregated max cosine similarity of their work against the
// requirements.
//
// The JD sets both the role bar (see jd.ts) and this Role Fit axis. With no JD
// loaded, Role Fit is neutral and this module is never called.

import { embedMany, embedderReady, cosine } from "./embed";
import { workStatementsOf, type Candidate } from "./data";

export interface FitRequirement {
  text: string;
  sim: number;      // best cosine of any of the candidate's work statements
  aligned: boolean; // sim cleared the alignment threshold
}
export interface FitDetail {
  fit: number; // 0 to 100
  requirements: FitRequirement[];
}

const ALIGN_THRESH = 0.4;

// Map an all-MiniLM cosine (about 0.15 unrelated to 0.75 close) to 0 to 100.
function simToScore(sim: number): number {
  return Math.max(0, Math.min(100, Math.round(((sim - 0.15) / (0.75 - 0.15)) * 100)));
}

// Split a job description into requirement statements (lines or sentences).
export function jdRequirements(jd: string): string[] {
  return jd
    .split(/\r?\n|(?<=[.!?])\s+|•|^[-*]\s*/m)
    .map((l) => l.replace(/^[-*•\s]+/, "").trim())
    .filter((l) => l.length > 12)
    .slice(0, 24);
}

// Compute Role Fit for a whole pool against the JD. Candidate work-statement
// vectors are cached by id so re-applying a different JD only re-embeds the JD.
export async function computeFit(
  candidates: Candidate[],
  jd: string,
  cache: Map<string, number[][]>,
  onStage?: (s: "loading-model" | "scoring") => void,
): Promise<Map<string, FitDetail>> {
  const requirements = jdRequirements(jd);
  const result = new Map<string, FitDetail>();
  if (requirements.length === 0) return result;

  onStage?.(embedderReady() ? "scoring" : "loading-model");
  const reqVecs = await embedMany(requirements);

  for (const c of candidates) {
    let stmtVecs = cache.get(c.id);
    if (!stmtVecs) {
      const statements = workStatementsOf(c);
      stmtVecs = statements.length ? await embedMany(statements) : [];
      cache.set(c.id, stmtVecs);
    }
    const reqs: FitRequirement[] = reqVecs.map((rv, i) => {
      const sim = stmtVecs!.length ? Math.max(...stmtVecs!.map((sv) => cosine(sv, rv))) : 0;
      return { text: requirements[i], sim, aligned: sim >= ALIGN_THRESH };
    });
    const meanSim = reqs.reduce((s, r) => s + r.sim, 0) / reqs.length;
    result.set(c.id, { fit: simToScore(meanSim), requirements: reqs });
  }
  return result;
}
