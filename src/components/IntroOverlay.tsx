"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Deterministic scatter so there is never a hydration mismatch.
function seeded(i: number) {
  const s = Math.sin(i * 99.13) * 43758.5453;
  return s - Math.floor(s);
}

const DOTS = Array.from({ length: 30 }, (_, i) => ({
  fromX: (seeded(i) - 0.5) * 520,
  fromY: (seeded(i + 100) - 0.5) * 360,
  toX: (i - 15) * 13,
  delay: 0.2 + seeded(i + 50) * 0.5,
  color: ["45,90,39", "74,122,68", "30,58,95", "176,132,80"][i % 4],
}));

const NAME = "Armaan Kazi";

export default function IntroOverlay() {
  const [show, setShow] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || sessionStorage.getItem("introSeen")) return;
    sessionStorage.setItem("introSeen", "1");
    setShow(true);
    document.body.style.overflow = "hidden";
    window.__lenis?.stop();
    const t = setTimeout(() => setExiting(true), 2000);
    return () => { clearTimeout(t); document.body.style.overflow = ""; window.__lenis?.start(); };
  }, []);

  function done() {
    document.body.style.overflow = "";
    window.__lenis?.start();
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 30%, #FBFCFA 0%, #F2F5EF 60%, #E9EEE4 100%)",
          }}
          initial={{ opacity: 1 }}
          animate={exiting ? { opacity: 0, filter: "blur(8px)" } : { opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.7, 0, 0.84, 0] }}
          onAnimationComplete={() => { if (exiting) done(); }}
        >
          {/* converging latent cluster */}
          <div className="relative h-24 mb-2" aria-hidden>
            {DOTS.map((d, i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{ width: 5, height: 5, backgroundColor: `rgb(${d.color})` }}
                initial={{ x: d.fromX, y: d.fromY, opacity: 0, scale: 0.4 }}
                animate={{ x: d.toX, y: 0, opacity: 0.85, scale: 1 }}
                transition={{ duration: 1.1, delay: d.delay, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </div>

          {/* name reveal */}
          <div className="overflow-hidden">
            <motion.h1
              className="font-display text-4xl md:text-6xl font-semibold text-ink tracking-[-0.03em]"
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.9, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
            >
              {NAME}
            </motion.h1>
          </div>

          <motion.div
            className="h-px bg-terracotta mt-5"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 180, opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.p
            className="eyebrow mt-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ duration: 0.6, delay: 1.3 }}
          >
            Architecture &times; Computer Science
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
