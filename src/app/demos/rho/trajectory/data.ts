// Candidate Trajectory Visualization, Part Two of the Rho demo.
//
// Production note: in a real deployment this data reads straight from the
// Ashby hiring pipeline (no ATS integration is wired up in this demo). The
// authored pool below is a deterministic spine so the demo always tells the
// same story and never waits on a network call or a cold model load.
//
// The core idea: a resume is now an adversarial, AI-polished document, so the
// tool does not extract claims, it audits them.

// ─── Axes ────────────────────────────────────────────────────────────────
//
// X = Work Quality: demonstrated substance, independent of pedigree. Computed
//   from the parsed resume by the embeddings engine plus deterministic signals
//   (quantified outcomes, scope of impact, ownership language, breadth). It
//   deliberately excludes school, company brand, GPA, and title prestige; those
//   are pedigree, handled separately as overlays and filters.
// Y = Role Fit: semantic alignment between the candidate's demonstrated work and
//   the pasted job description's requirements (max cosine of their work against
//   the JD requirements, via embeddings, not keyword matching). Role Fit is only
//   defined once a JD is loaded; with no JD it is neutral.
//
// Both axes run 0 to 100. Quadrant boundaries are set by ROLE_BAR, not zero, so
// a position reads as above or below the role bar. The JD sets the bar AND the
// Role Fit axis.

// A plotted point. quality is the X axis, fit is the Y axis.
export interface AxisPosition {
  quality: number; // 0 to 100
  fit: number;     // 0 to 100, neutral 50 when no JD is loaded
}

export interface Role {
  title: string;
  startDate: string;        // "YYYY-MM"
  endDate: string | null;   // null means present
  bullets: string[];
}

// Per-claim breakdown so the detail panel (Prompt 4) can explain the score
// rather than presenting it as a black box.
export interface ClaimBreakdown {
  text: string;
  corroborated: boolean;
  note: string;
}

// Credential factors. These are OVERLAYS ONLY: they annotate a dot, they never
// move its Work Quality or Role Fit. Unknown fields stay undefined rather than
// being guessed, so overlays simply do not draw when there is nothing to show.
export interface Factors {
  school?: string;
  schoolPrestige?: number; // 0 to 100, drives the prestige halo intensity
  gpa?: number;            // 0 to 4
  extracurricular?: string; // a notable extracurricular, presence draws a marker
  major?: string;          // used by filters, not as an overlay
}

export interface Candidate {
  id: string;
  name: string;
  headline: string;
  roles: Role[];
  // X axis at face value. The corroborated quality is derived from the claim
  // audit below (claims that do not hold up reduce demonstrated quality).
  qualityClaimed: number;
  workStatements?: string[];  // demonstrated-work statements for Role Fit; defaults to claim texts
  claims: ClaimBreakdown[];   // corroboration audit, drives corroborated quality
  factors?: Factors;
  background?: boolean;       // true for anonymous density dots (smaller, unlabeled)
}

// The statements embedded against the JD for Role Fit. Defaults to the claim
// texts when a candidate does not carry an explicit set.
export function workStatementsOf(c: Candidate): string[] {
  return c.workStatements && c.workStatements.length ? c.workStatements : c.claims.map((x) => x.text);
}

// ─── Work Quality (deterministic, no pedigree) ──────────────────────────────
// Substance signals read off the demonstrated-work statements. Used to compute
// quality for pasted candidates and to explain the score in the detail panel.
// School, company brand, GPA, and title prestige are intentionally NOT here.
export interface QualitySignals {
  quantified: number; // 0 to 1, share of statements with numbers, metrics, or scale
  ownership: number;  // 0 to 1, owned/led/built versus supported/assisted
  scope: number;      // 0 to 1, team, org, platform, strategy language
  breadth: number;    // 0 to 1, how much distinct demonstrated work there is
}

const OWN_VERBS = /\b(owned?|led|built|founded|launched|shipped|drove|created|defined|architected|established|scaled)\b/i;
const WEAK_VERBS = /\b(supported|assisted|helped|contributed|participated|involved|worked on)\b/i;
const QUANT_RE = /(\d|\bpercent\b|%|\$|\bmillion\b|\bbillion\b|\bk\b|\bx\b)/i;
const SCOPE_RE = /\b(team|org|organization|company|platform|cross[- ]functional|multi[- ]year|strategy|roadmap|p&l|department|division)\b/i;

