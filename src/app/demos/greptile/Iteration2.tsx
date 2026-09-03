"use client";

import { useState, useRef } from "react";
import { CSS_VAR_COLORS, type PageColors } from "@/components/ThemeToggle";

const SIGNAL = "#16a34a";
const NOISE = "#dc2626";
const CONTEXT = "#ca8a04";
const CRITICAL = "#dc2626";
const HIGH = "#ea580c";
const MEDIUM = "#ca8a04";
const LOW = "#65a30d";
const NONE_COLOR = "#9ca3af";
const BLUE = "#2563eb";
const PURPLE = "#7c3aed";
const PANEL = "#ffffff";
const PANEL_BORDER = "#e5e0d8";
const PANEL_INNER = "#f5f3ef";

const SEVERITY_COLOR: Record<string, string> = {
  Critical: CRITICAL, High: HIGH, Medium: MEDIUM, Low: LOW, None: NONE_COLOR,
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: "#7c2d12", P1: CRITICAL, P2: HIGH, P3: MEDIUM,
};

const PRIORITY_COST: Record<string, number> = {
  P0: 50000, P1: 15000, P2: 5000, P3: 1000,
};

// ── Types ──────────────────────────────────────────────────────────────────────

type Cls = "Signal" | "Noise" | "Context" | "Neutral";
type Sev = "Critical" | "High" | "Medium" | "Low" | "None";
type Prio = "P0" | "P1" | "P2" | "P3";

interface CommentRow {
  reviewer: string;
  summary: string;
  original: Cls;
  adjusted: Cls;
  reason: string;
  severity: Sev;
}

interface Archetype {
  label: string;
  pct: number;
}

interface ReviewerDNA {
  reviewer: string;
  signalPct: number;
  comments: number;
  signals: number;
  archetypes: Archetype[];
  codebaseScore: number;
  caught: string[];
  missed: string[];
  verdict: string;
}

interface CodebaseFinding {
  text: string;
  status: "Caught by human" | "Missed by human" | "Systemic issue";
  attribution?: string;
}

interface BugTicket {
  id: string;
  title: string;
  priority: Prio;
  daysAfterMerge: number;
  reviewerLink: string;
  costUSD: number;
  status: "flagged but merged" | "missed entirely";
}

interface ROIBlock {
  topLine: string;
  noiseMinutes: number;
  missedCritical: number;
  bugsToProduction: number;
  remediationCostUSD: number;
  totalHours: number;
  bottomLine: string;
  source: "estimated" | "real" | "no_correlation";
  ticketsScanned?: number;
  projectKey?: string;
}

interface Iteration2Result {
  repo: string;
  prTitle: string;
  prNumber: number;
  reviewers: string[];
  comments: CommentRow[];
  reviewerDNA: ReviewerDNA[];
  codebaseFindings: CodebaseFinding[];
  bugTickets: BugTicket[];
  roi: ROIBlock;
  datasetCount: number | null;
  contributedThisSession: number;
}

type BugTrackerType = "none" | "jira" | "linear";

interface JiraCreds {
  baseUrl: string;
  email: string;
  token: string;
  projectKey: string;
}

