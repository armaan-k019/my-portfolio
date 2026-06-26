"use client";

// The Distribution view as a clickable dot distribution.
//
// Every candidate is an individual dot, positioned on the x axis by the chosen
// metric (Work Quality or Role Fit) and stacked vertically where scores cluster,
// so the overall shape is a distribution made of real people. Dots are colored
// by quadrant, the below-bar tail is highlighted, and a fitted normal curve is
// overlaid as a dashed line. The real shape tends to be bimodal, not normal.
// Every dot opens the candidate detail panel.
//
// The two metrics are distributed separately (not blended) because Work Quality
// and Role Fit are kept deliberately separate.

import { QUADRANT_COLORS, quadrantOf, qualityCorroborated, NEUTRAL_FIT, type Candidate, type RoleBarConfig } from "./data";

export type DistMetric = "quality" | "fit";

const W = 600;
const H = 320;
const PAD_L = 44;
const PAD_R = 24;
const PAD_T = 30;
const PAD_B = 48;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const BASELINE = PAD_T + PLOT_H;

const BIN_W = 5; // narrow buckets so two humps can separate
const N_BINS = 100 / BIN_W;

function sx(subst: number) {
  return PAD_L + (subst / 100) * PLOT_W;
}

const AXIS = "rgba(44,24,16,0.55)";
const RED = "#C0392B";

function gaussian(x: number, mean: number, std: number) {
  return Math.exp(-((x - mean) ** 2) / (2 * std * std)) / (std * Math.sqrt(2 * Math.PI));
}

