"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { type PageColors } from "@/components/ThemeToggle";

// ── Company style constants ────────────────────────────────────────────────────

const EREBOR_STYLE: PageColors = {
  bg: "#0a0a0f",
  cardBg: "#111118",
  cardBorder: "#c9a84c40",
  text: "#f5f0e8",
  muted: "#b0a080",
  dim: "#6b5e40",
  accent: "#c9a84c",
  accentBg: "rgba(201,168,76,0.10)",
  headerBg: "#07070c",
  headerBorder: "#c9a84c30",
  headerText: "#f5f0e8",
};

// ── Dropdown options ───────────────────────────────────────────────────────────

const COMPANY_TYPES = [
  "Crypto Exchange",
  "DeFi Protocol",
  "Stablecoin Operator",
  "AI Lab",
  "Defense Contractor",
  "NFT Platform",
  "Payment Service Provider",
  "Digital Asset Fund",
  "Web3 Gaming",
  "Fintech Startup",
  "Other Innovation Company",
];

const REVENUE_SOURCES = [
  "Trading Fees",
  "Token Sales",
  "SaaS",
  "Government Contracts",
  "Transaction Fees",
  "Investment Returns",
  "Mixed",
  "Other",
];

const REVENUE_RANGES = [
  "Pre-revenue",
  "Under $1M",
  "$1M-$10M",
  "$10M-$50M",
  "$50M-$250M",
  "$250M+",
];

const JURISDICTIONS = [
  "United States",
  "European Union",
  "United Kingdom",
  "Asia-Pacific",
  "Multiple",
  "Other",
];

const LOADING_STEPS = [
  "Analyzing business model...",
  "Scoring regulatory exposure...",
  "Assessing asset risk profile...",
  "Evaluating counterparty risk...",
  "Checking jurisdictional factors...",
  "Calculating banking vulnerability...",
  "Generating Erebor fit assessment...",
];

const SAMPLE = {
  companyType: "Crypto Exchange",
  revenueSource: "Trading Fees",
  revenueRange: "$10M-$50M",
  jurisdiction: "United States",
  holdsCrypto: true,
  defenseContracts: false,
  issuesStablecoins: false,
  hasBanking: true,
  description:
    "We operate a centralized crypto exchange serving institutional and retail traders across the US. We hold customer funds in segregated accounts, process approximately $50M in daily volume, and have had two banking relationships terminated in the past 18 months without explanation.",
};

// ── Risk level config ──────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  Low: "#22c55e",
  Moderate: "#eab308",
  High: "#f97316",
  Critical: "#ef4444",
  "N/A": "#4b5563",
};

const RISK_BG: Record<string, string> = {
  Low: "#052e16",
  Moderate: "#422006",
  High: "#3c1a08",
  Critical: "#3c0a0a",
  "N/A": "#1a1a1a",
};

const RISK_LABEL: Record<string, string> = {
  Low: "Traditional banking relationships are unlikely to be disrupted.",
  Moderate: "You have identifiable exposure. Proactive planning is warranted.",
  High: "Your business model is likely flagged in standard bank compliance reviews.",
  Critical: "Your current banking relationships are at significant risk of disruption.",
};

const STABILITY_COLOR: Record<string, string> = {
  Stable: "#22c55e",
  Vulnerable: "#eab308",
  "At Risk": "#f97316",
  Critical: "#ef4444",
};

