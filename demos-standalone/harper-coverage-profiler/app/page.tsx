"use client";

import { useState, useRef } from "react";

interface PageColors {
  bg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  accentBg: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
}

interface CoverageLine {
  name: string;
  priority: "Required" | "Strongly Recommended" | "Recommended" | "Optional";
  why_needed: string;
  premium_min: number;
  premium_max: number;
  typical_limit: string;
  without_it: string;
}

interface CoverageGap {
  gap_name: string;
  explanation: string;
  addressed_by: string;
}

interface HarperProfile {
  risk_profile: "Low" | "Moderate" | "Elevated" | "High";
  risk_summary: string;
  total_premium_min: number;
  total_premium_max: number;
  coverage_lines: CoverageLine[];
  coverage_gaps: CoverageGap[];
  key_risk_notes: string[];
}

const INDUSTRIES = [
  "Manufacturing",
  "Healthcare",
  "Hospitality",
  "Transportation & Logistics",
  "Construction",
  "Technology",
  "Retail",
  "Professional Services",
  "Real Estate",
  "Other",
];

const EMPLOYEE_OPTIONS = [
  "1–10",
  "11–50",
  "51–200",
  "201–500",
  "501–1,000",
  "1,000+",
];

const REVENUE_OPTIONS = [
  "Under $500K",
  "$500K–$2M",
  "$2M–$10M",
  "$10M–$50M",
  "$50M+",
];

const SAMPLE = {
  businessName: "Blue Ridge Cold Chain LLC",
  industry: "Transportation & Logistics",
  yearsInOperation: "6",
  employees: "11–50",
  annualRevenue: "$2M–$10M",
  businessDescription:
    "Regional refrigerated freight carrier operating 12 reefer trucks across the Southeast. We haul perishable food, pharmaceuticals, and temperature-sensitive medical supplies. Most runs are 200–800 miles. We maintain our own fleet and employ both company drivers and occasional owner-operators.",
  keyContracts:
    "Exclusive lane contracts with two regional grocery distributors; a pharmaceutical logistics agreement with a mid-sized drug wholesaler requiring $5M cargo liability minimums.",
  knownRisks:
    "Temperature excursion incidents, driver shortage leading to longer hours, aging fleet (avg vehicle age 7 years), one at-fault accident in the past 3 years.",
};

const LOADING_STEPS = [
  "Reading business profile…",
  "Assessing industry risk factors…",
  "Identifying required coverage lines…",
  "Estimating premium ranges…",
  "Detecting coverage gaps…",
  "Generating one-page brief…",
];

const PRIORITY_BORDER: Record<string, string> = {
  Required: "border-red-500",
  "Strongly Recommended": "border-orange-400",
  Recommended: "border-yellow-400",
  Optional: "border-gray-300",
};

const PRIORITY_BADGE: Record<string, string> = {
  Required: "bg-red-50 text-red-700 border border-red-200",
  "Strongly Recommended": "bg-orange-50 text-orange-700 border border-orange-200",
  Recommended: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  Optional: "bg-gray-50 text-gray-600 border border-gray-200",
};

const RISK_BADGE: Record<string, string> = {
  Low: "bg-green-50 text-green-700 border border-green-200",
  Moderate: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  Elevated: "bg-orange-50 text-orange-700 border border-orange-200",
  High: "bg-red-50 text-red-700 border border-red-200",
};

function fmt(n: number) {
  return "$" + n.toLocaleString();
}

function priorityOrder(p: string) {
  return ["Required", "Strongly Recommended", "Recommended", "Optional"].indexOf(p);
}