export function computeQuality(statements: string[]): { quality: number; signals: QualitySignals } {
  const n = statements.length;
  if (n === 0) return { quality: 30, signals: { quantified: 0, ownership: 0, scope: 0, breadth: 0 } };
  let quant = 0, own = 0, weak = 0, scope = 0;
  for (const s of statements) {
    if (QUANT_RE.test(s)) quant++;
    if (OWN_VERBS.test(s)) own++;
    if (WEAK_VERBS.test(s)) weak++;
    if (SCOPE_RE.test(s)) scope++;
  }
  const signals: QualitySignals = {
    quantified: quant / n,
    ownership: Math.max(0, Math.min(1, (own - weak) / n + 0.3)),
    scope: scope / n,
    breadth: Math.min(1, n / 5),
  };
  const quality = Math.max(4, Math.min(99, Math.round(100 * (0.3 * signals.quantified + 0.3 * signals.ownership + 0.25 * signals.scope + 0.15 * signals.breadth))));
  return { quality, signals };
}

// Share of the claim audit that corroborated. Drives the corroborated quality:
// claimed work that a second source does not back counts for less.
export function corroborationRatio(c: Candidate): number {
  if (c.claims.length === 0) return 1;
  return c.claims.filter((x) => x.corroborated).length / c.claims.length;
}

export function qualityClaimed(c: Candidate): number {
  return c.qualityClaimed;
}

export function qualityCorroborated(c: Candidate): number {
  return Math.round(c.qualityClaimed * (0.3 + 0.7 * corroborationRatio(c)));
}

// X position for the current evidence mode.
export type SourceMode = "resume" | "both";
export function qualityFor(c: Candidate, mode: SourceMode): number {
  return mode === "both" ? qualityCorroborated(c) : qualityClaimed(c);
}

// Neutral Role Fit when no JD is loaded.
export const NEUTRAL_FIT = 50;

// Total years of experience across a candidate's roles. Used by filters only,
// never by scoring. Open-ended roles run to the present anchor.
const PRESENT_YM = 2025 * 12 + 5;
function ymOf(d: string | null): number {
  if (!d) return PRESENT_YM;
  const [y, m] = d.split("-").map(Number);
  return (y || 2025) * 12 + ((m || 1) - 1);
}
export function experienceYears(roles: Role[]): number {
  if (roles.length === 0) return 0;
  const start = Math.min(...roles.map((r) => ymOf(r.startDate)));
  const end = Math.max(...roles.map((r) => ymOf(r.endDate)));
  return Math.max(0, Math.round(((end - start) / 12) * 10) / 10);
}

// A small lookup of well-known schools to a prestige score. Used to give the
// prestige overlay something to show for pasted candidates whose school we
// recognize. Unknown schools return undefined (no halo, no guessing).
const SCHOOL_PRESTIGE: { re: RegExp; score: number }[] = [
  { re: /\b(stanford|harvard|mit|princeton|yale|caltech)\b/i, score: 97 },
  { re: /\b(columbia|berkeley|uc berkeley|penn|cornell|brown|dartmouth|duke|chicago|northwestern)\b/i, score: 90 },
  { re: /\b(carnegie mellon|cmu|georgia tech|michigan|ucla|usc|nyu|ut austin|illinois|wisconsin|risd)\b/i, score: 80 },
  { re: /\b(university|college|institute|polytechnic|state)\b/i, score: 60 },
];
export function schoolPrestige(name?: string): number | undefined {
  if (!name) return undefined;
  for (const s of SCHOOL_PRESTIGE) if (s.re.test(name)) return s.score;
  return undefined;
}

// ─── Role bar (tunable quadrant boundaries) ────────────────────────────────
//
// Axes cross here, not at zero. Raise the bar to model a more senior role and
// the quadrants shift with it.
export interface RoleBarConfig {
  x: number; // Work Quality threshold
  y: number; // Role Fit threshold
}

export const ROLE_BAR: RoleBarConfig = { x: 55, y: 55 };

// ─── Quadrant helper ───────────────────────────────────────────────────────
//
// X = Work Quality, Y = Role Fit. The bar (set by the JD) decides above/below.

export type Quadrant =
  | "Strong and Aligned"
  | "Aligned but Light"
  | "Strong but Off-target"
  | "Low Signal";

export function quadrantOf(pos: AxisPosition, bar: RoleBarConfig = ROLE_BAR): Quadrant {
  const strong = pos.quality >= bar.x;
  const aligned = pos.fit >= bar.y;
  if (strong && aligned) return "Strong and Aligned";
  if (!strong && aligned) return "Aligned but Light";
  if (strong && !aligned) return "Strong but Off-target";
  return "Low Signal";
}

