// The live scoring engine. This is the anti-wrapper core.
//
// The LLM does exactly one job (parsing messy text into structured roles and
// claims, in /api/parse). Everything here is real math and retrieval:
//   Work Quality (X)  deterministic substance signals over the demonstrated-work
//                     statements (quantified outcomes, ownership, scope, breadth),
//                     reduced where claims do not corroborate against LinkedIn.
//   Role Fit (Y)      computed separately in fit.ts against a pasted JD.
// No model is asked to rate a number. Pedigree (school, GPA, title) never enters
// Work Quality; it lives in the overlays and filters.

import { embedMany, embedderReady, cosine } from "./embed";
import { computeQuality, schoolPrestige, type Candidate, type ClaimBreakdown, type Factors, type Role } from "./data";

export interface ParsedCandidate {
  name: string;
  roles: Role[];
  claims: string[];   // resume work statements (self-asserted)
  evidence: string[]; // LinkedIn corroborating snippets
  education?: { school?: string; gpa?: number; major?: string };
}

export type ScoreStage = "loading-model" | "scoring";

const PRESENT = 2025 * 12 + 5;
function ym(d: string | null): number {
  if (!d) return PRESENT;
  const [y, m] = d.split("-").map(Number);
  return (y || 2025) * 12 + ((m || 1) - 1);
}

const SENIOR_RE = /\b(chief|c[teofx]o|vp|vice president|head of|director|founder)\b/i;

// Resume vs corroborating dates: flag overlaps, gaps, and tenures too short for
// the scope claimed. Each flag becomes a non-corroborating audit line, which
// lowers the corroborated work quality.
function dateFlags(roles: Role[]): string[] {
  const flags: string[] = [];
  const sorted = [...roles].sort((a, b) => ym(a.startDate) - ym(b.startDate));
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = ym(sorted[i - 1].endDate);
    const currStart = ym(sorted[i].startDate);
    if (currStart < prevEnd - 1) flags.push(`Overlapping dates between ${sorted[i - 1].title} and ${sorted[i].title}.`);
    if (currStart > prevEnd + 6) flags.push(`Unexplained gap of over six months before ${sorted[i].title}.`);
  }
  for (const r of sorted) {
    const tenure = ym(r.endDate) - ym(r.startDate);
    if (SENIOR_RE.test(r.title) && tenure < 12) {
      flags.push(`Only ${Math.max(0, tenure)} months in ${r.title}, short for the scope that title implies.`);
    }
  }
  return flags;
}

function bulletsOf(roles: Role[]): string[] {
  return roles.flatMap((r) => r.bullets);
}

// Score one parsed candidate into a Candidate. Work Quality (X) is computed
// from the demonstrated-work statements; the per-claim audit is computed from
// embedding similarity against the LinkedIn evidence and drives how much of that
// quality holds up under corroboration. Role Fit (Y) is computed later, per JD.
export async function scoreCandidate(
  parsed: ParsedCandidate,
  id: string,
  opts: { onStage?: (s: ScoreStage) => void } = {},
): Promise<Candidate> {
  const claims = parsed.claims.length ? parsed.claims : bulletsOf(parsed.roles);
  const evidence = parsed.evidence;

  // Embed claims and evidence in one pass; score each claim by its best match.
  let claimSims = claims.map(() => 0);
  if (claims.length && evidence.length) {
    opts.onStage?.(embedderReady() ? "scoring" : "loading-model");
    const vecs = await embedMany([...claims, ...evidence]);
    const claimVecs = vecs.slice(0, claims.length);
    const evidVecs = vecs.slice(claims.length);
    claimSims = claimVecs.map((cv) => Math.max(0, ...evidVecs.map((ev) => cosine(cv, ev))));
  }

  // Work Quality at face value, from substance signals (no pedigree).
  const qualityClaimed = computeQuality(claims).quality;

  // Per-claim audit, computed from the similarities (not authored).
  const THRESH = 0.42;
  const breakdown: ClaimBreakdown[] = claims.map((text, i) => {
    const sim = claimSims[i] ?? 0;
    const ok = evidence.length ? sim >= THRESH : false;
    const note = evidence.length
      ? ok
        ? `Matches the corroborating evidence (similarity ${sim.toFixed(2)}).`
        : `No close match in the corroborating evidence (best similarity ${sim.toFixed(2)}).`
      : "No corroborating source was provided, so this is self-asserted.";
    return { text, corroborated: ok, note };
  });
  for (const f of dateFlags(parsed.roles)) {
    breakdown.push({ text: f, corroborated: false, note: "Flagged by the date-consistency check." });
  }

  const roles = parsed.roles.length
    ? parsed.roles
    : [{ title: "Role", startDate: "2022-01", endDate: null, bullets: claims }];
  const first = roles[0]?.title ?? "Candidate";
  const last = roles[roles.length - 1]?.title ?? first;

  const edu = parsed.education;
  const factors: Factors | undefined = edu && (edu.school || edu.gpa || edu.major)
    ? { school: edu.school, schoolPrestige: schoolPrestige(edu.school), gpa: typeof edu.gpa === "number" ? edu.gpa : undefined, major: edu.major }
    : undefined;

  return {
    id,
    name: parsed.name || "Pasted candidate",
    headline: roles.length > 1 ? `${first} to ${last}` : first,
    roles,
    qualityClaimed,
    workStatements: claims,
    claims: breakdown,
    factors,
  };
}
