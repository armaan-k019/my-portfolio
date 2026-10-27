"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Site } from "../../../content/sites";

export interface Tile {
  site: Site;
  visual: ReactNode;
  dark: boolean;
  // Tailwind classes for the tile's own surface behind the visual.
  surface: string;
}

// A dark drafting stage with a light that follows the pointer, and four square
// tiles in a 2x2 grid at its center. Hovering a tile dims the other three and
// shows that site's line under the grid.
export default function ChooserGrid({ tiles }: { tiles: Tile[] }) {
  const [active, setActive] = useState<number | null>(null);
  // The building tile that was just clicked, which shows "Working on it".
  const [notice, setNotice] = useState<number | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showNotice = (i: number) => {
    setNotice(i);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2400);
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const onMove = (e: React.PointerEvent) => {
    const el = stageRef.current;
    if (!el || reduce) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--lx", `${e.clientX - r.left}px`);
    el.style.setProperty("--ly", `${e.clientY - r.top}px`);
  };

  const caption = active === null ? null : tiles[active].site;

  return (
    <div
      ref={stageRef}
      onPointerMove={onMove}
      className="relative flex-1 flex flex-col items-center justify-center px-4 py-10 overflow-hidden"
      style={{
        backgroundColor: "#0F1A12",
        backgroundImage: [
          "radial-gradient(600px circle at var(--lx, 50%) var(--ly, 40%), rgba(212, 169, 106, 0.10), transparent 60%)",
          "linear-gradient(rgba(239, 244, 239, 0.045) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(239, 244, 239, 0.045) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "auto, 32px 32px, 32px 32px",
      }}
    >
      <div
        className="grid grid-cols-2 gap-3 md:gap-5 [--s:min(44vw,38vh)] md:[--s:min(34vw,36vh)]"
        onMouseLeave={() => setActive(null)}
      >
        {tiles.map((t, i) => (
          <motion.section
            key={t.site.index}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: active === null || active === i ? 1 : 0.45, y: 0, scale: active === i ? 1.02 : 1 }}
            transition={{ duration: active === null ? 0.9 : 0.4, delay: active === null && !reduce ? 0.15 + i * 0.12 : 0, ease: [0.16, 1, 0.3, 1] }}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            className={`group relative overflow-hidden w-[var(--s)] h-[var(--s)] ring-1 ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] ${t.surface}`}
          >
            <div className="absolute inset-0">{t.visual}</div>
            {t.dark && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 z-[15] bg-gradient-to-t from-[#121A16] to-transparent" />}
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 md:p-5">
              <div className="flex justify-between">
                <span className="flex items-baseline gap-2">
                  <span className={`coord ${t.dark ? "!text-[#3DD68C]" : ""}`}>{t.site.index}</span>
                  {t.site.building && (
                    <span className="font-mono text-[9px] md:text-[10px] tracking-[0.14em] uppercase whitespace-nowrap px-1.5 py-0.5 bg-tan text-ink">
                      <span className="md:hidden">Building</span>
                      <span className="hidden md:inline">Under construction</span>
                    </span>
                  )}
                </span>
                <span className={`meta transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${t.dark ? "!text-[#EFF4EF]" : "!text-darkblue"}`}>
                  {t.site.building ? null : t.site.external ? <>&#8599;</> : <>&#8594;</>}
                </span>
              </div>
              <div>
                <h2 className={`font-display font-semibold leading-none text-[clamp(1.35rem,3.2vw,2.75rem)] tracking-tight ${t.dark ? "text-[#EFF4EF]" : "text-darkblue"}`}>
                  {t.site.name}
                </h2>
                <p className={`meta mt-1.5 hidden md:block ${t.dark ? "!text-[#98A69C]" : ""}`}>{t.site.note}</p>
              </div>
            </div>
            {t.site.building ? (
              <>
                <button
                  type="button"
                  onClick={() => showNotice(i)}
                  className="absolute inset-0 z-10 cursor-not-allowed"
                  aria-label={`${t.site.name}: under construction`}
                />
                <AnimatePresence>
                  {notice === i && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      role="status"
                      className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0F1A12]/85"
                    >
                      <span aria-hidden className="h-3 w-2/3" style={{ backgroundImage: "repeating-linear-gradient(-45deg, var(--color-tan) 0 8px, transparent 8px 16px)" }} />
                      <span className="font-display text-[clamp(1.1rem,2.4vw,1.75rem)] font-semibold text-[#EFF4EF]">Working on it.</span>
                      <span className="meta !text-tan">Check back soon</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : t.site.external ? (
              <a href={t.site.href} className="absolute inset-0 z-10" aria-label={`${t.site.name}: ${t.site.blurb}`} />
            ) : (
              <Link href={t.site.href} className="absolute inset-0 z-10" aria-label={`${t.site.name}: ${t.site.blurb}`} />
            )}
          </motion.section>
        ))}
      </div>
      <p className="mt-8 h-12 max-w-md text-center text-sm leading-relaxed text-[#C2CCC4]" aria-live="polite">
        {caption ? caption.blurb : <span className="eyebrow !text-tan">Choose a site</span>}
      </p>
    </div>
  );
}