// Confident, professional palette (not neon). One color per quadrant, with a
// matching low-opacity tint for the quadrant background fills.
export const QUADRANT_COLORS: Record<Quadrant, string> = {
  "Strong and Aligned": "#2E7D6B",     // teal green, strong work that fits
  "Aligned but Light": "#3F6CB5",      // steady blue, fits but thin
  "Strong but Off-target": "#C0792B",  // warm amber, substantial but wrong role
  "Low Signal": "#8A7D6B",             // muted taupe
};

export const QUADRANT_TINTS: Record<Quadrant, string> = {
  "Strong and Aligned": "rgba(46,125,107,0.06)",
  "Aligned but Light": "rgba(63,108,181,0.06)",
  "Strong but Off-target": "rgba(192,121,43,0.06)",
  "Low Signal": "rgba(138,125,107,0.05)",
};

export function colorOf(pos: AxisPosition, bar: RoleBarConfig = ROLE_BAR): string {
  return QUADRANT_COLORS[quadrantOf(pos, bar)];
}

// ─── Example candidate pool (fixed, hand-curated) ────────────────────────────
//
// One deliberate set, not random. Work Quality (X) is authored; Role Fit (Y) is
// computed live against a pasted JD. The set is designed so that a relevant
// engineering or product role lights up all four quadrants:
//   Strong and Aligned   Maya, Raj, Priya (high quality, on-field).
//   Strong but Off-target Elena (mechanical), Marcus (clinical): strong work,
//                         wrong field for a software role, so Role Fit drops.
//                         This is the key teaching case.
//   Aligned but Light     Tom, Ana (on-field, thinner work).
//   Low Signal            Derek (off-field and modest).
//   Jordan reads strong on paper but barely corroborates; toggle LinkedIn to
//   watch his Work Quality collapse left.
// A couple of fields are mixed in on purpose so Role Fit visibly separates
// on-field from off-field candidates.

