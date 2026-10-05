"use client";

import { STRATEGIES, type DaySummary } from "./model";

export const STRATEGY_COLORS = ["#9a8a7a", "#c2410c", "#2563eb", "#2d5a27"];

const W = 320;
const H = 110;
const PAD = { l: 34, r: 8, t: 8, b: 18 };

function xScale(day: number, days: number) {
  return PAD.l + (day / Math.max(1, days - 1)) * (W - PAD.l - PAD.r);
}

function Frame({ days, yMax, yLabel, children }: { days: number; yMax: string; yLabel: string; children: React.ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={yLabel}>
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#e5e0d8" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#e5e0d8" />
      <text x={PAD.l - 4} y={PAD.t + 8} textAnchor="end" fontSize="9" fill="#9a8a7a">{yMax}</text>
      <text x={PAD.l - 4} y={H - PAD.b} textAnchor="end" fontSize="9" fill="#9a8a7a">0</text>
      <text x={PAD.l} y={H - 4} fontSize="9" fill="#9a8a7a">day 0</text>
      <text x={W - PAD.r} y={H - 4} textAnchor="end" fontSize="9" fill="#9a8a7a">day {days}</text>
      {children}
    </svg>
  );
}

export function LineChart({
  history,
  days,
  value,
  max,
  color,
  label,
  format,
}: {
  history: DaySummary[];
  days: number;
  value: (d: DaySummary) => number;
  max: number;
  color: string;
  label: string;
  format: (v: number) => string;
}) {
  const yScale = (v: number) => H - PAD.b - (Math.min(v, max) / max) * (H - PAD.t - PAD.b);
  const pts = history.map((d) => `${xScale(d.day, days).toFixed(1)},${yScale(value(d)).toFixed(1)}`).join(" ");
  return (
    <Frame days={days} yMax={format(max)} yLabel={label}>
      {history.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />}
    </Frame>
  );
}

export function SharesChart({ history, days, sellers }: { history: DaySummary[]; days: number; sellers: number }) {
  const yScale = (v: number) => H - PAD.b - (v / sellers) * (H - PAD.t - PAD.b);
  const bands = STRATEGIES.map((_, k) => {
    if (history.length < 2) return "";
    const top: string[] = [];
    const bottom: string[] = [];
    for (const d of history) {
      let below = 0;
      for (let q = 0; q < k; q++) below += d.shares[q];
      const x = xScale(d.day, days).toFixed(1);
      top.push(`${x},${yScale(below + d.shares[k]).toFixed(1)}`);
      bottom.push(`${x},${yScale(below).toFixed(1)}`);
    }
    return [...top, ...bottom.reverse()].join(" ");
  });
  return (
    <Frame days={days} yMax={String(sellers)} yLabel="Sellers on each strategy">
      {bands.map((pts, k) => pts && <polygon key={k} points={pts} fill={STRATEGY_COLORS[k]} fillOpacity={0.75} />)}
    </Frame>
  );
}

export function Sparkline({ values, color }: { values: ArrayLike<number>; color: string }) {
  const w = 220;
  const h = 40;
  const n = values.length;
  if (n < 2) return <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" />;
  const pts = Array.from({ length: n }, (_, i) => `${((i / (n - 1)) * w).toFixed(1)},${(h - 2 - values[i] * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" role="img" aria-label="Trust over time">
      <line x1={0} y1={h - 2} x2={w} y2={h - 2} stroke="#e5e0d8" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
