"use client";

import { useEffect, useRef, useState } from "react";

// Ambient field behind the homepage sections below the hero: points that
// link to their neighbours and move away from the pointer, in --color-line.
// Decorative only. Not rendered on coarse pointers or with reduced motion.
const LINK = 130;          // px within which two points are joined
const PUSH = 120;          // px radius of pointer repulsion
const DENSITY = 22000;     // px² of viewport per point
const MAX_POINTS = 80;

export default function NodeField() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Read once after mount so the server render (nothing) matches the client.
    const ok = matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(ok);
  }, []);

  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!enabled || !host || !canvas || !ctx) return;

    // --color-line is emitted as an 8-digit hex; split colour and alpha.
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--color-line").trim();
    const hex = raw.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
    const rgb = hex ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).join(",") : "45,90,39";
    const alpha = hex?.[2] ? parseInt(hex[2], 16) / 255 : 0.1;

    let w = 0, h = 0;
    let pts: { x: number; y: number; vx: number; vy: number; hx: number; hy: number }[] = [];
    function size() {
      w = canvas!.clientWidth; h = canvas!.clientHeight;
      canvas!.width = w; canvas!.height = h; // ambient layer: 1x is enough
      const n = Math.min(MAX_POINTS, Math.round((w * h) / DENSITY));
      pts = Array.from({ length: n }, () => {
        const x = Math.random() * w, y = Math.random() * h;
        return { x, y, vx: 0, vy: 0, hx: x, hy: y };
      });
    }

    let px = -1e4, py = -1e4;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top;
    };
    const onLeave = () => { px = py = -1e4; };

    let raf = 0, visible = false, t = 0;
    function frame() {
      raf = 0;
      t += 1 / 60;
      ctx!.clearRect(0, 0, w, h);
      for (const p of pts) {
        // Spring home with a slow wander, pushed away from the pointer.
        const dx = p.x - px, dy = p.y - py, d2 = dx * dx + dy * dy;
        if (d2 < PUSH * PUSH && d2 > 1) {
          const d = Math.sqrt(d2), f = (1 - d / PUSH) * 0.9;
          p.vx += (dx / d) * f; p.vy += (dy / d) * f;
        }
        p.vx += (p.hx + Math.sin(t * 0.3 + p.hy) * 6 - p.x) * 0.02;
        p.vy += (p.hy + Math.cos(t * 0.27 + p.hx) * 6 - p.y) * 0.02;
        p.vx *= 0.86; p.vy *= 0.86;
        p.x += p.vx; p.y += p.vy;
      }
      ctx!.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > LINK) continue;
          ctx!.strokeStyle = `rgba(${rgb},${alpha * (1 - d / LINK) * 2})`;
          ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(b.x, b.y); ctx!.stroke();
        }
        const dp = Math.hypot(a.x - px, a.y - py);
        if (dp < PUSH * 1.4) {
          ctx!.strokeStyle = `rgba(${rgb},${alpha * (1 - dp / (PUSH * 1.4)) * 3})`;
          ctx!.beginPath(); ctx!.moveTo(a.x, a.y); ctx!.lineTo(px, py); ctx!.stroke();
        }
        ctx!.fillStyle = `rgba(${rgb},${alpha * 3})`;
        ctx!.fillRect(a.x - 1, a.y - 1, 2, 2);
      }
      if (visible && document.visibilityState === "visible") raf = requestAnimationFrame(frame);
    }
    const start = () => { if (!raf && visible && document.visibilityState === "visible") raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    // intersectionRatio, not isIntersecting: a box whose edge only touches the
    // viewport edge (the hero boundary at load) counts as intersecting. The
    // second threshold makes the observer report when it really scrolls in.
    const io = new IntersectionObserver(([e]) => {
      visible = e.intersectionRatio > 0;
      if (visible) start(); else stop();
    }, { threshold: [0, 0.001] });
    const ro = new ResizeObserver(() => size());
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    size();
    io.observe(host);
    ro.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop(); io.disconnect(); ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div ref={hostRef} aria-hidden className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="sticky top-0 block w-full h-screen" />
    </div>
  );
}
