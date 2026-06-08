"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  LOCATIONS, REGIONS, REGION_ORDER, locationByRoute,
} from "@/lib/latent-atlas";

// ============================================================================
// THE LATENT ATLAS, canvas map with camera traversal.
// ============================================================================
// A stable 2D survey of every location in latent-atlas.ts, drawn on a single
// canvas in the atlas paper palette. A camera (center + zoom) eases to the
// current route's location on navigation, so moving between pages reads as a
// flight across the map. Atmospheric, light, and driven entirely by the data.

// Kept for DrawingAwareScope compatibility. The field is everywhere, so we
// publish no regions and the overlay embolden effect stays inert.
export interface DrawingRegion { x: number; y: number; w: number; h: number; alpha: number; }
export const drawingRegions: DrawingRegion[] = [];
const drawingListeners = new Set<() => void>();
export function subscribeDrawingRegions(cb: () => void): () => void {
  drawingListeners.add(cb);
  return () => { drawingListeners.delete(cb); };
}

interface Cam { cx: number; cy: number; zoom: number; }
const HOME: Cam = { cx: 0.5, cy: 0.5, zoom: 1 };
const FOCUS_ZOOM = 2.6;

function easeInOutQuart(e: number): number {
  return e < 0.5 ? 8 * e * e * e * e : 1 - Math.pow(-2 * e + 2, 4) / 2;
}
function targetFor(pathname: string): Cam {
  const clean = pathname.split(/[?#]/)[0] || "/";
  if (clean === "/") return { ...HOME };
  const loc = locationByRoute(clean);
  return loc ? { cx: loc.x, cy: loc.y, zoom: FOCUS_ZOOM } : { ...HOME };
}

export default function IsometricBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  // The route the camera should fly to. Read inside the render loop.
  const targetRef = useRef<Cam>(HOME);
  const tweenRef = useRef<{ from: Cam; to: Cam; start: number; dur: number } | null>(null);
  const firstRef = useRef(true);
  // Latest pathname for the render loop (reticle placement).
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // On every route change, rebase a tween from the current eased camera to the
  // new target. Interruptible by construction (always starts from "now").
  useEffect(() => {
    targetRef.current = targetFor(pathname);
  }, [pathname]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let W = 0, H = 0, dpr = 1;
    const cam: Cam = { ...targetFor(pathname) }; // direct link: start already there
    let appliedTarget = JSON.stringify(cam);

    // Pointer for the constellation.
    let mx = -9999, my = -9999, hasPointer = false;
    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; hasPointer = true; };
    const onLeave = () => { hasPointer = false; };
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = W * dpr; canvas!.height = H * dpr;
      canvas!.style.width = W + "px"; canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    // latent (x,y) to screen, under the current camera.
    function project(x: number, y: number): [number, number] {
      const scale = Math.min(W, H) * 0.78 * cam.zoom;
      return [W / 2 + (x - cam.cx) * scale, H / 2 + (y - cam.cy) * scale];
    }

    let raf = 0;
    const t0 = performance.now();

    function startTween(now: number) {
      const to = targetRef.current;
      const dist = Math.hypot(to.cx - cam.cx, to.cy - cam.cy) + Math.abs(to.zoom - cam.zoom) * 0.2;
      const dur = reduce ? 1 : Math.min(1400, 800 + dist * 900);
      tweenRef.current = { from: { ...cam }, to: { ...to }, start: now, dur };
      appliedTarget = JSON.stringify(to);
      firstRef.current = false;
    }

    function frame(now: number) {
      const t = (now - t0) / 1000;

      // New target? begin a flight (skip the very first, we start on target).
      if (JSON.stringify(targetRef.current) !== appliedTarget) {
        if (firstRef.current) { Object.assign(cam, targetRef.current); appliedTarget = JSON.stringify(targetRef.current); firstRef.current = false; }
        else startTween(now);
      }

      // Advance the flight.
      const tw = tweenRef.current;
      if (tw) {
        const e = Math.min(1, (now - tw.start) / tw.dur);
        const k = easeInOutQuart(e);
        const dist = Math.hypot(tw.to.cx - tw.from.cx, tw.to.cy - tw.from.cy);
        cam.cx = tw.from.cx + (tw.to.cx - tw.from.cx) * k;
        cam.cy = tw.from.cy + (tw.to.cy - tw.from.cy) * k;
        // Zoom dips out mid-flight on long journeys (van Wijk style lift).
        const zBase = tw.from.zoom + (tw.to.zoom - tw.from.zoom) * k;
        cam.zoom = Math.max(0.6, zBase * (1 - 0.32 * Math.sin(Math.PI * e) * Math.min(1, dist * 2.2)));
        if (e >= 1) tweenRef.current = null;
      }

      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = "#F7F2E8";
      ctx!.fillRect(0, 0, W, H);

      const drift = (i: number) => reduce ? 0 : Math.sin(t * 0.4 + i) * 0.0035;

      // ---- graticule -------------------------------------------------------
      ctx!.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const g = i / 10;
        ctx!.strokeStyle = `rgba(0,0,0,${i % 5 === 0 ? 0.08 : 0.045})`;
        const [x1, y1] = project(g, 0), [x2, y2] = project(g, 1);
        ctx!.beginPath(); ctx!.moveTo(x1, y1); ctx!.lineTo(x2, y2); ctx!.stroke();
        const [x3, y3] = project(0, g), [x4, y4] = project(1, g);
        ctx!.beginPath(); ctx!.moveTo(x3, y3); ctx!.lineTo(x4, y4); ctx!.stroke();
      }

      // ---- contour rings per region ---------------------------------------
      for (const id of REGION_ORDER) {
        const r = REGIONS[id];
        const [scx, scy] = project(r.center.x, r.center.y);
        const baseR = Math.min(W, H) * 0.78 * cam.zoom;
        [0.06, 0.105, 0.15, 0.195].forEach((rad, ring) => {
          ctx!.strokeStyle = `rgba(${r.color}, ${0.16 - ring * 0.032})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(scx, scy, rad * baseR, 0, Math.PI * 2);
          ctx!.stroke();
        });
      }

      // ---- pointer constellation ------------------------------------------
      if (hasPointer && !reduce) {
        for (let i = 0; i < LOCATIONS.length; i++) {
          const l = LOCATIONS[i];
          const [sx, sy] = project(l.x + drift(i), l.y + drift(i * 1.7));
          const d = Math.hypot(sx - mx, sy - my);
          if (d > 150) continue;
          ctx!.strokeStyle = `rgba(${REGIONS[l.region].color}, ${(1 - d / 150) * 0.28})`;
          ctx!.lineWidth = 0.7;
          ctx!.beginPath(); ctx!.moveTo(mx, my); ctx!.lineTo(sx, sy); ctx!.stroke();
        }
      }

      // ---- points ----------------------------------------------------------
      for (let i = 0; i < LOCATIONS.length; i++) {
        const l = LOCATIONS[i];
        const [sx, sy] = project(l.x + drift(i), l.y + drift(i * 1.7));
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
        const col = REGIONS[l.region].color;
        const rad = (l.type === "page" ? 5 : 4) * Math.max(0.8, Math.min(1.8, cam.zoom * 0.7));
        // halo
        ctx!.fillStyle = `rgba(${col}, 0.12)`;
        ctx!.beginPath(); ctx!.arc(sx, sy, rad * 2.6, 0, Math.PI * 2); ctx!.fill();
        // diamond
        ctx!.fillStyle = `rgba(${col}, 0.92)`;
        ctx!.beginPath();
        ctx!.moveTo(sx, sy - rad); ctx!.lineTo(sx + rad, sy);
        ctx!.lineTo(sx, sy + rad); ctx!.lineTo(sx - rad, sy);
        ctx!.closePath(); ctx!.fill();
      }

      // ---- labels (LOD: regions when zoomed out, points when zoomed in) ----
      ctx!.textAlign = "center";
      const ls = ctx as unknown as { letterSpacing: string };
      try { ls.letterSpacing = "1.5px"; } catch { /* not all browsers */ }
      // region labels
      ctx!.font = '600 12px var(--font-mono), "IBM Plex Mono", monospace';
      for (const id of REGION_ORDER) {
        const r = REGIONS[id];
        const [lx, ly] = project(r.labelPos.x, r.labelPos.y);
        ctx!.fillStyle = `rgba(${r.color}, ${cam.zoom < 2 ? 0.85 : 0.4})`;
        ctx!.fillText(r.id, lx, ly);
      }
      // point labels when zoomed in
      if (cam.zoom > 1.8) {
        ctx!.font = '500 10px var(--font-mono), "IBM Plex Mono", monospace';
        let shown = 0;
        for (const l of LOCATIONS) {
          if (shown > 16) break;
          const [sx, sy] = project(l.x, l.y);
          if (sx < 0 || sx > W || sy < 0 || sy > H) continue;
          ctx!.fillStyle = "rgba(40,40,40,0.6)";
          ctx!.fillText(l.title.toUpperCase(), sx, sy - 12);
          shown++;
        }
      }
      try { ls.letterSpacing = "0px"; } catch { /* noop */ }

      // ---- you are here reticle -------------------------------------------
      const cur = locationByRoute(pathnameRef.current);
      if (cur) {
        const [rx, ry] = project(cur.x, cur.y);
        ctx!.strokeStyle = "#A4332F";
        ctx!.lineWidth = 1.3;
        ctx!.beginPath(); ctx!.arc(rx, ry, 9, 0, Math.PI * 2); ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(rx - 14, ry); ctx!.lineTo(rx - 5, ry);
        ctx!.moveTo(rx + 5, ry); ctx!.lineTo(rx + 14, ry);
        ctx!.moveTo(rx, ry - 14); ctx!.lineTo(rx, ry - 5);
        ctx!.moveTo(rx, ry + 5); ctx!.lineTo(rx, ry + 14);
        ctx!.stroke();
      }

      for (const cb of drawingListeners) cb();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />;
}
