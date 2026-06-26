"use client";

// The quadrant scatter: Work Quality (X) vs Role Fit (Y).
//
// Position is set ONLY by these two. The role bar (set by the JD) re-sorts
// candidates into above-bar and below-bar without moving any dot. Credential
// overlays (school prestige, GPA, extracurriculars) annotate dots and never
// change position.
//
// No-JD holding state: Role Fit is undefined, so dots are muted and parked on a
// shelf near the bottom at their real Work Quality (X), with the explaining
// prompt rendered outside the chart (in the demo). Once a JD is applied dots
// take their real Y and spread. Light collision relaxation keeps dots from
// clumping into an unreadable mass in either state.

import { useState } from "react";
import {
  qualityFor,
  quadrantOf,
  QUADRANT_COLORS,
  QUADRANT_TINTS,
  NEUTRAL_FIT,
  type SourceMode,
  type AxisPosition,
  type Candidate,
  type RoleBarConfig,
} from "./data";

export interface OverlayToggles {
  school: boolean;
  gpa: boolean;
  extracurriculars: boolean;
}

// ─── Plot geometry ───────────────────────────────────────────────────────────
const W = 600;
const H = 440;
const PAD_L = 48;
const PAD_R = 28;
const PAD_T = 28;
const PAD_B = 44;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function px(quality: number) {
  return PAD_L + (quality / 100) * PLOT_W;
}
function py(fit: number) {
  return PAD_T + PLOT_H - (fit / 100) * PLOT_H;
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

const AXIS = "rgba(44,24,16,0.55)";
const GRID = "rgba(44,24,16,0.16)";
const PRESTIGE = "#B8860B"; // school prestige marker (gold)
const STAR = "#2E7D6B";     // extracurricular marker
const GPA_BG = "#3F6CB5";   // GPA pill
const MUTED = "#9A8C7A";    // no-JD holding color

// Overlays mark STANDOUTS only, so toggling one makes the high-credential
// candidates pop and a recruiter can see whether they sit on strong work or are
// stranded on thin work. Average and low credentials stay unmarked.
const PRESTIGE_STANDOUT = 85; // high prestige school
const GPA_STANDOUT = 3.7;     // high GPA
// A notable extracurricular: leadership, awards, significant involvement.
const NOTABLE_EXTRA = /\b(winner|captain|founded|founder|lead|president|published|division i|award|maintainer|olympiad|national)\b/i;
function isNotableExtra(x?: string): boolean {
  return !!x && NOTABLE_EXTRA.test(x);
}

interface Placed { id: string; x: number; y: number }

// Deterministic collision relaxation: push apart any two dots closer than
// minDist so clusters fan out instead of overlapping. No randomness, so output
// is stable across renders.
function relax(base: Placed[], minDist: number, iters: number): Map<string, Placed> {
  const pts = base.map((p) => ({ ...p }));
  const minX = PAD_L + 6, maxX = PAD_L + PLOT_W - 6;
  const minY = PAD_T + 6, maxY = PAD_T + PLOT_H - 6;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[j].x - pts[i].x;
        let dy = pts[j].y - pts[i].y;
        let d = Math.hypot(dx, dy);
        if (d === 0) {
          // Identical coordinates: separate deterministically by index.
          dx = (j - i) % 2 === 0 ? 0.6 : -0.6;
          dy = 0.6;
          d = Math.hypot(dx, dy);
        }
        if (d < minDist) {
          const push = (minDist - d) / 2;
          const ux = dx / d, uy = dy / d;
          pts[i].x -= ux * push; pts[i].y -= uy * push;
          pts[j].x += ux * push; pts[j].y += uy * push;
        }
      }
    }
    for (const p of pts) { p.x = clamp(p.x, minX, maxX); p.y = clamp(p.y, minY, maxY); }
  }
  const map = new Map<string, Placed>();
  for (const p of pts) map.set(p.id, p);
  return map;
}

