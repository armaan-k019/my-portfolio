// Anonymous background population for Showcase density.
//
// Generated deterministically (seeded, no Math.random and no Date), so the
// server and client render the identical set with no hydration mismatch. These
// dots give the chart a realistic distribution across all four quadrants; they
// render small, light, and unlabeled, and recede behind the named hero
// candidates. Work Quality (X) comes from a tier band; Role Fit (Y) for the
// fixed showcase role is authored per field (on-field high, off-field low) so
// the whole pool spreads instantly with no model load.

import type { Candidate, ClaimBreakdown, Factors } from "./data";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const randInt = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(r: Rng, arr: T[]): T => arr[randInt(r, 0, arr.length - 1)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const FIRST = ["Aria", "Mateo", "Wei", "Priyanka", "Diego", "Nadia", "Kwame", "Sora", "Hiro", "Lena", "Omar", "Gita", "Ravi", "Bianca", "Tomas", "Yuki", "Amara", "Luca", "Fatima", "Ezra", "Noor", "Chen", "Ingrid", "Mateus", "Sana", "Kofi", "Elif", "Jin", "Carmen", "Aleksei", "Tara", "Hassan", "Mei", "Andre", "Zara", "Pablo", "Anika", "Niko", "Leila", "Sven"];
const LAST = ["Okonkwo", "Reyes", "Zhang", "Iyer", "Romero", "Haddad", "Mensah", "Tan", "Tanaka", "Novak", "Haas", "Ito", "Banerjee", "Serrano", "Kovac", "Sato", "Diallo", "Costa", "Khan", "Frost", "Nguyen", "Park", "Lindqvist", "Silva", "Qureshi", "Boateng", "Cruz", "Kim", "Vega", "Petrov", "Walsh", "Aziz", "Wang", "Moreau", "Ramos", "Larsen", "Najafi", "Engel", "Oduya", "Marchetti"];

const SCHOOLS: { name: string; prestige: number }[] = [
  { name: "Stanford", prestige: 97 }, { name: "MIT", prestige: 97 }, { name: "UC Berkeley", prestige: 90 },
  { name: "Carnegie Mellon", prestige: 88 }, { name: "University of Michigan", prestige: 80 }, { name: "Georgia Tech", prestige: 80 },
  { name: "University of Toronto", prestige: 82 }, { name: "IIT Bombay", prestige: 85 }, { name: "ETH Zurich", prestige: 88 },
  { name: "National University of Singapore", prestige: 84 }, { name: "University of Lagos", prestige: 62 }, { name: "Tecnologico de Monterrey", prestige: 66 },
  { name: "Ohio State", prestige: 62 }, { name: "Arizona State", prestige: 55 }, { name: "San Jose State", prestige: 52 },
  { name: "CUNY", prestige: 50 }, { name: "Community college transfer", prestige: 42 }, { name: "Self-taught, bootcamp", prestige: 38 },
];
const EXTRAS = ["Hackathon winner", "Open source maintainer", "Division I athlete", "Founded a nonprofit", "Published researcher", "Volunteer mentor"];

// On-field for the fintech product operations role gets a higher Role Fit base.
interface Field { name: string; major: string; ladder: string[]; claims: string[]; fit: [number, number] }
const FIELDS: Field[] = [
  { name: "software engineering", major: "Computer Science", ladder: ["Software Engineer", "Senior Software Engineer", "Staff Engineer"], fit: [58, 84],
    claims: ["Built backend services handling millions of requests.", "Reduced latency by 40 percent across core services.", "Owned the reliability roadmap for the platform."] },
  { name: "data science", major: "Statistics", ladder: ["Data Analyst", "Data Scientist", "Senior Data Scientist"], fit: [55, 82],
    claims: ["Built models that improved a core metric by 30 percent.", "Owned the experimentation and metrics framework.", "Shipped a production scoring pipeline."] },
  { name: "product management", major: "Economics", ladder: ["Associate PM", "Product Manager", "Senior Product Manager"], fit: [66, 90],
    claims: ["Owned a product roadmap and grew revenue.", "Led a launch used by thousands of businesses.", "Ran discovery across many customer interviews."] },
  { name: "operations", major: "Business", ladder: ["Operations Analyst", "Operations Manager", "Senior Operations Manager"], fit: [62, 88],
    claims: ["Owned operational metrics for the business.", "Cut fulfillment time by 25 percent.", "Managed vendor and partner relationships."] },
  { name: "finance", major: "Finance", ladder: ["Financial Analyst", "Senior Financial Analyst", "Finance Manager"], fit: [60, 86],
    claims: ["Built financial models for major decisions.", "Owned forecasting across business units.", "Cut the close cycle from ten days to six."] },
  { name: "mechanical engineering", major: "Mechanical Engineering", ladder: ["Mechanical Engineer", "Senior Mechanical Engineer", "Lead Engineer"], fit: [16, 40],
    claims: ["Led the mechanical design of a hardware product.", "Cut failure rates through a tolerance redesign.", "Owned thermal and structural analysis."] },
  { name: "civil engineering", major: "Civil Engineering", ladder: ["Civil Engineer", "Senior Civil Engineer", "Project Engineer"], fit: [16, 38],
    claims: ["Led the structural design of a major building.", "Managed a multi-million dollar construction budget.", "Owned the seismic analysis for bridges."] },
  { name: "clinical healthcare", major: "Nursing", ladder: ["Registered Nurse", "Clinical Research Nurse", "Clinical Coordinator"], fit: [18, 42],
    claims: ["Coordinated clinical trials across many patients.", "Owned protocol compliance and cut query rates.", "Trained new clinical staff on procedures."] },
  { name: "design", major: "Design", ladder: ["Product Designer", "Senior Product Designer", "Design Lead"], fit: [44, 70],
    claims: ["Led a redesign that lifted conversion.", "Owned the design system across products.", "Ran usability research and accessibility audits."] },
  { name: "marketing", major: "Marketing", ladder: ["Marketing Associate", "Marketing Manager", "Senior Marketing Manager"], fit: [34, 60],
    claims: ["Ran paid acquisition and cut cost per acquisition.", "Owned the demand generation engine.", "Led a brand campaign that grew awareness."] },
  { name: "sales", major: "Communications", ladder: ["Sales Development Rep", "Account Executive", "Senior Account Executive"], fit: [30, 56],
    claims: ["Carried a quota and closed major accounts.", "Built and led a regional sales effort.", "Owned a strategic enterprise territory."] },
];

type Tier = "junior" | "mid" | "senior" | "strong" | "inflated";
const TIER_SPEC: Record<Tier, { quality: [number, number]; ratio: [number, number] }> = {
  junior: { quality: [28, 48], ratio: [0.5, 0.85] },
  mid: { quality: [48, 66], ratio: [0.6, 0.9] },
  senior: { quality: [62, 80], ratio: [0.72, 0.95] },
  strong: { quality: [80, 95], ratio: [0.85, 1.0] },
  inflated: { quality: [78, 92], ratio: [0.1, 0.35] },
};
const TIER_BAG: Tier[] = ["junior", "junior", "mid", "mid", "mid", "senior", "senior", "strong", "inflated"];

const CORROB = "Corroborated against a second source.";
const FAIL = "No corroborating source supports this claim.";

function makeBg(r: Rng, i: number): { c: Candidate; fit: number } {
  const field = pick(r, FIELDS);
  const tier = pick(r, TIER_BAG);
  const spec = TIER_SPEC[tier];
  const qualityClaimed = randInt(r, spec.quality[0], spec.quality[1]);
  const ratio = spec.ratio[0] + r() * (spec.ratio[1] - spec.ratio[0]);

  const nClaims = randInt(r, 2, 3);
  const corrCount = clamp(Math.round(ratio * nClaims), 0, nClaims);
  const claims: ClaimBreakdown[] = field.claims.slice(0, nClaims).map((text, j) => ({
    text,
    corroborated: j < corrCount,
    note: j < corrCount ? CORROB : FAIL,
  }));

  const title = field.ladder[clamp(Math.round((qualityClaimed / 100) * (field.ladder.length - 1)), 0, field.ladder.length - 1)];
  const school = pick(r, SCHOOLS);
  const factors: Factors = { school: school.name, schoolPrestige: school.prestige, gpa: Math.round((2.6 + r() * 1.4) * 10) / 10, major: field.major };
  if (r() < 0.35) factors.extracurricular = pick(r, EXTRAS);

  // Role Fit for the fixed showcase role: field base, nudged by quality, plus noise.
  const fitBase = field.fit[0] + r() * (field.fit[1] - field.fit[0]);
  const fit = clamp(Math.round(fitBase + (qualityClaimed - 55) * 0.15), 8, 96);

  const c: Candidate = {
    id: `bg-${i}`,
    name: `${pick(r, FIRST)} ${pick(r, LAST)}`,
    headline: `${title}, ${field.name}`,
    roles: [{ title, startDate: "2020-01", endDate: null, bullets: [] }],
    qualityClaimed,
    workStatements: claims.map((x) => x.text),
    claims,
    factors,
    background: true,
  };
  return { c, fit };
}

function build(n: number, seed: number) {
  const r = mulberry32(seed);
  const pool: Candidate[] = [];
  const fit: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const { c, fit: f } = makeBg(r, i);
    pool.push(c);
    fit[c.id] = f;
  }
  return { pool, fit };
}

const built = build(64, 0x5eed1234);
export const BACKGROUND_POOL: Candidate[] = built.pool;
export const BACKGROUND_FIT: Record<string, number> = built.fit;