export const CANDIDATES: Candidate[] = [
  {
    id: "maya-chen",
    name: "Maya Chen",
    headline: "Software Engineer to Director of Engineering, payments",
    roles: [
      { title: "Software Engineer", startDate: "2017-06", endDate: "2019-08", bullets: ["Shipped a card tokenization service used across checkout."] },
      { title: "Senior Engineer", startDate: "2019-08", endDate: "2021-03", bullets: ["Owned ledger reliability for the payments platform."] },
      { title: "Engineering Lead", startDate: "2021-03", endDate: "2023-01", bullets: ["Grew the payments engineering team."] },
      { title: "Director of Engineering", startDate: "2023-01", endDate: null, bullets: ["Set platform architecture across teams."] },
    ],
    qualityClaimed: 88,
    claims: [
      { text: "Owned ledger reliability for the payments platform and cut incident rate by 60 percent.", corroborated: true, note: "A conference talk and LinkedIn posts corroborate." },
      { text: "Grew the payments engineering team from 4 to 19 engineers.", corroborated: true, note: "Team size referenced in two recommendations." },
      { text: "Defined a multi-year backend platform architecture across three teams.", corroborated: true, note: "Title and tenure align across sources." },
      { text: "Led the migration of the core transaction service to a new stack.", corroborated: true, note: "Project link and posts confirm the launch." },
    ],
    factors: { school: "Stanford", schoolPrestige: 97, gpa: 3.8, extracurricular: "ACM chapter lead", major: "Computer Science" },
  },
  {
    id: "raj-patel",
    name: "Raj Patel",
    headline: "Staff Software Engineer, backend infrastructure",
    roles: [
      { title: "Software Engineer", startDate: "2016-08", endDate: "2019-05", bullets: ["Built backend services for core APIs."] },
      { title: "Senior Software Engineer", startDate: "2019-05", endDate: "2022-02", bullets: ["Owned reliability for a high traffic system."] },
      { title: "Staff Software Engineer", startDate: "2022-02", endDate: null, bullets: ["Drives the infrastructure reliability roadmap."] },
    ],
    qualityClaimed: 84,
    claims: [
      { text: "Built a distributed job scheduler handling 2 million tasks per day.", corroborated: true, note: "Open source commits corroborate the work." },
      { text: "Reduced API p99 latency by 45 percent across core backend services.", corroborated: true, note: "An engineering blog post confirms the result." },
      { text: "Owned the service reliability roadmap for the infrastructure org.", corroborated: true, note: "Recommendations reference the ownership." },
    ],
    factors: { school: "Carnegie Mellon", schoolPrestige: 88, gpa: 3.7, major: "Computer Science" },
  },
  {
    id: "priya-raman",
    name: "Priya Raman",
    headline: "Senior Software Engineer, observability",
    roles: [
      { title: "Software Engineer", startDate: "2016-04", endDate: "2018-10", bullets: ["Worked on the metrics ingestion path."] },
      { title: "Senior Software Engineer", startDate: "2018-10", endDate: null, bullets: ["Maintains the core metrics pipeline."] },
    ],
    qualityClaimed: 64,
    claims: [
      { text: "Maintained the core metrics and observability pipeline at scale.", corroborated: true, note: "Open source commits and talks corroborate." },
      { text: "Built alerting that cut mean time to detection by 30 percent.", corroborated: true, note: "An internal case study, referenced on LinkedIn, confirms it." },
      { text: "Mentored engineers on backend on-call practices.", corroborated: true, note: "Recommendations reference the mentorship." },
    ],
    factors: { school: "UT Austin", schoolPrestige: 80, gpa: 3.7, extracurricular: "Open source maintainer", major: "Computer Science" },
  },
  {
    id: "sofia-marenko",
    name: "Sofia Marenko",
    headline: "Lead Data Scientist, fintech risk",
    roles: [
      { title: "Data Scientist", startDate: "2018-09", endDate: "2021-02", bullets: ["Built models for the lending portfolio."] },
      { title: "Lead Data Scientist", startDate: "2021-02", endDate: null, bullets: ["Owns risk modeling for the product."] },
    ],
    qualityClaimed: 80,
    claims: [
      { text: "Built a machine learning fraud detection model that cut losses by 35 percent.", corroborated: true, note: "A patent filing and a post corroborate." },
      { text: "Owns the risk modeling roadmap for the lending product.", corroborated: true, note: "Title history aligns across sources." },
      { text: "Shipped a production scoring pipeline serving live traffic.", corroborated: true, note: "Recommendations reference the system." },
      { text: "Presented at two industry machine learning conferences.", corroborated: false, note: "Only one talk is verifiable, the second was not found." },
    ],
    factors: { school: "Georgia Tech", schoolPrestige: 80, gpa: 3.6, major: "Statistics" },
  },
  {
    id: "elena-cruz",
    name: "Elena Cruz",
    headline: "Senior Mechanical Engineer, robotics hardware",
    roles: [
      { title: "Mechanical Engineer", startDate: "2016-07", endDate: "2020-01", bullets: ["Designed mechanical assemblies for robotics."] },
      { title: "Senior Mechanical Engineer", startDate: "2020-01", endDate: null, bullets: ["Leads hardware mechanical design."] },
    ],
    qualityClaimed: 86,
    claims: [
      { text: "Led the mechanical design of a six-axis robotic arm from prototype to production.", corroborated: true, note: "A patent and a product page corroborate." },
      { text: "Cut actuator failure rate by 50 percent through a tolerance redesign.", corroborated: true, note: "An engineering writeup confirms it." },
      { text: "Owned the thermal and structural analysis for the hardware platform.", corroborated: true, note: "Recommendations reference the ownership." },
      { text: "Managed a team of five mechanical and manufacturing engineers.", corroborated: true, note: "Team size confirmed on LinkedIn." },
    ],
    factors: { school: "MIT", schoolPrestige: 97, gpa: 3.9, extracurricular: "Formula SAE captain", major: "Mechanical Engineering" },
  },
  {
    id: "marcus-lee",
    name: "Marcus Lee",
    headline: "Clinical Research Nurse, oncology trials",
    roles: [
      { title: "Registered Nurse", startDate: "2015-06", endDate: "2019-03", bullets: ["Delivered bedside oncology care."] },
      { title: "Clinical Research Nurse", startDate: "2019-03", endDate: null, bullets: ["Coordinates clinical trials."] },
    ],
    qualityClaimed: 78,
    claims: [
      { text: "Coordinated three phase II oncology clinical trials across 120 patients.", corroborated: true, note: "Trial registry entries corroborate." },
      { text: "Owned protocol compliance and reduced data query rates by 30 percent.", corroborated: true, note: "A site audit confirms the improvement." },
      { text: "Trained eight new research nurses on trial procedures.", corroborated: true, note: "Recommendations reference the training." },
    ],
    factors: { school: "Johns Hopkins University", schoolPrestige: 60, gpa: 3.7, major: "Nursing" },
  },
  {
    id: "tom-becker",
    name: "Tom Becker",
    headline: "Junior Frontend Developer",
    roles: [
      { title: "Frontend Developer", startDate: "2022-01", endDate: null, bullets: ["Builds UI components."] },
    ],
    qualityClaimed: 42,
    claims: [
      { text: "Built React UI components from designs for the web app.", corroborated: true, note: "Commit history confirms the contributions." },
      { text: "Fixed bugs and assisted on feature releases.", corroborated: true, note: "Corroborated, but this is execution level scope." },
      { text: "Supported the team during sprint work.", corroborated: false, note: "No corroborating detail beyond the resume." },
    ],
    factors: { school: "State University", schoolPrestige: 50, gpa: 3.0, major: "Computer Science" },
  },
  {
    id: "ana-velez",
    name: "Ana Velez",
    headline: "Associate Product Designer",
    roles: [
      { title: "Product Designer", startDate: "2021-04", endDate: null, bullets: ["Designs product flows."] },
    ],
    qualityClaimed: 50,
    claims: [
      { text: "Designed onboarding flows for the mobile product.", corroborated: true, note: "A case study corroborates." },
      { text: "Ran usability tests with a dozen users.", corroborated: true, note: "A research summary confirms it." },
      { text: "Supported upkeep of the shared design system.", corroborated: true, note: "Corroborated, but a supporting role." },
    ],
    factors: { school: "RISD", schoolPrestige: 80, gpa: 3.5, major: "Industrial Design" },
  },
  {
    id: "derek-olsson",
    name: "Derek Olsson",
    headline: "Account Executive, SaaS sales",
    roles: [
      { title: "Account Executive", startDate: "2019-05", endDate: "2022-03", bullets: ["Carried a sales quota."] },
      { title: "Senior Account Executive", startDate: "2022-03", endDate: null, bullets: ["Handles mid-market accounts."] },
    ],
    qualityClaimed: 48,
    claims: [
      { text: "Carried a mid-market sales quota and closed a large account.", corroborated: true, note: "A press release confirms the account." },
      { text: "Supported renewals and assisted the sales team.", corroborated: false, note: "No corroborating detail beyond the resume." },
      { text: "Ran outreach across email and calls.", corroborated: true, note: "Execution level scope, corroborated." },
    ],
    factors: { school: "Ohio State", schoolPrestige: 60, gpa: 3.2, major: "Communications" },
  },
  {
    id: "jordan-ellis",
    name: "Jordan Ellis",
    headline: "Associate PM to VP Product in under four years",
    roles: [
      { title: "Associate Product Manager", startDate: "2019-01", endDate: "2020-06", bullets: ["Supported roadmap research."] },
      { title: "Product Manager", startDate: "2020-06", endDate: "2021-09", bullets: ["Shipped an onboarding redesign."] },
      { title: "Senior Product Manager", startDate: "2021-09", endDate: "2022-08", bullets: ["Led growth discovery."] },
      { title: "VP Product", startDate: "2022-08", endDate: null, bullets: ["Claims org leadership."] },
    ],
    qualityClaimed: 86,
    claims: [
      { text: "Drove the product from 0 to 10M ARR.", corroborated: false, note: "No corroborating source mentions revenue." },
      { text: "Promoted to VP Product in under four years.", corroborated: false, note: "LinkedIn shows the current title as Senior PM." },
      { text: "Led a 30 person org across product and design.", corroborated: false, note: "No direct reports listed and a 9 month tenure." },
      { text: "Shipped a flagship onboarding redesign.", corroborated: true, note: "A post and a project link confirm the launch." },
    ],
    factors: { school: "Harvard", schoolPrestige: 96, gpa: 3.9, extracurricular: "Debate team captain", major: "Economics" },
  },
  {
    id: "lin-zhao",
    name: "Lin Zhao",
    headline: "Senior Software Engineer, ML platform",
    roles: [
      { title: "Software Engineer", startDate: "2017-08", endDate: "2020-06", bullets: ["Built data pipelines for ML."] },
      { title: "Senior Software Engineer", startDate: "2020-06", endDate: null, bullets: ["Owns the ML platform."] },
    ],
    qualityClaimed: 82,
    claims: [
      { text: "Built the feature store powering all production machine learning models.", corroborated: true, note: "Open source commits corroborate." },
      { text: "Cut model training time by 40 percent with a data pipeline rewrite.", corroborated: true, note: "An engineering post confirms it." },
      { text: "Owned the model serving infrastructure across teams.", corroborated: true, note: "Recommendations reference the ownership." },
    ],
    factors: { school: "UC Berkeley", schoolPrestige: 90, gpa: 3.8, major: "Computer Science" },
  },
  {
    id: "victor-quan",
    name: "Victor Quan",
    headline: "Staff Software Engineer, application security",
    roles: [
      { title: "Security Engineer", startDate: "2016-03", endDate: "2019-09", bullets: ["Hardened core services."] },
      { title: "Senior Security Engineer", startDate: "2019-09", endDate: "2022-05", bullets: ["Led security reviews."] },
      { title: "Staff Software Engineer", startDate: "2022-05", endDate: null, bullets: ["Owns application security."] },
    ],
    qualityClaimed: 85,
    claims: [
      { text: "Built the authentication and authorization platform used company wide.", corroborated: true, note: "Internal docs referenced on LinkedIn corroborate." },
      { text: "Led the response to a critical security incident, cutting the exposure window by 80 percent.", corroborated: true, note: "A postmortem write up confirms it." },
      { text: "Owns the application security roadmap across engineering.", corroborated: true, note: "Recommendations reference the ownership." },
    ],
    factors: { school: "Caltech", schoolPrestige: 97, gpa: 3.8, major: "Computer Science" },
  },
  {
    id: "hannah-okafor",
    name: "Hannah Okafor",
    headline: "Product Manager, payments",
    roles: [
      { title: "Associate Product Manager", startDate: "2018-07", endDate: "2020-09", bullets: ["Ran roadmap research."] },
      { title: "Product Manager", startDate: "2020-09", endDate: null, bullets: ["Owns the payouts product."] },
    ],
    qualityClaimed: 70,
    claims: [
      { text: "Led the launch of the merchant payouts product to 5000 businesses.", corroborated: true, note: "A launch post corroborates." },
      { text: "Owned the payments roadmap and grew the line by 25 percent.", corroborated: true, note: "Recommendations reference the ownership." },
      { text: "Ran discovery across 40 merchant interviews.", corroborated: true, note: "A case study confirms it." },
    ],
    factors: { school: "University of Michigan", schoolPrestige: 80, gpa: 3.6, major: "Economics" },
  },
  {
    id: "grace-ito",
    name: "Grace Ito",
    headline: "Senior UX Designer, commerce",
    roles: [
      { title: "Product Designer", startDate: "2017-02", endDate: "2021-01", bullets: ["Designed commerce flows."] },
      { title: "Senior UX Designer", startDate: "2021-01", endDate: null, bullets: ["Owns the design system."] },
    ],
    qualityClaimed: 68,
    claims: [
      { text: "Led the redesign of the checkout experience, lifting conversion by 12 percent.", corroborated: true, note: "A case study and posts corroborate." },
      { text: "Owned the design system across web and mobile.", corroborated: true, note: "Recommendations reference the ownership." },
      { text: "Ran accessibility audits to WCAG AA.", corroborated: true, note: "A public audit confirms it." },
    ],
    factors: { school: "RISD", schoolPrestige: 80, gpa: 3.6, major: "Industrial Design" },
  },
  {
    id: "diego-romero",
    name: "Diego Romero",
    headline: "Senior Civil Engineer, structures",
    roles: [
      { title: "Civil Engineer", startDate: "2015-05", endDate: "2019-08", bullets: ["Designed structural systems."] },
      { title: "Senior Civil Engineer", startDate: "2019-08", endDate: null, bullets: ["Leads structural design."] },
    ],
    qualityClaimed: 80,
    claims: [
      { text: "Led the structural design of a 40 story commercial tower.", corroborated: true, note: "Public project records corroborate." },
      { text: "Managed a 12 million dollar construction budget.", corroborated: true, note: "A trade publication confirms it." },
      { text: "Owned the seismic retrofit analysis for three bridges.", corroborated: true, note: "Recommendations reference the ownership." },
    ],
    factors: { school: "University of Illinois", schoolPrestige: 80, gpa: 3.7, major: "Civil Engineering" },
  },
  {
    id: "nadia-abadi",
    name: "Nadia Abadi",
    headline: "Senior Financial Analyst, corporate finance",
    roles: [
      { title: "Financial Analyst", startDate: "2017-06", endDate: "2020-10", bullets: ["Built financial models."] },
      { title: "Senior Financial Analyst", startDate: "2020-10", endDate: null, bullets: ["Owns forecasting."] },
    ],
    qualityClaimed: 64,
    claims: [
      { text: "Built the financial model for a 200 million dollar acquisition.", corroborated: true, note: "A press release corroborates the deal." },
      { text: "Owned monthly forecasting for three business units.", corroborated: true, note: "Recommendations reference the ownership." },
      { text: "Cut the financial close cycle from 10 days to 6 days.", corroborated: true, note: "An internal note, referenced on LinkedIn, confirms it." },
    ],
    factors: { school: "University of Pennsylvania", schoolPrestige: 90, gpa: 3.7, major: "Finance" },
  },
  {
    id: "aisha-bauer",
    name: "Aisha Bauer",
    headline: "Clinical Dietitian, hospital network",
    roles: [
      { title: "Registered Dietitian", startDate: "2016-09", endDate: "2020-04", bullets: ["Delivered patient nutrition care."] },
      { title: "Senior Clinical Dietitian", startDate: "2020-04", endDate: null, bullets: ["Leads a nutrition program."] },
    ],
    qualityClaimed: 66,
    claims: [
      { text: "Built nutrition care plans for 200 patients across a hospital network.", corroborated: true, note: "Hospital program records corroborate." },
      { text: "Cut readmission rates by 15 percent through a dietary program.", corroborated: true, note: "A published outcomes summary confirms it." },
      { text: "Trained clinical staff on nutrition protocols.", corroborated: true, note: "Recommendations reference the training." },
    ],
    factors: { school: "Cornell", schoolPrestige: 90, gpa: 3.5, major: "Nutrition Science" },
  },
  {
    id: "sam-nilsson",
    name: "Sam Nilsson",
    headline: "Junior Data Analyst",
    roles: [
      { title: "Data Analyst", startDate: "2022-03", endDate: null, bullets: ["Builds reports and dashboards."] },
    ],
    qualityClaimed: 46,
    claims: [
      { text: "Built dashboards in SQL and a BI tool for weekly reporting.", corroborated: true, note: "Commit history confirms the work." },
      { text: "Assisted with the weekly metrics review.", corroborated: true, note: "Corroborated, but a supporting role." },
      { text: "Supported ad hoc data requests across teams.", corroborated: false, note: "No corroborating detail beyond the resume." },
    ],
    factors: { school: "Arizona State", schoolPrestige: 55, gpa: 3.1, major: "Statistics" },
  },
  {
    id: "bianca-serrano",
    name: "Bianca Serrano",
    headline: "Marketing Manager, growth",
    roles: [
      { title: "Marketing Associate", startDate: "2018-02", endDate: "2021-06", bullets: ["Ran campaigns."] },
      { title: "Marketing Manager", startDate: "2021-06", endDate: null, bullets: ["Owns demand generation."] },
    ],
    qualityClaimed: 52,
    claims: [
      { text: "Ran paid acquisition across four channels and cut cost per acquisition by 20 percent.", corroborated: true, note: "A campaign recap corroborates." },
      { text: "Owned the lifecycle email program.", corroborated: true, note: "Recommendations reference the ownership." },
      { text: "Supported brand campaigns across the team.", corroborated: false, note: "No corroborating detail beyond the resume." },
    ],
    factors: { school: "NYU", schoolPrestige: 80, gpa: 3.4, major: "Marketing" },
  },
  {
    id: "omar-haas",
    name: "Omar Haas",
    headline: "Operations Manager, logistics",
    roles: [
      { title: "Operations Coordinator", startDate: "2017-10", endDate: "2021-02", bullets: ["Coordinated logistics."] },
      { title: "Operations Manager", startDate: "2021-02", endDate: null, bullets: ["Runs a regional hub."] },
    ],
    qualityClaimed: 50,
    claims: [
      { text: "Managed warehouse operations for a regional distribution hub.", corroborated: true, note: "Corroborated on LinkedIn." },
      { text: "Ran shift scheduling for 30 warehouse staff.", corroborated: true, note: "Execution level scope, corroborated." },
      { text: "Assisted with vendor coordination.", corroborated: false, note: "No corroborating detail beyond the resume." },
    ],
    factors: { school: "State University", schoolPrestige: 50, gpa: 3.0, major: "Business" },
  },
  {
    id: "carlos-frost",
    name: "Carlos Frost",
    headline: "Self-described platform lead",
    roles: [
      { title: "Software Engineer", startDate: "2018-01", endDate: "2020-08", bullets: ["Worked on the platform."] },
      { title: "Senior Software Engineer", startDate: "2020-08", endDate: "2022-04", bullets: ["Built features."] },
      { title: "Engineering Lead", startDate: "2022-04", endDate: null, bullets: ["Claims platform leadership."] },
    ],
    qualityClaimed: 84,
    claims: [
      { text: "Architected the entire platform single handedly.", corroborated: false, note: "No corroborating source supports sole ownership." },
      { text: "Scaled the system to 100 million users.", corroborated: false, note: "No corroborating source mentions that scale." },
      { text: "Led a team of 25 engineers.", corroborated: false, note: "LinkedIn lists no direct reports." },
      { text: "Shipped the mobile app rewrite.", corroborated: true, note: "An app store listing confirms the launch." },
    ],
    factors: { school: "Stanford", schoolPrestige: 97, gpa: 3.6, major: "Computer Science" },
  },
];