interface LinearCreds {
  apiKey: string;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_DATA: Iteration2Result = {
  repo: "acme-corp/payments-service",
  prTitle: "Refactor authentication middleware and add rate limiting",
  prNumber: 247,
  reviewers: ["Sarah Chen", "Marcus Webb", "Dev Patel"],
  comments: [
    {
      reviewer: "Sarah Chen",
      summary: "Variable should be camelCase not snake_case",
      original: "Signal",
      adjusted: "Noise",
      reason: "snake_case is used in 34 other files in this repo. Comment fights the codebase convention.",
      severity: "None",
    },
    {
      reviewer: "Sarah Chen",
      summary: "validateAndProcessRequest is doing too much, should be split",
      original: "Signal",
      adjusted: "Context",
      reason: "Same pattern exists in 8 other services unchanged. Splitting here creates inconsistency, not improvement.",
      severity: "Low",
    },
    {
      reviewer: "Sarah Chen",
      summary: "Missing null check could cause NPE on user object",
      original: "Signal",
      adjusted: "Signal",
      reason: "This pattern is missing in 12 other places. PR is one instance of a wider systemic gap.",
      severity: "High",
    },
    {
      reviewer: "Sarah Chen",
      summary: "Style: prefer const over let on loop variable",
      original: "Noise",
      adjusted: "Noise",
      reason: "Style nit. ESLint rule is not enforced in this repo.",
      severity: "None",
    },
    {
      reviewer: "Sarah Chen",
      summary: "Rate limit logic does not account for distributed systems",
      original: "Signal",
      adjusted: "Signal",
      reason: "Correct flag. The Redis store referenced is single-node only, real concern under load.",
      severity: "High",
    },
    {
      reviewer: "Sarah Chen",
      summary: "Security: JWT expiry not validated before processing",
      original: "Signal",
      adjusted: "Signal",
      reason: "JWT expiry is not validated anywhere in the codebase. Critical security gap caught here.",
      severity: "Critical",
    },
    {
      reviewer: "Marcus Webb",
      summary: "Naming: use descriptive variable names instead of x",
      original: "Signal",
      adjusted: "Noise",
      reason: "Single-letter loop counters appear in 60+ files. Codebase convention, not a bug.",
      severity: "None",
    },
    {
      reviewer: "Marcus Webb",
      summary: "Add a comment explaining this regex",
      original: "Signal",
      adjusted: "Signal",
      reason: "Regex is non-obvious and uncommented. Codebase has comments on similar patterns.",
      severity: "Low",
    },
    {
      reviewer: "Marcus Webb",
      summary: "This could be simplified to a one-liner",
      original: "Noise",
      adjusted: "Noise",
      reason: "Style preference. Multiline form is more readable for this branch logic.",
      severity: "None",
    },
    {
      reviewer: "Marcus Webb",
      summary: "Indentation is off here",
      original: "Noise",
      adjusted: "Noise",
      reason: "Auto-formatter handles this on save. Reviewer comment adds zero value.",
      severity: "None",
    },
    {
      reviewer: "Dev Patel",
      summary: "Good catch on the rate limiting",
      original: "Neutral",
      adjusted: "Neutral",
      reason: "Praise comment. Non-actionable. Useful socially but not technically.",
      severity: "None",
    },
    {
      reviewer: "Dev Patel",
      summary: "This pattern is used inconsistently across the codebase",
      original: "Signal",
      adjusted: "Signal",
      reason: "Confirmed. Error handling style diverges in 4 services. Reviewer flagged a real systemic concern.",
      severity: "Medium",
    },
    {
      reviewer: "Dev Patel",
      summary: "Performance: this runs O(n squared) on the user list, could be O(n) with a map",
      original: "Signal",
      adjusted: "Signal",
      reason: "Same O(n squared) pattern appears in 3 other services. High signal, systemic performance concern.",
      severity: "Critical",
    },
  ],
  reviewerDNA: [
    {
      reviewer: "Sarah Chen",
      signalPct: 67,
      comments: 6,
      signals: 4,
      archetypes: [
        { label: "Security and Auth", pct: 40 },
        { label: "Code Quality", pct: 35 },
        { label: "Style", pct: 25 },
      ],
      codebaseScore: 78,
      caught: [
        "JWT expiry validation gap",
        "Null check pattern missing across codebase",
      ],
      missed: ["Distributed rate limiting concerns under real load"],
      verdict: "High value reviewer for security-critical code.",
    },
    {
      reviewer: "Marcus Webb",
      signalPct: 25,
      comments: 4,
      signals: 1,
      archetypes: [
        { label: "Style and Formatting", pct: 70 },
        { label: "Readability", pct: 30 },
      ],
      codebaseScore: 31,
      caught: [],
      missed: ["Everything that mattered on this PR"],
      verdict: "Low signal reviewer. Consider reassigning non-style PRs.",
    },
    {
      reviewer: "Dev Patel",
      signalPct: 67,
      comments: 3,
      signals: 2,
      archetypes: [
        { label: "Performance", pct: 60 },
        { label: "Consistency", pct: 40 },
      ],
      codebaseScore: 85,
      caught: ["Critical O(n squared) on user list"],
      missed: ["Security issues entirely"],
      verdict: "Strong performance reviewer with a security blind spot.",
    },
  ],
  codebaseFindings: [
    {
      text: "JWT expiry validation missing across entire codebase. Systemic security gap.",
      status: "Caught by human",
      attribution: "Sarah",
    },
    {
      text: "Null check pattern absent in 12 files. This PR is one instance of a wider problem.",
      status: "Caught by human",
      attribution: "Sarah",
    },
    {
      text: "O(n squared) pattern appears in 3 other services. Performance issue is systemic.",
      status: "Caught by human",
      attribution: "Dev",
    },
    {
      text: "Distributed rate limiting not implemented anywhere in the service mesh.",
      status: "Missed by human",
    },
    {
      text: "snake_case is the actual codebase convention in 34 files. Naming nit was misaligned.",
      status: "Systemic issue",
    },
  ],
  bugTickets: [
    {
      id: "BUG-1821",
      title: "Authentication fails under load",
      priority: "P1",
      daysAfterMerge: 6,
      reviewerLink: "Touches rate limiting code Marcus reviewed without flagging.",
      costUSD: 15000,
      status: "missed entirely",
    },
    {
      id: "BUG-1834",
      title: "NPE in user processing",
      priority: "P2",
      daysAfterMerge: 11,
      reviewerLink: "Touches the exact line Sarah flagged. Merged anyway.",
      costUSD: 5000,
      status: "flagged but merged",
    },
    {
      id: "BUG-1841",
      title: "Slow response on large user lists",
      priority: "P3",
      daysAfterMerge: 8,
      reviewerLink: "Touches O(n squared) code Dev flagged. Merged anyway.",
      costUSD: 1000,
      status: "flagged but merged",
    },
  ],
  roi: {
    topLine:
      "This review wasted 47 minutes on noise and missed 1 critical issue that became a P1 bug 6 days later.",
    noiseMinutes: 47,
    missedCritical: 1,
    bugsToProduction: 3,
    remediationCostUSD: 21000,
    totalHours: 0.78,
    bottomLine:
      "This PR review process cost the team an estimated 0.78 hours and $21,000 in bug remediation.",
    source: "real",
    ticketsScanned: 847,
    projectKey: "BUG",
  },
  datasetCount: null,
  contributedThisSession: 13,
};

const V2_LOADING = [
  "Indexing repository...",
  "Querying codebase patterns...",
  "Running embeddings on review comments...",
  "Building reviewer profiles...",
  "Fetching tickets...",
  "Correlating bugs to PR files...",
  "Calculating real ROI...",
  "Generating dashboard...",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function V2Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color, backgroundColor: bg, borderColor: color + "40" }}
    >
      {label}
    </span>
  );
}

