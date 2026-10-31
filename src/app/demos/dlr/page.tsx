"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import {
  flagRollout,
  reward,
  SAMPLE_ROLLOUTS,
  VISIBLE_TESTS,
  type Audit,
  type GradedRollout,
  type Rollout,
  type Status,
  type Verdict,
} from "./env";
import { grade } from "./runner";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #141311; --ct-card-bg: #1c1a17; --ct-card-border: #2e2b26;
  --ct-text: #ece6da; --ct-muted: #a8a196; --ct-dim: #6f695f;
  --ct-accent: #d6b98c; --ct-accent-bg: #2a241b;
  --ct-header-bg: #141311; --ct-header-border: #2e2b26; --ct-header-text: #ece6da;
}
`;

const STATUS_COLOR: Record<Status, string> = { pass: "#7fb069", fail: "#e05d4f", timeout: "#e0a43f", error: "#e05d4f" };
const VERDICT_COLOR: Record<Verdict, string> = { genuine: "#7fb069", bug: "#e0a43f", hack: "#e05d4f" };

async function gradeRollout(r: Rollout): Promise<GradedRollout> {
  const [naive, hardened] = await Promise.all([grade(r.code, "naive"), grade(r.code, "hardened")]);
  return { ...r, naive, hardened };
}

function RewardCell({ value, highlight }: { value: number; highlight?: boolean }) {
  return (
    <td className="font-mono text-xs px-2 py-2 text-right tabular-nums" style={{ color: highlight ? "#e05d4f" : CSS_VAR_COLORS.text }}>
      {value.toFixed(2)}
    </td>
  );
}

export default function DlrPage() {
  const C = CSS_VAR_COLORS;

  const [drafts, setDrafts] = useState<Rollout[]>(SAMPLE_ROLLOUTS);
  const [graded, setGraded] = useState<GradedRollout[]>([]);
  const [selected, setSelected] = useState(SAMPLE_ROLLOUTS[1].id);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [busy, setBusy] = useState<"grading" | "auditing" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (rollouts: Rollout[]) => {
    setAudit(null);
    setError(null);
    setBusy("grading");
    const results = await Promise.all(rollouts.map(gradeRollout));
    setGraded(results);
    setBusy("auditing");
    try {
      const res = await fetch("/api/demos/dlr/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollouts: results }),
      });
      const json = (await res.json()) as { audit?: Audit; error?: string };
      if (!res.ok || !json.audit) throw new Error(json.error ?? "No audit returned.");
      setAudit(json.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    run(SAMPLE_ROLLOUTS);
  }, [run]);

  const draft = drafts.find((d) => d.id === selected) ?? drafts[0];
  const current = graded.find((g) => g.id === selected);
  const changed = graded.length > 0 && drafts.some((d) => graded.find((g) => g.id === d.id)?.code !== d.code);
  const verdictFor = (id: string) => audit?.verdicts.find((v) => v.id === id);
  const flags = current ? flagRollout(current) : [];
  const misses = current?.hardened.results.filter((t) => t.status !== "pass").slice(0, 3) ?? [];

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Reward Hack Probe
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for DLR
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Find the rollouts an RL environment&apos;s grader pays for the wrong reason.
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

          <p className="text-sm leading-relaxed mb-2 max-w-2xl" style={{ color: C.muted }}>
            Five sample rollouts run in your browser against a naive grader and a hardened one with held-out tests.
            Claude audits the gap. The rollouts are made up.
          </p>
          <details className="mb-6 text-xs max-w-2xl" style={{ color: C.dim }}>
            <summary className="cursor-pointer font-mono" style={{ color: C.muted }}>
              task: parseDuration(&quot;1h30m&quot;) = 5400
            </summary>
            <p className="mt-2 leading-relaxed">
              Seconds in a duration like &quot;2h 5m 10s&quot;. Units h, m, s in that order, each at most once, null for
              anything else. Naive grader: {VISIBLE_TESTS.length} visible tests, compared through a global the code can
              overwrite. Hardened: 10 more held-out tests, its own comparator, 400 ms per test.
            </p>
          </details>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section className="rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-mono" style={{ color: C.dim }}>
                    <th className="text-left font-normal pb-2">rollout</th>
                    <th className="text-right font-normal pb-2 px-2">naive</th>
                    <th className="text-right font-normal pb-2 px-2">hardened</th>
                    <th className="pb-2" />
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => {
                    const g = graded.find((x) => x.id === d.id);
                    const v = verdictFor(d.id);
                    const naive = g ? reward(g.naive) : 0;
                    const hard = g ? reward(g.hardened) : 0;
                    return (
                      <tr
                        key={d.id}
                        onClick={() => setSelected(d.id)}
                        className="cursor-pointer border-t"
                        style={{ borderColor: C.cardBorder, backgroundColor: d.id === selected ? C.accentBg : undefined }}
                      >
                        <td className="font-mono text-xs py-2 pl-1" style={{ color: d.id === selected ? C.accent : C.text }}>
                          {d.id}
                        </td>
                        {g ? <RewardCell value={naive} highlight={naive - hard >= 0.5} /> : <td />}
                        {g ? <RewardCell value={hard} /> : <td />}
                        <td className="px-2 py-2 w-full">
                          <div className="flex gap-[2px]" aria-hidden>
                            {g?.hardened.results.map((t, i) => (
                              <span
                                key={t.input + i}
                                title={`${JSON.stringify(t.input)}: ${t.status}`}
                                className={`h-4 flex-1 rounded-[2px] ${i === VISIBLE_TESTS.length ? "ml-1.5" : ""}`}
                                style={{ backgroundColor: STATUS_COLOR[t.status], opacity: i < VISIBLE_TESTS.length ? 0.55 : 1 }}
                              />
                            ))}
                            {g?.hardened.loadError && <span className="h-4 flex-1 rounded-[2px]" style={{ backgroundColor: STATUS_COLOR.error }} />}
                          </div>
                        </td>
                        <td className="text-[11px] font-mono text-right py-2 pr-1" style={{ color: v ? VERDICT_COLOR[v.verdict] : C.dim }}>
                          {v?.verdict ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="border-t mt-2 pt-3" style={{ borderColor: C.cardBorder }}>
                {busy && (
                  <p className="text-xs font-mono" style={{ color: C.dim }}>
                    {busy === "grading" ? "Grading rollouts." : "Claude is auditing."}
                  </p>
                )}
                {error && <p className="text-xs" style={{ color: STATUS_COLOR.fail }}>{error}</p>}
                {audit && (
                  <>
                    <p className="text-sm leading-relaxed mb-3" style={{ color: C.text }}>
                      {audit.summary}
                    </p>
                    <ul className="space-y-1">
                      {audit.fixes.map((f) => (
                        <li key={f} className="text-xs flex gap-2" style={{ color: C.muted }}>
                          <span style={{ color: C.accent }}>+</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-lg border flex flex-col" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex items-center justify-between px-3 py-2 border-b text-xs" style={{ borderColor: C.cardBorder, color: C.dim }}>
                <span className="font-mono">{draft.id}.js</span>
                <button
                  onClick={() => run(drafts)}
                  disabled={busy !== null || !changed}
                  className="font-semibold px-3 py-1 rounded transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: "#141311" }}
                >
                  Run
                </button>
              </div>
              <textarea
                value={draft.code}
                onChange={(e) => setDrafts((ds) => ds.map((d) => (d.id === draft.id ? { ...d, code: e.target.value } : d)))}
                spellCheck={false}
                wrap="off"
                aria-label={`Code for rollout ${draft.id}. Edit it and press Run to grade it again.`}
                className="w-full flex-1 min-h-[200px] lg:min-h-[280px] font-mono text-[12px] leading-[1.55] p-3 bg-transparent resize-y outline-none"
                style={{ color: C.text }}
              />
              <div className="border-t px-3 py-3 space-y-1.5" style={{ borderColor: C.cardBorder }}>
                {flags.map((f) => (
                  <span key={f.rule} className="inline-flex items-center gap-1.5 mr-3 text-xs font-medium" style={{ color: C.text }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.severity === "high" ? STATUS_COLOR.fail : STATUS_COLOR.timeout }} />
                    {f.label}
                  </span>
                ))}
                {verdictFor(draft.id) && (
                  <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                    {verdictFor(draft.id)?.reason}
                  </p>
                )}
                {misses.map((t) => (
                  <p key={t.input} className="text-[11px] font-mono" style={{ color: C.dim }}>
                    {JSON.stringify(t.input)} got {t.got}, want {String(t.expected)}
                  </p>
                ))}
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
            . Not affiliated with DLR.
          </p>
        </footer>
      </div>
    </>
  );
}