// ─── Showcase mode ────────────────────────────────────────────────────────────
// A fixed, pre-written role and a pre-computed Role Fit per curated candidate,
// so Showcase mode looks complete and correct on load with zero clicks and no
// model load. The fit values are authored (not random) against the role below
// so the curated pool spreads across all four quadrants, including clearly
// stranded Strong but Off-target candidates (high quality, wrong field).
export const SHOWCASE_JD = `Senior Product Operations Manager, Fintech Payments

We are hiring a Senior Product Operations Manager to own the operational backbone of our payments and banking product. You will partner with product and engineering to launch features, own the operational roadmap, and drive measurable improvements in reliability and customer outcomes.

Responsibilities
- Own the product operations roadmap for the payments platform.
- Partner with engineering and data to ship and scale new features.
- Drive measurable improvements in onboarding, reliability, and cost.
- Manage vendor and banking partner relationships.
- Build dashboards and reporting to track operational metrics.

Requirements
- Proven track record owning operational or product outcomes with quantified impact.
- Experience in fintech, payments, or a regulated financial environment.
- Strong analytical skills and comfort with data.
- Demonstrated ownership of cross-functional initiatives.`;

export const SHOWCASE_BAR: RoleBarConfig = { x: 60, y: 70 };
export const SHOWCASE_SUMMARY = "Senior Product Operations Manager, fintech. Work Quality bar 60, Role Fit bar 70.";