function ClsBadge({ cls }: { cls: Cls }) {
  const map: Record<Cls, { color: string; bg: string }> = {
    Signal: { color: SIGNAL, bg: SIGNAL + "15" },
    Noise: { color: NOISE, bg: NOISE + "15" },
    Context: { color: CONTEXT, bg: CONTEXT + "15" },
    Neutral: { color: NONE_COLOR, bg: NONE_COLOR + "15" },
  };
  const { color, bg } = map[cls];
  return <V2Badge label={cls} color={color} bg={bg} />;
}

function StatusPill({ status }: { status: CodebaseFinding["status"] }) {
  const map: Record<CodebaseFinding["status"], { color: string; bg: string }> = {
    "Caught by human": { color: SIGNAL, bg: SIGNAL + "15" },
    "Missed by human": { color: NOISE, bg: NOISE + "15" },
    "Systemic issue": { color: BLUE, bg: BLUE + "15" },
  };
  const { color, bg } = map[status];
  return (
    <span
      className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color, backgroundColor: bg, borderColor: color + "40" }}
    >
      {status}
    </span>
  );
}

function MiniBar({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: trackColor }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, transition: "width 600ms ease-out" }} />
    </div>
  );
}

function Tip({ children, label, C }: { children: React.ReactNode; label: string; C: PageColors }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen(o => !o)}
    >
      <span
        className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 text-[9px] font-bold rounded-full cursor-help"
        style={{ backgroundColor: C.cardBorder, color: C.muted }}
        aria-label={label}
      >
        ?
      </span>
      {open && (
        <span
          className="absolute z-20 left-1/2 -translate-x-1/2 top-full mt-2 w-64 text-[11px] leading-relaxed p-3 rounded-lg border shadow-lg"
          style={{ backgroundColor: PANEL, color: "#1a1a1a", borderColor: PANEL_BORDER }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Iteration2() {
  const C = CSS_VAR_COLORS;

  const [mode, setMode] = useState<"live" | "demo">("live");
  const [prUrl, setPrUrl] = useState("");

  const [tracker, setTracker] = useState<BugTrackerType>("none");
  const [jiraOpen, setJiraOpen] = useState(false);
  const [linearOpen, setLinearOpen] = useState(false);
  const [jiraCreds, setJiraCreds] = useState<JiraCreds>({ baseUrl: "", email: "", token: "", projectKey: "" });
  const [linearCreds, setLinearCreds] = useState<LinearCreds>({ apiKey: "" });
  const [trackerStatus, setTrackerStatus] = useState<{ ok: boolean; ticketsScanned: number; project?: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Iteration2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [greptileStatus, setGreptileStatus] = useState<{ ok: boolean; reason: string; message?: string } | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

  function resetAll() {
    setResult(null);
    setError(null);
    setStep(0);
    setDegraded(false);
    setGreptileStatus(null);
  }

  async function animateSteps(stepsToShow: number) {
    for (let i = 0; i < stepsToShow; i++) {
      setStep(i);
      await new Promise(r => setTimeout(r, 320));
    }
  }

  async function runDemo() {
    resetAll();
    setLoading(true);

    // Fetch the live dataset count in parallel with the loading animation.
    // If Supabase isn't configured the endpoint returns { count: null } and
    // the progress bar in the dashboard is hidden.
    const countPromise = fetch("/api/demos/greptile-v2/dataset-count")
      .then(r => r.json() as Promise<{ count: number | null }>)
      .then(d => d.count)
      .catch(() => null);

    await animateSteps(V2_LOADING.length);
    const realCount = await countPromise;
    setResult({ ...DEMO_DATA, datasetCount: realCount });
    setTrackerStatus({ ok: true, ticketsScanned: 847, project: "BUG" });
    setLoading(false);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  async function runLive(e: React.FormEvent) {
    e.preventDefault();
    if (!prUrl.trim()) return;
    resetAll();
    setLoading(true);

    const stepCount = tracker === "none" ? 5 : V2_LOADING.length;
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, stepCount - 1);
      setStep(stepIdx);
    }, 700);

    try {
      const payload: Record<string, unknown> = { prUrl };
      if (tracker === "jira") payload.jira = jiraCreds;
      if (tracker === "linear") payload.linear = linearCreds;

      const res = await fetch("/api/demos/greptile-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        result?: Iteration2Result;
        error?: string;
        degraded?: boolean;
        greptileStatus?: { ok: boolean; reason: string; message?: string } | null;
        trackerStatus?: { ok: boolean; ticketsScanned: number; project?: string } | null;
      };
      clearInterval(stepTimer);
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result!);
      setDegraded(!!json.degraded);
      setGreptileStatus(json.greptileStatus ?? null);
      setTrackerStatus(json.trackerStatus ?? null);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      clearInterval(stepTimer);
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }

  const visibleLoadingSteps = tracker === "none"
    ? V2_LOADING.slice(0, 4).concat(["Calculating ROI...", "Generating dashboard..."])
    : V2_LOADING;

  return (
    <>
      {/* Divider */}
      <div className="w-full max-w-3xl mx-auto px-6 mt-20 mb-12">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px" style={{ backgroundColor: C.cardBorder }} />
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.dim }}>
            Iteration 2
          </span>
          <div className="flex-1 h-px" style={{ backgroundColor: C.cardBorder }} />
        </div>
        <h2 className="text-3xl font-black tracking-tight text-center mb-3" style={{ color: C.text }}>
          Taking It Further
        </h2>
        <p className="text-sm text-center max-w-xl mx-auto" style={{ color: C.muted }}>
          What PR Review Auditor becomes with codebase intelligence.
        </p>
      </div>

      <div className="w-full max-w-3xl mx-auto px-6 pb-10">

        {/* NARRATIVE: matches Iteration 1 SECTION A format */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            What PR Review Auditor becomes with codebase intelligence
          </p>
          <p className="text-sm leading-relaxed mb-4 max-w-2xl" style={{ color: C.muted }}>
            Iteration 1 scores comments as signal or noise using general best practices. But the real question is not whether a comment is generically good. It is whether the comment is relevant to how this codebase actually works.
          </p>
          <p className="text-sm leading-relaxed mb-4 max-w-2xl" style={{ color: C.muted }}>
            A naming convention comment is noise if your codebase violates that convention in 40 other places. A missed bug matters more if that function is called in 200 places downstream.
          </p>
          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            Iteration 2 grounds every analysis in your actual codebase using the Greptile API, and builds a living profile of every reviewer based on what they consistently catch and miss.
          </p>

          {/* Pipeline strip */}
          <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.muted }}>
              {[
                "GitHub PR",
                "Greptile codebase index",
                "Per comment codebase queries",
                "Embedding clusters per reviewer",
                "Reviewer DNA + ROI dashboard",
              ].map((s, i, arr) => (
                <span key={s} className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: C.text }}>{s}</span>
                  {i < arr.length - 1 && <span style={{ color: C.dim }}>&#8594;</span>}
                </span>
              ))}
            </div>
            <p className="text-xs mt-3 font-semibold italic" style={{ color: C.accent }}>
              Generic analysis becomes specific intelligence.
            </p>
          </div>
        </section>

        {/* MODE TOGGLE */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
            Try it
          </p>
          <p className="text-sm mb-1" style={{ color: C.muted }}>
            Live mode runs the real pipeline. Demo mode loads a pre-built scenario in seconds.
          </p>
          <p className="text-xs mb-4" style={{ color: C.dim }}>
            Demo mode requires zero credentials.
          </p>

          <div
            className="inline-flex p-1 rounded-xl border"
            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            role="tablist"
            aria-label="Mode selector"
          >
            {(["live", "demo"] as const).map(m => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => { setMode(m); resetAll(); }}
                className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all"
                style={{
                  backgroundColor: mode === m ? C.accent : "transparent",
                  color: mode === m ? "#ffffff" : C.muted,
                }}
              >
                {m === "live" ? "Live mode" : "Demo mode"}
              </button>
            ))}
          </div>
        </div>

        {/* TOOL: input form */}
        {!result && (
          <div className="rounded-xl border mb-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            {mode === "live" ? (
              <form onSubmit={runLive} className="p-6 space-y-5">
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

                {/* Bug tracker connection */}
                <div className="pt-2 border-t" style={{ borderColor: C.cardBorder }}>
                  <p className="text-xs font-bold mb-1 mt-4" style={{ color: C.dim }}>
                    CONNECT BUG TRACKER (OPTIONAL)
                  </p>
                  <p className="text-xs mb-3" style={{ color: C.dim }}>
                    Connect your bug tracker to calculate real ROI from production bugs. Skip to use estimated data.
                  </p>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => { setTracker("jira"); setJiraOpen(true); setLinearOpen(false); }}
                      className="text-xs font-bold px-4 py-2 rounded-lg border transition-all"
                      style={{
                        borderColor: tracker === "jira" ? C.accent : C.cardBorder,
                        color: tracker === "jira" ? C.accent : C.muted,
                        backgroundColor: tracker === "jira" ? C.accentBg : "transparent",
                      }}
                    >
                      Connect Jira
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTracker("linear"); setLinearOpen(true); setJiraOpen(false); }}
                      className="text-xs font-bold px-4 py-2 rounded-lg border transition-all"
                      style={{
                        borderColor: tracker === "linear" ? C.accent : C.cardBorder,
                        color: tracker === "linear" ? C.accent : C.muted,
                        backgroundColor: tracker === "linear" ? C.accentBg : "transparent",
                      }}
                    >
                      Connect Linear
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTracker("none"); setJiraOpen(false); setLinearOpen(false); }}
                      className="text-xs font-bold px-4 py-2 rounded-lg border transition-all"
                      style={{
                        borderColor: tracker === "none" ? C.accent : C.cardBorder,
                        color: tracker === "none" ? C.accent : C.muted,
                        backgroundColor: tracker === "none" ? C.accentBg : "transparent",
                      }}
                    >
                      Skip
                    </button>
                  </div>

                  {tracker === "jira" && jiraOpen && (
                    <div className="rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ backgroundColor: C.bg, border: `1px dashed ${C.cardBorder}` }}>
                      {[
                        { key: "baseUrl" as const, label: "Base URL", placeholder: "https://yourcompany.atlassian.net" },
                        { key: "email" as const, label: "Email", placeholder: "you@company.com" },
                        { key: "token" as const, label: "API Token", placeholder: "ATATT..." },
                        { key: "projectKey" as const, label: "Project Key", placeholder: "BUG" },
                      ].map(field => (
                        <div key={field.key}>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
                            {field.label}
                          </label>
                          <input
                            type={field.key === "token" ? "password" : "text"}
                            value={jiraCreds[field.key]}
                            onChange={e => setJiraCreds(c => ({ ...c, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 text-xs rounded-lg border font-mono"
                            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder, color: C.text }}
                          />
                        </div>
                      ))}
                      <p className="text-[10px] sm:col-span-2" style={{ color: C.dim }}>
                        Credentials are sent to the server only. Never stored, never exposed client side.
                      </p>
                    </div>
                  )}

                  {tracker === "linear" && linearOpen && (
                    <div className="rounded-lg p-3" style={{ backgroundColor: C.bg, border: `1px dashed ${C.cardBorder}` }}>
                      <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
                        Linear API Key
                      </label>
                      <input
                        type="password"
                        value={linearCreds.apiKey}
                        onChange={e => setLinearCreds({ apiKey: e.target.value })}
                        placeholder="lin_api_..."
                        className="w-full px-3 py-2 text-xs rounded-lg border font-mono"
                        style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder, color: C.text }}
                      />
                      <p className="text-[10px] mt-2" style={{ color: C.dim }}>
                        Sent to the server only. Never stored.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={!prUrl.trim() || loading}
                    className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                    style={{ backgroundColor: C.accent, color: "#ffffff" }}
                  >
                    {loading ? "Analyzing..." : "Run Analysis"}
                  </button>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </form>
            ) : (
              <div className="p-6 space-y-4">
                <div className="rounded-lg p-4" style={{ backgroundColor: C.bg, border: `1px dashed ${C.cardBorder}` }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
                    Pre-built scenario
                  </p>
                  <p className="text-sm font-bold mb-1" style={{ color: C.text }}>
                    {DEMO_DATA.repo} &middot; PR #{DEMO_DATA.prNumber}
                  </p>
                  <p className="text-xs mb-3" style={{ color: C.muted }}>
                    {DEMO_DATA.prTitle}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs" style={{ color: C.muted }}>
                    <span><span className="font-bold" style={{ color: C.text }}>{DEMO_DATA.reviewers.length}</span> reviewers</span>
                    <span><span className="font-bold" style={{ color: C.text }}>{DEMO_DATA.comments.length}</span> review comments</span>
                    <span><span className="font-bold" style={{ color: C.text }}>{DEMO_DATA.bugTickets.length}</span> production bugs filed in 30 days</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={runDemo}
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                  style={{ backgroundColor: C.accent, color: "#ffffff" }}
                >
                  {loading ? "Running demo..." : "Load Demo Scenario"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-xl border p-8 mb-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <div className="space-y-2">
              {visibleLoadingSteps.slice(0, step + 1).map((s, i) => (
                <p
                  key={i}
                  className="text-sm font-mono flex items-center gap-2"
                  style={{ color: i === step ? C.text : C.dim, opacity: i === step ? 1 : 0.5 }}
                >
                  {i === step
                    ? <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.accent }} />
                    : <span className="text-xs" style={{ color: SIGNAL }}>&#10003;</span>
                  }
                  {s}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS DASHBOARD */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-8">

            {/* Reset bar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs font-mono truncate max-w-xs" style={{ color: C.dim }}>
                  {mode === "demo" ? `${result.repo} #${result.prNumber}` : prUrl}
                </p>
                {trackerStatus?.ok && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border whitespace-nowrap"
                    style={{ color: SIGNAL, backgroundColor: SIGNAL + "12", borderColor: SIGNAL + "40" }}
                  >
                    {tracker === "linear" ? "Linear" : "Jira"} connected. {trackerStatus.ticketsScanned.toLocaleString()} tickets scanned
                  </span>
                )}
                {(() => {
                  // Priority: explicit skip message > populated findings > generic unavailable.
                  if (greptileStatus?.message) {
                    return (
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border whitespace-normal max-w-md"
                        style={{ color: HIGH, backgroundColor: HIGH + "12", borderColor: HIGH + "40" }}
                      >
                        {greptileStatus.message}
                      </span>
                    );
                  }
                  if (result.codebaseFindings.length > 0) {
                    return (
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border whitespace-nowrap"
                        style={{ color: SIGNAL, backgroundColor: SIGNAL + "12", borderColor: SIGNAL + "40" }}
                      >
                        Greptile connected. {result.codebaseFindings.length} codebase finding{result.codebaseFindings.length === 1 ? "" : "s"}
                      </span>
                    );
                  }
                  return (
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border whitespace-nowrap"
                      style={{ color: HIGH, backgroundColor: HIGH + "12", borderColor: HIGH + "40" }}
                    >
                      Greptile content unavailable
                    </span>
                  );
                })()}
              </div>
              <button
                onClick={resetAll}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: C.muted }}
              >
                &#8592; Run another
              </button>
            </div>

            {/* 1. ROI HEADER CARD */}
            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: C.accentBg,
                border: `1px solid ${C.accent}40`,
                borderLeft: `4px solid ${C.accent}`,
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.accent }}>
                {result.roi.source === "real" ? `Real ROI from ${result.roi.projectKey ?? "ticket"} data` : result.roi.source === "no_correlation" ? "No production bugs correlated" : "Estimated ROI"}
              </p>
              <p className="text-xl sm:text-2xl font-black leading-tight mb-5" style={{ color: C.text }}>
                {result.roi.topLine}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                <div>
                  <p className="text-2xl font-black tabular-nums" style={{ color: NOISE }}>
                    {result.roi.noiseMinutes}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim }}>
                    Noise minutes
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums" style={{ color: CRITICAL }}>
                    {result.roi.missedCritical}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim }}>
                    Missed critical
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums" style={{ color: HIGH }}>
                    {result.roi.bugsToProduction}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim }}>
                    Bugs to prod
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums" style={{ color: C.text }}>
                    ${result.roi.remediationCostUSD.toLocaleString()}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.dim }}>
                    Remediation cost{result.roi.source === "real" ? "" : " (estimated)"}
                  </p>
                </div>
              </div>
              <p className="text-sm font-bold leading-snug pt-4 border-t" style={{ color: C.text, borderColor: C.accent + "40" }}>
                {result.roi.bottomLine}
              </p>
              {result.roi.source === "estimated" && (
                <p className="text-[10px] mt-2" style={{ color: C.dim }}>
                  Estimated using industry-standard remediation costs. Connect a bug tracker for real numbers.
                </p>
              )}
            </div>

            {/* 2. COMMENT ANALYSIS TABLE */}
            <div>
              <h2 className="text-base font-black mb-1" style={{ color: C.text }}>Comment Analysis</h2>
              <p className="text-xs mb-4" style={{ color: C.dim }}>
                Original signal/noise score, then re-scored with codebase context layered on top.
              </p>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.cardBorder }}>
                <table className="w-full text-xs" style={{ minWidth: 720 }}>
                  <thead>
                    <tr style={{ backgroundColor: C.cardBg }}>
                      {["Reviewer", "Comment", "Original", "Adjusted", "Reason", "Severity"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-bold whitespace-nowrap" style={{ color: C.dim, borderBottom: `1px solid ${C.cardBorder}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.comments.map((row, i) => {
                      const rowBg = i % 2 === 0 ? C.cardBg : C.bg;
                      const rowAccent = row.adjusted === "Signal" ? SIGNAL
                        : row.adjusted === "Noise" ? NOISE
                        : row.adjusted === "Context" ? CONTEXT
                        : C.cardBorder;
                      return (
                        <tr
                          key={i}
                          style={{
                            backgroundColor: rowBg,
                            borderBottom: `1px solid ${C.cardBorder}`,
                            borderLeft: `3px solid ${rowAccent}`,
                          }}
                        >
                          <td className="px-3 py-3 font-semibold align-top" style={{ color: C.text }}>{row.reviewer}</td>
                          <td className="px-3 py-3 align-top" style={{ color: C.text }}>{row.summary}</td>
                          <td className="px-3 py-3 align-top"><ClsBadge cls={row.original} /></td>
                          <td className="px-3 py-3 align-top"><ClsBadge cls={row.adjusted} /></td>
                          <td className="px-3 py-3 align-top max-w-md" style={{ color: C.muted }}>{row.reason}</td>
                          <td className="px-3 py-3 align-top">
                            {row.severity !== "None" && (
                              <V2Badge label={row.severity} color={SEVERITY_COLOR[row.severity]} bg={SEVERITY_COLOR[row.severity] + "15"} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. REVIEWER DNA PROFILES */}
            <div>
              <h2 className="text-base font-black mb-1" style={{ color: C.text }}>Reviewer DNA</h2>
              <p className="text-xs mb-4" style={{ color: C.dim }}>
                Concern archetypes from clustered comment embeddings. Codebase score reflects how aligned each reviewer is with actual codebase patterns.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {result.reviewerDNA.map(r => (
                  <div key={r.reviewer} className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                    <p className="text-sm font-black mb-1" style={{ color: C.text }}>{r.reviewer}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
                      {r.signals} of {r.comments} signal &middot; {r.signalPct}%
                    </p>

                    <div className="mb-3">
                      <MiniBar
                        pct={r.signalPct}
                        color={r.signalPct >= 60 ? SIGNAL : r.signalPct >= 40 ? MEDIUM : NOISE}
                        trackColor={C.cardBorder}
                      />
                    </div>

                    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
                      Concern archetypes
                    </p>
                    <div className="space-y-1.5 mb-4">
                      {r.archetypes.map(a => (
                        <div key={a.label}>
                          <div className="flex items-center justify-between text-[11px] mb-0.5">
                            <span style={{ color: C.text }}>{a.label}</span>
                            <span className="tabular-nums font-bold" style={{ color: C.muted }}>{a.pct}%</span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: C.cardBorder }}>
                            <div className="h-full rounded-full" style={{ width: `${a.pct}%`, backgroundColor: C.accent }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
                      Codebase knowledge
                    </p>
                    <div className="flex items-center gap-2 mb-4">
                      <p className="text-2xl font-black tabular-nums" style={{ color: r.codebaseScore >= 70 ? SIGNAL : r.codebaseScore >= 40 ? MEDIUM : NOISE }}>
                        {r.codebaseScore}
                      </p>
                      <span className="text-xs font-bold" style={{ color: C.dim }}>/ 100</span>
                    </div>

                    {r.caught.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: SIGNAL }}>Caught</p>
                        {r.caught.map((c, i) => (
                          <p key={i} className="text-[11px] leading-snug" style={{ color: C.muted }}>&#10003; {c}</p>
                        ))}
                      </div>
                    )}

                    {r.missed.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: NOISE }}>Missed</p>
                        {r.missed.map((c, i) => (
                          <p key={i} className="text-[11px] leading-snug" style={{ color: C.muted }}>&times; {c}</p>
                        ))}
                      </div>
                    )}

                    <p className="text-xs italic leading-snug pt-3 border-t" style={{ color: C.text, borderColor: C.cardBorder }}>
                      {r.verdict}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. CODEBASE GROUNDING PANEL (dark) */}
            <div className="rounded-xl border overflow-hidden shadow-sm" style={{ backgroundColor: PANEL, borderColor: PANEL_BORDER }}>
              <div className="px-6 py-5 border-b" style={{ borderColor: PANEL_BORDER }}>
                <h2 className="text-lg font-black tracking-tight" style={{ color: C.text }}>Codebase Grounding</h2>
                <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                  What the codebase index found. Cross referenced against every human comment.
                </p>
              </div>
              <div className="p-6 space-y-3">
                {result.codebaseFindings.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-4 flex items-start gap-3 flex-wrap"
                    style={{ backgroundColor: PANEL_INNER, borderColor: PANEL_BORDER }}
                  >
                    <StatusPill status={f.status} />
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm leading-relaxed" style={{ color: C.text }}>{f.text}</p>
                      {f.attribution && (
                        <p className="text-[10px] mt-1" style={{ color: "#6b7280" }}>
                          flagged by {f.attribution}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. BUG CORRELATION SECTION */}
            {result.bugTickets.length > 0 && (
              <div>
                <h2 className="text-base font-black mb-1" style={{ color: C.text }}>
                  Bugs that survived this review
                </h2>
                <p className="text-xs mb-4" style={{ color: C.dim }}>
                  {result.roi.source === "real"
                    ? `From ${result.roi.projectKey ?? "ticket data"}. Filed in the 30 days after merge. Files in each ticket overlap with files this PR changed.`
                    : "Estimated. Industry baseline for a PR of this complexity."}
                </p>
                <div className="space-y-3">
                  {result.bugTickets.map(t => (
                    <div
                      key={t.id}
                      className="rounded-xl border p-4"
                      style={{
                        backgroundColor: C.cardBg,
                        borderColor: C.cardBorder,
                        borderLeft: `4px solid ${PRIORITY_COLOR[t.priority]}`,
                      }}
                    >
                      <div className="flex items-start gap-3 flex-wrap mb-2">
                        <V2Badge label={t.priority} color={PRIORITY_COLOR[t.priority]} bg={PRIORITY_COLOR[t.priority] + "15"} />
                        <span className="text-xs font-mono" style={{ color: C.dim }}>{t.id}</span>
                        <V2Badge
                          label={t.status === "missed entirely" ? "Missed entirely" : "Flagged but merged"}
                          color={t.status === "missed entirely" ? NOISE : HIGH}
                          bg={(t.status === "missed entirely" ? NOISE : HIGH) + "15"}
                        />
                        <span className="text-[10px] font-mono" style={{ color: C.dim }}>
                          filed {t.daysAfterMerge} days after merge
                        </span>
                      </div>
                      <p className="text-sm font-bold mb-1" style={{ color: C.text }}>{t.title}</p>
                      <p className="text-xs mb-2" style={{ color: C.muted }}>{t.reviewerLink}</p>
                      <p className="text-xs font-bold tabular-nums" style={{ color: C.text }}>
                        Estimated remediation: ${t.costUSD.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.bugTickets.length === 0 && result.roi.source === "no_correlation" && (
              <div
                className="rounded-xl p-5"
                style={{ backgroundColor: SIGNAL + "10", border: `1px solid ${SIGNAL}40` }}
              >
                <p className="text-sm font-bold mb-1" style={{ color: SIGNAL }}>
                  &#10003; No production bugs correlated to this PR
                </p>
                <p className="text-xs" style={{ color: C.muted }}>
                  Scanned {trackerStatus?.ticketsScanned ?? 0} tickets in the 30 days after merge. None mention files this PR changed. Clean review.
                </p>
              </div>
            )}

            {/* 6. SELF-IMPROVING CALLOUT — only renders when the live dataset
                count is available from Supabase. Hidden entirely otherwise. */}
            {result.datasetCount !== null && (
              <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.dim }}>
                      Self-improving model
                      <Tip label="How this works" C={C}>
                        In production, every analyzed PR contributes labeled comments to a training set. Once the dataset crosses 5,000 labeled comments, the scoring layer is replaced with a fine-tuned classifier trained on real usage data. The generic scoring layer is the cold start; the team-specific classifier is the long term system.
                      </Tip>
                    </p>
                    <p className="text-sm mt-1" style={{ color: C.text }}>
                      Every analysis trains the model. This session contributed{" "}
                      <span className="font-bold">{result.contributedThisSession} labeled comments</span> to the reviewer intelligence dataset.
                    </p>
                  </div>
                  <span className="text-xs font-bold tabular-nums" style={{ color: C.muted }}>
                    {result.datasetCount.toLocaleString()} / 5,000
                  </span>
                </div>
                <MiniBar
                  pct={Math.min(100, (result.datasetCount / 5000) * 100)}
                  color={C.accent}
                  trackColor={C.cardBorder}
                />
                <p className="text-[10px] mt-2" style={{ color: C.dim }}>
                  Model retrains at 5,000 labeled comments.
                </p>
              </div>
            )}

          </div>
        )}

        {/* BELOW-THE-TOOL: Why It Matters cards */}
        <section className="mt-12 mb-6">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            Why it matters
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              {
                title: "Codebase-aware scoring changes everything",
                body: "Generic signal/noise analysis treats all codebases the same. A naming convention comment is noise in a codebase that ignores naming conventions. Greptile's codebase graph turns generic analysis into specific, actionable intelligence.",
              },
              {
                title: "Reviewer profiles reveal team health",
                body: "Knowing that one reviewer has a 25% signal ratio and zero codebase knowledge is not personal. It is structural. It tells you who should review what, where your team has blind spots, and where your review process is costing you time.",
              },
              {
                title: "Bugs that survive review have a paper trail",
                body: "Every production bug started as a code change that someone reviewed and approved. Connecting Jira tickets to PR reviews closes the loop, and turns your bug history into a training dataset for better reviews.",
              },
            ].map(card => (
              <div key={card.title} className="rounded-xl border p-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                <p className="text-xs font-bold mb-2" style={{ color: C.text }}>{card.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{card.body}</p>
              </div>
            ))}
          </div>

          {/* Why I Built This */}
          <div className="rounded-xl border p-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <p className="text-xs font-bold mb-2" style={{ color: C.text }}>Why I Built This</p>
            <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
              After our conversation I went home and kept building. The idea of grounding review scores in actual codebase patterns felt too good to leave as a concept. This is what it looks like with pen to paper.
            </p>
          </div>
        </section>

      </div>
    </>
  );
}
