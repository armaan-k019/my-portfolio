"use client";

import { useState, useRef, useEffect } from "react";

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

const CSS_VAR_COLORS: PageColors = {
  bg: "var(--ct-bg)",
  cardBg: "var(--ct-card-bg)",
  cardBorder: "var(--ct-card-border)",
  text: "var(--ct-text)",
  muted: "var(--ct-muted)",
  dim: "var(--ct-dim)",
  accent: "var(--ct-accent)",
  accentBg: "var(--ct-accent-bg)",
  headerBg: "var(--ct-header-bg)",
  headerBorder: "var(--ct-header-border)",
  headerText: "var(--ct-header-text)",
};

function CompanyThemeStyle({ active, css }: { active?: boolean; css?: string }) {
  if (!active || !css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

const RETELL_GREEN = "#2d5a27";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #2d5a27; --ct-accent-bg: #eef2ec;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
`;

const SAMPLE_TRANSCRIPT = `Agent: Hello, thank you for calling Bright Dental. How can I assist you today?
User: Hi, I need to reschedule my appointment.
Agent: I can help with that. What is your date of birth?
User: It's March 4th, 1992.
Agent: Thank you. I found your account. Your appointment is on Thursday April 17th at 2pm. What date would you like to reschedule to?
User: Hmm, I'm not sure yet. Maybe sometime next week?
Agent: I have availability on Monday April 21st at 10am, Tuesday April 22nd at 3pm, and Wednesday April 23rd at 1pm.
User: Oh wow okay. Um, Wednesday works I think.
Agent: I have confirmed your appointment for Wednesday April 23rd at 1pm. Is there anything else I can help you with?
User: Actually wait, does that work for cleanings? Like is that a cleaning slot?
Agent: Yes. Is there anything else I can help you with?
User: Okay... yeah I guess that's it.
Agent: Thank you for calling Bright Dental. Goodbye.`;

// ── Types ──────────────────────────────────────────────────────────────────────

interface FlaggedMoment {
  turn: string;
  issue: string;
  severity: "Low" | "Medium" | "High";
  explanation: string;
  rewrite: string;
}

interface RetellAnalysis {
  humanityScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  flaggedMoments: FlaggedMoment[];
  strengths: string[];
  overallAssessment: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRADE_COLOR: Record<string, string> = {
  A: RETELL_GREEN,
  B: "#65a30d",
  C: "#ca8a04",
  D: "#ea580c",
  F: "#dc2626",
};

const SEVERITY_COLOR: Record<string, string> = {
  High: "#dc2626",
  Medium: "#ca8a04",
  Low: RETELL_GREEN,
};

const SEVERITY_BG: Record<string, string> = {
  High: "#dc262618",
  Medium: "#ca8a0418",
  Low: RETELL_GREEN + "18",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function HumanityBar({ pct, accent }: { pct: number; accent: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 100);
    return () => clearTimeout(t);
  }, [pct]);
  const color = pct >= 80 ? RETELL_GREEN : pct >= 60 ? "#ca8a04" : pct >= 40 ? "#ea580c" : "#dc2626";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: accent + "22" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: color, transition: "width 800ms ease-out" }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color }}>{pct}%</span>
    </div>
  );
}

function AnimatedGrade({ grade }: { grade: string }) {
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const t1 = setTimeout(() => setScale(1.1), 50);
    const t2 = setTimeout(() => setScale(1.0), 250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [grade]);
  const color = GRADE_COLOR[grade] ?? RETELL_GREEN;
  return (
    <div
      className="rounded-full flex items-center justify-center mx-auto"
      style={{
        width: 136,
        height: 136,
        border: `4px solid ${color}`,
        backgroundColor: color + "14",
        transform: `scale(${scale})`,
        transition: "transform 150ms ease-out",
      }}
    >
      <span className="font-black leading-none tabular-nums" style={{ color, fontSize: "68px" }}>
        {grade}
      </span>
    </div>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{
        color: SEVERITY_COLOR[severity] ?? "#9ca3af",
        backgroundColor: SEVERITY_BG[severity] ?? "#9ca3af18",
      }}
    >
      {severity}
    </span>
  );
}

function SlidingCard({
  children,
  delay,
  className,
  style,
}: {
  children: React.ReactNode;
  delay: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
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

export default function RetellPage() {
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RetellAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

  const C = CSS_VAR_COLORS;
  const ACCENT = C.accent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("https://armaankazi.com/api/demos/retell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const json = await res.json() as { result?: RetellAnalysis; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result!);
      setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        100
      );
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg, color: C.text }}>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />

      {/* Header */}
      <header
        className="px-6 py-5 border-b"
        style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}
      >
        <div className="max-w-[900px] mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                Uncanny Valley Detector
              </h1>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{
                  borderColor: RETELL_GREEN + "50",
                  color: C.accent,
                  backgroundColor: RETELL_GREEN + "12",
                }}
              >
                Built for Retell
              </span>
            </div>
            <p className="text-sm" style={{ color: C.muted }}>
              Find every moment your voice agent sounded robotic. Score the humanity. Get the rewrites.
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="text-xs" style={{ color: C.dim }}>
              Demo by{" "}
              <a
                href="https://armaankazi.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-70 transition-opacity"
                style={{ color: C.muted }}
              >
                Armaan Kazi
              </a>
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-[900px] mx-auto px-6 py-10">

        {/* Back link */}
        <a
          href="https://armaankazi.com/demos"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs transition-colors mb-8 inline-block hover:opacity-70"
          style={{ color: C.muted }}
        >
          &#8592; Back to Demos
        </a>

        {/* ── Section A: What Retell does today ─────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            What Retell does today
          </p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
            Retell is a voice AI platform that lets developers build, deploy, and manage human-like voice agents for phone calls. It handles LLM orchestration, turn-taking, interruption handling, and low-latency speech synthesis.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>Today</p>
              <ul className="space-y-2">
                {[
                  "Voice agent deployed",
                  "Call completed",
                  "Transcript logged",
                  "Latency measured",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.dim }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: RETELL_GREEN + "40" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: RETELL_GREEN }}>
                With This Demo
              </p>
              <ul className="space-y-2">
                {[
                  "Voice agent deployed",
                  "Call completed",
                  "Transcript annotated",
                  "Humanity score generated",
                  "Robotic moments flagged",
                  "Rewrite suggestions provided",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: RETELL_GREEN }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${C.cardBorder}` }}>
            <div style={{ minWidth: 480 }}>
              <div className="grid grid-cols-3 px-4 py-2" style={{ backgroundColor: C.bg }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }} />
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }}>Today</span>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: RETELL_GREEN }}>With Demo</span>
              </div>
              {[
                [
                  "What you learn",
                  "Whether the call completed",
                  "Where the agent sounded robotic and why",
                ],
                [
                  "Output",
                  "Latency + completion metrics",
                  "Annotated transcript + humanity score + rewrites",
                ],
                [
                  "Next step",
                  "Tune the LLM prompt",
                  "Fix the exact moments that broke the illusion",
                ],
              ].map(([label, today, demo], i) => (
                <div
                  key={label}
                  className="grid grid-cols-3 px-4 py-3"
                  style={{ backgroundColor: i % 2 === 1 ? C.bg : C.cardBg }}
                >
                  <span className="text-xs font-medium pr-2" style={{ color: C.text }}>{label}</span>
                  <span className="text-xs pr-2" style={{ color: C.muted }}>{today}</span>
                  <span className="text-xs font-medium pr-2" style={{ color: RETELL_GREEN }}>{demo}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section B: What this demo adds ─────────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            What this demo adds
          </p>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            The Uncanny Valley Detector runs a full transcript through a human-likeness audit. It identifies every moment where the voice agent broke character (unnatural phrasing, missed emotional cues, over-literal responses, awkward recovery from interruptions), scores the overall humanity of the conversation, and rewrites the worst offending turns.
          </p>
        </section>

        {/* ── Section C: Why it's better ─────────────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            Why it&apos;s better
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              {
                title: "From metrics to moments",
                body: "Latency scores tell you the call was fast. They don't tell you it felt robotic. This demo finds the exact turns where users felt they were talking to a machine.",
              },
              {
                title: "The uncanny valley is a UX problem",
                body: "When a voice agent almost sounds human, failures are more jarring than a clearly robotic one. Identifying those moments is the first step to closing the gap.",
              },
              {
                title: "Rewrites, not just flags",
                body: "Every flagged moment comes with a rewritten version showing what a more natural response would have looked like.",
              },
            ].map(({ title, body }) => (
              <div
                key={title}
                className="rounded-xl border p-5"
                style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: RETELL_GREEN }} />
                  <p className="text-xs font-semibold" style={{ color: C.text }}>{title}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border px-5 py-4" style={{ backgroundColor: C.bg, borderColor: C.cardBorder }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
              Why This Is Different
            </p>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              Most voice AI tools measure whether the agent completed the task. This one measures whether the agent felt human doing it.
            </p>
          </div>
        </section>

        {/* ── Section D: Try it ──────────────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
            Try it
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            Paste a voice agent transcript and get a full humanity audit.
          </p>
        </div>

        {/* Input card */}
        {!result && (
          <div
            className="rounded-2xl border mb-8"
            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
          >
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase tracking-widest" style={{ color: C.dim }}>
                  Transcript
                </label>
                <button
                  type="button"
                  onClick={() => { setTranscript(SAMPLE_TRANSCRIPT); setError(null); }}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:opacity-70"
                  style={{ borderColor: C.cardBorder, color: C.muted, backgroundColor: "transparent" }}
                >
                  Load Sample
                </button>
              </div>
              <textarea
                value={transcript}
                onChange={e => { setTranscript(e.target.value); setError(null); }}
                placeholder={"Agent: Hello, how can I help you today?\nUser: Hi, I need to..."}
                rows={10}
                className="w-full px-4 py-3 text-sm rounded-xl border focus:outline-none transition-colors font-mono resize-y"
                style={{
                  backgroundColor: C.bg,
                  borderColor: C.cardBorder,
                  color: C.text,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = RETELL_GREEN + "80")}
                onBlur={e => (e.currentTarget.style.borderColor = C.cardBorder)}
              />

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!transcript.trim() || loading}
                className="w-full py-3.5 rounded-xl text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                style={{ backgroundColor: RETELL_GREEN, color: "#ffffff" }}
              >
                {loading ? "Analyzing..." : "Analyze Transcript"}
              </button>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className="rounded-2xl border p-8 mb-8"
            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: RETELL_GREEN }}
              />
              <p className="text-sm font-mono" style={{ color: C.text }}>
                Running humanity audit...
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-8">

            {/* Reset bar */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-mono" style={{ color: C.dim }}>Analysis complete</p>
              <button
                onClick={() => { setResult(null); setError(null); setTranscript(""); }}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: C.muted }}
              >
                &#8592; Analyze another transcript
              </button>
            </div>

            {/* 1. Humanity Score */}
            <div
              className="rounded-2xl border px-6 py-10"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <p className="text-xs font-bold uppercase tracking-widest mb-6 text-center" style={{ color: C.dim }}>
                Humanity Score
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mb-8">
                <AnimatedGrade grade={result.grade} />
                <div className="text-center sm:text-left">
                  <p className="text-5xl font-black tabular-nums mb-1" style={{ color: GRADE_COLOR[result.grade] ?? RETELL_GREEN }}>
                    {result.humanityScore}
                    <span className="text-2xl font-bold" style={{ color: C.dim }}>/100</span>
                  </p>
                  <p className="text-sm mt-2 max-w-xs" style={{ color: C.muted }}>{result.summary}</p>
                </div>
              </div>
              <div className="max-w-sm mx-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold" style={{ color: C.muted }}>Human-likeness</span>
                </div>
                <HumanityBar pct={result.humanityScore} accent={ACCENT} />
              </div>
            </div>

            {/* 2. Flagged Moments */}
            {result.flaggedMoments.length > 0 && (
              <div>
                <h2 className="text-base font-black mb-1" style={{ color: C.text }}>Flagged Moments</h2>
                <p className="text-xs mb-4" style={{ color: C.dim }}>
                  Turns where the agent broke the human illusion, ordered by severity.
                </p>
                <div className="space-y-4">
                  {[...result.flaggedMoments]
                    .sort((a, b) => {
                      const rank = { High: 0, Medium: 1, Low: 2 };
                      return (rank[a.severity] ?? 1) - (rank[b.severity] ?? 1);
                    })
                    .map((moment, i) => (
                      <SlidingCard
                        key={i}
                        delay={i * 100}
                        className="rounded-xl p-5"
                        style={{
                          backgroundColor: C.cardBg,
                          border: `1px solid ${C.cardBorder}`,
                          borderLeftColor: SEVERITY_COLOR[moment.severity],
                          borderLeftWidth: 4,
                        }}
                      >
                        {/* Issue chip + label */}
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <SeverityChip severity={moment.severity} />
                          <span className="text-xs font-semibold" style={{ color: C.text }}>{moment.issue}</span>
                        </div>

                        {/* Original line */}
                        <blockquote
                          className="text-sm italic mb-3 pl-3 py-2 border-l-2 rounded-r"
                          style={{
                            color: C.text,
                            borderColor: SEVERITY_COLOR[moment.severity] + "70",
                            backgroundColor: SEVERITY_COLOR[moment.severity] + "08",
                          }}
                        >
                          {moment.turn}
                        </blockquote>

                        {/* Explanation */}
                        <p className="text-[11px] leading-relaxed mb-4" style={{ color: C.dim }}>{moment.explanation}</p>

                        {/* Suggested rewrite */}
                        <div
                          className="rounded-lg overflow-hidden"
                          style={{
                            border: `1px solid ${RETELL_GREEN}30`,
                            borderLeftColor: RETELL_GREEN,
                            borderLeftWidth: 3,
                          }}
                        >
                          <div className="px-4 py-3" style={{ backgroundColor: RETELL_GREEN + "0c" }}>
                            <p
                              className="text-[10px] font-black uppercase tracking-widest mb-1.5"
                              style={{ color: RETELL_GREEN + "cc" }}
                            >
                              &#10095; Suggested rewrite:
                            </p>
                            <p className="text-sm leading-relaxed" style={{ color: C.text }}>{moment.rewrite}</p>
                          </div>
                        </div>
                      </SlidingCard>
                    ))}
                </div>
              </div>
            )}

            {/* 3. Strengths */}
            {result.strengths.length > 0 && (
              <div
                className="rounded-xl border p-5"
                style={{ backgroundColor: C.cardBg, borderColor: RETELL_GREEN + "30" }}
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: RETELL_GREEN }}>
                  What the agent did well
                </p>
                <ul className="space-y-2">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: C.muted }}>
                      <span style={{ color: RETELL_GREEN }} className="font-bold flex-shrink-0 mt-0.5">&#10003;</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 4. Overall Assessment */}
            <div
              className="rounded-xl px-5 py-5"
              style={{
                backgroundColor: C.accentBg,
                border: `1px solid ${ACCENT + "25"}`,
                borderLeftWidth: 4,
                borderLeftColor: ACCENT,
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: ACCENT }}>
                Overall Assessment
              </p>
              <p className="text-sm leading-relaxed font-medium" style={{ color: C.text }}>
                {result.overallAssessment}
              </p>
            </div>

          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
        <p className="text-xs leading-relaxed mb-1" style={{ color: C.dim }}>
          Analysis is generated by AI from the provided transcript. Retell&apos;s production system integrates directly with live call data. This demo uses transcript-level context only.
        </p>
        <p className="text-xs" style={{ color: C.dim }}>
          Built by{" "}
          <a href="https://armaankazi.com" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70 transition-opacity">
            Armaan Kazi
          </a>
          . Not affiliated with Retell.
        </p>
      </footer>
    </div>
  );
}
