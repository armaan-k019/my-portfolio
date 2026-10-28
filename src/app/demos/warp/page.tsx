"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { flagSession, parseSession, SAMPLE_SESSION, type Flag, type Review, type Severity, type Step } from "./session";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #0f1115; --ct-card-bg: #161920; --ct-card-border: #262b36;
  --ct-text: #e6e8ec; --ct-muted: #a0a8b6; --ct-dim: #6b7385;
  --ct-accent: #5fb3a8; --ct-accent-bg: #15211f;
  --ct-header-bg: #0f1115; --ct-header-border: #262b36; --ct-header-text: #e6e8ec;
}
`;

const SEVERITY_COLOR: Record<Severity, string> = { high: "#ef4444", medium: "#f59e0b", low: "#8b93a3" };

interface Row {
  step: number;
  flags: Flag[];
  note?: string;
}

function rowsFor(flags: Flag[], review: Review | null): Row[] {
  const byStep = new Map<number, Row>();
  for (const f of flags) {
    const row = byStep.get(f.step) ?? { step: f.step, flags: [] };
    row.flags.push(f);
    byStep.set(f.step, row);
  }
  for (const n of review?.notes ?? []) {
    const row = byStep.get(n.step) ?? { step: n.step, flags: [] };
    row.note = n.note;
    byStep.set(n.step, row);
  }
  const rank = (r: Row) => (r.flags.length ? Math.min(...r.flags.map((f) => ["high", "medium", "low"].indexOf(f.severity))) : 3);
  return [...byStep.values()].sort((a, b) => rank(a) - rank(b) || a.step - b.step);
}

function tickColor(step: Step, flags: Flag[]): string {
  const hit = flags.filter((f) => f.step === step.index);
  if (hit.some((f) => f.severity === "high")) return SEVERITY_COLOR.high;
  if (hit.some((f) => f.severity === "medium")) return SEVERITY_COLOR.medium;
  if (hit.length) return SEVERITY_COLOR.low;
  return step.kind === "agent" ? "#3b4252" : "#2a303c";
}

export default function WarpPage() {
  const C = CSS_VAR_COLORS;

  const [session, setSession] = useState(SAMPLE_SESSION);
  const [reviewed, setReviewed] = useState(SAMPLE_SESSION);
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rules run on the session as reviewed, so flags and Claude's notes agree.
  const steps = useMemo(() => parseSession(reviewed), [reviewed]);
  const flags = useMemo(() => flagSession(steps), [steps]);
  const rows = rowsFor(flags, review);

  const run = useCallback(async (text: string) => {
    setReviewed(text);
    setReview(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/demos/warp/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: text }),
      });
      const json = (await res.json()) as { review?: Review; error?: string };
      if (!res.ok || !json.review) throw new Error(json.error ?? "No review returned.");
      setReview(json.review);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run(SAMPLE_SESSION);
  }, [run]);

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Agent Run Reviewer
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Warp
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Read a coding agent&apos;s session before you merge its work.
              </p>
            </div>
            <span className="text-xs flex-shrink-0" style={{ color: C.dim }}>
              Demo by{" "}
              <Link href="/" className="underline hover:opacity-70 transition-opacity" style={{ color: C.muted }}>
                Armaan Kazi
              </Link>
            </span>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/demos" className="text-xs mb-6 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            Fixed rules mark risky steps in the session, then Claude checks the agent&apos;s final claim against the
            evidence. The sample session is made up.
          </p>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* Session input */}
            <section className="rounded-lg border flex flex-col" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex items-center justify-between px-3 py-2 border-b text-xs" style={{ borderColor: C.cardBorder, color: C.dim }}>
                <span className="font-mono">session.log (sample)</span>
                <button
                  onClick={() => run(session)}
                  disabled={loading || session === reviewed}
                  className="font-semibold px-3 py-1 rounded transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: "#0f1115" }}
                >
                  Review
                </button>
              </div>
              <textarea
                value={session}
                onChange={(e) => setSession(e.target.value)}
                spellCheck={false}
                wrap="off"
                aria-label="Agent session. Lines start with $ for commands, agent: for messages, or diff --git for diffs."
                className="w-full flex-1 min-h-[260px] lg:min-h-[460px] font-mono text-[12px] leading-[1.55] p-3 bg-transparent resize-y outline-none"
                style={{ color: C.text }}
              />
            </section>

            {/* Review */}
            <section className="rounded-lg border p-4 order-first lg:order-none" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex gap-[3px] mb-4" aria-hidden>
                {steps.map((s) => (
                  <div
                    key={s.index}
                    title={`${s.index}. ${s.head}`}
                    className="h-6 flex-1 rounded-sm"
                    style={{ backgroundColor: tickColor(s, flags) }}
                  />
                ))}
              </div>

              <ul className="space-y-2 mb-4">
                {rows.map((r) => (
                  <li key={r.step} className="flex gap-3 text-sm">
                    <span className="font-mono text-xs w-6 pt-0.5 text-right flex-shrink-0" style={{ color: C.dim }}>
                      {r.step}
                    </span>
                    <div>
                      {r.flags.map((f) => (
                        <span key={f.rule} className="inline-flex items-center gap-1.5 mr-3 font-medium" style={{ color: C.text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[f.severity] }} />
                          {f.label}
                        </span>
                      ))}
                      {r.note && (
                        <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                          {r.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="border-t pt-3" style={{ borderColor: C.cardBorder }}>
                {loading && <p className="text-xs font-mono" style={{ color: C.dim }}>Claude is reading the session.</p>}
                {error && <p className="text-xs" style={{ color: SEVERITY_COLOR.high }}>{error}</p>}
                {review && (
                  <>
                    <p className="text-sm leading-relaxed mb-3" style={{ color: C.text }}>
                      {review.summary}
                    </p>
                    <ul className="space-y-1">
                      {review.checklist.map((c) => (
                        <li key={c} className="text-xs flex gap-2" style={{ color: C.muted }}>
                          <span style={{ color: C.accent }}>&#9744;</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Warp.
          </p>
        </footer>
      </div>
    </>
  );
}
