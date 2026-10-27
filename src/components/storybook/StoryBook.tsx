"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { storybook } from "../../../content/storybook";
import { facingPages, flippedForPage, leafCount, paginate, type PageSide } from "@/lib/storybook/paginate";
import type { BookScene, BookState } from "./book-scene";

const pad = (n: number) => String(n).padStart(2, "0");

// What a page says, for screen readers and the no WebGL fallback.
function describe(side: PageSide): string {
  switch (side.kind) {
    case "image": return side.half ? `${side.alt} (${side.half} half of a spread)` : side.alt;
    case "text": return `${side.title}. ${side.body}`;
    case "placeholder": return `Placeholder: ${side.title}${side.note ? `, ${side.note}` : ""}`;
    case "contents": return `Contents: ${side.items.map((i) => `${i.title}, page ${i.page}`).join("; ")}`;
    case "blank": return "Blank page";
  }
}

// The architecture portfolio as a book: a Three.js scene for the book itself,
// with DOM controls, a contents menu, and a text version of every page.
export default function StoryBook() {
  const layout = useMemo(() => paginate(storybook.entries), []);
  const total = layout.sides.length;
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BookScene | null>(null);
  const reduce = useReducedMotion() ?? false;
  const [state, setState] = useState<BookState>({ flipped: 0, leaves: leafCount(total), focus: "right", narrow: false });
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Three.js loads with the scene, only on this route and only in the browser.
    let scene: BookScene | null = null;
    let cancelled = false;
    import("./book-scene")
      .then(({ BookScene }) => {
        if (cancelled) return;
        scene = new BookScene(host, storybook, layout, reduce, setState);
        sceneRef.current = scene;
      })
      // WebGL is unavailable (or the chunk failed); show the text version of the pages instead.
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [layout, reduce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      // Inside the contents menu, paging keys scroll the list rather than the book.
      if (target?.closest("[data-book-menu]") && e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Escape") return;
      const scene = sceneRef.current;
      if (!scene) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") scene.next();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") scene.prev();
      else if (e.key === "Home") scene.goTo(0);
      else if (e.key === "End") scene.goTo(state.leaves);
      else if (e.key === "Escape") setMenu(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.leaves]);

  const { flipped, leaves, focus, narrow } = state;
  const facing = facingPages(flipped, total);
  let where: string;
  if (flipped === 0) where = "Cover";
  else if (flipped === leaves) where = "Back cover";
  else if (narrow) {
    const p = focus === "left" ? facing.left : facing.right;
    where = p ? `Page ${pad(p)}` : "Endpaper";
  } else if (facing.left && facing.right) where = `Pages ${pad(facing.left)} to ${pad(facing.right)}`;
  else where = `Page ${pad((facing.left ?? facing.right) as number)}`;

  const hint = flipped === 0
    ? (narrow ? "Tap the cover to open" : "Click the cover to open, or drag its edge")
    : (narrow ? "Tap or swipe to turn the page" : "Drag a page corner, click a page, or use the arrow keys");

  const jump = (page: number) => {
    sceneRef.current?.goTo(flippedForPage(page), page % 2 === 0 ? "left" : "right");
    setMenu(false);
  };

  return (
    <div
      className="relative h-[calc(100svh-4rem)] min-h-[520px] overflow-hidden select-none"
      style={{
        backgroundColor: "#0F1A12",
        backgroundImage: [
          "radial-gradient(70% 60% at 50% 45%, rgba(212, 169, 106, 0.16), transparent 70%)",
          "linear-gradient(rgba(239, 244, 239, 0.04) 1px, transparent 1px)",
          "linear-gradient(90deg, rgba(239, 244, 239, 0.04) 1px, transparent 1px)",
        ].join(", "),
        backgroundSize: "auto, 32px 32px, 32px 32px",
      }}
    >
      <div ref={hostRef} className="absolute inset-0" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-baseline justify-between px-4 md:px-8 pt-5">
        <div className="pointer-events-auto flex items-baseline gap-4">
          <Link href="/" className="font-mono text-[11px] tracking-[0.08em] text-[#EFF4EF]/60 hover:text-tan transition-colors">&#8592; All sites</Link>
          <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-tan">02 Portfolio</span>
        </div>
        <span className="hidden md:inline font-mono text-[11px] tracking-[0.08em] text-[#EFF4EF]/45">{hint}</span>
      </header>

      {failed && (
        <div className="absolute inset-0 z-10 overflow-y-auto px-6 py-20 text-[#EFF4EF]">
          <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-tan">Portfolio</p>
          <p className="mt-4 max-w-xl text-sm text-[#EFF4EF]/70">This book needs WebGL, which this browser did not provide. Its pages are listed here instead.</p>
          <ol className="mt-8 space-y-3 max-w-xl">
            {layout.sides.map((s) => (
              <li key={s.number} className="flex gap-4 text-sm">
                <span className="font-mono text-tan">{pad(s.number)}</span>
                <span className="text-[#EFF4EF]/85">{describe(s)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!failed && (
        <section className="sr-only" aria-label="Portfolio pages">
          <ol>
            {layout.sides.map((s) => <li key={s.number}>Page {s.number}: {describe(s)}</li>)}
          </ol>
        </section>
      )}

      {!failed && (
        <nav aria-label="Book controls" className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 pb-5 md:pb-7 px-4">
          {menu && (
            <div data-book-menu className="w-full max-w-sm max-h-[calc(100svh-15rem)] overflow-y-auto bg-[#0C120E]/95 ring-1 ring-white/10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] p-2">
              <button onClick={() => { sceneRef.current?.goTo(0); setMenu(false); }} className="w-full flex justify-between px-3 py-2 text-left font-mono text-[12px] text-[#EFF4EF]/80 hover:bg-white/5 hover:text-tan">
                <span>Cover</span><span className="text-[#EFF4EF]/40">00</span>
              </button>
              {layout.sections.map((s) => (
                <button key={`${s.page}-${s.title}`} onClick={() => jump(s.page)} className="w-full flex justify-between gap-4 px-3 py-2 text-left font-mono text-[12px] text-[#EFF4EF]/80 hover:bg-white/5 hover:text-tan">
                  <span className="truncate">{s.title}</span><span className="text-[#EFF4EF]/40">{pad(s.page)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 bg-[#0C120E]/80 backdrop-blur ring-1 ring-white/10 px-1.5 py-1.5">
            <button aria-label="Previous page" disabled={flipped === 0} onClick={() => sceneRef.current?.prev()} className="w-9 h-9 grid place-items-center text-[#EFF4EF]/80 hover:text-tan disabled:opacity-30 disabled:hover:text-[#EFF4EF]/80 transition-colors">&#8592;</button>
            <span aria-live="polite" className="min-w-[10.5rem] text-center font-mono text-[11px] tracking-[0.08em] text-[#EFF4EF]/80 tabular-nums">
              {where} <span className="text-[#EFF4EF]/35">of {pad(total)}</span>
            </span>
            <button aria-label="Next page" disabled={flipped === leaves} onClick={() => sceneRef.current?.next()} className="w-9 h-9 grid place-items-center text-[#EFF4EF]/80 hover:text-tan disabled:opacity-30 disabled:hover:text-[#EFF4EF]/80 transition-colors">&#8594;</button>
            <span className="w-px h-5 bg-white/10 mx-1" />
            <button aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="h-9 px-3 font-mono text-[11px] tracking-[0.14em] uppercase text-[#EFF4EF]/80 hover:text-tan transition-colors">Contents</button>
          </div>
          <span className="md:hidden font-mono text-[10px] tracking-[0.08em] text-[#EFF4EF]/45">{hint}</span>
        </nav>
      )}
    </div>
  );
}
