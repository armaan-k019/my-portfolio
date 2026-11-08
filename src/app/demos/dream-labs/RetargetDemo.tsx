"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import {
  FAILURE_LABEL,
  OBJECT_HEIGHT,
  PICK,
  PLACE,
  ROBOTS,
  SHELF,
  defaultPath,
  resample,
  run,
  toKrl,
  type Pt,
  type Robot,
  type Run,
} from "./robots";

const C = CSS_VAR_COLORS;
const OK = "#7fb069";
const FAIL = "#e05d4f";
const N = 90; // samples along the path

// View window in millimeters (x forward, z up).
const X0 = -160;
const X1 = 960;
const Z0 = -70;
const Z1 = 960;
const VW = X1 - X0;
const VH = Z1 - Z0;
const sx = (x: number) => x - X0;
const sz = (z: number) => Z1 - z;

function Scene({ objectWidth }: { objectWidth: number }) {
  return (
    <g>
      <rect x={sx(X0)} y={sz(0)} width={VW} height={-Z0} fill="#1d2126" />
      <line x1={sx(X0)} x2={sx(X1)} y1={sz(0)} y2={sz(0)} stroke="#3a4048" strokeWidth={3} />
      <rect x={sx(SHELF.x0)} y={sz(SHELF.z)} width={SHELF.x1 - SHELF.x0} height={10} fill="#3a4048" />
      <line x1={sx(SHELF.x1 - 10)} x2={sx(SHELF.x1 - 10)} y1={sz(SHELF.z)} y2={sz(0)} stroke="#3a4048" strokeWidth={8} />
      <rect
        x={sx(PICK[0] - objectWidth / 2)}
        y={sz(OBJECT_HEIGHT)}
        width={objectWidth}
        height={OBJECT_HEIGHT}
        fill="none"
        stroke="#9aa3ad"
        strokeDasharray="6 5"
        strokeWidth={2}
      />
      <rect
        x={sx(PLACE[0] - objectWidth / 2)}
        y={sz(SHELF.z + OBJECT_HEIGHT)}
        width={objectWidth}
        height={OBJECT_HEIGHT}
        fill="none"
        stroke="#66707a"
        strokeDasharray="3 6"
        strokeWidth={2}
      />
    </g>
  );
}

function Arm({ points, color, width = 14 }: { points: Pt[]; color: string; width?: number }) {
  const d = points.map(([x, z], i) => `${i ? "L" : "M"}${sx(x)},${sz(z)}`).join(" ");
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      {points.slice(1, -1).map(([x, z], i) => (
        <circle key={i} cx={sx(x)} cy={sz(z)} r={width * 0.55} fill="#0d0f11" stroke={color} strokeWidth={3} />
      ))}
    </g>
  );
}

