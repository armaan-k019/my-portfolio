"use client";

import { useEffect, useRef } from "react";

// ════════════════════════════════════════════════════════════════════════════
// LATENT FIELD — an interactive, living t-SNE embedding
// ════════════════════════════════════════════════════════════════════════════
//
// A point cloud that perpetually re-embeds: samples stream out of their current
// arrangement and settle into fresh clusters, the way a t-SNE optimisation pulls
// scattered points into neighbourhoods. It is alive to the cursor — points are
// pushed by a repulsion field and the pointer threads a constellation to the
// nearest samples. Each settled cluster names itself. The field is vivid in the
// hero and calms as you scroll into the writing.

export interface DrawingRegion { x: number; y: number; w: number; h: number; alpha: number; }
export const drawingRegions: DrawingRegion[] = [];
const drawingListeners = new Set<() => void>();
export function subscribeDrawingRegions(cb: () => void): () => void {
  drawingListeners.add(cb);
  return () => { drawingListeners.delete(cb); };
}

// Cluster ink — architectural palette, a touch brighter than the chrome.
const PALETTE = [
  "45, 90, 39",    // deep green
  "74, 122, 68",   // sage
  "30, 58, 95",    // darkblue
  "176, 132, 80",  // tan
  "92, 138, 84",   // green-light
];
// Fixed region identities — the territories of the atlas. Index-aligned with
// PALETTE and with the legend in AtlasFrame, so colour ↔ region is consistent
// everywhere. The regions persist and merely rearrange on each re-embedding.
const REGION_LABELS = ["DESIGN", "ARCHITECTURE", "RESEARCH", "PHOTOGRAPHY", "SYSTEMS"];