export default function TrajectoryChart({
  candidates,
  mode,
  bar,
  overlays,
  fitById,
  fitAvailable,
  selectedId,
  hiddenIds,
  onSelect,
}: {
  candidates: Candidate[];
  mode: SourceMode;
  bar: RoleBarConfig;
  overlays: OverlayToggles;
  fitById: Map<string, number>;
  fitAvailable: boolean;
  selectedId: string | null;
  hiddenIds: Set<string>;
  onSelect: (id: string | null) => void;
}) {
  // Names are shown only on hover (tooltip) or selection (also the detail panel),
  // so the chart stays free of floating labels.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const visible = candidates.filter((c) => !hiddenIds.has(c.id));
  const heroR = visible.length > 40 ? 7 : 8;
  const bgR = 4;

  const barX = px(bar.x);
  const barY = py(bar.y);

  // Base coordinates: X is always real Work Quality. Y is real Role Fit when a
  // JD is loaded, otherwise a bottom holding shelf.
  const shelfY = PAD_T + PLOT_H - 14;
  const base: Placed[] = visible.map((c) => ({
    id: c.id,
    x: px(qualityFor(c, mode)),
    y: fitAvailable ? py(fitById.get(c.id) ?? NEUTRAL_FIT) : shelfY,
  }));
  const placed = relax(base, bgR * 2 + 3, 60);

  // The one name shown on the chart: hovered first, otherwise the selected dot.
  const tipId = hoveredId && !hiddenIds.has(hoveredId) ? hoveredId : selectedId;
  const tipCandidate = tipId ? candidates.find((c) => c.id === tipId && !hiddenIds.has(c.id)) ?? null : null;
  const tipPos = tipId ? placed.get(tipId) ?? null : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ overflow: "visible", display: "block" }}
      aria-label="Candidate work quality and role fit chart"
      onClick={() => onSelect(null)}
    >
      <rect x={0} y={0} width={W} height={H} fill="var(--ct-card-bg)" />

      {/* Quadrant background tints. Muted when there is no Role Fit yet. */}
      <g style={{ opacity: fitAvailable ? 1 : 0.35, transition: "opacity 0.5s ease" }}>
        <rect x={barX} y={PAD_T} width={PAD_L + PLOT_W - barX} height={barY - PAD_T} fill={QUADRANT_TINTS["Strong and Aligned"]} />
        <rect x={PAD_L} y={PAD_T} width={barX - PAD_L} height={barY - PAD_T} fill={QUADRANT_TINTS["Aligned but Light"]} />
        <rect x={barX} y={barY} width={PAD_L + PLOT_W - barX} height={PAD_T + PLOT_H - barY} fill={QUADRANT_TINTS["Strong but Off-target"]} />
        <rect x={PAD_L} y={barY} width={barX - PAD_L} height={PAD_T + PLOT_H - barY} fill={QUADRANT_TINTS["Low Signal"]} />
      </g>

      <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="none" stroke={GRID} strokeWidth={1} />

      {/* Role bar dividers, in translated groups so they glide when the JD moves them */}
      <g style={{ transform: `translateX(${barX}px)`, transition: "transform 0.6s var(--ease-soft, ease)" }}>
        <line x1={0} y1={PAD_T} x2={0} y2={PAD_T + PLOT_H} stroke={AXIS} strokeWidth={1} strokeDasharray="4,3" />
      </g>
      {/* Horizontal (Role Fit) divider only matters once a JD is loaded */}
      <g style={{ transform: `translateY(${barY}px)`, transition: "transform 0.6s var(--ease-soft, ease)", opacity: fitAvailable ? 1 : 0.25 }}>
        <line x1={PAD_L} y1={0} x2={PAD_L + PLOT_W} y2={0} stroke={AXIS} strokeWidth={1} strokeDasharray="4,3" />
      </g>

      {/* Quadrant labels, muted with no Role Fit */}
      <g style={{ opacity: fitAvailable ? 1 : 0.3, transition: "opacity 0.5s ease" }}>
        <text x={PAD_L + PLOT_W - 6} y={PAD_T + 14} textAnchor="end" fontSize={11} fontWeight={700} fill={QUADRANT_COLORS["Strong and Aligned"]} opacity={0.8}>Strong and Aligned</text>
        <text x={PAD_L + 6} y={PAD_T + 14} textAnchor="start" fontSize={11} fontWeight={700} fill={QUADRANT_COLORS["Aligned but Light"]} opacity={0.8}>Aligned but Light</text>
        <text x={PAD_L + PLOT_W - 6} y={PAD_T + PLOT_H - 8} textAnchor="end" fontSize={11} fontWeight={700} fill={QUADRANT_COLORS["Strong but Off-target"]} opacity={0.85}>Strong but Off-target</text>
        <text x={PAD_L + 6} y={PAD_T + PLOT_H - 8} textAnchor="start" fontSize={11} fontWeight={700} fill={QUADRANT_COLORS["Low Signal"]} opacity={0.8}>Low Signal</text>
      </g>

      {/* Axis labels */}
      <text x={PAD_L + PLOT_W / 2} y={H - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill={AXIS}>
        Work Quality (demonstrated substance)
      </text>
      <text x={14} y={PAD_T + PLOT_H / 2} textAnchor="middle" fontSize={11} fontWeight={600} fill={AXIS} transform={`rotate(-90, 14, ${PAD_T + PLOT_H / 2})`}>
        Role Fit (alignment with the role)
      </text>

      {/* Background population first, so named heroes render on top */}
      {candidates.filter((c) => c.background).map((c) => renderDot(c, true))}
      {candidates.filter((c) => !c.background).map((c) => renderDot(c, false))}

      {/* Name tooltip for the hovered or selected dot only. No persistent labels. */}
      {tipCandidate && tipPos && (() => {
        const left = tipPos.x > PAD_L + PLOT_W * 0.7;
        return (
          <text
            x={left ? tipPos.x - 11 : tipPos.x + 11}
            y={tipPos.y - 10}
            textAnchor={left ? "end" : "start"}
            fontSize={11}
            fontWeight={700}
            fill="var(--ct-text)"
            pointerEvents="none"
            style={{ paintOrder: "stroke", stroke: "var(--ct-card-bg)", strokeWidth: 4 }}
          >
            {tipCandidate.name}
          </text>
        );
      })()}
    </svg>
  );

  function renderDot(c: Candidate, isBg: boolean) {
    const hidden = hiddenIds.has(c.id);
    const p = placed.get(c.id);
    const x = p ? p.x : px(qualityFor(c, mode));
    const y = p ? p.y : shelfY;
    const pos: AxisPosition = { quality: qualityFor(c, mode), fit: fitAvailable ? fitById.get(c.id) ?? NEUTRAL_FIT : NEUTRAL_FIT };
    const color = fitAvailable ? QUADRANT_COLORS[quadrantOf(pos, bar)] : MUTED;
    const r = isBg ? bgR : heroR;
    const isSelected = selectedId === c.id;
    const dimmed = selectedId !== null && !isSelected;
    const f = c.factors;

    // Overlays mark STANDOUTS only, on any candidate (hero or background).
    const markPrestige = overlays.school && !hidden && (f?.schoolPrestige ?? 0) >= PRESTIGE_STANDOUT;
    const markExtra = overlays.extracurriculars && !hidden && isNotableExtra(f?.extracurricular);
    const markGpa = overlays.gpa && !hidden && (f?.gpa ?? 0) >= GPA_STANDOUT;

    return (
      <g
        key={c.id}
        style={{
          transform: `translate(${x}px, ${y}px)`,
          transition: "transform 0.7s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease",
          opacity: hidden ? 0 : isBg && !isSelected ? 0.55 : 1,
          cursor: hidden ? "default" : "pointer",
        }}
        pointerEvents={hidden ? "none" : "auto"}
        onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}
        onMouseEnter={() => setHoveredId(c.id)}
        onMouseLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
      >
        <circle r={Math.max(r + 6, 12)} fill="transparent" />

        {isSelected && !hidden && <circle r={r + 5} fill="none" stroke={color} strokeWidth={2} opacity={0.7} />}

        <circle
          className="traj-dot"
          r={isSelected ? r + 1 : r}
          fill={color}
          fillOpacity={dimmed ? 0.28 : isBg ? 0.6 : fitAvailable ? 0.95 : 0.62}
          stroke="white"
          strokeWidth={isBg ? 1 : 1.75}
          style={{ transition: "fill 0.5s ease, fill-opacity 0.5s ease, transform 0.16s var(--ease-soft), filter 0.16s ease" }}
        />

        {/* High school prestige: gold diamond, top-left */}
        {markPrestige && (() => {
          const cx = -(r - 1), cy = -(r - 1);
          return <rect x={cx - 3.2} y={cy - 3.2} width={6.4} height={6.4} fill={PRESTIGE} stroke="var(--ct-card-bg)" strokeWidth={1} transform={`rotate(45, ${cx}, ${cy})`} />;
        })()}

        {/* Notable extracurricular: small star, top-right */}
        {markExtra && (
          <text x={r - 1} y={-(r - 1)} fontSize={11} fill={STAR} style={{ paintOrder: "stroke", stroke: "var(--ct-card-bg)", strokeWidth: 2.5 }}>★</text>
        )}

        {/* High GPA: small filled pip, bottom */}
        {markGpa && (
          <circle cx={0} cy={r + 3.5} r={2.6} fill={GPA_BG} stroke="var(--ct-card-bg)" strokeWidth={1} />
        )}
      </g>
    );
  }
}