const FIT_COLOR: Record<string, string> = {
  Strong: "#22c55e",
  Good: "#84cc16",
  Moderate: "#eab308",
  "Not Yet Applicable": "#6b7280",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface Dimension {
  name: string;
  score: number;
  assessment: string;
  risk_factor: string;
  what_banks_see: string;
}

interface VulnerabilityItem {
  service: string;
  risk: "Low" | "Moderate" | "High" | "Critical" | "N/A";
}

interface EreborService {
  service: string;
  why_applicable: string;
  replaces: string;
}

interface ScoreResult {
  overall_score: number;
  risk_level: "Low" | "Moderate" | "High" | "Critical";
  banking_stability: "Stable" | "Vulnerable" | "At Risk" | "Critical";
  erebor_fit: "Strong" | "Good" | "Moderate" | "Not Yet Applicable";
  summary: string;
  dimensions: Dimension[];
  vulnerability_map: VulnerabilityItem[];
  erebor_fit_verdict: string;
  erebor_services: EreborService[];
  erebor_narrative: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreBar({ score, accent }: { score: number; accent: string }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "#ef4444" : score >= 6 ? "#f97316" : score >= 4 ? "#eab308" : "#22c55e";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: accent + "20" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-8 text-right" style={{ color }}>
        {score}/10
      </span>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  c,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  c: PageColors;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer py-1">
      <span className="text-sm" style={{ color: c.muted }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="relative flex-shrink-0 w-10 h-5 rounded-full transition-all"
        style={{ backgroundColor: value ? c.accent : c.cardBorder }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
          style={{ left: value ? "calc(100% - 18px)" : "2px" }}
        />
      </button>
    </label>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EreborPage() {
  const C = EREBOR_STYLE;
  const GOLD = C.accent;

  const [form, setForm] = useState({
    companyType: COMPANY_TYPES[0],
    revenueSource: REVENUE_SOURCES[0],
    revenueRange: REVENUE_RANGES[3],
    jurisdiction: JURISDICTIONS[0],
    holdsCrypto: false,
    defenseContracts: false,
    issuesStablecoins: false,
    hasBanking: false,
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  function loadSample() {
    setForm(SAMPLE);
    setResult(null);
    setError(null);
  }

  function reset() {
    setResult(null);
    setError(null);
    setStepIndex(-1);
  }

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setStepIndex(0);

    for (let i = 0; i < LOADING_STEPS.length; i++) {
      setStepIndex(i);
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const res = await fetch("/api/demos/erebor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const raw = await res.text();
      const json = JSON.parse(raw) as { result?: ScoreResult; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result!);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      console.error("[erebor] error:", err);
      setError(String(err));
    } finally {
      setLoading(false);
      setStepIndex(-1);
    }
  }

  const canSubmit = form.description.trim().length > 10 && !loading;

  // Shared input style
  const inputStyle: React.CSSProperties = {
    backgroundColor: "#0d0d14",
    border: `1px solid ${C.cardBorder}`,
    color: C.text,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    width: "100%",
    outline: "none",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.text }}>

      {/* ── Header ── */}
      <header
        className="px-6 py-5 border-b"
        style={{ borderColor: C.headerBorder, backgroundColor: C.headerBg }}
      >
        <div className="max-w-4xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span
                className="text-2xl font-black tracking-widest uppercase"
                style={{ color: GOLD, letterSpacing: "0.15em" }}
              >
                Erebor
              </span>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{ borderColor: GOLD + "50", color: GOLD, backgroundColor: GOLD + "12" }}
              >
                De-banking Risk Scorer
              </span>
            </div>
            <p className="text-sm" style={{ color: C.muted }}>
              Know your risk before your bank acts on it.
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="text-xs mt-1" style={{ color: C.dim }}>
              Demo by{" "}
              <Link href="/" className="underline transition-colors" style={{ color: C.muted }}>
                Armaan Kazi
              </Link>
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* ── Back link ── */}
        <Link
          href="/demos"
          className="text-xs transition-colors mb-8 inline-block"
          style={{ color: C.dim }}
        >
          &#8592; Back to Demos
        </Link>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* SECTION A                                                          */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: C.dim, letterSpacing: "0.15em" }}
          >
            What traditional banking looks like for innovation companies
          </p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
            Most banks were not built for companies operating at the frontier. Crypto firms, AI labs, defense contractors, and stablecoin operators face a systemic problem: the banking infrastructure they depend on treats them as liabilities, not customers. The result is frozen accounts, sudden closures, and an inability to access basic financial services -- not because of fraud or wrongdoing, but because traditional risk frameworks were never designed for this economy.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Today block */}
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: C.cardBg, border: `1px solid ${C.cardBorder}` }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-4"
                style={{ color: C.dim, letterSpacing: "0.12em" }}
              >
                Today
              </p>
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                {["Innovation Co.", "Traditional Bank", "Risk Flags Raised", "Account Closed"].map((node, i, arr) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: i >= 2 ? "#ef444415" : C.cardBorder + "40",
                        color: i >= 2 ? "#ef4444" : C.muted,
                        border: `1px solid ${i >= 2 ? "#ef444430" : C.cardBorder}`,
                      }}
                    >
                      {node}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="text-xs" style={{ color: C.dim }}>&#8594;</span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs italic" style={{ color: C.dim }}>
                One compliance review away from losing your banking.
              </p>
            </div>

            {/* With scorer block */}
            <div
              className="rounded-xl p-5"
              style={{ backgroundColor: C.cardBg, border: `1px solid ${GOLD}40` }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-4"
                style={{ color: GOLD, letterSpacing: "0.12em" }}
              >
                With De-banking Risk Scorer
              </p>
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                {["Your Profile", "5-Dimension Analysis", "Vulnerability Map", "Erebor Fit"].map((node, i, arr) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: GOLD + "15",
                        color: GOLD,
                        border: `1px solid ${GOLD}40`,
                      }}
                    >
                      {node}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="text-xs font-bold" style={{ color: GOLD }}>&#8594;</span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs italic" style={{ color: C.muted }}>
                Know your risk before your bank acts on it.
              </p>
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* SECTION B                                                          */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: C.dim, letterSpacing: "0.15em" }}
          >
            What this demo adds
          </p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
            De-banking risk is not random. It follows predictable patterns based on your business model, revenue sources, asset types, and regulatory exposure. This tool scores your company across the five dimensions that traditional bank compliance teams use to flag accounts for review or closure.
          </p>

          <div className="overflow-x-auto mb-2">
            <div
              className="rounded-xl overflow-hidden min-w-[480px]"
              style={{ border: `1px solid ${C.cardBorder}` }}
            >
              <div
                className="grid grid-cols-3 px-4 py-2.5"
                style={{ backgroundColor: "#0d0d14", borderBottom: `1px solid ${C.cardBorder}` }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim }}></span>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim }}>Today</span>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>With This Tool</span>
              </div>
              {[
                ["Risk visibility", "None until account closed", "Scored before it happens"],
                ["Dimensions assessed", "Unknown to company", "5 specific risk vectors"],
                ["Banking alternatives", "Scramble after closure", "Identified proactively"],
                ["Stablecoin readiness", "Not assessed", "Explicitly scored"],
              ].map(([feature, today, withTool], i) => (
                <div
                  key={feature}
                  className="grid grid-cols-3 px-4 py-3"
                  style={{
                    backgroundColor: i % 2 === 0 ? C.cardBg : ("#0d0d14"),
                    borderBottom: i < 3 ? `1px solid ${C.cardBorder}` : "none",
                  }}
                >
                  <span className="text-xs font-semibold pr-3" style={{ color: C.text }}>{feature}</span>
                  <span className="text-xs pr-3" style={{ color: C.dim }}>{today}</span>
                  <span className="text-xs" style={{ color: C.text }}>{withTool}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* SECTION C                                                          */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: C.dim, letterSpacing: "0.15em" }}
          >
            Why it matters
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              {
                title: "SVB proved concentration risk is existential",
                body: "When SVB collapsed in 2023, thousands of crypto and tech companies lost access to funds overnight. De-banking does not require a bank failure -- a single compliance review can produce the same outcome for a single company.",
              },
              {
                title: "Traditional banks use blunt instruments",
                body: "A bank's compliance system does not distinguish between a sophisticated institutional crypto trading desk and a retail speculation account. Both get flagged. Both get closed. The nuance that makes your business legitimate does not survive a risk screening algorithm.",
              },
              {
                title: "Erebor was built for exactly this gap",
                body: "Erebor received OCC and FDIC approval in under 9 months specifically to serve companies the traditional banking system excludes. Knowing your risk profile is the first step to finding infrastructure that matches your business.",
              },
            ].map(card => (
              <div
                key={card.title}
                className="rounded-xl p-4"
                style={{ backgroundColor: C.cardBg, border: `1px solid ${C.cardBorder}` }}
              >
                <p
                  className="text-xs font-bold mb-2 leading-snug"
                  style={{ color: C.text }}
                >
                  {card.title}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{card.body}</p>
              </div>
            ))}
          </div>
          <div
            className="rounded-xl px-5 py-4"
            style={{ border: `1px solid ${GOLD}40`, backgroundColor: GOLD + "0d" }}
          >
            <p className="text-xs font-bold mb-1" style={{ color: GOLD }}>Why This Is Different</p>
            <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
              Most banking tools help you manage money. This one tells you whether your bank is about to take it away.
            </p>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* SECTION D: Try it                                                  */}
        {/* ────────────────────────────────────────────────────────────────── */}
        <p
          className="text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: C.dim, letterSpacing: "0.15em" }}
        >
          Try it
        </p>
        <p className="text-sm mb-1" style={{ color: C.muted }}>
          Enter your company profile and get your de-banking risk score.
        </p>
        <p className="text-xs mb-6" style={{ color: C.dim }}>
          Works for any company in crypto, AI, defense, stablecoins, or digital assets. The more specific you are about your business model, the more accurate the assessment.
        </p>

        {/* ── Input Form ── */}
        {!result && (
          <div
            className="rounded-2xl p-6 mb-8"
            style={{ backgroundColor: C.cardBg, border: `1px solid ${C.cardBorder}` }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-base" style={{ color: C.text, letterSpacing: "0.04em" }}>
                Company Profile
              </h2>
              <button
                type="button"
                onClick={loadSample}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ border: `1px solid ${C.cardBorder}`, color: C.muted, backgroundColor: "transparent" }}
              >
                Load Sample
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">

                {/* Left column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: C.muted }}>
                      Company Type
                    </label>
                    <select
                      value={form.companyType}
                      onChange={e => setField("companyType", e.target.value)}
                      style={selectStyle}
                    >
                      {COMPANY_TYPES.map(t => (
                        <option key={t} value={t} style={{ backgroundColor: "#111118" }}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: C.muted }}>
                      Primary Revenue Source
                    </label>
                    <select
                      value={form.revenueSource}
                      onChange={e => setField("revenueSource", e.target.value)}
                      style={selectStyle}
                    >
                      {REVENUE_SOURCES.map(r => (
                        <option key={r} value={r} style={{ backgroundColor: "#111118" }}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: C.muted }}>
                      Annual Revenue Range
                    </label>
                    <select
                      value={form.revenueRange}
                      onChange={e => setField("revenueRange", e.target.value)}
                      style={selectStyle}
                    >
                      {REVENUE_RANGES.map(r => (
                        <option key={r} value={r} style={{ backgroundColor: "#111118" }}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: C.muted }}>
                      Jurisdiction
                    </label>
                    <select
                      value={form.jurisdiction}
                      onChange={e => setField("jurisdiction", e.target.value)}
                      style={selectStyle}
                    >
                      {JURISDICTIONS.map(j => (
                        <option key={j} value={j} style={{ backgroundColor: "#111118" }}>{j}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ backgroundColor: "#0d0d14", border: `1px solid ${C.cardBorder}` }}
                  >
                    <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.dim, letterSpacing: "0.12em" }}>
                      Business Characteristics
                    </p>
                    <Toggle label="Holds or transacts in crypto" value={form.holdsCrypto} onChange={v => setField("holdsCrypto", v)} c={C} />
                    <Toggle label="Works with defense or government contracts" value={form.defenseContracts} onChange={v => setField("defenseContracts", v)} c={C} />
                    <Toggle label="Issues or operates stablecoins" value={form.issuesStablecoins} onChange={v => setField("issuesStablecoins", v)} c={C} />
                    <Toggle label="Has existing banking relationships" value={form.hasBanking} onChange={v => setField("hasBanking", v)} c={C} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: C.muted }}>
                      Brief description of your business
                    </label>
                    <textarea
                      value={form.description}
                      onChange={e => setField("description", e.target.value)}
                      rows={5}
                      placeholder="Describe what your company does, how you make money, and any specific banking challenges you have faced. Example: We operate a DeFi lending protocol on Ethereum, earn fees from interest rate spreads, and hold 60% of our treasury in USDC."
                      style={{ ...inputStyle, resize: "none" }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all uppercase"
                style={{
                  backgroundColor: canSubmit ? GOLD : C.cardBorder,
                  color: canSubmit ? "#0a0a0f" : C.dim,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  letterSpacing: "0.08em",
                }}
              >
                Score My De-banking Risk
              </button>
            </form>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div
            className="rounded-2xl p-8 mb-8 flex flex-col items-center"
            style={{ backgroundColor: C.cardBg, border: `1px solid ${C.cardBorder}` }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin mb-6"
              style={{ borderColor: `${GOLD}30`, borderTopColor: GOLD }}
            />
            <div className="space-y-2 w-full max-w-xs">
              {LOADING_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all"
                    style={{
                      backgroundColor: i <= stepIndex ? GOLD : C.cardBorder,
                      opacity: i <= stepIndex ? 1 : 0.3,
                    }}
                  />
                  <span
                    className="text-sm transition-all"
                    style={{ color: i === stepIndex ? C.text : i < stepIndex ? C.muted : C.dim }}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div
            className="rounded-xl px-4 py-3 mb-8"
            style={{ backgroundColor: "#2a0f0f", border: "1px solid #ef444440" }}
          >
            <p className="text-sm text-red-400">{error}</p>
            <button onClick={reset} className="text-xs mt-2 underline" style={{ color: C.muted }}>
              Try again
            </button>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────── */}
        {/* RESULTS                                                            */}
        {/* ────────────────────────────────────────────────────────────────── */}
        {result && !loading && (
          <div ref={resultsRef}>

            {/* ── 1. Overall Risk Score ── */}
            <div
              className="rounded-2xl p-7 mb-6"
              style={{
                backgroundColor: C.cardBg,
                border: `2px solid ${RISK_COLOR[result.risk_level]}40`,
                boxShadow: `0 0 30px ${RISK_COLOR[result.risk_level]}15`,
              }}
            >
              <div className="flex items-start gap-6 flex-wrap mb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.dim, letterSpacing: "0.12em" }}>
                    Overall De-banking Risk
                  </p>
                  <div className="flex items-end gap-2">
                    <span
                      className="text-6xl font-black tabular-nums leading-none"
                      style={{ color: RISK_COLOR[result.risk_level] }}
                    >
                      {result.overall_score}
                    </span>
                    <span className="text-2xl font-bold mb-1" style={{ color: C.dim }}>/100</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-3"
                    style={{
                      backgroundColor: RISK_COLOR[result.risk_level] + "20",
                      color: RISK_COLOR[result.risk_level],
                      border: `1px solid ${RISK_COLOR[result.risk_level]}40`,
                      letterSpacing: "0.10em",
                    }}
                  >
                    {result.risk_level} Risk
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                    {RISK_LABEL[result.risk_level]}
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-5" style={{ color: C.text }}>
                {result.summary}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Risk Level", value: result.risk_level, color: RISK_COLOR[result.risk_level] },
                  { label: "Banking Stability", value: result.banking_stability, color: STABILITY_COLOR[result.banking_stability] },
                  { label: "Erebor Fit", value: result.erebor_fit, color: FIT_COLOR[result.erebor_fit] },
                ].map(pill => (
                  <div
                    key={pill.label}
                    className="rounded-xl px-4 py-3"
                    style={{ backgroundColor: "#0d0d14", border: `1px solid ${C.cardBorder}` }}
                  >
                    <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: C.dim, letterSpacing: "0.12em" }}>
                      {pill.label}
                    </p>
                    <p className="text-sm font-bold" style={{ color: pill.color }}>{pill.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 2. Five Dimension Breakdown ── */}
            <h2
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: C.dim, letterSpacing: "0.15em" }}
            >
              Five Dimension Breakdown
            </h2>
            <div className="space-y-4 mb-8">
              {result.dimensions.map((dim, i) => (
                <div
                  key={i}
                  className="rounded-2xl p-5"
                  style={{ backgroundColor: C.cardBg, border: `1px solid ${C.cardBorder}` }}
                >
                  <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: C.dim, letterSpacing: "0.10em" }}>
                        Dimension {i + 1}
                      </p>
                      <p className="font-bold text-base" style={{ color: C.text }}>{dim.name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span
                        className="text-2xl font-black tabular-nums"
                        style={{ color: dim.score >= 8 ? "#ef4444" : dim.score >= 6 ? "#f97316" : dim.score >= 4 ? "#eab308" : "#22c55e" }}
                      >
                        {dim.score}
                      </span>
                      <span className="text-sm font-bold" style={{ color: C.dim }}>/10</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <ScoreBar score={dim.score} accent={GOLD} />
                  </div>

                  <p className="text-sm leading-relaxed mb-4" style={{ color: C.muted }}>
                    {dim.assessment}
                  </p>

                  <div
                    className="rounded-xl px-4 py-3 mb-3"
                    style={{ backgroundColor: "#ef444410", border: "1px solid #ef444430" }}
                  >
                    <p className="text-xs font-bold mb-1" style={{ color: "#ef4444" }}>Risk Factor</p>
                    <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{dim.risk_factor}</p>
                  </div>

                  <div
                    className="rounded-xl px-4 py-3"
                    style={{ backgroundColor: GOLD + "0d", border: `1px solid ${GOLD}30` }}
                  >
                    <p className="text-xs font-bold mb-1" style={{ color: GOLD }}>What Banks See</p>
                    <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{dim.what_banks_see}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── 3. Vulnerability Map ── */}
            <h2
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: C.dim, letterSpacing: "0.15em" }}
            >
              Banking Service Vulnerability Map
            </h2>
            <div
              className="rounded-2xl overflow-hidden mb-8"
              style={{ border: `1px solid ${C.cardBorder}` }}
            >
              {/* Header */}
              <div
                className="grid grid-cols-2 px-5 py-3"
                style={{ backgroundColor: "#0d0d14", borderBottom: `1px solid ${C.cardBorder}` }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim, letterSpacing: "0.12em" }}>
                  Banking Service
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim, letterSpacing: "0.12em" }}>
                  Risk Level
                </span>
              </div>
              {result.vulnerability_map.map((item, i) => (
                <div
                  key={item.service}
                  className="grid grid-cols-2 px-5 py-4 items-center"
                  style={{
                    backgroundColor: i % 2 === 0 ? C.cardBg : ("#0d0d14"),
                    borderBottom: i < result.vulnerability_map.length - 1 ? `1px solid ${C.cardBorder}` : "none",
                  }}
                >
                  <span className="text-sm font-semibold" style={{ color: C.text }}>{item.service}</span>
                  <div>
                    <span
                      className="inline-block text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest"
                      style={{
                        backgroundColor: RISK_BG[item.risk],
                        color: RISK_COLOR[item.risk],
                        border: `1px solid ${RISK_COLOR[item.risk]}40`,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {item.risk}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── 4. Erebor Fit Assessment ── */}
            <div
              className="rounded-2xl p-6 sm:p-8 mb-6"
              style={{ backgroundColor: C.headerBg, border: `1px solid ${GOLD}40` }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-1"
                style={{ color: GOLD, letterSpacing: "0.15em" }}
              >
                Erebor Fit Assessment
              </p>
              <h2
                className="text-xl font-black mb-2 tracking-wide"
                style={{ color: C.headerText, letterSpacing: "0.04em" }}
              >
                Is Erebor the right banking partner for your company?
              </h2>

              <div
                className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
                style={{
                  backgroundColor: FIT_COLOR[result.erebor_fit] + "20",
                  color: FIT_COLOR[result.erebor_fit],
                  border: `1px solid ${FIT_COLOR[result.erebor_fit]}40`,
                  letterSpacing: "0.10em",
                }}
              >
                {result.erebor_fit} Fit
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
                {result.erebor_fit_verdict}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {result.erebor_services.map((svc, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-4"
                    style={{ backgroundColor: GOLD + "0d", border: `1px solid ${GOLD}30` }}
                  >
                    <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: GOLD, letterSpacing: "0.10em" }}>
                      {svc.service}
                    </p>
                    <p className="text-xs leading-relaxed mb-3" style={{ color: C.muted }}>{svc.why_applicable}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.dim, letterSpacing: "0.08em" }}>
                      Replaces
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: C.muted }}>{svc.replaces}</p>
                  </div>
                ))}
              </div>

              <div
                className="rounded-xl px-5 py-4"
                style={{ backgroundColor: GOLD + "12", border: `1px solid ${GOLD}40` }}
              >
                <p className="text-sm leading-relaxed" style={{ color: C.headerText }}>{result.erebor_narrative}</p>
              </div>
            </div>

            {/* ── 5. Erebor CTA ── */}
            <div
              className="rounded-2xl p-6 text-center mb-8"
              style={{ backgroundColor: C.cardBg, border: `1px solid ${C.cardBorder}` }}
            >
              <p
                className="font-black text-lg mb-2 uppercase tracking-wide"
                style={{ color: C.text, letterSpacing: "0.06em" }}
              >
                Banking built for the innovation economy
              </p>
              <p className="text-sm leading-relaxed max-w-xl mx-auto mb-5" style={{ color: C.muted }}>
                Erebor received OCC and FDIC approval to serve exactly the companies traditional banks refuse. Crypto, AI, defense, and digital asset companies are our core customers -- not our compliance problem.
              </p>
              <a
                href="https://erebor.bank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-7 py-3 rounded-xl font-bold text-sm transition-all uppercase tracking-widest"
                style={{ backgroundColor: GOLD, color: "#0a0a0f", letterSpacing: "0.10em" }}
              >
                Learn about Erebor &#8599;
              </a>
              <div className="flex items-center justify-center gap-5 mt-5 flex-wrap">
                {["OCC and FDIC approved", "Palmer Luckey and Joe Lonsdale", "Backed by Founders Fund and Lux Capital"].map(trust => (
                  <span key={trust} className="text-xs" style={{ color: C.dim }}>
                    &#10003; {trust}
                  </span>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div className="mt-4 text-center">
              <button
                onClick={reset}
                className="text-xs underline transition-colors"
                style={{ color: C.dim }}
              >
                &#8592; Score another company
              </button>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="mt-12 pt-6" style={{ borderTop: `1px solid ${C.cardBorder}` }}>
          <p className="text-xs leading-relaxed mb-1" style={{ color: C.dim }}>
            This risk assessment is for illustrative purposes only and does not constitute legal, financial, or regulatory advice. Banking relationships depend on many factors not captured in this tool. Consult qualified advisors for specific guidance.
          </p>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline transition-colors" style={{ color: C.muted }}>
              Armaan Kazi
            </Link>
            . Not affiliated with Erebor.
          </p>
        </div>
      </div>
    </div>
  );
}
