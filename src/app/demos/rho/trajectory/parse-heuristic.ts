// Prompt 6, Part B: the no-key fallback parser.
//
// A lightweight, deterministic parser used when ANTHROPIC_API_KEY is absent (or
// the model call fails). It splits on lines and detects titles, dates, and
// bullets with simple patterns so the input still works without a key. Shared
// by the API route; it has no server-only dependencies.

import type { Role } from "./data";

export interface ParsedShape {
  name: string;
  roles: Role[];
  claims: string[];
  evidence: string[];
  education?: { school?: string; gpa?: number; major?: string };
}

// "Jan 2021", "2021-03", "March 2021", "2021" to "YYYY-MM".
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
function toYM(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (/present|current|now/.test(t)) return null;
  const iso = t.match(/(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(Math.min(12, Math.max(1, Number(iso[2])))).padStart(2, "0")}`;
  const named = t.match(/([a-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (named && MONTHS[named[1]]) return `${named[2]}-${String(MONTHS[named[1]]).padStart(2, "0")}`;
  const year = t.match(/\b(19|20)\d{2}\b/);
  if (year) return `${year[0]}-01`;
  return null;
}

// A line looks like a role header if it contains a date range.
const RANGE = /(\b(?:19|20)\d{2}\b|present|current)\s*(?:-|to|\u2013|\u2014)\s*(\b(?:19|20)\d{2}\b|present|current)/i;

function looksLikeTitle(line: string): boolean {
  return /\b(engineer|developer|manager|director|lead|head|vp|president|designer|scientist|analyst|associate|consultant|architect|founder|officer|specialist|coordinator|executive|pm|product)\b/i.test(line);
}

export function parseHeuristic(resume: string, linkedin: string): ParsedShape {
  const resumeLines = resume.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Name: first short line with no digits.
  const name =
    resumeLines.find((l) => l.length <= 40 && !/\d/.test(l) && /^[A-Za-z][A-Za-z .'-]+$/.test(l)) ?? "Pasted candidate";

  const roles: Role[] = [];
  const claims: string[] = [];

  for (let i = 0; i < resumeLines.length; i++) {
    const line = resumeLines[i];
    const isBullet = /^[-•*•]/.test(line);
    if (isBullet) {
      const text = line.replace(/^[-•*•]\s*/, "").trim();
      if (text) {
        claims.push(text);
        if (roles.length) roles[roles.length - 1].bullets.push(text);
      }
      continue;
    }

    const range = line.match(RANGE);
    if (range && (looksLikeTitle(line) || roles.length === 0)) {
      const start = toYM(range[1]) ?? "2022-01";
      const end = toYM(range[2]);
      // Title is the text before the date range, trimmed of separators.
      const title = line.slice(0, range.index ?? 0).replace(/[,|@\u2013\u2014-]+\s*$/, "").replace(/\bat\b\s*$/i, "").trim() || line.replace(RANGE, "").trim() || "Role";
      roles.push({ title, startDate: start, endDate: end, bullets: [] });
    } else if (looksLikeTitle(line) && line.length < 80) {
      roles.push({ title: line, startDate: "2022-01", endDate: null, bullets: [] });
    } else if (line.length > 24) {
      // Prose line, treat as a claim.
      claims.push(line);
    }
  }

  if (roles.length === 0) {
    roles.push({ title: "Role", startDate: "2022-01", endDate: null, bullets: claims.slice(0, 4) });
  }

  const evidence = linkedin
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 12);

  return {
    name,
    roles,
    claims: claims.length ? claims : roles.flatMap((r) => r.bullets),
    evidence,
    education: extractEducation(resume),
  };
}

// Pull school, GPA, and major from the resume text when present. Anything not
// found stays undefined so the overlays do not guess.
function extractEducation(resume: string): { school?: string; gpa?: number; major?: string } {
  const edu: { school?: string; gpa?: number; major?: string } = {};
  const schoolLine = resume
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /\b(university|college|institute|polytechnic|school of)\b/i.test(l) && l.length < 80);
  if (schoolLine) edu.school = schoolLine.replace(/\b(b\.?s\.?|b\.?a\.?|m\.?s\.?|mba|phd|bachelor[a-z' ]*|master[a-z' ]*).*/i, "").replace(/[,|].*$/, "").trim() || schoolLine;

  const gpa = resume.match(/\bgpa[:\s]*([0-4](?:\.\d{1,2})?)/i);
  if (gpa) edu.gpa = Math.min(4, Number(gpa[1]));

  const major = resume.match(/\b(?:b\.?s\.?|b\.?a\.?|bachelor(?:'s)?(?: of)?|major(?:ed)?(?: in)?)\s+(?:of\s+|in\s+)?([A-Z][A-Za-z ]{2,30})/);
  if (major) edu.major = major[1].trim();

  return edu;
}
