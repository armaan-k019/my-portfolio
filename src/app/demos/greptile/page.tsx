"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import ThemeToggle, { MY_STYLE, CSS_VAR_COLORS, type PageColors } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { JetBrains_Mono } from "next/font/google";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-brand" });

const GREPTILE_DARK = "#1a1a1a";

const COMPANY_STYLE: PageColors = {
  bg: "#ffffff",
  cardBg: "#fafafa",
  cardBorder: "#e5e7eb",
  text: "#1a1a1a",
  muted: "#6b7280",
  dim: "#9ca3af",
  accent: GREPTILE_DARK,
  accentBg: "#f3f4f6",
  headerBg: GREPTILE_DARK,
  headerBorder: "#333333",
  headerText: "#ffffff",
};

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #ffffff; --ct-card-bg: #fafafa; --ct-card-border: #e5e7eb;
  --ct-text: #1a1a1a; --ct-muted: #6b7280; --ct-dim: #9ca3af;
  --ct-accent: ${GREPTILE_DARK}; --ct-accent-bg: #f3f4f6;
  --ct-header-bg: ${GREPTILE_DARK}; --ct-header-border: #333333; --ct-header-text: #ffffff;
  font-family: var(--font-brand, 'JetBrains Mono', monospace);
}
.company-theme .rounded-xl, .company-theme .rounded-lg,
.company-theme .rounded-2xl, .company-theme .rounded-full { border-radius: 2px; }
.company-theme button, .company-theme input, .company-theme textarea { border-radius: 2px; font-family: inherit; }
`;

const SAMPLE_PR = "https://github.com/tailwindlabs/tailwindcss/pull/14326";

const LOADING_STEPS = [
  "Fetching PR metadata...",
  "Loading diff...",
  "Loading review comments...",
  "Analyzing comment signal vs noise...",
  "Scanning diff for missed issues...",
  "Scoring reviewer health...",
  "Generating full report...",
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface PrSummary {
  title: string;
  files_changed: number;
  lines_added: number;
  lines_removed: number;
  complexity: "Low" | "Medium" | "High" | "Very High";
  complexity_reason: string;
}

interface ReviewHealth {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  signal_count: number;
  noise_count: number;
  signal_percentage: number;
  verdict: string;
}

interface ReviewComment {
  author: string;
  body: string;
  file: string;
  category: string;
  classification: "Signal" | "Noise" | "Neutral";
  severity: "Critical" | "High" | "Medium" | "Low" | "None";
  reasoning: string;
}

interface MissedIssue {
  file: string;
  issue: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  category: string;
  line_reference: string;
  what_greptile_would_say: string;
}

interface ReviewerScore {
  reviewer: string;
  comments_left: number;
  signal_count: number;
  noise_count: number;
  signal_ratio: number;
  top_category: string;
}

interface AnalysisResult {
  pr_summary: PrSummary;
  review_health: ReviewHealth;
  comments: ReviewComment[];
  missed_issues: MissedIssue[];
  reviewer_scores: ReviewerScore[];
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  A: "#16a34a", B: "#65a30d", C: "#ca8a04", D: "#ea580c", F: "#dc2626",
};

const COMPLEXITY_COLOR: Record<string, string> = {
  Low: "#16a34a", Medium: "#ca8a04", High: "#ea580c", "Very High": "#dc2626",
};

const SEVERITY_COLOR: Record<string, string> = {
  Critical: "#dc2626", High: "#ea580c", Medium: "#ca8a04", Low: "#65a30d", None: "#9ca3af",
};

const CATEGORY_COLOR: Record<string, string> = {
  Bug: "#dc2626", Security: "#7c3aed", Performance: "#ea580c", Architecture: "#2563eb",
  Style: "#9ca3af", Naming: "#a3a3a3", Formatting: "#a3a3a3", Preference: "#a3a3a3",
  Praise: "#16a34a", Question: "#0891b2",
};

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
      style={{ color, backgroundColor: bg, borderColor: color + "40" }}
    >
      {label}
    </span>
  );
}

function ClassificationBadge({ cls }: { cls: "Signal" | "Noise" | "Neutral" }) {
  const map = {
    Signal: { color: "#16a34a", bg: "#f0fdf4" },
    Noise:  { color: "#dc2626", bg: "#fef2f2" },
    Neutral: { color: "#6b7280", bg: "#f9fafb" },
  };
  const { color, bg } = map[cls];
  return <Badge label={cls} color={color} bg={bg} />;
}

function SeverityBadge({ sev }: { sev: string }) {
  if (sev === "None") return null;
  const color = SEVERITY_COLOR[sev] ?? "#9ca3af";
  return <Badge label={sev} color={color} bg={color + "15"} />;
}

function CategoryBadge({ cat }: { cat: string }) {
  const color = CATEGORY_COLOR[cat] ?? "#6b7280";
  return <Badge label={cat} color={color} bg={color + "15"} />;
}

function SignalBar({ pct, C }: { pct: number; C: PageColors }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(pct), 100); return () => clearTimeout(t); }, [pct]);
  const color = pct >= 70 ? "#16a34a" : pct >= 40 ? "#ca8a04" : "#dc2626";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: C.cardBorder }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color, transition: "width 800ms ease-out" }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ── AnimatedGrade ─────────────────────────────────────────────────────────────

function AnimatedGrade({ grade, C }: { grade: string; C: PageColors }) {
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const t1 = setTimeout(() => setScale(1.1), 50);
    const t2 = setTimeout(() => setScale(1.0), 250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [grade]);
  const color = GRADE_COLOR[grade];
  return (
    <div
      className="rounded-full flex items-center justify-center mx-auto"
      style={{
        width: 144,
        height: 144,
        border: `4px solid ${color}`,
        backgroundColor: color + "12",
        transform: `scale(${scale})`,
        transition: "transform 150ms ease-out",
      }}
    >
      <span
        className="font-black leading-none tabular-nums"
        style={{ color, fontSize: "72px" }}
      >
        {grade}
      </span>
    </div>
  );
}

// ── SlidingCard ───────────────────────────────────────────────────────────────

function SlidingCard({ children, delay, className, style }: { children: React.ReactNode; delay: number; className?: string; style?: React.CSSProperties }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 350ms ease-out, transform 350ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function GreptilePage() {
  const [prUrl, setPrUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"my" | "company">("my");

  const resultsRef = useRef<HTMLDivElement>(null);

  const C = theme === "my" ? MY_STYLE : CSS_VAR_COLORS;

  const DARK_PANEL = theme === "my" ? "#1e2a1e" : "#1a1a1a";
  const DARK_PANEL_BORDER = theme === "my" ? "#2d4a2d" : "#333333";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setLoadingStep(0);

    // Animate steps
    for (let i = 0; i < LOADING_STEPS.length; i++) {
      setLoadingStep(i);
      await new Promise(r => setTimeout(r, 400));
    }

    try {
      const res = await fetch("/api/demos/greptile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prUrl }),
      });
      const json = await res.json() as { result?: AnalysisResult; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result!);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }

  const sorted = result
    ? [...result.comments].sort((a, b) => {
        const rank = { Signal: 0, Neutral: 1, Noise: 2 };
        return (rank[a.classification] ?? 1) - (rank[b.classification] ?? 1);
      })
    : [];

  return (
    <div className={`min-h-screen${theme === "company" ? ` company-theme ${jetbrainsMono.variable}` : ""}`} style={{ backgroundColor: C.bg, color: C.text }}>
      <CompanyThemeStyle active={theme === "company"} css={COMPANY_THEME_CSS} />

      {/* Header */}
      <header
        className="px-6 py-5 border-b"
        style={{ borderColor: C.headerBorder, backgroundColor: C.headerBg }}
      >
        <div className="w-full max-w-[900px] mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                PR Review Auditor
              </h1>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{ borderColor: C.accent + "60", color: C.headerText === "#ffffff" ? "#9ca3af" : C.accent, backgroundColor: C.accent + "15" }}
              >
                Built for Greptile
              </span>
            </div>
            <p className="text-sm" style={{ color: C.headerText === "#ffffff" ? "#9ca3af" : C.muted }}>
              Signal vs noise. Bugs your reviewers missed. Reviewer health scores.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs" style={{ color: C.headerText === "#ffffff" ? "#6b7280" : C.dim }}>
              Demo by{" "}
              <Link href="/" className="underline hover:opacity-70 transition-opacity" style={{ color: C.headerText === "#ffffff" ? "#9ca3af" : C.muted }}>
                Armaan Kazi
              </Link>
            </span>
            <ThemeToggle theme={theme} onChange={setTheme} companyAccent={GREPTILE_DARK} darkContext={theme === "company"} />
          </div>
        </div>
      </header>

      <div className="w-full max-w-[900px] mx-auto px-6 py-10">

        {/* Back link */}
        <Link
          href="/demos"
          className="text-xs transition-colors mb-8 inline-block hover:opacity-70"
          style={{ color: C.muted }}
        >
          &#8592; Back to Demos
        </Link>

        {/* SECTION A */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            What code review looks like today
          </p>
          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            As AI coding tools generate more code, PR volume is exploding. The average developer now produces 75% more lines of code than two years ago. Human reviewers are overwhelmed, and when reviewers are overwhelmed, they leave noise: style nits, personal preferences, formatting opinions. The real bugs get buried.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
                What reviewers spend time on
              </p>
              <div className="space-y-3">
                {[
                  { label: "Formatting and style", pct: 34 },
                  { label: "Variable naming opinions", pct: 18 },
                  { label: "Personal preferences", pct: 21 },
                  { label: "Actual bugs and logic errors", pct: 27, highlight: true },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: item.highlight ? C.text : C.muted }}>{item.label}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: item.highlight ? GRADE_COLOR.C : C.dim }}>{item.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ backgroundColor: C.cardBorder }}>
                      <div className="h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.highlight ? GRADE_COLOR.C : C.dim + "60" }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-4 font-semibold" style={{ color: "#dc2626" }}>
                Most review time is noise.
              </p>
            </div>
            <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.accent + "40" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: C.accent }}>
                What actually matters
              </p>
              <div className="space-y-2">
                {["Security vulnerabilities", "Logic errors", "Performance problems", "Architectural issues"].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span style={{ color: "#16a34a" }} className="text-xs mt-0.5 font-bold">&#10003;</span>
                    <span className="text-xs" style={{ color: C.text }}>{item}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-4 font-semibold" style={{ color: C.muted }}>
                Less than a third of comments are signal.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION B */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            What this demo adds
          </p>
          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            This tool fetches a real GitHub PR, the actual diff and the actual review comments, and does two things no human reviewer consistently does: it scores every comment by signal vs noise with reasoning, and it scans the diff for issues the reviewers missed entirely.
          </p>

          {/* Pipeline */}
          <div className="rounded-xl border p-5 mb-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.muted }}>
              {[
                "Real PR URL",
                "GitHub API fetches diff + comments",
                "Signal/noise analysis + missed bug scan",
                "Review health scorecard",
              ].map((step, i, arr) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: C.text }}>{step}</span>
                  {i < arr.length - 1 && <span style={{ color: C.dim }}>&#8594;</span>}
                </span>
              ))}
            </div>
            <p className="text-xs mt-3 font-semibold italic" style={{ color: C.accent }}>
              See what your reviewers missed. See what they wasted time on.
            </p>
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4 font-bold" style={{ color: C.dim, borderBottom: `1px solid ${C.cardBorder}` }}></th>
                  <th className="text-left py-2 pr-4 font-bold" style={{ color: C.dim, borderBottom: `1px solid ${C.cardBorder}` }}>Today</th>
                  <th className="text-left py-2 font-bold" style={{ color: C.accent, borderBottom: `1px solid ${C.cardBorder}` }}>With PR Review Auditor</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Review comments", "All treated equally", "Scored by signal vs noise"],
                  ["Missed bugs", "Unknown until production", "Surfaced from the diff"],
                  ["Reviewer quality", "No visibility", "Scored per reviewer"],
                  ["Review time", "Spent on noise", "Focused on what matters"],
                ].map(([label, today, after]) => (
                  <tr key={label}>
                    <td className="py-2.5 pr-4 font-semibold" style={{ color: C.text, borderBottom: `1px solid ${C.cardBorder}` }}>{label}</td>
                    <td className="py-2.5 pr-4" style={{ color: C.muted, borderBottom: `1px solid ${C.cardBorder}` }}>{today}</td>
                    <td className="py-2.5 font-medium" style={{ color: C.accent, borderBottom: `1px solid ${C.cardBorder}` }}>{after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* SECTION C */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            Why it matters
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              {
                title: "Noise teaches engineers to ignore feedback",
                body: "When most comments are nits, engineers learn to dismiss all comments. The reviewer who cries wolf about indentation does not get taken seriously when they flag a real security issue.",
              },
              {
                title: "Missed bugs compound silently",
                body: "A bug that survives code review does not announce itself. It sits in the codebase, interacts with future changes, and surfaces at the worst possible time. Every missed bug is a deferred cost.",
              },
              {
                title: "Review patterns reveal team health",
                body: "A team whose reviews are 80% noise has a fundamentally different engineering culture than one whose reviews are 80% signal. This is a metric that matters and that almost no team tracks.",
              },
            ].map(card => (
              <div key={card.title} className="rounded-xl border p-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                <p className="text-xs font-bold mb-2" style={{ color: C.text }}>{card.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{card.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.accent + "40", backgroundColor: C.accentBg }}>
            <p className="text-xs font-bold mb-1" style={{ color: C.accent }}>Why This Is Different</p>
            <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
              Every other code review tool tells you what to fix. This one tells you whether your review process itself is broken.
            </p>
          </div>
        </section>

        {/* SECTION D: Try it */}
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
          Try it
        </p>
        <p className="text-sm mb-1" style={{ color: C.muted }}>
          Paste any public GitHub PR URL and see the full analysis.
        </p>
        <p className="text-xs mb-6" style={{ color: C.dim }}>
          Works best on PRs with at least 3-5 review comments and 50+ lines changed. Try a recent PR from a popular open source project, or use the sample below.
        </p>

        {/* Input card */}
        {!result && (
          <div className="rounded-2xl border mb-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: C.dim }}>
                  GITHUB PR URL
                </label>
                <input
                  type="text"
                  value={prUrl}
                  onChange={e => { setPrUrl(e.target.value); setError(null); }}
                  placeholder="https://github.com/owner/repo/pull/123"
                  className="w-full px-4 py-3 text-sm rounded-xl border focus:outline-none transition-colors font-mono"
                  style={{ backgroundColor: C.bg, borderColor: C.cardBorder, color: C.text }}
                  onFocus={e => (e.currentTarget.style.borderColor = C.accent + "80")}
                  onBlur={e => (e.currentTarget.style.borderColor = C.cardBorder)}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={!prUrl.trim() || loading}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                  style={{ backgroundColor: C.accent, color: C.headerText === "#ffffff" ? "#ffffff" : "#ffffff" }}
                >
                  {loading ? "Analyzing..." : "Analyze PR"}
                </button>
                <button
                  type="button"
                  onClick={() => { setPrUrl(SAMPLE_PR); setError(null); }}
                  className="px-5 py-3.5 rounded-xl text-sm font-bold border transition-all hover:opacity-70"
                  style={{ borderColor: C.cardBorder, color: C.muted, backgroundColor: "transparent" }}
                >
                  Load Sample PR
                </button>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl border p-8 mb-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <div className="space-y-2">
              {LOADING_STEPS.slice(0, loadingStep + 1).map((step, i) => (
                <p
                  key={i}
                  className="text-sm font-mono flex items-center gap-2"
                  style={{ color: i === loadingStep ? C.text : C.dim, opacity: i === loadingStep ? 1 : 0.5 }}
                >
                  {i === loadingStep
                    ? <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.accent }} />
                    : <span className="text-xs" style={{ color: "#16a34a" }}>&#10003;</span>
                  }
                  {step}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-8">

            {/* Reset bar */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono truncate max-w-xs" style={{ color: C.dim }}>{prUrl}</p>
              <button
                onClick={() => { setResult(null); setError(null); }}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: C.muted }}
              >
                &#8592; Analyze another PR
              </button>
            </div>

            {/* 1. PR Summary banner */}
            <div className="rounded-2xl border px-6 py-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <h2 className="text-lg font-black leading-tight max-w-xl" style={{ color: C.text }}>
                  {result.pr_summary.title}
                </h2>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full border shrink-0"
                  style={{
                    color: COMPLEXITY_COLOR[result.pr_summary.complexity],
                    borderColor: COMPLEXITY_COLOR[result.pr_summary.complexity] + "50",
                    backgroundColor: COMPLEXITY_COLOR[result.pr_summary.complexity] + "12",
                  }}
                >
                  {result.pr_summary.complexity} Complexity
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-xs mb-3" style={{ color: C.muted }}>
                <span><span className="font-bold" style={{ color: C.text }}>{result.pr_summary.files_changed}</span> files changed</span>
                <span><span className="font-bold" style={{ color: "#16a34a" }}>+{result.pr_summary.lines_added}</span> lines added</span>
                <span><span className="font-bold" style={{ color: "#dc2626" }}>-{result.pr_summary.lines_removed}</span> lines removed</span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>{result.pr_summary.complexity_reason}</p>
            </div>

            {/* 2. Review Health Scorecard */}
            <div className="rounded-2xl border px-6 py-10" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-6 text-center" style={{ color: C.dim }}>
                Review Health Score
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mb-8">
                <AnimatedGrade grade={result.review_health.grade} C={C} />
                <div className="text-center sm:text-left">
                  <p className="text-5xl font-black tabular-nums mb-1" style={{ color: GRADE_COLOR[result.review_health.grade] }}>
                    {result.review_health.score}<span className="text-2xl font-bold" style={{ color: C.dim }}>/100</span>
                  </p>
                  <div className="flex items-center justify-center sm:justify-start gap-5 mt-4">
                    <div className="text-center">
                      <p className="text-2xl font-black" style={{ color: "#16a34a" }}>{result.review_health.signal_count}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.dim }}>Signal</p>
                    </div>
                    <div className="w-px h-8" style={{ backgroundColor: C.cardBorder }} />
                    <div className="text-center">
                      <p className="text-2xl font-black" style={{ color: "#dc2626" }}>{result.review_health.noise_count}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.dim }}>Noise</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="max-w-sm mx-auto mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: C.muted }}>Signal ratio</span>
                  <span className="text-xs font-bold" style={{ color: C.text }}>{result.review_health.signal_percentage}%</span>
                </div>
                <SignalBar pct={result.review_health.signal_percentage} C={C} />
              </div>
              <p className="text-sm max-w-lg mx-auto text-center" style={{ color: C.muted }}>{result.review_health.verdict}</p>
            </div>

            {/* 3. Comment-by-comment breakdown */}
            <div>
              <h2 className="text-base font-black mb-1" style={{ color: C.text }}>Comment Breakdown</h2>
              <p className="text-xs mb-4" style={{ color: C.dim }}>Sorted by signal. Signal first, noise last.</p>
              <div className="space-y-3">
                {sorted.map((comment, i) => {
                  const isNoise = comment.classification === "Noise";
                  const borderColor = comment.classification === "Signal" ? "#16a34a"
                    : comment.classification === "Noise" ? "#dc2626"
                    : C.cardBorder;
                  return (
                    <div
                      key={i}
                      className="rounded-xl p-4"
                      style={{
                        backgroundColor: C.cardBg,
                        border: `1px solid ${C.cardBorder}`,
                        borderLeftColor: borderColor,
                        borderLeftWidth: "4px",
                        opacity: isNoise ? 0.6 : 1,
                      }}
                    >
                      <div className="mb-2">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-bold" style={{ color: C.text }}>{comment.author}</span>
                          <ClassificationBadge cls={comment.classification} />
                          <CategoryBadge cat={comment.category} />
                          {comment.classification === "Signal" && <SeverityBadge sev={comment.severity} />}
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: C.dim }}>
                          {comment.file !== "general" ? comment.file : "general comment"}
                        </span>
                      </div>
                      <blockquote
                        className="text-sm italic mb-3 pl-3 py-2 border-l-2 rounded-r"
                        style={{ color: C.text, borderColor: borderColor + "70", backgroundColor: borderColor + "08" }}
                      >
                        {comment.body.length > 200 ? comment.body.slice(0, 200) + "..." : comment.body}
                      </blockquote>
                      <p className="text-[11px] leading-relaxed" style={{ color: C.dim }}>{comment.reasoning}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. What Greptile Would Have Caught */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: DARK_PANEL }}>
              <div className="px-6 py-5 border-b" style={{ borderColor: DARK_PANEL_BORDER }}>
                <h2 className="text-lg font-black tracking-tight text-white">Issues the reviewers missed</h2>
                <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                  Found in the diff. Not flagged by any human reviewer.
                </p>
              </div>

              <div className="p-6">
                {result.missed_issues.length === 0 ? (
                  <div className="rounded-xl border border-green-800 bg-green-950 px-5 py-4 text-sm text-green-400 font-semibold">
                    &#10003; Human reviewers caught everything on this PR.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {result.missed_issues.map((issue, i) => (
                      <SlidingCard
                        key={i}
                        delay={i * 150}
                        className="rounded-xl border p-5"
                        style={{ backgroundColor: "#111111", borderColor: SEVERITY_COLOR[issue.severity] + "40" }}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="text-xs font-mono text-gray-400">{issue.file.split("/").slice(-1)[0]}</span>
                          {issue.line_reference && (
                            <span className="text-xs font-mono" style={{ color: "#6b7280" }}>:{issue.line_reference}</span>
                          )}
                          <Badge label={issue.severity} color={SEVERITY_COLOR[issue.severity]} bg={SEVERITY_COLOR[issue.severity] + "20"} />
                          <Badge label={issue.category} color={CATEGORY_COLOR[issue.category] ?? "#9ca3af"} bg={(CATEGORY_COLOR[issue.category] ?? "#9ca3af") + "20"} />
                        </div>
                        <p className="text-sm font-semibold text-white mb-3">{issue.issue}</p>
                        <div
                          className="rounded-lg border border-gray-700 bg-black overflow-hidden"
                          style={{ borderLeftColor: SEVERITY_COLOR[issue.severity], borderLeftWidth: 3 }}
                        >
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: SEVERITY_COLOR[issue.severity] + "cc" }}>
                              &#10095; Greptile would flag:
                            </p>
                            <p className="text-sm leading-relaxed text-gray-200">{issue.what_greptile_would_say}</p>
                          </div>
                        </div>
                      </SlidingCard>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 5. Reviewer Leaderboard */}
            {result.reviewer_scores.length > 0 && (
              <div>
                <h2 className="text-base font-black mb-1" style={{ color: C.text }}>Reviewer Leaderboard</h2>
                <p className="text-xs mb-4" style={{ color: C.dim }}>Signal ratio per reviewer.</p>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cardBorder }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: C.cardBg }}>
                        {["Reviewer", "Comments", "Signal", "Noise", "Signal %", "Top Category"].map(h => (
                          <th key={h} className="text-left px-4 py-3 font-bold" style={{ color: C.dim, borderBottom: `1px solid ${C.cardBorder}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...result.reviewer_scores]
                        .sort((a, b) => b.signal_ratio - a.signal_ratio)
                        .map((r, i) => {
                          const signalPct = Math.round(r.signal_ratio * 100);
                          const signalColor = signalPct >= 70 ? "#16a34a" : signalPct >= 40 ? "#ca8a04" : "#dc2626";
                          const rowBg = i % 2 === 0 ? C.cardBg : C.bg;
                          return (
                            <tr
                              key={i}
                              className="transition-colors"
                              style={{ borderBottom: `1px solid ${C.cardBorder}`, backgroundColor: rowBg }}
                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.accentBg)}
                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = rowBg)}
                            >
                              <td className="px-4 py-3 font-semibold" style={{ color: C.text }}>{r.reviewer}</td>
                              <td className="px-4 py-3" style={{ color: C.muted }}>{r.comments_left}</td>
                              <td className="px-4 py-3 font-bold" style={{ color: "#16a34a" }}>{r.signal_count}</td>
                              <td className="px-4 py-3 font-bold" style={{ color: "#dc2626" }}>{r.noise_count}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.cardBorder }}>
                                    <div className="h-full rounded-full" style={{ width: `${signalPct}%`, backgroundColor: signalColor }} />
                                  </div>
                                  <span className="text-xs font-bold tabular-nums" style={{ color: signalColor }}>{signalPct}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <CategoryBadge cat={r.top_category} />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. Summary */}
            <div
              className="rounded-xl px-5 py-5"
              style={{ backgroundColor: C.accentBg, borderLeft: `4px solid ${C.accent}`, border: `1px solid ${C.accent + "25"}`, borderLeftWidth: 4, borderLeftColor: C.accent }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.accent }}>Overall Assessment</p>
              <p className="text-sm leading-relaxed font-medium" style={{ color: C.text }}>{result.summary}</p>
            </div>

          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
        <p className="text-xs leading-relaxed mb-1" style={{ color: C.dim }}>
          Analysis is generated from real GitHub data but reviewed by AI. Greptile&apos;s production system uses full codebase indexing for deeper analysis. This demo uses diff-level context only.
        </p>
        <p className="text-xs" style={{ color: C.dim }}>
          Built by{" "}
          <Link href="/" className="underline hover:opacity-70 transition-opacity">
            Armaan Kazi
          </Link>
          . Not affiliated with Greptile.
        </p>
      </footer>
    </div>
  );
}
