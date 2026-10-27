"use client";

import { useMemo, useState } from "react";
import { probAbove, type ProbPoint, type Smile } from "./math";

const FORWARD = 100_000;
const N_POINTS = 121;

const HORIZONS = [
  { label: "1 day", years: 1 / 365 },
  { label: "3 days", years: 3 / 365 },
  { label: "7 days", years: 7 / 365 },
  { label: "30 days", years: 30 / 365 },
];

const W = 640;
const H = 300;
const SMILE_H = 140;
const GAP_H = 140;
const PAD = { left: 48, right: 16, top: 16, bottom: 32 };

function buildSmile(atmVol: number, rho: number): Smile {
  const b = 0.3;
  const s = 0.1;
  // At k = m = 0 the variance is a + b s, so this sets the at-the-money vol.
  return { a: atmVol * atmVol - b * s, b, rho, m: 0, s };
}

function path(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

function fmtUsd(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export default function ImpliedProbabilityChart() {
  const [horizon, setHorizon] = useState(2);
  const [rho, setRho] = useState(-0.4);
  const [atmVol, setAtmVol] = useState(0.5);
  const [cursor, setCursor] = useState(0.38);

  const T = HORIZONS[horizon].years;
  const smile = useMemo(() => buildSmile(atmVol, rho), [atmVol, rho]);

  const points = useMemo<ProbPoint[]>(() => {
    const span = 3 * atmVol * Math.sqrt(T);
    return Array.from({ length: N_POINTS }, (_, i) => {
      const k = -span + (2 * span * i) / (N_POINTS - 1);
      return probAbove(smile, FORWARD, FORWARD * Math.exp(k), T);
    });
  }, [smile, atmVol, T]);

  const kMin = points[0].strike;
  const kMax = points[points.length - 1].strike;
  const x = (K: number) => PAD.left + ((K - kMin) / (kMax - kMin)) * (W - PAD.left - PAD.right);
  const y = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);

  const sigmas = points.map((p) => p.sigma);
  const sMin = Math.min(...sigmas) * 0.95;
  const sMax = Math.max(...sigmas) * 1.05;
  const ys = (s: number) => PAD.top + (1 - (s - sMin) / (sMax - sMin)) * (SMILE_H - PAD.top - PAD.bottom);

  const gaps = points.map((p) => (p.withSkew - p.flat) * 100);
  const gMax = Math.max(0.1, ...gaps.map(Math.abs)) * 1.15;
  const yg = (g: number) => PAD.top + (1 - (g + gMax) / (2 * gMax)) * (GAP_H - PAD.top - PAD.bottom);

  const idx = Math.round(cursor * (N_POINTS - 1));
  const at = points[idx];
  const gapPp = (at.withSkew - at.flat) * 100;

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => kMin + f * (kMax - kMin));

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const f = (px - PAD.left) / (W - PAD.left - PAD.right);
    setCursor(Math.min(1, Math.max(0, f)));
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="eyebrow">Implied P(price above strike at expiry)</p>
        <p className="meta">Synthetic smile, forward {fmtUsd(FORWARD)}. Not market data.</p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-4 w-full touch-none select-none"
        role="img"
        aria-label="Probability that the price ends above each strike, with and without the smile slope term"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(p)} y2={y(p)} stroke="var(--color-line)" />
            <text x={PAD.left - 8} y={y(p) + 4} textAnchor="end" className="fill-[var(--color-brown-light)] font-mono text-[10px]">
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}
        {xTicks.map((K) => (
          <text key={K} x={x(K)} y={H - 10} textAnchor="middle" className="fill-[var(--color-brown-light)] font-mono text-[10px]">
            {fmtUsd(K / 1000)}k
          </text>
        ))}
        <line x1={x(FORWARD)} x2={x(FORWARD)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-tan)" strokeDasharray="3 3" />
        <path d={path(points.map((p) => ({ x: x(p.strike), y: y(p.flat) })))} fill="none" stroke="var(--color-darkblue-light)" strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={path(points.map((p) => ({ x: x(p.strike), y: y(p.withSkew) })))} fill="none" stroke="var(--color-terracotta)" strokeWidth={2} />
        <line x1={x(at.strike)} x2={x(at.strike)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-ink)" strokeOpacity={0.35} />
        <circle cx={x(at.strike)} cy={y(at.flat)} r={3.5} fill="var(--color-darkblue-light)" />
        <circle cx={x(at.strike)} cy={y(at.withSkew)} r={4} fill="var(--color-terracotta)" />
      </svg>

      <svg viewBox={`0 0 ${W} ${GAP_H}`} className="mt-2 w-full" role="img" aria-label="Size of the smile slope term across strikes, in percentage points">
        <text x={PAD.left} y={12} className="fill-[var(--color-brown-light)] font-mono text-[10px]">
          smile slope term, percentage points
        </text>
        <line x1={PAD.left} x2={W - PAD.right} y1={yg(0)} y2={yg(0)} stroke="var(--color-line)" />
        <path
          d={`${path(points.map((p, i) => ({ x: x(p.strike), y: yg(gaps[i]) })))}L${x(kMax).toFixed(1)},${yg(0).toFixed(1)}L${x(kMin).toFixed(1)},${yg(0).toFixed(1)}Z`}
          fill="var(--color-terracotta)"
          fillOpacity={0.12}
          stroke="var(--color-terracotta)"
          strokeWidth={1.5}
        />
        <circle cx={x(at.strike)} cy={yg(gaps[idx])} r={3.5} fill="var(--color-terracotta)" />
        {[gMax / 1.15, 0, -gMax / 1.15].map((g) => (
          <text key={g} x={PAD.left - 8} y={yg(g) + 4} textAnchor="end" className="fill-[var(--color-brown-light)] font-mono text-[10px]">
            {g > 0 ? "+" : ""}
            {g.toFixed(1)}
          </text>
        ))}
      </svg>

      <svg viewBox={`0 0 ${W} ${SMILE_H}`} className="mt-2 w-full" role="img" aria-label="Implied volatility smile across strikes">
        <text x={PAD.left} y={12} className="fill-[var(--color-brown-light)] font-mono text-[10px]">
          implied vol sigma(K)
        </text>
        <line x1={PAD.left} x2={W - PAD.right} y1={SMILE_H - PAD.bottom} y2={SMILE_H - PAD.bottom} stroke="var(--color-line)" />
        <path d={path(points.map((p) => ({ x: x(p.strike), y: ys(p.sigma) })))} fill="none" stroke="var(--color-sage)" strokeWidth={1.75} />
        <circle cx={x(at.strike)} cy={ys(at.sigma)} r={3.5} fill="var(--color-sage)" />
        {[sMin, sMax].map((s) => (
          <text key={s} x={PAD.left - 8} y={ys(s) + 4} textAnchor="end" className="fill-[var(--color-brown-light)] font-mono text-[10px]">
            {Math.round(s * 100)}%
          </text>
        ))}
      </svg>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="meta">Strike</dt>
          <dd className="font-mono text-sm text-ink">{fmtUsd(at.strike)}</dd>
        </div>
        <div>
          <dt className="meta">
            <span className="mr-1.5 inline-block h-0.5 w-4 align-middle bg-[var(--color-darkblue-light)]" />
            Flat vol, N(d2)
          </dt>
          <dd className="font-mono text-sm text-ink">{(at.flat * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="meta">
            <span className="mr-1.5 inline-block h-0.5 w-4 align-middle bg-[var(--color-terracotta)]" />
            With smile slope
          </dt>
          <dd className="font-mono text-sm text-ink">{(at.withSkew * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="meta">Skew term</dt>
          <dd className="font-mono text-sm text-ink">
            {gapPp >= 0 ? "+" : ""}
            {gapPp.toFixed(2)} pp
          </dd>
        </div>
      </dl>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <span className="meta">Horizon</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {HORIZONS.map((h, i) => (
              <button
                key={h.label}
                type="button"
                onClick={() => setHorizon(i)}
                className={`rounded border px-2 py-0.5 font-mono text-xs transition-colors ${
                  i === horizon
                    ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white"
                    : "border-[var(--color-line)] text-[var(--color-brown-light)] hover:text-[var(--color-terracotta)]"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="meta">Skew (SVI rho) {rho.toFixed(2)}</span>
          <input type="range" min={-0.8} max={0.4} step={0.05} value={rho} onChange={(e) => setRho(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-terracotta)]" />
        </label>
        <label className="block">
          <span className="meta">At-the-money vol {Math.round(atmVol * 100)}%</span>
          <input type="range" min={0.3} max={1} step={0.05} value={atmVol} onChange={(e) => setAtmVol(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-terracotta)]" />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="meta">Strike (or drag across the chart)</span>
        <input type="range" min={0} max={1} step={1 / (N_POINTS - 1)} value={cursor} onChange={(e) => setCursor(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-terracotta)]" />
      </label>
    </div>
  );
}
