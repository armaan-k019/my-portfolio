"use client";

import { useMemo, useRef, useState } from "react";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import {
  PLAN,
  REVIEWERS,
  SAMPLE_MARKUPS,
  conflicts,
  roomArea,
  solve,
  type Markup,
  type Plan,
} from "./consensus";

const C = CSS_VAR_COLORS;
const S = 25; // px per meter
const PAD = 14;
const W = PLAN.xs.at(-1)! * S + PAD * 2;
const H = PLAN.ys.at(-1)! * S + PAD * 2;
const TRACE = "#c2410c";

type Tool = "bigger" | "smaller" | "keep" | "wall";
const TOOLS: { id: Tool; label: string }[] = [
  { id: "bigger", label: "Bigger" },
  { id: "smaller", label: "Smaller" },
  { id: "keep", label: "Keep" },
  { id: "wall", label: "Drag a wall" },
];
const GLYPH: Record<Exclude<Tool, "wall">, string> = { bigger: "+", smaller: "−", keep: "=" };

type MarkupInput = Markup extends infer M ? (M extends Markup ? Omit<M, "id" | "reviewer"> : never) : never;

const px = (m: number) => PAD + m * S;
// Where a grid line is actually a wall: the span of the rooms it bounds.
function extent(axis: "x" | "y", line: number): [number, number] {
  const touching = PLAN.rooms.filter((r) => r[axis][0] === line || r[axis][1] === line);
  const other = axis === "x" ? "y" : "x";
  const lines = axis === "x" ? PLAN.ys : PLAN.xs;
  return [px(Math.min(...touching.map((r) => lines[r[other][0]]))), px(Math.max(...touching.map((r) => lines[r[other][1]])))];
}

const reviewerColor = (id: string) => REVIEWERS.find((r) => r.id === id)?.color ?? "#000";
const roomName = (id: string) => PLAN.rooms.find((r) => r.id === id)?.name ?? id;

function describe(m: Markup) {
  const who = REVIEWERS.find((r) => r.id === m.reviewer)?.name ?? m.reviewer;
  if (m.kind === "wall") return `${who}: wall at ${m.to.toFixed(1)} m`;
  return `${who}: ${m.kind} ${roomName(m.room).toLowerCase()}`;
}

function Rooms({ plan, dashed }: { plan: Plan; dashed?: boolean }) {
  return (
    <g>
      {plan.rooms.map((r) => {
        const x = px(plan.xs[r.x[0]]);
        const y = px(plan.ys[r.y[0]]);
        const w = (plan.xs[r.x[1]] - plan.xs[r.x[0]]) * S;
        const h = (plan.ys[r.y[1]] - plan.ys[r.y[0]]) * S;
        return dashed ? (
          <rect key={r.id} x={x} y={y} width={w} height={h} fill={`${TRACE}0d`} stroke={TRACE} strokeWidth={1.5} strokeDasharray="5 3" pointerEvents="none" />
        ) : (
          <rect key={r.id} x={x} y={y} width={w} height={h} fill="#fff" stroke="#1a1a1a" strokeWidth={2} />
        );
      })}
    </g>
  );
}

