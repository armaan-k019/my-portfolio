"use client";

import { motion, useReducedMotion } from "framer-motion";

// Runs on every route change: a drafting-green curtain wipes up off the screen
// while the incoming page rises into place. Reduced-motion → no transition.
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-0 z-[95] pointer-events-none origin-top"
        style={{ background: "linear-gradient(180deg, #1F4A1A 0%, #16241A 100%)" }}
        initial={{ scaleY: 1 }}
        animate={{ scaleY: 0 }}
        transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
      />
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-[34%] z-[96] pointer-events-none text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, times: [0, 0.45, 1], ease: "easeInOut" }}
      >
        <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-tan-light/80">Relocating</p>
        <p className="coord text-white/40 mt-2">33.7490°N 84.3880°W</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </>
  );
}
