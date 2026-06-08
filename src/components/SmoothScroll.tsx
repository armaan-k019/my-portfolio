"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// Momentum smooth-scroll (the backbone of the "experience" feel). Exposes the
// instance on window so modals can lock/unlock it and anchors can ease to target.
// Fully disabled under prefers-reduced-motion.
declare global {
  interface Window { __lenis?: Lenis }
}

export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    window.__lenis = lenis;

    let raf = requestAnimationFrame(function loop(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });

    // Ease in-page anchor links instead of hard-jumping.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href^="#"], a[href^="/#"]') as HTMLAnchorElement | null;
      if (!a) return;
      const raw = a.getAttribute("href") || "";
      const hash = raw.startsWith("/#") ? raw.slice(1) : raw;
      if (hash.length < 2) return;
      const onHome = window.location.pathname === "/";
      if ((raw.startsWith("#") || onHome) && document.querySelector(hash)) {
        e.preventDefault();
        lenis.scrollTo(hash, { offset: -80, duration: 1.2 });
        history.replaceState(null, "", hash);
      }
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(raf);
      lenis.destroy();
      delete window.__lenis;
    };
  }, []);

  return null;
}
