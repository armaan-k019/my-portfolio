"use client";

import { useEffect, useRef } from "react";

// ════════════════════════════════════════════════════════════════════════════
// GENERATIVE GEOMETRY BACKGROUND
// ════════════════════════════════════════════════════════════════════════════
//
// A whisper-faint field of axonometric wireframe solids. Each solid is always
// in motion: it rotates continuously and runs a slow shape-grammar cycle —
//   recombined  →  subdivide (interior cells appear)  →  explode (cells push
//   apart)  →  recombine  →  (reconfigure into a new subdivision)  → …
// A drifting isometric ground grid sits behind it. Nothing ever holds still,
// but the ink stays barely-there so body copy always wins.

// ── Types ─────────────────────────────────────────────────────────────────
type Vec3 = [number, number, number];

// Oblique axonometric projection of a point already expressed relative to a
// solid's screen anchor. z leans the point up-and-right, giving the iso look.
const Z_X = 0.4;
const Z_Y = 0.3;

function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotateX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}

// 8 corners of a unit box, indexed iz∈{-1,1}, iy∈{-1,1}, ix∈{-1,1}.
//   0:--- 1:--+ 2:-+- 3:-++ 4:+-- 5:+-+ 6:++- 7:+++   (z,y,x signs)
const BOX_EDGES: Array<[number, number]> = [
  [0, 1], [1, 3], [3, 2], [2, 0],   // front face (z-)
  [4, 5], [5, 7], [7, 6], [6, 4],   // back face  (z+)
  [0, 4], [1, 5], [2, 6], [3, 7],   // connectors
];

// ── Drawing-region pub-sub (kept for DrawingAwareScope compatibility) ───────
// The generative field covers the whole canvas, so we intentionally publish no
// regions — the overlay-embolden effect stays inert rather than firing on every
// paragraph. The exports remain so DrawingAwareScope keeps importing cleanly.
export interface DrawingRegion {
  x: number; y: number; w: number; h: number; alpha: number;
}
export const drawingRegions: DrawingRegion[] = [];
const drawingListeners = new Set<() => void>();
export function subscribeDrawingRegions(cb: () => void): () => void {
  drawingListeners.add(cb);
  return () => { drawingListeners.delete(cb); };
}

// ── Ink palette — two muted tints, kept very low alpha ──────────────────────
const INK_GREEN = "45, 90, 39";
const INK_BLUE = "30, 58, 95";

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── A single evolving solid ─────────────────────────────────────────────────
interface Solid {
  x: number; y: number;          // screen anchor (px)
  hx: number; hy: number; hz: number;   // half-extents (px)
  yaw: number; yawSpeed: number;
  pitchBase: number; pitchAmp: number; pitchPhase: number; pitchSpeed: number;
  nx: number; ny: number; nz: number;   // current subdivision counts
  cycle: number; cycleSpeed: number;    // shape-grammar phase (radians)
  reconfigured: boolean;                // guard: one reconfigure per recombine
  ink: string;
  baseAlpha: number;
  parallax: number;
  bobAmp: number; bobPhase: number; bobSpeed: number;
}

const SUB_CHOICES: Array<[number, number, number]> = [
  [1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2],
  [2, 2, 1], [2, 1, 2], [1, 2, 2], [2, 2, 2],
];

function makeSolid(r: () => number, x: number, y: number): Solid {
  const depth = 0.5 + r() * 1.0;          // farther solids → smaller, fainter, slower parallax
  const base = 34 + r() * 56;
  const [nx, ny, nz] = SUB_CHOICES[(r() * SUB_CHOICES.length) | 0];
  return {
    x, y,
    hx: base * (0.7 + r() * 0.6),
    hy: base * (0.7 + r() * 0.6),
    hz: base * (0.7 + r() * 0.6),
    yaw: r() * Math.PI * 2,
    yawSpeed: (0.05 + r() * 0.10) * (r() < 0.5 ? -1 : 1),
    pitchBase: 0.30 + r() * 0.25,
    pitchAmp: 0.10 + r() * 0.12,
    pitchPhase: r() * Math.PI * 2,
    pitchSpeed: 0.12 + r() * 0.10,
    nx, ny, nz,
    cycle: r() * Math.PI * 2,
    cycleSpeed: 0.10 + r() * 0.14,
    reconfigured: false,
    ink: r() < 0.28 ? INK_BLUE : INK_GREEN,
    baseAlpha: (0.055 + r() * 0.04) / depth,
    parallax: 0.02 + (1 / depth) * 0.05,
    bobAmp: 6 + r() * 10,
    bobPhase: r() * Math.PI * 2,
    bobSpeed: 0.20 + r() * 0.20,
  };
}

const MAX_EXPLODE = 0.22;   // peak fractional push of cells away from center

