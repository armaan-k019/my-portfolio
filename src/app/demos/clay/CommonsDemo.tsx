"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PARAMS,
  STRATEGIES,
  createSim,
  step,
  trustOf,
  type Params,
  type Sim,
} from "./model";
import { LineChart, SharesChart, Sparkline, STRATEGY_COLORS } from "./charts";

const COLS = 40;

const PRESETS: { label: string; personalCost: number; targetCost: number }[] = [
  { label: "Hand research", personalCost: 3, targetCost: 3 },
  { label: "Cheap words, costly data", personalCost: 0.03, targetCost: 3 },
  { label: "Cheap words, cheap data", personalCost: 0.03, targetCost: 0.6 },
];

// Log-scale slider helpers: slider runs 0..100.
function fromSlider(v: number, min: number, max: number) {
  return Math.exp(Math.log(min) + (v / 100) * (Math.log(max) - Math.log(min)));
}
function toSlider(x: number, min: number, max: number) {
  return ((Math.log(x) - Math.log(min)) / (Math.log(max) - Math.log(min))) * 100;
}
function dollars(x: number) {
  return x < 0.1 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`;
}

function hex(c: string) {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}
const LOW = hex("#c2410c");
const MID = hex("#e5e0d8");
const HIGH = hex("#2d5a27");
export function trustColor(t: number) {
  const x = Math.max(0, Math.min(1, t / 0.75));
  const [a, b, f] = x < 0.5 ? [LOW, MID, x / 0.5] : [MID, HIGH, (x - 0.5) / 0.5];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ sim, tick, selected, onSelect }: { sim: Sim; tick: number; selected: number | null; onSelect: (i: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const n = sim.params.prospects;
  const rows = Math.ceil(n / COLS);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cssW = canvas.clientWidth;
    const cell = cssW / COLS;
    const cssH = cell * rows;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    for (let i = 0; i < n; i++) {
      const x = (i % COLS) * cell;
      const y = Math.floor(i / COLS) * cell;
      ctx.fillStyle = trustColor(trustOf(sim, i));
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (sim.lastInbox[i].some((e) => e.replied)) {
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, Math.max(1.5, cell * 0.18), 0, Math.PI * 2);
        ctx.fill();
      }
      if (i === selected) {
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
  }, [sim, tick, selected, n, rows]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cell = rect.width / COLS;
    const col = Math.floor((e.clientX - rect.left) / cell);
    const row = Math.floor((e.clientY - rect.top) / cell);
    const i = row * COLS + col;
    if (i >= 0 && i < n) onSelect(i);
  }

  return <canvas ref={ref} onClick={handleClick} className="w-full block cursor-pointer" aria-label="Prospects, colored by trust in personal-looking email. Click one to inspect it." />;
}

// ─── Inspector ────────────────────────────────────────────────────────────────

function Inspector({ sim, i }: { sim: Sim; i: number }) {
  const mail = sim.lastInbox[i];
  const trust = trustOf(sim, i);
  const read = mail.filter((e) => e.read);
  const personalFirst = trust >= sim.params.needRate;
  const need = sim.need[i];
  const shown = [...mail].sort((a, b) => Number(b.read) - Number(a.read)).slice(0, 12);
  return (
    <div className="rounded-xl border p-4 text-xs" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
      <div className="flex items-baseline justify-between mb-2">
        <p className="font-semibold" style={{ color: "#1a1a1a" }}>Prospect {i + 1}</p>
        <p style={{ color: "#9a8a7a" }}>day {Math.max(0, sim.day - 1)}</p>
      </div>
      <p className="leading-relaxed mb-3" style={{ color: "#6b6b6b" }}>
        Reads {sim.attention[i]} emails a day. {need >= 0 ? `Needs a category ${need + 1} product right now.` : "Needs nothing right now."}{" "}
        Believes a personal-looking email is relevant {Math.round(trust * 100)}% of the time.
      </p>
      <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#9a8a7a" }}>Trust in personal-looking email, day 0 to now</p>
      <Sparkline values={sim.trustHistory[i].subarray(0, sim.day)} color={trustColor(trust)} />
      <p className="leading-relaxed mt-3 mb-2" style={{ color: "#6b6b6b" }}>
        Got {mail.length} emails and read {read.length}.{" "}
        {mail.length > sim.attention[i]
          ? personalFirst
            ? "Personal-looking ones went first, because they still seemed more likely to be relevant than a template."
            : "Templates went first: personal-looking email had become less believable than the base rate."
          : "Read everything, so nothing competed for attention."}
      </p>
      {shown.length > 0 && (
        <table className="w-full">
          <thead>
            <tr style={{ color: "#9a8a7a" }}>
              <th className="text-left font-normal py-1">Seller</th>
              <th className="text-left font-normal">Strategy</th>
              <th className="text-left font-normal">Relevant</th>
              <th className="text-left font-normal">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e, k) => (
              <tr key={k} className="border-t" style={{ borderColor: "#f0ece5", color: "#1a1a1a" }}>
                <td className="py-1 font-mono">#{e.seller + 1}</td>
                <td>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: STRATEGY_COLORS[e.strategy] }} />
                  {STRATEGIES[e.strategy].label}
                </td>
                <td>{e.relevant ? "yes" : "no"}</td>
                <td style={{ color: e.replied ? "#2d5a27" : e.read ? "#1a1a1a" : "#9a8a7a" }}>
                  {e.replied ? "replied" : e.read ? "read, no reply" : "never opened"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {mail.length > shown.length && (
        <p className="mt-1" style={{ color: "#9a8a7a" }}>{mail.length - shown.length} more never opened.</p>
      )}
    </div>
  );
}

// ─── Regime map ───────────────────────────────────────────────────────────────

const MAP_PC = [3, 1, 0.3, 0.1, 0.03];
const MAP_TC = [0.3, 0.6, 1.5, 3, 5];

interface Cell {
  growth: number;
  trust: number;
}

function RegimeMap({ current }: { current: { personalCost: number; targetCost: number } }) {
  const [cells, setCells] = useState<(Cell | null)[]>(() => MAP_PC.flatMap(() => MAP_TC.map(() => null)));
  const [running, setRunning] = useState(false);
  const cancel = useRef(false);

  useEffect(() => () => {
    cancel.current = true;
  }, []);

  const compute = useCallback(() => {
    cancel.current = false;
    setRunning(true);
    setCells(MAP_PC.flatMap(() => MAP_TC.map(() => null)));
    const jobs = MAP_PC.flatMap((pc) => MAP_TC.map((tc) => ({ pc, tc })));
    let j = 0;
    let sim: Sim | null = null;
    const tickJob = () => {
      if (cancel.current) return;
      if (j >= jobs.length) {
        setRunning(false);
        return;
      }
      if (!sim) sim = createSim({ ...DEFAULT_PARAMS, personalCost: jobs[j].pc, targetCost: jobs[j].tc });
      for (let d = 0; d < 20 && step(sim); d++) {
        /* advance a chunk */
      }
      if (sim.day >= sim.params.days) {
        const h = sim.history;
        let first = 0;
        let last = 0;
        for (let d = 0; d < 30; d++) {
          first += h[d].replies;
          last += h[h.length - 1 - d].replies;
        }
        const cell = { growth: last / Math.max(1, first), trust: h[h.length - 1].trust };
        const idx = j;
        setCells((prev) => prev.map((c, k) => (k === idx ? cell : c)));
        sim = null;
        j++;
      }
      setTimeout(tickJob, 0);
    };
    setTimeout(tickJob, 0);
  }, []);

  const done = cells.filter(Boolean).length;
  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button
          onClick={compute}
          disabled={running}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-opacity disabled:opacity-50"
          style={{ borderColor: "#2d5a27", color: "#2d5a27" }}
        >
          {running ? `Running ${done} of ${cells.length}` : done === cells.length ? "Run again" : "Run all 25"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="text-left font-normal pr-2 align-bottom" style={{ color: "#9a8a7a" }}>
                Personal email cost
                <br />
                vs signal data cost
              </th>
              {MAP_TC.map((tc) => (
                <th key={tc} className="font-mono font-normal px-1" style={{ color: "#6b6b6b" }}>{dollars(tc)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MAP_PC.map((pc, r) => (
              <tr key={pc}>
                <td className="font-mono pr-2" style={{ color: "#6b6b6b" }}>{dollars(pc)}</td>
                {MAP_TC.map((tc, c) => {
                  const cell = cells[r * MAP_TC.length + c];
                  const here = Math.abs(Math.log(pc / current.personalCost)) < 0.3 && Math.abs(Math.log(tc / current.targetCost)) < 0.3;
                  return (
                    <td
                      key={tc}
                      className="w-16 h-11 text-center rounded-md font-mono"
                      style={{
                        backgroundColor: cell ? trustColor(cell.trust) : "#f5f3ef",
                        color: cell && cell.trust < 0.3 ? "#ffffff" : "#1a1a1a",
                        outline: here ? "2px solid #1a1a1a" : "none",
                      }}
                      title={cell ? `Replies, last 30 days vs first 30: ${cell.growth.toFixed(2)}x. Ending trust ${Math.round(cell.trust * 100)}%.` : "Not run yet"}
                    >
                      {cell ? `${cell.growth.toFixed(1)}x` : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2 leading-relaxed" style={{ color: "#9a8a7a" }}>
        Number: replies, last 30 days over first 30. Color: ending trust.
      </p>
    </div>
  );
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

export default function CommonsDemo() {
  const [personalCost, setPersonalCost] = useState(DEFAULT_PARAMS.personalCost);
  const [targetCost, setTargetCost] = useState(DEFAULT_PARAMS.targetCost);
  const [seed, setSeed] = useState(DEFAULT_PARAMS.seed);
  const [sim, setSim] = useState<Sim>(() => createSim(DEFAULT_PARAMS));
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [selected, setSelected] = useState<number | null>(null);

  const reset = useCallback((next: Partial<Params>) => {
    setRunning(false);
    setSim(createSim({ ...DEFAULT_PARAMS, personalCost, targetCost, seed, ...next }));
    setTick((t) => t + 1);
  }, [personalCost, targetCost, seed]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const loop = () => {
      let alive = true;
      for (let k = 0; k < speed && alive; k++) alive = step(sim);
      setTick((t) => t + 1);
      if (alive) frame = requestAnimationFrame(loop);
      else setRunning(false);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, speed, sim]);

  const h = sim.history;
  const last = h[h.length - 1];
  const days = sim.params.days;
  const finished = sim.day >= days;
  const maxReplies = Math.max(50, ...h.map((d) => d.replies));
  const label = "text-[10px] font-semibold uppercase tracking-widest";

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PRESETS.map((p) => {
          const active = Math.abs(p.personalCost - personalCost) < 1e-9 && Math.abs(p.targetCost - targetCost) < 1e-9;
          return (
            <button
              key={p.label}
              onClick={() => {
                setPersonalCost(p.personalCost);
                setTargetCost(p.targetCost);
                setSelected(null);
                setRunning(false);
                const next = createSim({ ...DEFAULT_PARAMS, seed, personalCost: p.personalCost, targetCost: p.targetCost });
                setSim(next);
                setTick((t) => t + 1);
                setRunning(true);
              }}
              className="text-left rounded-xl border px-3 py-2.5 transition-colors"
              style={{ borderColor: active ? "#2d5a27" : "#e5e0d8", backgroundColor: active ? "#eef2ec" : "#ffffff" }}
            >
              <p className="text-xs font-semibold" style={{ color: "#1a1a1a" }}>{p.label}</p>
            </button>
          );
        })}
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { name: "Personalization cost per email", value: personalCost, min: 0.01, max: 5, set: (v: number) => { setPersonalCost(v); reset({ personalCost: v }); } },
          { name: "Targeting cost per email", value: targetCost, min: 0.1, max: 5, set: (v: number) => { setTargetCost(v); reset({ targetCost: v }); } },
        ].map((s) => (
          <label key={s.name} className="block">
            <span className="flex justify-between text-xs mb-1">
              <span style={{ color: "#6b6b6b" }}>{s.name}</span>
              <span className="font-mono" style={{ color: "#1a1a1a" }}>{dollars(s.value)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={toSlider(s.value, s.min, s.max)}
              onChange={(e) => s.set(Number(fromSlider(Number(e.target.value), s.min, s.max).toPrecision(2)))}
              className="w-full accent-[#2d5a27]"
            />
          </label>
        ))}
      </div>

      {/* Transport */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => (finished ? (reset({}), setRunning(true)) : setRunning((r) => !r))}
          className="text-xs font-semibold px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: "#2d5a27" }}
        >
          {running ? "Pause" : finished ? "Run again" : sim.day === 0 ? "Play" : "Resume"}
        </button>
        <button
          onClick={() => { step(sim); setTick((t) => t + 1); }}
          disabled={running || finished}
          className="text-xs px-3 py-2 rounded-lg border disabled:opacity-40"
          style={{ borderColor: "#e5e0d8", color: "#1a1a1a" }}
        >
          One day
        </button>
        <button onClick={() => reset({})} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: "#e5e0d8", color: "#1a1a1a" }}>
          Reset
        </button>
        <button
          onClick={() => { const s = seed + 1; setSeed(s); reset({ seed: s }); }}
          className="text-xs px-3 py-2 rounded-lg border"
          style={{ borderColor: "#e5e0d8", color: "#1a1a1a" }}
        >
          New seed ({seed})
        </button>
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="text-xs px-2 py-2 rounded-lg border bg-white"
          style={{ borderColor: "#e5e0d8", color: "#1a1a1a" }}
          aria-label="Days per frame"
        >
          <option value={1}>1x speed</option>
          <option value={2}>2x speed</option>
          <option value={5}>5x speed</option>
        </select>
        <span className="text-xs font-mono ml-auto" style={{ color: "#6b6b6b" }}>day {sim.day} of {days}</span>
      </div>

      {/* Field and stats */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_15rem] gap-4">
        <div className="rounded-xl border p-3" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
          <p className={`${label} mb-2`} style={{ color: "#9a8a7a" }}>
            Color: trust in personal email. Dot: replied today.
          </p>
          <Field sim={sim} tick={tick} selected={selected} onSelect={setSelected} />
        </div>
        <div className="space-y-3">
          {[
            { k: "Inbox size", v: last ? last.inbox.toFixed(1) : "0" },
            { k: "Replies today", v: last ? String(last.replies) : "0" },
            { k: "Average trust", v: last ? `${Math.round(last.trust * 100)}%` : `${Math.round(DEFAULT_PARAMS.trustPrior * 100)}%` },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border px-4 py-3" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
              <p className={label} style={{ color: "#9a8a7a" }}>{s.k}</p>
              <p className="text-xl font-semibold font-mono" style={{ color: "#1a1a1a" }}>{s.v}</p>
            </div>
          ))}
          <div className="rounded-xl border px-4 py-3" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
            <p className={`${label} mb-1.5`} style={{ color: "#9a8a7a" }}>Sellers by strategy</p>
            {STRATEGIES.map((s, k) => (
              <p key={s.id} className="text-xs flex items-center justify-between" style={{ color: "#1a1a1a" }}>
                <span className="flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: STRATEGY_COLORS[k] }} />
                  {s.label}
                </span>
                <span className="font-mono">{last ? last.shares[k] : sim.params.sellers / STRATEGIES.length}</span>
              </p>
            ))}
          </div>
        </div>
      </div>

      {selected !== null ? (
        <Inspector sim={sim} i={selected} />
      ) : (
        <p className="text-xs" style={{ color: "#9a8a7a" }}>Click a prospect.</p>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-3" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
          <p className={`${label} mb-1`} style={{ color: "#9a8a7a" }}>Replies per day</p>
          <LineChart history={h} days={days} value={(d) => d.replies} max={maxReplies} color="#1a1a1a" label="Replies per day" format={(v) => String(Math.round(v))} />
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
          <p className={`${label} mb-1`} style={{ color: "#9a8a7a" }}>Average trust</p>
          <LineChart history={h} days={days} value={(d) => d.trust} max={1} color="#c2410c" label="Average trust" format={() => "100%"} />
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
          <p className={`${label} mb-1`} style={{ color: "#9a8a7a" }}>Sellers by strategy</p>
          <SharesChart history={h} days={days} sellers={sim.params.sellers} />
        </div>
      </div>

      {/* Regime map */}
      <div className="rounded-xl border p-4" style={{ borderColor: "#e5e0d8", backgroundColor: "#ffffff" }}>
        <p className={`${label} mb-1`} style={{ color: "#9a8a7a" }}>All 25 cost pairs</p>
        <RegimeMap current={{ personalCost, targetCost }} />
      </div>
    </div>
  );
}
