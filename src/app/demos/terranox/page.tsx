"use client";

import { useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #2d5a27; --ct-accent-bg: #eef2ec;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
`;

// Phase A: one survey type, two fixed deposits, a flat budget. Phase B adds the
// full survey library, result noise, tuning, and win and lose states.
const GRID = 8;
const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const DEPOSITS = new Set(["C4", "F7"]);
const START_BUDGET = 2_000_000;
const DRILL_COST = 250_000;

type CellState = "unknown" | "hit" | "miss";

interface TerranoxAdvice {
  recommended_cell: string;
  action: string;
  reason: string;
  confidence: "Low" | "Medium" | "High";
  rationale: string[];
}

function cellId(r: number, c: number) {
  return `${COLS[c]}${r + 1}`;
}

export default function TerranoxPage() {
  const C = CSS_VAR_COLORS;
  const PAGE_BG = C.bg;
  const HEADING = C.text;
  const SUBTEXT = C.muted;
  const LABEL = C.dim;

  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [budget, setBudget] = useState(START_BUDGET);
  const [log, setLog] = useState<string[]>([]);
  const [advice, setAdvice] = useState<TerranoxAdvice | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const found = Object.values(cells).filter((s) => s === "hit").length;
  const outOfBudget = budget < DRILL_COST;

  function drill(id: string) {
    if (cells[id] || outOfBudget) return;
    const hit = DEPOSITS.has(id);
    setCells((prev) => ({ ...prev, [id]: hit ? "hit" : "miss" }));
    setBudget((b) => b - DRILL_COST);
    setLog((l) => [`Drilled ${id}: ${hit ? "uranium intercept" : "barren"}`, ...l].slice(0, 8));
    setAdvice(null);
  }

  function reset() {
    setCells({});
    setBudget(START_BUDGET);
    setLog([]);
    setAdvice(null);
    setError(null);
  }

  async function askTerranox() {
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/demos/terranox/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cells, budget }),
      });
      const json = (await res.json()) as { result?: TerranoxAdvice; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "No advice returned.");
      setAdvice(json.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: PAGE_BG }}>

        {/* Header */}
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Prospect
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.accent + "50", color: C.accent, backgroundColor: C.accent + "12" }}
                >
                  Built for Terranox
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Capital efficient uranium exploration, played as a game against the ground.
              </p>
            </div>
            <div className="flex-shrink-0">
              <span className="text-xs" style={{ color: C.dim }}>
                Demo by{" "}
                <Link href="/" className="underline hover:opacity-70 transition-opacity" style={{ color: C.muted }}>
                  Armaan Kazi
                </Link>
              </span>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-10">

          {/* Back link */}
          <Link
            href="/demos"
            className="text-xs transition-colors mb-8 inline-block hover:opacity-70"
            style={{ color: C.muted }}
          >
            &#8592; Back to Demos
          </Link>

          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What this is
            </h2>
            <p className="leading-relaxed text-sm" style={{ color: SUBTEXT }}>
              Junior uranium explorers spend most of their capital learning where not to drill. Prospect turns that problem into a game: a claim block, a fixed budget, a set of survey tools with different costs and resolutions, and hidden deposits. You decide what to run and where. At any point you can ask Terranox, and its sequential decision engine tells you the single best next move given everything you already know.
            </p>
          </section>
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What Terranox does today
            </h2>
            <p className="leading-relaxed text-sm mb-5" style={{ color: SUBTEXT }}>
              Terranox builds decision tooling for exploration teams so that each dollar of survey spend buys the most information about the ground. Most juniors still plan campaigns on intuition, a geologist's map, and whatever the last drill hole said.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
                  Today: exploration by intuition
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>Survey programs planned up front, rarely revised as results arrive</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>Each survey type read in isolation instead of as evidence that updates a belief</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>Drill targets picked by the loudest anomaly, not the highest expected value</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>No clear answer to the question a board actually asks: is the next hole worth it</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.accent + "50", backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: C.accent }}>
                  With Prospect
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Every survey and drill hole updates a probability map of where the deposit sits</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>The engine ranks the next move by information gained per dollar spent</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Cheap wide surveys are recommended before expensive narrow ones, automatically</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>A plain language reason for each recommendation you can show to a board</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              How the game works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                {
                  title: "A claim block with hidden deposits",
                  body: "An 8 by 8 grid hides a small number of uranium deposits. You do not know where. Phase A fixes two deposits; later phases randomize distribution and grade.",
                },
                {
                  title: "Survey tools with real tradeoffs",
                  body: "Airborne magnetics covers a lot of ground cheaply but says little. Ground radiometrics is narrow and precise. Drilling is the truth and the most expensive. Phase A ships drilling only.",
                },
                {
                  title: "Ask Terranox at any point",
                  body: "The engine looks at what you have learned and what you have left to spend and names the one move with the best expected return, with its reasoning attached.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border p-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.accent }} />
                    <p className="text-xs font-semibold" style={{ color: HEADING }}>{card.title}</p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: LABEL }}>{card.body}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>Why this is the right demo for Terranox</p>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                A board does not fund a survey program, it funds a sequence of decisions. Prospect makes that sequence visible and shows what a decision engine adds at each step: not a prettier map, but a better next move.
              </p>
            </div>
          </section>

          {/* Try it */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>
              Try it
            </h2>
            <p className="text-sm mb-4" style={{ color: LABEL }}>
              An 8 by 8 claim block with two hidden uranium deposits. Every drill hole costs $250k from a $2M budget. Ask Terranox before you spend.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5">
              {/* Grid */}
              <div className="rounded-xl border p-4 shadow-sm inline-block" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <div className="grid gap-1" style={{ gridTemplateColumns: `1.25rem repeat(${GRID}, 2rem)` }}>
                  <span />
                  {COLS.map((c) => (
                    <span key={c} className="text-[10px] font-mono text-center" style={{ color: LABEL }}>{c}</span>
                  ))}
                  {Array.from({ length: GRID }).map((_, r) => (
                    <>
                      <span key={`r${r}`} className="text-[10px] font-mono flex items-center justify-center" style={{ color: LABEL }}>{r + 1}</span>
                      {Array.from({ length: GRID }).map((_, c) => {
                        const id = cellId(r, c);
                        const st = cells[id] ?? "unknown";
                        const bg = st === "hit" ? C.accent : st === "miss" ? C.cardBorder : C.bg;
                        return (
                          <button
                            key={id}
                            onClick={() => drill(id)}
                            disabled={st !== "unknown" || outOfBudget}
                            title={id}
                            className="w-8 h-8 rounded border text-[10px] font-mono transition-colors disabled:cursor-default hover:opacity-80"
                            style={{
                              backgroundColor: bg,
                              borderColor: advice?.recommended_cell === id ? C.accent : C.cardBorder,
                              borderWidth: advice?.recommended_cell === id ? 2 : 1,
                              color: st === "hit" ? "#fff" : LABEL,
                            }}
                          >
                            {st === "hit" ? "U" : st === "miss" ? "x" : ""}
                          </button>
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>

              {/* Status + ask */}
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Budget left", value: `$${(budget / 1_000_000).toFixed(2)}M` },
                    { label: "Holes drilled", value: String(Object.keys(cells).length) },
                    { label: "Deposits found", value: `${found} / ${DEPOSITS.size}` },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border px-3 py-3" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>{s.label}</p>
                      <p className="text-lg font-black tabular-nums" style={{ color: HEADING }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={askTerranox}
                    disabled={asking}
                    className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: C.accent, color: "#fff" }}
                  >
                    {asking ? "Thinking..." : "Ask Terranox"}
                  </button>
                  <button
                    onClick={reset}
                    className="text-sm font-semibold px-4 py-2 rounded-lg border transition-opacity hover:opacity-70"
                    style={{ borderColor: C.cardBorder, color: SUBTEXT, backgroundColor: C.cardBg }}
                  >
                    Reset claim
                  </button>
                </div>

                {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}

                {advice && (
                  <div className="rounded-xl border p-4" style={{ borderColor: C.accent + "50", backgroundColor: C.accentBg }}>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.accent }}>
                        Terranox recommends
                      </p>
                      <span className="text-[10px] font-mono" style={{ color: LABEL }}>{advice.confidence} confidence</span>
                    </div>
                    <p className="text-sm font-black mb-1" style={{ color: HEADING }}>
                      {advice.action} {advice.recommended_cell}
                    </p>
                    <p className="text-xs leading-relaxed mb-3" style={{ color: SUBTEXT }}>{advice.reason}</p>
                    <ul className="space-y-1">
                      {advice.rationale.map((r, i) => (
                        <li key={i} className="text-xs flex gap-2" style={{ color: SUBTEXT }}>
                          <span style={{ color: C.accent }}>&#8226;</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {log.length > 0 && (
                  <div className="rounded-xl border p-3" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: LABEL }}>Drill log</p>
                    <ul className="space-y-1 font-mono text-[11px]" style={{ color: SUBTEXT }}>
                      {log.map((l, i) => <li key={i}>{l}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>

          </section>

        </div>

        {/* Footer */}
        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs leading-relaxed" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Terranox. Phase A scaffold: the interactive tool returns stubbed data.
          </p>
        </footer>

      </div>
    </>
  );
}