function PathTrace({ path, result }: { path: Pt[]; result: Run }) {
  return (
    <g>
      {path.slice(1).map((p, i) => {
        const ok = result.steps[i + 1]?.ok && result.steps[i]?.ok;
        return (
          <line
            key={i}
            x1={sx(path[i][0])}
            y1={sz(path[i][1])}
            x2={sx(p[0])}
            y2={sz(p[1])}
            stroke={ok ? OK : FAIL}
            strokeWidth={5}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

// The pose to show at step k: the step itself, or the last solved one before it.
function poseAt(result: Run, k: number) {
  for (let i = k; i >= 0; i--) {
    const s = result.steps[i];
    if (s.ok) return { pose: s.pose, stuck: i !== k };
  }
  // Never solved yet: draw the failed attempt itself.
  return { pose: result.steps[k]?.pose ?? null, stuck: true };
}

function Card({
  robot,
  result,
  k,
  path,
  active,
  onClick,
}: {
  robot: Robot;
  result: Run;
  k: number;
  path: Pt[];
  active: boolean;
  onClick: () => void;
}) {
  const { pose, stuck } = poseAt(result, k);
  const done = result.firstFail === null;
  return (
    <button
      onClick={onClick}
      className="rounded-lg border p-2 text-left transition-colors"
      style={{ borderColor: active ? C.accent : C.cardBorder, backgroundColor: C.cardBg }}
    >
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-auto" aria-hidden>
        <rect x={sx(X0)} y={sz(0)} width={VW} height={-Z0} fill="#1d2126" />
        <polyline points={path.map(([x, z]) => `${sx(x)},${sz(z)}`).join(" ")} fill="none" stroke="#3a4048" strokeWidth={8} />
        {pose && <Arm points={pose.points} color={stuck ? FAIL : C.text} width={22} />}
      </svg>
      <p className="text-xs font-semibold mt-1 truncate" style={{ color: C.text }}>{robot.name}</p>
      <p className="font-mono text-[11px] truncate" style={{ color: done ? OK : FAIL }}>
        {done ? "completes" : `${FAILURE_LABEL[result.why!]} at ${Math.round((result.firstFail! / (N - 1)) * 100)}%`}
      </p>
    </button>
  );
}

export default function RetargetDemo() {
  const [raw, setRaw] = useState<Pt[]>(defaultPath);
  const [drawing, setDrawing] = useState<Pt[] | null>(null);
  const [objectWidth, setObjectWidth] = useState(40);
  const [selected, setSelected] = useState("kuka");
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const path = useMemo(() => resample(raw, N), [raw]);
  const results = useMemo(() => ROBOTS.map((r) => run(r, path, objectWidth)), [path, objectWidth]);
  const k = Math.round(t * (N - 1));
  const idx = ROBOTS.findIndex((r) => r.id === selected);
  const robot = ROBOTS[idx];
  const result = results[idx];
  const { pose, stuck } = poseAt(result, k);
  const solvedCount = results.filter((r) => r.firstFail === null).length;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => {
        const next = v + dt / 4;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  function toMm(e: React.PointerEvent): Pt {
    const box = svgRef.current!.getBoundingClientRect();
    const x = X0 + ((e.clientX - box.left) / box.width) * VW;
    const z = Z1 - ((e.clientY - box.top) / box.height) * VH;
    return [Math.max(X0, Math.min(X1, x)), Math.max(0, Math.min(Z1, z))];
  }

  function download() {
    const blob = new Blob([toKrl(results[0])], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dream_retarget.src";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const target = path[k];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Main view */}
        <section className="rounded-lg border overflow-hidden" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VW} ${VH}`}
            className="w-full h-auto touch-none select-none cursor-crosshair"
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setPlaying(false);
              setDrawing([toMm(e)]);
            }}
            onPointerMove={(e) => drawing && setDrawing([...drawing, toMm(e)])}
            onPointerUp={() => {
              if (drawing && drawing.length > 4) {
                setRaw(drawing);
                setT(0);
                setPlaying(true);
              }
              setDrawing(null);
            }}
            role="img"
            aria-label="Side view of the table, the robot, and the drawn path"
          >
            <Scene objectWidth={objectWidth} />
            {drawing ? (
              <polyline points={drawing.map(([x, z]) => `${sx(x)},${sz(z)}`).join(" ")} fill="none" stroke={C.accent} strokeWidth={5} />
            ) : (
              <PathTrace path={path} result={result} />
            )}
            {!drawing && pose && <Arm points={pose.points} color={stuck ? FAIL : C.text} />}
            {!drawing && <circle cx={sx(target[0])} cy={sz(target[1])} r={9} fill={stuck ? FAIL : C.accent} />}
          </svg>
          <div className="border-t px-3 py-2 flex items-center gap-3" style={{ borderColor: C.cardBorder }}>
            <button
              onClick={() => {
                if (t >= 1) setT(0);
                setPlaying((p) => !p);
              }}
              className="text-xs font-semibold px-3 py-1 rounded"
              style={{ backgroundColor: C.accent, color: "#0d0f11" }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={t}
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
              className="flex-1"
              aria-label="Position along the path"
            />
            <span className="font-mono text-[11px] tabular-nums w-10 text-right" style={{ color: C.dim }}>
              {Math.round(t * 100)}%
            </span>
          </div>
        </section>

        {/* Selected robot */}
        <section className="rounded-lg border p-4 flex flex-col gap-3" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold" style={{ color: C.text }}>{robot.name}</p>
            <p className="font-mono text-xs" style={{ color: C.muted }}>{solvedCount}/5 complete</p>
          </div>
          <dl className="font-mono text-[11px] grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" style={{ color: C.muted }}>
            {robot.kind === "scara" ? (
              <>
                <dt style={{ color: C.dim }}>reach</dt>
                <dd>{robot.reach![0]} to {robot.reach![1]} mm</dd>
                <dt style={{ color: C.dim }}>stroke</dt>
                <dd>{robot.stroke![0]} to {robot.stroke![1]} mm</dd>
              </>
            ) : (
              <>
                <dt style={{ color: C.dim }}>links</dt>
                <dd>{robot.links.map((l) => Math.round(l)).join(" / ")} mm</dd>
                <dt style={{ color: C.dim }}>wrist</dt>
                <dd>{robot.kind === "planar2" ? "none" : "yes"}</dd>
              </>
            )}
            <dt style={{ color: C.dim }}>gripper</dt>
            <dd>{robot.gripperMax} mm</dd>
            <dt style={{ color: C.dim }}>joints</dt>
            <dd>
              {!pose
                ? "none"
                : robot.id === "kuka"
                  ? `A2 ${(-pose.joints[0]).toFixed(0)}, A3 ${(-pose.joints[1]).toFixed(0)}, A5 ${(-pose.joints[2]).toFixed(0)}`
                  : pose.joints.map((q) => q.toFixed(0)).join(", ")}
            </dd>
          </dl>
          <label className="text-xs flex items-center gap-3" style={{ color: C.muted }}>
            Object width
            <input
              type="range"
              min={20}
              max={120}
              step={5}
              value={objectWidth}
              onChange={(e) => setObjectWidth(Number(e.target.value))}
              className="flex-1"
            />
            <span className="font-mono tabular-nums">{objectWidth} mm</span>
          </label>
          <div className="mt-auto flex flex-wrap gap-2">
            <button
              onClick={() => {
                setRaw(defaultPath());
                setT(1);
              }}
              className="text-xs px-3 py-1 rounded border"
              style={{ borderColor: C.cardBorder, color: C.text }}
            >
              Reset path
            </button>
            <button
              onClick={download}
              className="text-xs px-3 py-1 rounded border"
              style={{ borderColor: C.accent, color: C.accent }}
            >
              KUKA KRL (.src)
            </button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {ROBOTS.map((r, i) => (
          <Card key={r.id} robot={r} result={results[i]} k={k} path={path} active={r.id === selected} onClick={() => setSelected(r.id)} />
        ))}
      </div>
    </div>
  );
}
