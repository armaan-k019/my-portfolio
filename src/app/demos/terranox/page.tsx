"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import {
  GRID, COLS, START_BUDGET, DEPOSIT_COUNT, SURVEYS,
  allCells, cellId, coverage, newGame, runSurvey, belief, candidates, bestMove, engineTrajectory, fmtMoney, alreadyRun,
  type GameState, type SurveyKind, type Mode, type Candidate,
} from "./engine";
import type { TerranoxAdvice } from "@/app/api/demos/terranox/analyze/route";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #2d5a27; --ct-accent-bg: #eef2ec;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
@keyframes px-reveal { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
@keyframes px-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(45,90,39,0.45); } 50% { box-shadow: 0 0 0 6px rgba(45,90,39,0); } }
@keyframes px-slide { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
.px-reveal { animation: px-reveal 320ms cubic-bezier(0.16,1,0.3,1) both; }
.px-deposit { animation: px-pulse 1.4s ease-out 2; }
.px-slide { animation: px-slide 240ms cubic-bezier(0.16,1,0.3,1) both; }
`;

const ORDER: SurveyKind[] = ["magnetics", "geochem", "radiometric", "gravity", "drill"];
const LEARNER_FIRST: SurveyKind[] = ["magnetics", "drill"];
const LS_ROUNDS = "terranox_rounds";

// Short reading glyphs on the grid, one per survey kind, so a cell can show
// several results at once without text overflow.
const GLYPH: Record<string, string> = {
  warm: "▲", cold: "▽", anomaly: "◆", none: "◇", hit: "●", miss: "○", halo: "◉", intercept: "U", barren: "×",
};

function useTween(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, d = value - a;
    if (d === 0) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 500);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + d * e));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

export default function TerranoxPage() {
  const C = CSS_VAR_COLORS;
  const HEADING = C.text, SUBTEXT = C.muted, LABEL = C.dim;

  // ── mode: learner for a first visit, terranox from the second round on ──
  const [mode, setMode] = useState<Mode>("learner");
  const [rounds, setRounds] = useState(0);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(LS_ROUNDS) ?? "0");
      setRounds(n);
      setMode(n >= 1 ? "terranox" : "learner");
    } catch { /* storage unavailable, keep defaults */ }
  }, []);

  // ── game ──
  const [game, setGame] = useState<GameState>(() => newGame(20260904));
  useEffect(() => { setGame(newGame()); }, []);
  const [armed, setArmed] = useState<SurveyKind | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [revealIds, setRevealIds] = useState<Set<number>>(new Set());
  const [lastFound, setLastFound] = useState<string | null>(null);

  const allowed: SurveyKind[] = mode === "learner" && rounds < 1 ? LEARNER_FIRST : ORDER;
  const b = useMemo(() => belief(game), [game]);
  const top = useMemo(() => allCells().map((c) => ({ cell: c, p: b[c] })).sort((x, y) => y.p - x.p).slice(0, 3), [b]);
  const hint = useMemo(() => bestMove(game, allowed), [game, allowed]);
  const budgetShown = useTween(game.budget);
  const drilled = useMemo(() => new Set(game.results.filter((r) => r.kind === "drill").map((r) => r.target)), [game.results]);

  useEffect(() => {
    if (game.status !== "playing") {
      try { const n = rounds + 1; localStorage.setItem(LS_ROUNDS, String(n)); setRounds(n); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status]);

  function commit(kind: SurveyKind, target: string) {
    if (game.status !== "playing" || drilled.has(target)) return;
    const next = runSurvey(game, kind, target);
    if (next === game) return;
    const res = next.results[next.results.length - 1];
    setGame(next);
    setRevealIds((s) => new Set(s).add(res.id));
    if (next.found.length > game.found.length) setLastFound(target);
    setArmed(null);
    setAdvice(null);
  }

  function reset() {
    setGame(newGame());
    setArmed(null); setHover(null); setRevealIds(new Set()); setLastFound(null);
    setAdvice(null); setAdviceErr(null); setAskOpen(false);
  }

  // ── ask terranox ──
  const [askOpen, setAskOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [advice, setAdvice] = useState<TerranoxAdvice | null>(null);
  const [adviceErr, setAdviceErr] = useState<string | null>(null);
  const [fallback, setFallback] = useState<Candidate | null>(null);

  async function ask() {
    setAskOpen(true); setAsking(true); setAdviceErr(null); setAdvice(null); setFallback(null);
    const cands = candidates(game, allowed);
    try {
      const res = await fetch("/api/demos/terranox/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode, budget: game.budget, allowed,
          results: game.results.map((r) => ({ kind: r.kind, target: r.target, readings: r.readings })),
          belief: b, topCells: top, candidates: cands.slice(0, 12),
        }),
      });
      const json = (await res.json()) as { result?: TerranoxAdvice; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "No advice returned.");
      setAdvice(json.result);
    } catch (e) {
      setAdviceErr(String(e));
      setFallback(cands[0] ?? null);
    } finally { setAsking(false); }
  }

  // ── post mortem ──
  const post = useMemo(() => {
    if (game.status === "playing") return null;
    const eng = engineTrajectory(game.seed, ORDER);
    const spend = START_BUDGET - game.budget;
    const engSpend = START_BUDGET - eng.budget;
    const drills = game.results.filter((r) => r.kind === "drill");
    const hits = drills.filter((r) => r.readings[r.target] === "intercept").length;
    const surveysBeforeFirstDrill = game.results.findIndex((r) => r.kind === "drill");
    const wasted = drills.filter((r) => r.readings[r.target] === "barren" && (r.id === 1 || b[r.target] < 0.15)).length;
    let lesson: string;
    if (surveysBeforeFirstDrill === 0) {
      lesson = mode === "terranox"
        ? "You drilled on a flat prior. A $50k airborne magnetics block would have moved prospectivity on nine cells before you committed $250k to one. Sequential decision intelligence means buying the cheapest information first."
        : "You drilled before surveying. Airborne magnetics costs a fifth of a drill hole and tells you about nine cells at once, so it should almost always come first.";
    } else if (wasted >= 2) {
      lesson = mode === "terranox"
        ? "Two or more holes went into cells with prospectivity under 15 percent. The drill hit rate on those was too low to justify the cost; the belief said survey more, not drill."
        : "A couple of your drill holes went into cells the surveys had already made unlikely. Read the warm and cold signals before you spend big.";
    } else if (game.status === "won" && spend <= engSpend) {
      lesson = "You matched or beat the engine on this seed. Your sequence bought information in the right order and drilled when the belief was concentrated.";
    } else if (game.status === "won") {
      lesson = mode === "terranox"
        ? `You found both deposits for ${fmtMoney(spend)}; the engine's trajectory on the same seed spent ${fmtMoney(engSpend)}. The gap is the cost of moves with low information gain per dollar.`
        : `You found both deposits, spending ${fmtMoney(spend)}. The engine did it for ${fmtMoney(engSpend)} on the same block by surveying wide before it drilled.`;
    } else {
      lesson = mode === "terranox"
        ? "Budget exhausted with a deposit still in the ground. Compare your sequence against the engine's: the difference is almost always spending on narrow surveys while the belief was still flat."
        : "You ran out of money before finding both deposits. Look at where the engine spent its first $200k: on wide, cheap surveys that narrowed the search.";
    }
    return { eng, spend, engSpend, drills: drills.length, hits, lesson };
  }, [game, b, mode]);

  const hoverCells = armed && hover && !drilled.has(hover) ? new Set(coverage(armed, hover)) : new Set<string>();

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>

        {/* Header, compact so the game sits above the fold */}
        <header className="px-6 py-4 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>Prospect</h1>
                <span className="text-sm" style={{ color: SUBTEXT }}>A game about exploration economics.</span>
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest mt-1" style={{ color: LABEL }}>Built for Terranox</p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-4">
              <Link href="/demos" className="text-xs hover:opacity-70" style={{ color: C.muted }}>&#8592; Demos</Link>
              <span className="text-xs" style={{ color: C.dim }}>
                by <Link href="/" className="underline hover:opacity-70" style={{ color: C.muted }}>Armaan Kazi</Link>
              </span>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-6">

          {/* Invitation */}
          <p className="text-sm leading-relaxed mb-5" style={{ color: SUBTEXT }}>
            You have a $2M budget, an 8 by 8 claim block, and two hidden uranium deposits. Every survey costs money and returns partial information. Every drill hole is expensive and definitive. Ask Terranox for the optimal next move, or play by intuition. Try not to run out of money before you find something.
          </p>

          {/* ── PLAY ─────────────────────────────────────────────────────── */}
          <section className="mb-12 relative">
            <div className="rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg, filter: askOpen ? "brightness(0.96)" : "none", transition: "filter 200ms" }}>
              {/* toolbar */}
              <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-2.5 border-b" style={{ borderColor: C.cardBorder, backgroundColor: `${C.cardBorder}40` }}>
                <div className="flex items-center gap-1 font-mono text-[11px]">
                  {(["learner", "terranox"] as Mode[]).map((m) => (
                    <button key={m} onClick={() => setMode(m)}
                      className="px-2.5 py-1 rounded-md uppercase tracking-widest transition-colors"
                      style={{ backgroundColor: mode === m ? C.accent : "transparent", color: mode === m ? "#fff" : LABEL }}>
                      {m === "learner" ? "Learner" : "Terranox"} mode
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]" style={{ color: LABEL }}>
                  <span>seed {game.seed}</span>
                  <button onClick={reset} className="underline hover:opacity-70" style={{ color: SUBTEXT }}>new claim</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-0">
                {/* grid */}
                <div className="p-4 border-b md:border-b-0 md:border-r" style={{ borderColor: C.cardBorder }}>
                  <div className="grid gap-[3px] font-mono select-none" style={{ gridTemplateColumns: `1.1rem repeat(${GRID}, 2.35rem)` }}>
                    <span />
                    {COLS.map((c) => <span key={c} className="text-[10px] text-center" style={{ color: LABEL }}>{c}</span>)}
                    {Array.from({ length: GRID }).map((_, r) => (
                      <Fragment key={`row-${r}`}>
                        <span className="text-[10px] flex items-center justify-center" style={{ color: LABEL }}>{r + 1}</span>
                        {Array.from({ length: GRID }).map((_, c) => {
                          const id = cellId(r, c);
                          const p = b[id];
                          const isDrilled = drilled.has(id);
                          const isFound = game.found.includes(id);
                          const marks = game.results.filter((res) => res.readings[id] !== undefined);
                          const latest = marks[marks.length - 1];
                          const repeat = armed ? alreadyRun(game, armed, id) : false;
                          const inHover = hoverCells.has(id) && !repeat;
                          const recommended = advice?.recommendation.cell === id || (!advice && fallback?.target === id);
                          const heat = isDrilled ? 0 : Math.min(1, p * 4);
                          return (
                            <button key={id} title={id}
                              onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}
                              onClick={() => armed && !repeat && commit(armed, id)}
                              disabled={!armed || isDrilled || repeat || game.status !== "playing"}
                              className={`relative h-[2.35rem] rounded-[4px] border text-[11px] transition-colors ${armed && !isDrilled && !repeat ? "cursor-crosshair" : "cursor-default"} ${isFound && lastFound === id ? "px-deposit" : ""}`}
                              style={{
                                backgroundColor: isFound ? C.accent : isDrilled ? C.cardBorder : `rgba(45,90,39,${0.04 + heat * 0.32})`,
                                borderColor: recommended ? C.accent : inHover ? (armed ? SURVEYS[armed].color : C.accent) : C.cardBorder,
                                borderWidth: recommended || inHover ? 2 : 1,
                                color: isFound ? "#fff" : HEADING,
                                outline: inHover && armed ? `2px solid ${SURVEYS[armed].color}40` : "none",
                              }}>
                              {latest && (
                                <span className={`px-reveal ${revealIds.has(latest.id) ? "" : ""}`}
                                  style={{ color: isFound ? "#fff" : SURVEYS[latest.kind].color, fontWeight: 700 }}>
                                  {GLYPH[latest.readings[id]] ?? "?"}
                                </span>
                              )}
                              {marks.length > 1 && !isFound && (
                                <span className="absolute top-0 right-0.5 text-[7px]" style={{ color: LABEL }}>{marks.length}</span>
                              )}
                              {isFound && (
                                <span className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 text-[6px] px-1 rounded-sm font-bold tracking-widest" style={{ backgroundColor: C.accent, color: "#fff" }}>DEPOSIT</span>
                              )}
                            </button>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                  {/* hover readout */}
                  <div className="mt-3 h-9 font-mono text-[11px] leading-snug" style={{ color: SUBTEXT }}>
                    {hover ? (
                      <>
                        <span className="font-bold" style={{ color: HEADING }}>{hover}</span>
                        {" "}prospectivity {(b[hover] * 100).toFixed(0)}%
                        {game.results.filter((r) => r.readings[hover] !== undefined).map((r) => (
                          <span key={r.id} className="ml-2" style={{ color: SURVEYS[r.kind].color }}>{SURVEYS[r.kind].short} {r.readings[hover]}</span>
                        ))}
                        {armed && !drilled.has(hover) && (alreadyRun(game, armed, hover)
                          ? <span className="ml-2" style={{ color: LABEL }}>{SURVEYS[armed].short} already run here</span>
                          : <span className="ml-2" style={{ color: SURVEYS[armed].color }}>click to deploy {SURVEYS[armed].short}</span>)}
                      </>
                    ) : armed ? <span style={{ color: SURVEYS[armed].color }}>{SURVEYS[armed].label} armed. Pick a cell.</span>
                      : <span>Hover a cell. Shade is prospectivity.</span>}
                  </div>
                </div>

                {/* status + actions */}
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    {[
                      { label: "Budget", value: fmtMoney(budgetShown) },
                      { label: "Moves", value: String(game.results.length) },
                      { label: "Found", value: `${game.found.length}/${DEPOSIT_COUNT}` },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg border px-2.5 py-2" style={{ borderColor: C.cardBorder, backgroundColor: C.bg }}>
                        <p className="text-[9px] uppercase tracking-widest" style={{ color: LABEL }}>{s.label}</p>
                        <p className="text-base font-black tabular-nums" style={{ color: HEADING }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-[9px] font-mono uppercase tracking-widest mb-1.5" style={{ color: LABEL }}>Deploy</p>
                    <div className="space-y-1.5">
                      {ORDER.map((k) => {
                        const s = SURVEYS[k];
                        const locked = !allowed.includes(k);
                        const cant = game.budget < s.cost || game.status !== "playing";
                        return (
                          <button key={k} onClick={() => !locked && !cant && setArmed(armed === k ? null : k)} disabled={locked || cant}
                            className="w-full flex items-center justify-between rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-40"
                            style={{ borderColor: armed === k ? s.color : C.cardBorder, backgroundColor: armed === k ? `${s.color}14` : C.bg, color: HEADING }}>
                            <span className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                              {s.label}
                              {locked && <span className="text-[9px]" style={{ color: LABEL }}>unlocks after round 1</span>}
                            </span>
                            <span style={{ color: LABEL }}>{fmtMoney(s.cost)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button onClick={ask} disabled={asking || game.status !== "playing"}
                    className="w-full text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: C.accent, color: "#fff" }}>
                    {asking ? "Engine thinking..." : "Ask Terranox"}
                  </button>

                  {mode === "learner" && game.status === "playing" && (
                    <div className="rounded-lg border p-2.5 font-mono text-[11px]" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
                      <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: C.accent }}>Hints</p>
                      <p style={{ color: SUBTEXT }}>
                        {game.results.length === 0
                          ? "Nothing is known yet: every cell is about 3%. Airborne magnetics reads nine cells for $50k, so arm it and click near the middle."
                          : game.results.length < 3 && !drilled.size
                          ? "Warm cells are more likely, not certain. Survey a second block or drill the warmest cell once it climbs past 25%."
                          : `Most prospective: ${top.map((t) => `${t.cell} ${(t.p * 100).toFixed(0)}%`).join(", ")}.`}
                      </p>
                      {hint && <p className="mt-1" style={{ color: HEADING }}>Engine would: {SURVEYS[hint.kind].short} {hint.target} ({hint.kind === "drill" ? `${(hint.prospectivity * 100).toFixed(0)}% hit rate` : `${hint.infoGainBits.toFixed(2)} bits for ${fmtMoney(hint.cost)}`})</p>}
                    </div>
                  )}

                  {game.results.length > 0 && (
                    <div className="font-mono text-[10px] space-y-0.5 max-h-24 overflow-auto" style={{ color: SUBTEXT }}>
                      {[...game.results].reverse().slice(0, 6).map((r) => (
                        <p key={r.id}><span style={{ color: SURVEYS[r.kind].color }}>{SURVEYS[r.kind].short}</span> {r.target} {r.kind === "drill" ? r.readings[r.target] : `${Object.values(r.readings).filter((v) => v === "warm" || v === "hit" || v === "halo" || v === "anomaly").length} positive of ${r.cells.length}`} <span style={{ color: LABEL }}>-{fmtMoney(r.cost)}</span></p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* post mortem */}
              {post && (
                <div className="border-t p-5 px-slide" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                    <p className="text-sm font-black" style={{ color: HEADING }}>{game.status === "won" ? "Both deposits found." : "Budget exhausted."}</p>
                    <button onClick={reset} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ backgroundColor: C.accent, color: "#fff" }}>Play again</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono mb-4">
                    {[
                      ["Your spend", fmtMoney(post.spend)], ["Engine spend", fmtMoney(post.engSpend)],
                      ["Drill hit rate", `${post.hits}/${post.drills}`], ["Engine moves", String(post.eng.results.length)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg border px-2.5 py-2" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                        <p className="text-[9px] uppercase tracking-widest" style={{ color: LABEL }}>{k}</p>
                        <p className="text-sm font-black" style={{ color: HEADING }}>{v}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: HEADING }}>{post.lesson}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[10px]">
                    {[["Your trajectory", game.results], ["Engine on the same seed", post.eng.results]].map(([title, list]) => (
                      <div key={title as string} className="rounded-lg border p-2.5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                        <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: LABEL }}>{title as string}</p>
                        {(list as GameState["results"]).map((r) => (
                          <p key={r.id} style={{ color: SUBTEXT }}>
                            {r.id}. <span style={{ color: SURVEYS[r.kind].color }}>{SURVEYS[r.kind].short}</span> {r.target}
                            {r.kind === "drill" ? ` ${r.readings[r.target]}` : ""}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ask terranox panel */}
            {askOpen && (
              <div className="absolute inset-0 z-10 flex justify-end" onClick={() => setAskOpen(false)}>
                <div className="px-slide w-full sm:w-[380px] h-full overflow-auto rounded-xl border shadow-lg p-5" style={{ backgroundColor: C.cardBg, borderColor: C.accent + "60" }} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: C.accent }}>Terranox decision engine</p>
                    <button onClick={() => setAskOpen(false)} className="text-xs hover:opacity-70" style={{ color: LABEL }}>close</button>
                  </div>
                  {asking && (
                    <div className="space-y-2 animate-pulse">{[1, 0.8, 0.9, 0.6].map((w, i) => <div key={i} className="h-3 rounded" style={{ width: `${w * 100}%`, backgroundColor: C.cardBorder }} />)}</div>
                  )}
                  {advice && (
                    <div className="space-y-3">
                      <div className="rounded-lg p-3" style={{ backgroundColor: C.accentBg }}>
                        <p className="text-base font-black font-mono" style={{ color: HEADING }}>
                          <span style={{ color: SURVEYS[advice.recommendation.survey]?.color ?? C.accent }}>{SURVEYS[advice.recommendation.survey]?.label ?? advice.recommendation.survey}</span> at {advice.recommendation.cell}
                        </p>
                        <p className="text-[11px] font-mono mt-1" style={{ color: SUBTEXT }}>{fmtMoney(advice.expected_cost)} · {advice.expected_information_gain} · {advice.expected_value_ratio}</p>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: HEADING }}>{advice.reasoning}</p>
                      {advice.alternatives_considered?.length > 0 && (
                        <div>
                          <p className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: LABEL }}>Rejected</p>
                          {advice.alternatives_considered.map((a, i) => (
                            <p key={i} className="text-xs leading-relaxed" style={{ color: SUBTEXT }}><span className="font-semibold" style={{ color: HEADING }}>{a.move}:</span> {a.why_rejected}</p>
                          ))}
                        </div>
                      )}
                      {SURVEYS[advice.recommendation.survey] && (
                        <button onClick={() => { commit(advice.recommendation.survey, advice.recommendation.cell); setAskOpen(false); }}
                          className="w-full text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: C.accent, color: "#fff" }}>Do it</button>
                      )}
                    </div>
                  )}
                  {adviceErr && (
                    <div className="space-y-3">
                      <p className="text-xs leading-relaxed" style={{ color: "#b45309" }}>The live engine is unavailable ({adviceErr.replace("Error: ", "")}). Showing the local heuristic instead.</p>
                      {fallback && (
                        <div className="rounded-lg p-3" style={{ backgroundColor: C.accentBg }}>
                          <p className="text-base font-black font-mono" style={{ color: HEADING }}>
                            <span style={{ color: SURVEYS[fallback.kind].color }}>{SURVEYS[fallback.kind].label}</span> at {fallback.target}
                          </p>
                          <p className="text-[11px] font-mono mt-1" style={{ color: SUBTEXT }}>{fmtMoney(fallback.cost)} · {fallback.kind === "drill" ? `${(fallback.prospectivity * 100).toFixed(0)}% hit rate` : `${fallback.infoGainBits.toFixed(2)} bits, ${fallback.gainPerDollar.toFixed(2)} per $100k`}</p>
                          <p className="text-xs leading-relaxed mt-2" style={{ color: SUBTEXT }}>The engine's own pick: a hole once a cell's prospectivity clears break even, otherwise the survey with the most prospectivity weighted information per dollar.</p>
                          <button onClick={() => { commit(fallback.kind, fallback.target); setAskOpen(false); }}
                            className="w-full mt-3 text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: C.accent, color: "#fff" }}>Do it</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── WHY A GAME ───────────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>Why a game</h2>
            <div className="space-y-3 text-sm leading-relaxed" style={{ color: SUBTEXT }}>
              <p>Games teach intuition about probability, cost, and information faster than articles or dashboards. Every drill hole in Prospect trains the same reasoning muscle a real exploration decision requires: is this hole worth $250k given what I already know, or is there a cheaper way to learn more first.</p>
              <p>Sequential decision making under uncertainty is hard to explain in slides and easy to feel in one round. The first time a warm magnetics cell drills barren, the difference between a signal and a certainty stops being abstract.</p>
              <p>What Terranox does in the real world is what you do here: choose the next move that maximizes information gain per dollar. The game teaches the intuition. Terranox's platform automates it across a real tenement, with real geophysics and a real budget.</p>
            </div>
          </section>

          {/* ── HOW PROSPECT MAPS TO REAL EXPLORATION ────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>How Prospect maps to real exploration</h2>
            <div className="space-y-2">
              {ORDER.map((k) => {
                const s = SURVEYS[k];
                return (
                  <div key={k} className="rounded-xl border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                      <p className="text-xs font-semibold flex items-center gap-2" style={{ color: HEADING }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
                      </p>
                      <p className="font-mono text-[10px]" style={{ color: LABEL }}>{fmtMoney(s.cost)} · {s.reads} · {s.quality}</p>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>{s.real}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── BUILT FOR TERRANOX ───────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>Built for Terranox</h2>
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                Terranox builds sequential decision intelligence for exploration: given everything a program has learned, what is the one move that buys the most information per dollar. Prospect is that method as a game. The belief model, the information gain scoring, and the vocabulary in the decision engine are Terranox's, scaled to a board you can finish in five minutes. It is meant to be useful as a first conversation with a junior, a training round for a new geologist, or a thing to hand a board member who asks why the next hole is where it is.
              </p>
            </div>
          </section>

          {/* ── ABOUT ────────────────────────────────────────────────────── */}
          <footer className="border-t pt-5 text-xs" style={{ borderColor: C.cardBorder, color: LABEL }}>
            Built by <Link href="/" className="underline hover:opacity-70">Armaan Kazi</Link>. Not affiliated with Terranox. The decision engine runs on Claude; when it is unreachable the local heuristic answers instead.
          </footer>
        </div>
      </div>
    </>
  );
}