// Authored Role Fit (Y) for each hero candidate against the role above. Chosen
// with their Work Quality (X) so the named heroes spread cleanly: each quadrant
// has at least one readable example rather than clustering upper-middle.
//   Strong and Aligned    Maya (88,84), Raj (84,74), Hannah (70,80), Nadia (64,86), Jordan (86,76)
//   Strong but Off-target Elena (86,24), Marcus (78,36), Diego (80,46)
//   Aligned but Light     Ana (50,78), Omar (50,72)
//   Low Signal            Tom (42,56), Bianca (52,50)
export const SHOWCASE_FIT: Record<string, number> = {
  "maya-chen": 84,
  "raj-patel": 74,
  "hannah-okafor": 80,
  "nadia-abadi": 86,
  "jordan-ellis": 76,     // reads strong, collapses left when LinkedIn is toggled
  "elena-cruz": 24,       // strong mechanical engineer, wrong field, stranded off-target
  "marcus-lee": 36,       // strong clinical nurse, off-target
  "diego-romero": 46,     // strong civil engineer, off-target
  "ana-velez": 78,        // design, fits the role but lighter work
  "omar-haas": 72,        // operations, fits the role but lighter work
  "tom-becker": 56,       // junior, low signal
  "bianca-serrano": 50,   // marketing, low signal for this role
};

// The named hero candidates: a small legible, labeled, clickable set that tells
// the story, spread across all four quadrants (Elena and Marcus are the Strong
// but Off-target teaching cases, Tom is Low Signal). The rest of the showcase
// density is an anonymous background population (see background.ts).
export const HERO_IDS = [
  "maya-chen", "raj-patel", "hannah-okafor", "nadia-abadi", "jordan-ellis",
  "elena-cruz", "marcus-lee", "diego-romero",
  "ana-velez", "omar-haas",
  "tom-becker", "bianca-serrano",
];
export const HERO_POOL: Candidate[] = HERO_IDS
  .map((id) => CANDIDATES.find((c) => c.id === id))
  .filter((c): c is Candidate => Boolean(c));