export default function PinUpDemo() {
  const [markups, setMarkups] = useState<Markup[]>(SAMPLE_MARKUPS);
  const [active, setActive] = useState<Set<string>>(() => new Set(REVIEWERS.map((r) => r.id)));
  const [reviewer, setReviewer] = useState("you");
  const [tool, setTool] = useState<Tool>("bigger");
  const [showTrace, setShowTrace] = useState(true);
  const [drag, setDrag] = useState<{ axis: "x" | "y"; line: number; at: number } | null>(null);
  const nextId = useRef(100);
  const svgRef = useRef<SVGSVGElement>(null);

  const live = useMemo(() => markups.filter((m) => active.has(m.reviewer)), [markups, active]);
  const weights = useMemo(() => new Map(REVIEWERS.map((r) => [r.id, 1])), []);
  const sol = useMemo(() => solve(PLAN, live, weights), [live, weights]);
  const clashes = useMemo(() => conflicts(PLAN, live, sol, weights).slice(0, 3), [live, sol, weights]);

  function add(m: MarkupInput) {
    setMarkups((ms) => [...ms, { ...m, id: nextId.current++, reviewer } as Markup]);
    setActive((a) => new Set(a).add(reviewer));
  }

  function meters(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const box = svg.getBoundingClientRect();
    return {
      x: (((e.clientX - box.left) / box.width) * W - PAD) / S,
      y: (((e.clientY - box.top) / box.height) * H - PAD) / S,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = meters(e);
    const lines = drag.axis === "x" ? PLAN.xs : PLAN.ys;
    const at = Math.round(Math.max(lines[drag.line - 1] + 1, Math.min(lines[drag.line + 1] - 1, drag.axis === "x" ? p.x : p.y)) * 2) / 2;
    setDrag({ ...drag, at });
  }

  function onPointerUp() {
    if (drag) add({ kind: "wall", axis: drag.axis, line: drag.line, to: drag.at });
    setDrag(null);
  }

  // Pins sit in a row at each room's center, one per markup.
  const pins = live
    .filter((m) => m.kind !== "wall")
    .map((m) => {
      const r = PLAN.rooms.find((q) => q.id === (m as { room: string }).room)!;
      const peers = live.filter((q) => q.kind !== "wall" && (q as { room: string }).room === r.id);
      const k = peers.indexOf(m);
      const cx = (PLAN.xs[r.x[0]] + PLAN.xs[r.x[1]]) / 2;
      const cy = (PLAN.ys[r.y[0]] + PLAN.ys[r.y[1]]) / 2;
      return { m, x: px(cx) + (k - (peers.length - 1) / 2) * 20, y: px(cy) + 16 };
    });

  const interiorWalls = [
    ...PLAN.xs.slice(1, -1).map((_, i) => ({ axis: "x" as const, line: i + 1 })),
    ...PLAN.ys.slice(1, -1).map((_, i) => ({ axis: "y" as const, line: i + 1 })),
  ];

  return (
    <div className="space-y-5">
      {/* Reviewers */}
      <div className="flex flex-wrap gap-2 text-xs">
        {REVIEWERS.map((r) => {
          const on = active.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() =>
                reviewer === r.id
                  ? setActive((a) => { const n = new Set(a); if (on) n.delete(r.id); else n.add(r.id); return n; })
                  : setReviewer(r.id)
              }
              className="px-2.5 py-1 rounded-full border"
              style={{
                borderColor: r.color,
                color: reviewer === r.id ? "#fff" : r.color,
                backgroundColor: reviewer === r.id ? r.color : "transparent",
                opacity: on ? 1 : 0.35,
              }}
              title="Click to mark up as this reviewer. Click again to mute."
            >
              {r.name}
            </button>
          );
        })}
      </div>

      {/* Tools */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className="px-2.5 py-1 rounded border"
            style={{ borderColor: C.cardBorder, backgroundColor: tool === t.id ? C.accentBg : C.cardBg, color: C.text }}
          >
            {t.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5" style={{ color: C.muted }}>
          <input type="checkbox" checked={showTrace} onChange={(e) => setShowTrace(e.target.checked)} />
          Consensus overlay
        </label>
      </div>

      {/* Plan */}
      <div className="rounded-xl border p-2" style={{ borderColor: C.cardBorder, backgroundColor: "#faf8f4" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none touch-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setDrag(null)}
          role="img"
          aria-label="Sample plan with reviewer markups"
        >
          <Rooms plan={PLAN} />
          {PLAN.rooms.map((r) => {
            const cx = px((PLAN.xs[r.x[0]] + PLAN.xs[r.x[1]]) / 2);
            const cy = px((PLAN.ys[r.y[0]] + PLAN.ys[r.y[1]]) / 2);
            return (
              <g key={r.id} onClick={() => tool !== "wall" && add({ kind: tool, room: r.id })} style={{ cursor: tool === "wall" ? "default" : "pointer" }}>
                <rect
                  x={px(PLAN.xs[r.x[0]]) + 2}
                  y={px(PLAN.ys[r.y[0]]) + 2}
                  width={(PLAN.xs[r.x[1]] - PLAN.xs[r.x[0]]) * S - 4}
                  height={(PLAN.ys[r.y[1]] - PLAN.ys[r.y[0]]) * S - 4}
                  fill="transparent"
                />
                <text x={cx} y={cy - 8} textAnchor="middle" fontSize="12" fill="#1a1a1a">{r.name}</text>
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill="#6b6b6b">
                  {roomArea(PLAN, r).toFixed(0)}
                  {showTrace && ` → ${roomArea(sol.plan, r).toFixed(0)}`} m²
                </text>
              </g>
            );
          })}

          {showTrace && <Rooms plan={sol.plan} dashed />}

          {/* Draggable walls */}
          {interiorWalls.map(({ axis, line }) => {
            const isX = axis === "x";
            const pos = px((isX ? PLAN.xs : PLAN.ys)[line]);
            const [a, b] = extent(axis, line);
            return (
              <line
                key={`${axis}${line}`}
                x1={isX ? pos : a}
                x2={isX ? pos : b}
                y1={isX ? a : pos}
                y2={isX ? b : pos}
                stroke="transparent"
                strokeWidth={14}
                style={{ cursor: tool === "wall" ? (isX ? "ew-resize" : "ns-resize") : "default" }}
                onPointerDown={(e) => {
                  if (tool !== "wall") return;
                  e.preventDefault();
                  setDrag({ axis, line, at: (isX ? PLAN.xs : PLAN.ys)[line] });
                }}
              />
            );
          })}

          {/* Wall markups and the live drag */}
          {[...live.filter((m) => m.kind === "wall"), ...(drag ? [{ id: -1, reviewer, kind: "wall" as const, ...drag, to: drag.at }] : [])].map((m) => {
            if (m.kind !== "wall") return null;
            const isX = m.axis === "x";
            const pos = px(m.to);
            const [a, b] = extent(m.axis, m.line);
            return (
              <line
                key={m.id}
                x1={isX ? pos : a}
                x2={isX ? pos : b}
                y1={isX ? a : pos}
                y2={isX ? b : pos}
                stroke={reviewerColor(m.reviewer)}
                strokeWidth={2}
                strokeDasharray="2 4"
                onClick={() => m.id > 0 && setMarkups((ms) => ms.filter((q) => q.id !== m.id))}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* Room pins */}
          {pins.map(({ m, x, y }) => (
            <g key={m.id} onClick={(e) => { e.stopPropagation(); setMarkups((ms) => ms.filter((q) => q.id !== m.id)); }} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r={8} fill={reviewerColor(m.reviewer)} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="#fff">
                {GLYPH[m.kind as Exclude<Tool, "wall">]}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Resolve first */}
      <div className="rounded-xl border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: C.dim }}>Resolve first</p>
        {clashes.length === 0 ? (
          <p className="text-xs" style={{ color: C.muted }}>No conflicts: one plan satisfies everyone.</p>
        ) : (
          <ol className="space-y-1.5 text-xs list-decimal pl-4" style={{ color: C.text }}>
            {clashes.map((c) => (
              <li key={`${c.a.id}-${c.b.id}`}>
                <span style={{ color: reviewerColor(c.a.reviewer) }}>{describe(c.a)}</span>
                {" vs "}
                <span style={{ color: reviewerColor(c.b.reviewer) }}>{describe(c.b)}</span>
                <span style={{ color: C.dim }}>
                  {" "}
                  ({Math.round((sol.satisfied.get(c.a.id) ?? 0) * 100)}% / {Math.round((sol.satisfied.get(c.b.id) ?? 0) * 100)}% met)
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button onClick={() => { setMarkups(SAMPLE_MARKUPS); setActive(new Set(REVIEWERS.map((r) => r.id))); }} className="text-xs underline hover:opacity-70" style={{ color: C.muted }}>
        Reset
      </button>
    </div>
  );
}