export default function HarperPage() {
  const [form, setForm] = useState({
    businessName: "",
    industry: INDUSTRIES[0],
    yearsInOperation: "",
    employees: EMPLOYEE_OPTIONS[0],
    annualRevenue: REVENUE_OPTIONS[0],
    businessDescription: "",
    keyContracts: "",
    knownRisks: "",
  });

  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [profile, setProfile] = useState<HarperProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const briefRef = useRef<HTMLDivElement>(null);

  const COMPANY_STYLE: PageColors = {
    bg: "#ffffff",
    cardBg: "#ffffff",
    cardBorder: "rgba(15,31,61,0.15)",
    text: "#0f1f3d",
    muted: "#4b6080",
    dim: "#8a9abc",
    accent: "#0f1f3d",
    accentBg: "rgba(15,31,61,0.06)",
    headerBg: "#0f1f3d",
    headerBorder: "#1a2f5a",
    headerText: "#ffffff",
  };

  const C = COMPANY_STYLE;
  const NAVY = C.accent;

  function loadSample() {
    setForm(SAMPLE);
    setProfile(null);
    setError(null);
  }

  function reset() {
    setProfile(null);
    setError(null);
    setStepIndex(0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setProfile(null);
    setError(null);
    setStepIndex(0);

    // Animate loading steps
    for (let i = 0; i < LOADING_STEPS.length; i++) {
      setStepIndex(i);
      await new Promise((r) => setTimeout(r, 400));
    }

    try {
      const res = await fetch("https://armaankazi.com/api/demos/harper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          industry: form.industry,
          yearsInOperation: form.yearsInOperation,
          employees: form.employees,
          revenue: form.annualRevenue,
          description: form.businessDescription,
          contracts: form.keyContracts,
          risks: form.knownRisks,
        }),
      });
      const rawText = await res.text();
      const result = JSON.parse(rawText) as { result?: HarperProfile; error?: string };
      if (!res.ok) {
        setError(result.error ?? `Request failed (${res.status})`);
        return;
      }
      if (!result.result) {
        setError(result.error ?? "Unexpected response from server.");
        return;
      }
      setProfile(result.result);
    } catch (err) {
      console.error("[harper] fetch error:", err);
      setError("Failed to generate coverage profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    form.businessName.trim().length > 0 &&
    form.yearsInOperation.trim().length > 0 &&
    form.businessDescription.trim().length > 10;

  const sorted = profile
    ? [...profile.coverage_lines].sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority))
    : [];

  const totalMin = sorted.reduce((sum, l) => sum + l.premium_min, 0);
  const totalMax = sorted.reduce((sum, l) => sum + l.premium_max, 0);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.bg }}>
      {/* Header */}
      <header
        className="border-b px-6 py-4"
        style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="font-bold text-xl tracking-tight" style={{ color: C.headerText }}>
              Harper
            </span>
            <span className="text-lg font-light" style={{ color: C.headerText + "60" }}>|</span>
            <span className="text-sm" style={{ color: C.headerText + "99" }}>Business Coverage Profiler</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-xs" style={{ color: C.headerText + "99" }}>
                Built by{" "}
                <a href="https://armaankazi.com" className="hover:underline" style={{ color: C.headerText }}>
                  Armaan Kazi
                </a>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto w-full px-6 py-10 flex-1">

        {/* Hero */}
        <div className="mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: NAVY }}>
            Built for Harper Insurance
          </p>
          <h1 className="text-2xl font-bold mb-2" style={{ color: NAVY }}>
            Business Coverage Profiler
          </h1>
          <p className="leading-relaxed max-w-2xl text-sm" style={{ color: C.muted }}>
            Enter your business profile and get a structured commercial insurance recommendation: coverage lines,
            priority tiers, premium estimates, and gap analysis.
          </p>
        </div>

        {/* Section A: What Harper does today */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>What Harper does today</p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
            Harper is a commercial insurance brokerage. Today, getting a business covered means completing a lengthy intake form, waiting for a broker to review it, and receiving a quote, a process that typically takes days to weeks depending on the complexity of the business.
          </p>

          {/* Today vs With Demo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>Today</p>
              <ul className="space-y-2">
                {["Business profile", "Broker intake", "Manual review", "Quote in days"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.dim }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: NAVY }}>With This Demo</p>
              <ul className="space-y-2">
                {["Business profile", "AI analysis", "Coverage profile in seconds", "Ready-to-share brief"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: NAVY }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Comparison table */}
          <div className="rounded-xl border overflow-x-auto" style={{ borderColor: C.cardBorder }}>
            <div style={{ minWidth: 480 }}>
              <div className="grid grid-cols-3 px-4 py-2" style={{ backgroundColor: C.accentBg }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }}></span>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }}>Today</span>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: NAVY }}>With Demo</span>
              </div>
              {[
                ["Time to first recommendation", "Days to weeks", "Under 60 seconds"],
                ["Who does the analysis", "Licensed broker", "Claude, guided by underwriting logic"],
                ["Output format", "Phone call or email", "Structured coverage profile with gap analysis and one-page brief"],
              ].map(([label, today, demo], i) => (
                <div
                  key={label}
                  className="grid grid-cols-3 px-4 py-3"
                  style={{ backgroundColor: i % 2 === 1 ? C.accentBg : C.cardBg }}
                >
                  <span className="text-xs font-medium pr-2" style={{ color: C.text }}>{label}</span>
                  <span className="text-xs pr-2" style={{ color: C.muted }}>{today}</span>
                  <span className="text-xs font-medium pr-2" style={{ color: NAVY }}>{demo}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section B: What this demo adds */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>What this demo adds</p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: C.muted }}>
            The Business Coverage Profiler takes a plain-language business description and returns a prioritized set of coverage lines with premium estimates, a gap analysis, and a print-ready one-page brief, all in under 60 seconds. It doesn&apos;t replace a broker. It compresses the intake triage from hours to seconds.
          </p>
        </section>

        {/* Section C: Why it's better */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>Why it&apos;s better</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              {
                title: "Instant triage, not a form",
                body: "Traditional broker intake requires back-and-forth to establish what a business does, what it needs, and what gaps exist. This tool does that analysis from a plain-language description.",
              },
              {
                title: "Coverage gaps surface automatically",
                body: "The profiler identifies exposures that the recommended lines don't cover, things a business owner might not know to ask about, and flags them explicitly.",
              },
              {
                title: "A brief you can actually share",
                body: "The one-page coverage brief is print-ready and structured for broker handoff. It summarizes the risk profile, lists all coverage lines with limits and premiums, and flags gaps, all in one page.",
              },
            ].map(({ title, body }) => (
              <div
                key={title}
                className="rounded-xl border p-5"
                style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: NAVY }} />
                  <p className="text-xs font-semibold" style={{ color: C.text }}>{title}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border px-5 py-4" style={{ backgroundColor: C.accentBg, borderColor: C.cardBorder }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>Why This Is Different</p>
            <p className="text-sm leading-relaxed" style={{ color: C.text }}>
              This isn&apos;t a quote. It&apos;s a structured, explainable coverage recommendation that a real broker can validate in minutes instead of days.
            </p>
          </div>
        </section>

        {/* Section D: Try it label */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>Try it</h2>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>Describe your business and get a prioritized commercial insurance recommendation with premium estimates, gap analysis, and a one-page brief.</p>
        </div>

        {/* Input Form */}
        {!profile && (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border shadow-sm p-6 mb-8"
            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold" style={{ color: C.text }}>Business Profile</h2>
              <button
                type="button"
                onClick={loadSample}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: C.cardBorder, color: C.muted }}
              >
                Load Sample
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Business Name</label>
                <input
                  type="text"
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  placeholder="e.g. Blue Ridge Cold Chain LLC"
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Industry</label>
                <select
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Years in Operation</label>
                <input
                  type="text"
                  value={form.yearsInOperation}
                  onChange={(e) => setForm({ ...form, yearsInOperation: e.target.value })}
                  placeholder="e.g. 6"
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Number of Employees</label>
                <select
                  value={form.employees}
                  onChange={(e) => setForm({ ...form, employees: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                >
                  {EMPLOYEE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Annual Revenue</label>
                <select
                  value={form.annualRevenue}
                  onChange={(e) => setForm({ ...form, annualRevenue: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                >
                  {REVENUE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>Business Description</label>
                <textarea
                  value={form.businessDescription}
                  onChange={(e) => setForm({ ...form, businessDescription: e.target.value })}
                  placeholder="Describe what your business does, how it operates, and any relevant details about products, services, or locations."
                  rows={4}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300 resize-none"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
                  Key Contracts / Clients{" "}
                  <span className="font-normal" style={{ color: C.dim }}>(optional)</span>
                </label>
                <textarea
                  value={form.keyContracts}
                  onChange={(e) => setForm({ ...form, keyContracts: e.target.value })}
                  placeholder="Describe any major contracts, clients, or insurance minimums required by partners."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300 resize-none"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
                  Known Risks / Concerns{" "}
                  <span className="font-normal" style={{ color: C.dim }}>(optional)</span>
                </label>
                <textarea
                  value={form.knownRisks}
                  onChange={(e) => setForm({ ...form, knownRisks: e.target.value })}
                  placeholder="Any prior claims, known hazards, regulatory concerns, or operational risks worth noting."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300 resize-none"
                  style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              style={{ backgroundColor: NAVY }}
            >
              {loading ? "Generating…" : "Generate Coverage Profile →"}
            </button>
          </form>
        )}

        {/* Loading Steps */}
        {loading && (
          <div
            className="rounded-2xl border shadow-sm p-8 mb-8"
            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
          >
            <div className="space-y-3">
              {LOADING_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i < stepIndex ? (
                    <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs flex-shrink-0">
                      ✓
                    </span>
                  ) : i === stepIndex ? (
                    <span className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0" style={{ borderColor: NAVY, borderTopColor: "transparent" }} />
                  ) : (
                    <span className="w-5 h-5 rounded-full border border-gray-200 flex-shrink-0" />
                  )}
                  <span
                    className="text-sm"
                    style={{ color: i <= stepIndex ? C.text : C.dim }}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {profile && !loading && (
          <div className="space-y-6">
            {/* Risk Summary Banner */}
            <div
              className="rounded-2xl border shadow-sm p-6"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-bold text-lg" style={{ color: NAVY }}>
                      {form.businessName || "Your Business"}
                    </h2>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_BADGE[profile.risk_profile]}`}>
                      {profile.risk_profile} Risk
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: C.muted }}>{form.industry} · {form.employees} employees · {form.annualRevenue} revenue</p>
                </div>
                <div className="text-right">
                  <p className="text-xs mb-0.5" style={{ color: C.dim }}>Estimated Annual Premium</p>
                  <p className="text-xl font-bold" style={{ color: NAVY }}>
                    {fmt(totalMin)} – {fmt(totalMax)}
                  </p>
                  <p className="text-xs" style={{ color: C.dim }}>{sorted.length} coverage lines</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>{profile.risk_summary}</p>

              {profile.key_risk_notes.length > 0 && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: C.cardBorder }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>Key Risk Notes</p>
                  <ul className="space-y-1">
                    {profile.key_risk_notes.map((note, i) => (
                      <li key={i} className="text-sm flex gap-2" style={{ color: C.text }}>
                        <span className="flex-shrink-0 mt-0.5" style={{ color: C.dim }}>•</span>
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Coverage Lines */}
            <div>
              <h2 className="font-semibold mb-3" style={{ color: C.text }}>Recommended Coverage Lines</h2>
              <div className="space-y-3">
                {sorted.map((line: CoverageLine, i: number) => (
                  <div
                    key={i}
                    className={`rounded-xl border-l-4 border shadow-sm p-5 ${PRIORITY_BORDER[line.priority]}`}
                    style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm" style={{ color: C.text }}>{line.name}</h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[line.priority]}`}>
                          {line.priority}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold" style={{ color: NAVY }}>
                          {fmt(line.premium_min)} – {fmt(line.premium_max)}/yr
                        </p>
                        <p className="text-xs" style={{ color: C.dim }}>Limit: {line.typical_limit}</p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed mb-2" style={{ color: C.text }}>{line.why_needed}</p>
                    <p className="text-xs text-red-500 leading-relaxed">
                      <span className="font-medium">Without it:</span> {line.without_it}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Coverage Gaps */}
            <div>
              <h2 className="font-semibold mb-3" style={{ color: C.text }}>Coverage Gap Analysis</h2>
              {profile.coverage_gaps.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-sm text-green-700">
                  No significant coverage gaps identified. The recommended lines address the primary exposures for this business profile.
                </div>
              ) : (
                <div className="space-y-3">
                  {profile.coverage_gaps.map((gap: CoverageGap, i: number) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                      <div className="flex items-start gap-3">
                        <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
                        <div>
                          <p className="font-semibold text-sm text-amber-800 mb-1">{gap.gap_name}</p>
                          <p className="text-sm text-amber-700 leading-relaxed mb-1">{gap.explanation}</p>
                          <p className="text-xs text-amber-600">
                            <span className="font-medium">Addressed by:</span> {gap.addressed_by}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* One-Page Coverage Brief */}
            <div className="rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: NAVY }}>
                <div>
                  <p className="text-white font-semibold">One-Page Coverage Brief</p>
                  <p className="text-blue-200 text-xs mt-0.5">Print-ready summary for your records or broker</p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="text-xs px-4 py-2 rounded-lg border border-white/30 text-white hover:bg-white/10 transition-colors"
                >
                  Download as PDF
                </button>
              </div>

              <div ref={briefRef} className="bg-white p-6 print:p-0">
                <div className="border border-gray-200 rounded-xl p-6 print:border-none print:rounded-none print:p-4">
                  {/* Brief header */}
                  <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
                    <div>
                      <p className="font-bold text-base" style={{ color: NAVY }}>{form.businessName || "Business"}</p>
                      <p className="text-xs text-gray-500">{form.industry} · {form.employees} employees · {form.annualRevenue}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_BADGE[profile.risk_profile]}`}>
                        {profile.risk_profile} Risk
                      </span>
                      <p className="text-xs text-gray-400 mt-1">Generated by Harper</p>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed mb-4">{profile.risk_summary}</p>

                  {/* Brief coverage table */}
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Coverage</th>
                          <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Priority</th>
                          <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Typical Limit</th>
                          <th className="text-right py-1.5 text-gray-500 font-medium">Est. Annual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((line: CoverageLine, i: number) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-2 pr-3 font-medium text-gray-800">{line.name}</td>
                            <td className="py-2 pr-3 text-gray-500">{line.priority}</td>
                            <td className="py-2 pr-3 text-gray-500">{line.typical_limit}</td>
                            <td className="py-2 text-right text-gray-800">{fmt(line.premium_min)}–{fmt(line.premium_max)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} className="py-2 pr-3 font-semibold text-gray-800">Total Estimated Premium</td>
                          <td className="py-2 text-right font-bold" style={{ color: NAVY }}>
                            {fmt(totalMin)}–{fmt(totalMax)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {profile.coverage_gaps.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Identified Gaps</p>
                      {profile.coverage_gaps.map((gap: CoverageGap, i: number) => (
                        <p key={i} className="text-xs text-amber-600">• {gap.gap_name}: {gap.explanation}</p>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    This profile is generated for illustrative purposes only and does not constitute a binding insurance quote. Premium estimates are indicative and will vary based on underwriting review. Consult a licensed Harper broker for final coverage recommendations.
                  </p>
                </div>
              </div>
            </div>

            {/* Harper CTA */}
            <div className="rounded-2xl p-8 text-center text-white" style={{ backgroundColor: NAVY }}>
              <p className="font-bold text-lg mb-2">Ready to get covered?</p>
              <p className="text-blue-200 text-sm max-w-md mx-auto mb-6 leading-relaxed">
                This profile is a starting point. A Harper broker can refine these recommendations, run full underwriting, and bind coverage, often in under 24 hours.
              </p>
              <a
                href="https://harperinsure.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block w-full sm:w-auto px-6 py-3 bg-white rounded-xl text-sm font-semibold hover:bg-gray-100 transition-colors"
                style={{ color: NAVY }}
              >
                Talk to a Harper Broker →
              </a>
            </div>

            {/* Reset */}
            <div className="text-center pb-8">
              <button
                onClick={reset}
                className="text-sm transition-colors"
                style={{ color: C.dim }}
              >
                ← Profile a different business
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body > *:not(.print-area) { display: none !important; }
          header, nav, footer, button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