export default function Distribution({
  candidates,
  bar,
  metric,
  fitById,
  fitAvailable,
  selectedId,
  onSelect,
}: {
  candidates: Candidate[];
  bar: RoleBarConfig;
  metric: DistMetric;
  fitById: Map<string, number>;
  fitAvailable: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const fitOf = (id: string) => (fitAvailable ? fitById.get(id) ?? NEUTRAL_FIT : NEUTRAL_FIT);
  const valueOf = (c: Candidate) => (metric === "fit" ? fitOf(c.id) : qualityCorroborated(c));
  const barThreshold = metric === "fit" ? bar.y : bar.x;
  const metricLabel = metric === "fit" ? "Role Fit" : "Work Quality (corroborated)";

  // Bucket by the chosen metric, ordered within a bin for stable stacks.
  const bins: Candidate[][] = Array.from({ length: N_BINS }, () => []);
  for (const c of candidates) {
    const idx = Math.min(N_BINS - 1, Math.floor(valueOf(c) / BIN_W));
    bins[idx].push(c);
  }
  bins.forEach((b) => b.sort((a, z) => a.id.localeCompare(z.id)));

  const maxCount = Math.max(1, ...bins.map((b) => b.length));
  const dotGap = Math.min(19, (PLOT_H - 8) / maxCount);
  const dotR = Math.min(dotGap / 2 - 1, candidates.length > 45 ? 5 : 6.5);

  // Pool mean and standard deviation of the chosen metric.
  const n = candidates.length;
  const scores = candidates.map((c) => valueOf(c));
  const mean = n ? scores.reduce((s, v) => s + v, 0) / n : 0;
  const std = Math.max(1, Math.sqrt(n ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0));

  // Fitted normal, scaled so its area matches the dot stacks (expected count
  // per bin = n * binWidth * pdf, drawn at the same dotGap unit as the stacks).
  const curve = (() => {
    const pts: string[] = [];
    for (let x = 0; x <= 100; x += 2) {
      const expected = n * BIN_W * gaussian(x, mean, std);
      const y = Math.max(PAD_T, BASELINE - expected * dotGap);
      pts.push(`${sx(x).toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  })();

  const barX = sx(barThreshold);
  const tailCount = candidates.filter((c) => valueOf(c) < barThreshold).length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ overflow: "visible", display: "block" }}
      aria-label={`Distribution of ${metric === "fit" ? "role fit" : "work quality"} across the pool`}
      onClick={() => onSelect(null)}
    >
      {/* Opaque base so nothing behind the card bleeds through */}
      <rect x={0} y={0} width={W} height={H} fill="var(--ct-card-bg)" />

      {/* Below-bar tail shading */}
      <rect x={PAD_L} y={PAD_T} width={barX - PAD_L} height={PLOT_H} fill="rgba(192,57,43,0.07)" />
      <text x={PAD_L + 6} y={PAD_T + 12} fontSize={10} fontWeight={700} fill={RED} opacity={0.8}>
        Below the bar
      </text>
      <text x={PAD_L + PLOT_W - 4} y={PAD_T + 12} textAnchor="end" fontSize={10} fill="rgba(44,24,16,0.55)">
        {tailCount} of {n} below the {metric === "fit" ? "fit" : "quality"} bar
      </text>

      {/* Baseline + role bar */}
      <line x1={PAD_L} y1={BASELINE} x2={PAD_L + PLOT_W} y2={BASELINE} stroke="rgba(44,24,16,0.18)" strokeWidth={1} />
      <g style={{ transform: `translateX(${barX}px)`, transition: "transform 0.6s var(--ease-soft, ease)" }}>
        <line x1={0} y1={PAD_T} x2={0} y2={BASELINE} stroke={AXIS} strokeWidth={1} strokeDasharray="4,3" />
        <text x={0} y={BASELINE + 26} textAnchor="middle" fontSize={9} fill={AXIS}>
          {metric === "fit" ? "fit" : "quality"} bar ({barThreshold})
        </text>
      </g>

      {/* Candidate dots, beeswarm stacked within each bin */}
      {bins.flatMap((b) =>
        b.map((c, stack) => {
          const v = valueOf(c);
          const x = sx(v);
          const y = BASELINE - (stack + 0.5) * dotGap;
          const inTail = v < barThreshold;
          const color = QUADRANT_COLORS[quadrantOf({ quality: qualityCorroborated(c), fit: fitOf(c.id) }, bar)];
          const isSelected = selectedId === c.id;
          const dimmed = selectedId !== null && !isSelected;
          const isBg = !!c.background;
          const r = isBg && !isSelected ? Math.max(dotR - 1.5, 3) : dotR;
          return (
            <g key={c.id} onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}>
              <circle cx={x} cy={y} r={Math.max(r + 5, 11)} fill="transparent" style={{ cursor: "pointer" }} />
              {isSelected && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />}
              <circle
                className="traj-dot"
                cx={x}
                cy={y}
                r={isSelected ? r + 1 : r}
                fill={color}
                fillOpacity={dimmed ? 0.28 : isBg ? 0.5 : inTail ? 0.95 : 0.8}
                stroke="white"
                strokeWidth={isBg ? 1 : 1.5}
              />
            </g>
          );
        })
      )}

      {/* Fitted normal distribution overlay (dashed) */}
      <polyline points={curve} fill="none" stroke="#3F6CB5" strokeWidth={2} strokeDasharray="5,3" opacity={0.85} />

      {/* Mean marker */}
      <line x1={sx(mean)} y1={PAD_T} x2={sx(mean)} y2={BASELINE} stroke="#3F6CB5" strokeWidth={1} opacity={0.45} />
      <text x={sx(mean)} y={PAD_T - 6} textAnchor="middle" fontSize={9} fill="#3F6CB5">
        mean {mean.toFixed(0)}, sd {std.toFixed(0)}
      </text>

      {/* X axis */}
      {[0, 25, 50, 75, 100].map((t) => (
        <text key={t} x={sx(t)} y={BASELINE + 14} textAnchor="middle" fontSize={9} fill="rgba(44,24,16,0.5)">
          {t}
        </text>
      ))}
      <text x={PAD_L + PLOT_W / 2} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={AXIS}>
        {metricLabel}
      </text>

      {/* Legend */}
      <g transform={`translate(${PAD_L + 4}, ${PAD_T + 26})`}>
        <line x1={0} y1={0} x2={14} y2={0} stroke="#3F6CB5" strokeWidth={2} strokeDasharray="5,3" />
        <text x={20} y={3} fontSize={9} fill="rgba(44,24,16,0.6)">fitted normal (real shape is bimodal)</text>
      </g>

      {n === 0 && (
        <text x={PAD_L + PLOT_W / 2} y={PAD_T + PLOT_H / 2} textAnchor="middle" fontSize={12} fill="rgba(44,24,16,0.5)">
          The pool is empty. Add a candidate or load the example pool.
        </text>
      )}

      {n > 0 && metric === "fit" && !fitAvailable && (
        <text x={PAD_L + PLOT_W / 2} y={PAD_T + PLOT_H / 2} textAnchor="middle" fontSize={12} fill="rgba(44,24,16,0.55)" style={{ paintOrder: "stroke", stroke: "var(--ct-card-bg)", strokeWidth: 4 }}>
          Paste a job description to distribute by Role Fit.
        </text>
      )}
    </svg>
  );
}