// Render one solid's wireframe (all its sub-cells) for the current frame.
function drawSolid(
  ctx: CanvasRenderingContext2D,
  s: Solid,
  scrollY: number,
) {
  // Shape-grammar breathing: e ∈ [0,1], 0 = fully recombined.
  const e = (1 - Math.cos(s.cycle)) * 0.5;
  const explode = e * MAX_EXPLODE;
  const shrink = 1 - e * 0.10;
  const pitch = s.pitchBase + Math.sin(s.pitchPhase) * s.pitchAmp;

  const ax = s.x;
  const ay = s.y + Math.sin(s.bobPhase) * s.bobAmp - scrollY * s.parallax;

  const cellHx = s.hx / s.nx, cellHy = s.hy / s.ny, cellHz = s.hz / s.nz;

  for (let iz = 0; iz < s.nz; iz++) {
    for (let iy = 0; iy < s.ny; iy++) {
      for (let ix = 0; ix < s.nx; ix++) {
        // Cell center within the box, then pushed outward when exploded.
        const ccx = -s.hx + (ix + 0.5) * 2 * cellHx;
        const ccy = -s.hy + (iy + 0.5) * 2 * cellHy;
        const ccz = -s.hz + (iz + 0.5) * 2 * cellHz;
        const ox = ccx * explode, oy = ccy * explode, oz = ccz * explode;
        const hxc = cellHx * shrink, hyc = cellHy * shrink, hzc = cellHz * shrink;

        // Build & transform the 8 corners.
        const proj: Array<[number, number]> = [];
        let zSum = 0;
        let k = 0;
        for (const sz of [-1, 1]) {
          for (const sy of [-1, 1]) {
            for (const sx of [-1, 1]) {
              let v: Vec3 = [ccx + ox + sx * hxc, ccy + oy + sy * hyc, ccz + oz + sz * hzc];
              v = rotateX(rotateY(v, s.yaw), pitch);
              zSum += v[2];
              proj[k++] = [ax + v[0] + v[2] * Z_X, ay + v[1] - v[2] * Z_Y];
            }
          }
        }

        // Depth fade: cells leaning toward the viewer ink a touch darker.
        const depthBoost = 1 + (zSum / 8 / s.hz) * 0.25;
        const alpha = Math.max(0, s.baseAlpha * depthBoost);
        ctx.strokeStyle = `rgba(${s.ink}, ${alpha})`;

        ctx.beginPath();
        for (const [a, b] of BOX_EDGES) {
          ctx.moveTo(proj[a][0], proj[a][1]);
          ctx.lineTo(proj[b][0], proj[b][1]);
        }
        ctx.stroke();
      }
    }
  }
}

export default function IsometricBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const motion = reduceMotion ? 0 : 1;

    let scrollY = window.scrollY;
    const onScroll = () => { scrollY = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });

    let solids: Solid[] = [];
    let dpr = 1;

    function layout() {
      const w = window.innerWidth, h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scatter solids on a loose jittered grid sized to the viewport.
      const r = rng(0x5eed);
      const cell = 300;
      const cols = Math.max(2, Math.ceil(w / cell));
      const rows = Math.max(2, Math.ceil(h / cell));
      solids = [];
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          if (r() < 0.22) continue;   // leave breathing room
          const px = (cx + 0.2 + r() * 0.6) * (w / cols);
          const py = (cy + 0.2 + r() * 0.6) * (h / rows);
          solids.push(makeSolid(r, px, py));
        }
      }
    }

    let last = performance.now();
    let raf = 0;

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const tSec = now * 0.001;
      const w = window.innerWidth, h = window.innerHeight;

      ctx!.clearRect(0, 0, w, h);

      // ── Drifting isometric ground grid ──────────────────────────────────
      const drift = (tSec * 6 * motion) % 64;
      ctx!.lineWidth = 0.5;
      ctx!.strokeStyle = `rgba(${INK_GREEN}, 0.035)`;
      ctx!.beginPath();
      for (let x = -64 + ((-drift) % 64); x < w + 64; x += 64) {
        // Two opposing diagonal families form the iso lattice.
        ctx!.moveTo(x, -64); ctx!.lineTo(x + h * 0.5 + 64, h);
        ctx!.moveTo(x, h + 64); ctx!.lineTo(x + h * 0.5 + 64, 0);
      }
      ctx!.stroke();

      // ── Evolving solids ─────────────────────────────────────────────────
      ctx!.lineWidth = 0.85;
      ctx!.lineJoin = "round";
      for (const s of solids) {
        // Advance the shape-grammar state.
        s.yaw += s.yawSpeed * dt * motion;
        s.pitchPhase += s.pitchSpeed * dt * motion;
        s.bobPhase += s.bobSpeed * dt * motion;
        s.cycle += s.cycleSpeed * dt * motion;

        // At each fully-recombined moment, reconfigure into a new subdivision.
        const e = (1 - Math.cos(s.cycle)) * 0.5;
        if (e < 0.015 && !s.reconfigured) {
          const r = rng((s.x * 131 + s.y * 17 + s.cycle * 1000) | 0);
          [s.nx, s.ny, s.nz] = SUB_CHOICES[(r() * SUB_CHOICES.length) | 0];
          s.reconfigured = true;
        } else if (e > 0.4) {
          s.reconfigured = false;
        }

        drawSolid(ctx!, s, scrollY);
      }

      for (const cb of drawingListeners) cb();
      raf = requestAnimationFrame(frame);
    }

    layout();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", layout);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
}
