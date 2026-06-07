"use client";

import { useEffect } from "react";
import { drawingRegions } from "./IsometricBackground";

// Selectors that get drawing-aware emphasis. Broad on purpose: nearly any
// piece of body copy can sit over a canvas drawing.
const TEXT_SELECTOR = [
  "p", "li",
  "h1", "h2", "h3", "h4",
  ".dat-text",
  "[data-bold-on-draw]",
].join(",");

// Skip elements that have opted out, are nested inside an opt-out container,
// or that we control via other means.
const SKIP_SELECTOR = [
  "[data-no-bold-on-draw]",
  "[data-no-bold-on-draw] *",
  "nav *",
  "footer *",
  "input", "textarea", "code", "pre",
].join(",");

const BASE_WEIGHT = 400;
const PEAK_WEIGHT = 700;
// Don't write inline styles unless the target weight has moved this much from
// the last applied value — keeps DOM mutations cheap.
const WEIGHT_THRESHOLD = 18;

interface TrackedElement {
  el: HTMLElement;
  lastWeight: number;
  originalWeight: string;
  originalShadow: string;
  originalTransition: string;
}

/**
 * Mount once at the page root. Scans the DOM for text elements and, on every
 * animation frame, computes each element's intersection with the current
 * canvas drawing regions. Elements overlaying an active drawing get a
 * heavier font-weight + a soft paper-coloured halo so they stay legible.
 */
export default function DrawingAwareScope({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let raf = 0;
    const tracked = new Map<HTMLElement, TrackedElement>();

    function shouldSkip(el: HTMLElement): boolean {
      try { return el.matches(SKIP_SELECTOR); }
      catch { return false; }
    }

    function refreshTracked() {
      const nodes = document.querySelectorAll<HTMLElement>(TEXT_SELECTOR);
      const found = new Set<HTMLElement>();

      nodes.forEach((el) => {
        if (shouldSkip(el)) return;
        // Ignore empty or whitespace-only nodes — they have no text to embolden.
        if (!el.textContent || !el.textContent.trim()) return;
        found.add(el);
        if (!tracked.has(el)) {
          const cs = window.getComputedStyle(el);
          tracked.set(el, {
            el,
            lastWeight: parseInt(cs.fontWeight, 10) || BASE_WEIGHT,
            originalWeight: el.style.fontWeight,
            originalShadow: el.style.textShadow,
            originalTransition: el.style.transition,
          });
        }
      });

      // Drop tracking for elements that disappeared and restore their styles.
      for (const [el, t] of tracked) {
        if (!found.has(el)) {
          el.style.fontWeight = t.originalWeight;
          el.style.textShadow = t.originalShadow;
          el.style.transition = t.originalTransition;
          tracked.delete(el);
        }
      }
    }

    refreshTracked();

    // The page mounts components asynchronously; pick up additions cheaply.
    let mutationScheduled = false;
    const observer = new MutationObserver(() => {
      if (mutationScheduled) return;
      mutationScheduled = true;
      requestAnimationFrame(() => {
        mutationScheduled = false;
        refreshTracked();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function tick() {
      // Snapshot regions to avoid mid-frame mutation
      const regions = drawingRegions.slice();

      // Phase 1 — read all bounding rects (batched DOM reads)
      const rects: { el: HTMLElement; rect: DOMRect; t: TrackedElement }[] = [];
      for (const t of tracked.values()) {
        const rect = t.el.getBoundingClientRect();
        // Skip elements totally outside the viewport — pure perf optimisation.
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        if (rect.right < 0 || rect.left > window.innerWidth) continue;
        if (rect.width === 0 || rect.height === 0) continue;
        rects.push({ el: t.el, rect, t });
      }

      // Phase 2 — compute target weight per element
      const updates: { t: TrackedElement; weight: number; intensity: number }[] = [];
      for (const { rect, t } of rects) {
        let best = 0;
        const rArea = rect.width * rect.height;
        for (const r of regions) {
          const ow = Math.max(0, Math.min(rect.right, r.x + r.w) - Math.max(rect.left, r.x));
          const oh = Math.max(0, Math.min(rect.bottom, r.y + r.h) - Math.max(rect.top, r.y));
          if (ow > 0 && oh > 0) {
            const ratio = (ow * oh) / Math.max(1, rArea);
            // Even a small overlap should register meaningfully — scale steeply.
            const score = Math.min(1, ratio * 4) * Math.min(1, r.alpha * 2.2);
            if (score > best) best = score;
          }
        }
        const target = Math.round(BASE_WEIGHT + (PEAK_WEIGHT - BASE_WEIGHT) * best);
        updates.push({ t, weight: target, intensity: best });
      }

      // Phase 3 — apply changes (batched DOM writes)
      for (const u of updates) {
        if (Math.abs(u.weight - u.t.lastWeight) >= WEIGHT_THRESHOLD) {
          u.t.el.style.fontWeight = String(u.weight);
          u.t.el.style.transition = "font-weight 220ms ease-out, text-shadow 220ms ease-out";
          u.t.lastWeight = u.weight;
        }
        // Soft paper-coloured halo behind the text so it stays crisp against
        // the heavier ink. Only paints when overlap is meaningful.
        if (u.intensity > 0.06) {
          const blur = 2 + u.intensity * 4;
          u.t.el.style.textShadow = `0 0 ${blur}px rgba(245, 243, 239, ${0.55 + u.intensity * 0.35})`;
        } else if (u.t.el.style.textShadow) {
          u.t.el.style.textShadow = "";
        }
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      // Restore original styles on every tracked element
      for (const t of tracked.values()) {
        t.el.style.fontWeight = t.originalWeight;
        t.el.style.textShadow = t.originalShadow;
        t.el.style.transition = t.originalTransition;
      }
      tracked.clear();
    };
  }, []);

  return <>{children}</>;
}