interface Point {
  cluster: number;
  ox: number; oy: number;
  x: number; y: number;
  vx: number; vy: number;
  oldHomeX: number; oldHomeY: number;
  releaseAt: number;
  stiffness: number;
  size: number;
  alpha: number;
  nbr: number[];
  nseed: number;
}
interface Cluster {
  baseX: number; baseY: number;
  driftAx: number; driftAy: number;
  driftPx: number; driftPy: number;
  driftSx: number; driftSy: number;
  label: string;
  sa: number; sb: number; ang: number;   // blob shape → contour rings
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}
function gauss(r: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const K = 5;
const REEMBED_PERIOD = 15;
const CURSOR_R = 150;       // repulsion + constellation radius

export default function IsometricBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let scrollY = window.scrollY;
    const onScroll = () => { scrollY = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Pointer state (eased so the field feels weighty, not twitchy).
    let pmx = -9999, pmy = -9999, mx = -9999, my = -9999, hasPointer = false;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (!hasPointer) { pmx = mx; pmy = my; }   // jump in, don't sweep across screen
      hasPointer = true;
    };
    const onLeave = () => { hasPointer = false; };
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    let W = window.innerWidth, H = window.innerHeight, dpr = 1;
    let clusters: Cluster[] = [];
    let points: Point[] = [];
    let lastReembed = 0;
    const r = rng(0x7a51e);

    function placeClusters(): Array<[number, number]> {
      const centres: Array<[number, number]> = [];
      for (let i = 0; i < K; i++) {
        const a = (i / K) * Math.PI * 2 + (r() - 0.5) * 0.7;
        const rad = 0.27 + r() * 0.12;
        centres.push([W * (0.5 + Math.cos(a) * rad * 1.4), H * (0.5 + Math.sin(a) * rad)]);
      }
      return centres;
    }

    function reembed(now: number, initial: boolean) {
      const centres = placeClusters();
      clusters = centres.map(([cx, cy], i) => ({
        baseX: cx, baseY: cy,
        driftAx: 16 + r() * 24, driftAy: 14 + r() * 22,
        driftPx: r() * Math.PI * 2, driftPy: r() * Math.PI * 2,
        driftSx: 0.05 + r() * 0.06, driftSy: 0.05 + r() * 0.06,
        label: REGION_LABELS[i % REGION_LABELS.length],
        ang: r() * Math.PI, sa: 34 + r() * 50, sb: 26 + r() * 42,
      }));

      const buckets: number[][] = Array.from({ length: K }, () => []);
      for (let i = 0; i < points.length; i++) {
        const c = (i * 7 + ((r() * K) | 0)) % K;
        buckets[c].push(i);
        const p = points[i];
        const sh = clusters[c];
        const gx = gauss(r) * sh.sa, gy = gauss(r) * sh.sb;
        const ca = Math.cos(sh.ang), sn = Math.sin(sh.ang);
        p.cluster = c;
        p.ox = gx * ca - gy * sn;
        p.oy = gx * sn + gy * ca;
        p.oldHomeX = p.x; p.oldHomeY = p.y;
        p.releaseAt = now + (initial ? 0 : r() * 1.5);
      }
      for (const bucket of buckets) {
        for (let j = 0; j < bucket.length; j++) {
          points[bucket[j]].nbr = bucket.length > 2
            ? [bucket[(j + 1) % bucket.length], bucket[(j + 2) % bucket.length]]
            : [];
        }
      }
      lastReembed = now;
    }

    function build() {
      W = window.innerWidth; H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = W * dpr; canvas!.height = H * dpr;
      canvas!.style.width = W + "px"; canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetN = Math.round(Math.min(280, Math.max(110, (W * H) / 7600)));
      points = [];
      for (let i = 0; i < targetN; i++) {
        const sx = r() * W, sy = r() * H;
        points.push({
          cluster: 0, ox: 0, oy: 0,
          x: sx, y: sy, vx: 0, vy: 0,
          oldHomeX: sx, oldHomeY: sy, releaseAt: 0,
          stiffness: 5.5 + r() * 3.5,
          size: 1.2 + r() * 1.5,
          alpha: 0.22 + r() * 0.2,
          nbr: [], nseed: r() * Math.PI * 2,
        });
      }
      reembed(0, true);
    }

    let last = performance.now();
    let raf = 0;

    function frame(now: number) {
      const tSec = now * 0.001;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!reduceMotion && tSec - lastReembed > REEMBED_PERIOD) reembed(tSec, false);

      // Ease pointer.
      if (hasPointer) { pmx += (mx - pmx) * 0.18; pmy += (my - pmy) * 0.18; }

      ctx!.clearRect(0, 0, W, H);
      const par = scrollY * 0.05;
      // Vivid in the hero, calmer in the writing below.
      const intensity = Math.max(0.32, 1 - scrollY / (H * 1.25));

      const cx: number[] = [], cy: number[] = [];
      for (let c = 0; c < clusters.length; c++) {
        const cl = clusters[c];
        cx[c] = cl.baseX + Math.sin(tSec * cl.driftSx + cl.driftPx) * cl.driftAx;
        cy[c] = cl.baseY + Math.cos(tSec * cl.driftSy + cl.driftPy) * cl.driftAy;
      }

      // ── Integrate springs (+ cursor repulsion) ──────────────────────────
      const px = pmx, py = pmy + par;
      for (const p of points) {
        let homeX: number, homeY: number;
        if (reduceMotion || tSec >= p.releaseAt) { homeX = cx[p.cluster] + p.ox; homeY = cy[p.cluster] + p.oy; }
        else { homeX = p.oldHomeX; homeY = p.oldHomeY; }
        const damp = 2 * Math.sqrt(p.stiffness);
        p.vx += ((homeX - p.x) * p.stiffness - p.vx * damp) * dt;
        p.vy += ((homeY - p.y) * p.stiffness - p.vy * damp) * dt;
        if (hasPointer && !reduceMotion) {
          const dx = p.x - px, dy = (p.y - par) - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < CURSOR_R * CURSOR_R && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / CURSOR_R);
            p.vx += (dx / d) * f * f * 900 * dt;
            p.vy += (dy / d) * f * f * 900 * dt;
          }
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (!reduceMotion) { p.x += Math.sin(tSec * 0.6 + p.nseed) * 0.05; p.y += Math.cos(tSec * 0.55 + p.nseed) * 0.05; }
      }

      // ── Contour rings — elevation around each territory ─────────────────
      for (let c = 0; c < clusters.length; c++) {
        const cl = clusters[c];
        const a = 0.06 * intensity;
        if (a < 0.005) continue;
        ctx!.strokeStyle = `rgba(${PALETTE[c]}, ${a})`;
        ctx!.lineWidth = 0.6;
        for (const k of [1.15, 1.8, 2.55]) {
          ctx!.beginPath();
          ctx!.ellipse(cx[c], cy[c] - par, cl.sa * k, cl.sb * k, cl.ang, 0, Math.PI * 2);
          ctx!.stroke();
        }
      }

      // ── Cluster labels (fade in when settled) ───────────────────────────
      ctx!.textAlign = "center";
      ctx!.font = "600 11px Inter, system-ui, sans-serif";
      for (let c = 0; c < clusters.length; c++) {
        const a = 0.14 * intensity;
        if (a < 0.01) continue;
        ctx!.fillStyle = `rgba(${PALETTE[c]}, ${a})`;
        const lbl = clusters[c].label.toUpperCase().split("").join(" ");
        ctx!.fillText(lbl, cx[c], cy[c] - 58 - par);
      }

      // ── Intra-cluster edges ─────────────────────────────────────────────
      ctx!.lineWidth = 0.65;
      for (const p of points) {
        const ink = PALETTE[p.cluster];
        for (const ni of p.nbr) {
          const q = points[ni];
          const dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > 150) continue;
          const a = (1 - d / 150) * 0.1 * intensity;
          if (a < 0.005) continue;
          ctx!.strokeStyle = `rgba(${ink}, ${a})`;
          ctx!.beginPath();
          ctx!.moveTo(p.x, p.y - par); ctx!.lineTo(q.x, q.y - par);
          ctx!.stroke();
        }
      }

      // ── Pointer constellation — thread to the nearest samples ───────────
      if (hasPointer && !reduceMotion) {
        ctx!.lineWidth = 0.7;
        for (const p of points) {
          const dx = p.x - px, dy = (p.y - par) - py;
          const d = Math.hypot(dx, dy);
          if (d > CURSOR_R) continue;
          const a = (1 - d / CURSOR_R) * 0.28 * intensity;
          ctx!.strokeStyle = `rgba(${PALETTE[p.cluster]}, ${a})`;
          ctx!.beginPath();
          ctx!.moveTo(px, py); ctx!.lineTo(p.x, p.y - par);
          ctx!.stroke();
        }
      }

      // ── Points ───────────────────────────────────────────────────────────
      for (const p of points) {
        const speed = Math.hypot(p.vx, p.vy);
        const settle = Math.max(0.4, 1 - speed / 160);
        ctx!.fillStyle = `rgba(${PALETTE[p.cluster]}, ${p.alpha * settle * intensity})`;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y - par, p.size, 0, Math.PI * 2);
        ctx!.fill();
      }

      for (const cb of drawingListeners) cb();
      raf = requestAnimationFrame(frame);
    }

    build();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", build);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", build);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}
