// Job description to role bar. The JD sets WHERE the bar sits, it does not
// keyword-match resumes. A more senior or higher-scope role raises the Work
// Quality bar (X), so stronger demonstrated work is needed to clear it. A role
// that emphasizes proven, owned, measurable impact raises the Role Fit bar (Y),
// so closer alignment is needed. The candidates never move; only the bar does
// (and Role Fit recomputes, handled in fit.ts).

import { ROLE_BAR, type RoleBarConfig } from "./data";

export interface DerivedBar {
  bar: RoleBarConfig;
  summary: string;
}

// Highest seniority signal present in the JD maps to a Work Quality bar.
const SENIORITY_BARS: { re: RegExp; quality: number; label: string }[] = [
  { re: /\b(chief|c[teofx]o|vp|vice president|head of|svp)\b/i, quality: 75, label: "Executive" },
  { re: /\bdirector\b/i, quality: 70, label: "Director" },
  { re: /\b(principal|staff)\b/i, quality: 66, label: "Principal or staff" },
  { re: /\b(manager|lead)\b/i, quality: 64, label: "Manager or lead" },
  { re: /\bsenior\b/i, quality: 60, label: "Senior" },
];

// Words that signal a role wants proven, owned, measurable impact.
const IMPACT_RE = /\b(proven|owned?|ownership|measurable|quantif\w*|track record|demonstrated|results|impact|metrics|p&l|accountab\w*|deliver\w*)\b/gi;

// A rough domain guess so the summary reads naturally.
const DOMAINS: { re: RegExp; label: string }[] = [
  { re: /\b(engineer|engineering|software|developer)\b/i, label: "Engineering" },
  { re: /\bproduct\b/i, label: "Product" },
  { re: /\bdesign\b/i, label: "Design" },
  { re: /\b(sales|account executive|revenue)\b/i, label: "Sales" },
  { re: /\b(data|analytics|scientist)\b/i, label: "Data" },
  { re: /\b(marketing|growth|demand)\b/i, label: "Marketing" },
];

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function deriveRoleBar(jd: string): DerivedBar {
  const text = jd.trim();
  if (!text) return { bar: { ...ROLE_BAR }, summary: "No role loaded. Default bar at 55 / 55." };

  let quality = 55;
  let seniorityLabel = "Mid-level";
  for (const s of SENIORITY_BARS) {
    if (s.re.test(text)) {
      quality = s.quality;
      seniorityLabel = s.label;
      break;
    }
  }

  const impactHits = (text.match(IMPACT_RE) ?? []).length;
  const fit = clamp(55 + Math.min(15, impactHits * 3), 55, 72);

  const domain = DOMAINS.find((d) => d.re.test(text))?.label ?? "";
  const roleLabel = [seniorityLabel, domain].filter(Boolean).join(" ") + " role";

  const summary = `${roleLabel}: Work Quality bar set to ${quality}, Role Fit bar set to ${fit}.`;
  return { bar: { x: quality, y: fit }, summary };
}
