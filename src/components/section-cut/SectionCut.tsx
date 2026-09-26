"use client";

import { useEffect, useRef, useState } from "react";
import type { Mode } from "./scene";

import { COMPOSITIONS, compositionOfTheDay } from "./compositions";

// Decorative canvas behind the hero text: one of three compositions of
// ground and structure, sectioned by the pointer. three and each
// composition load on demand so the rest of the site never pays for them; if
// WebGL is missing, nothing renders and the hero stands as plain text.
export default function SectionCut() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cutRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  // The day's composition is chosen on the client: the page is static, so
  // the server cannot know the visitor's date.
  const [index, setIndex] = useState<number | null>(null);
  const [contour, setContour] = useState<number | null>(null);
  // Touch and coarse pointers get one static frame; reduced motion keeps the
  // cut under the pointer but drops every autonomous movement. Re-read when
  // either preference changes while the page is open.
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const fine = matchMedia("(pointer: fine)"), reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const pick = () => setMode(!fine.matches ? "static" : reduce.matches ? "reduced" : "live");
    pick();
    setIndex(compositionOfTheDay());
    fine.addEventListener("change", pick);
    reduce.addEventListener("change", pick);
    return () => { fine.removeEventListener("change", pick); reduce.removeEventListener("change", pick); };
  }, []);

  useEffect(() => {
    if (index === null || mode === null) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const host = canvas?.closest("section");
    const cut = cutRef.current, view = viewRef.current;
    if (!canvas || !host || !cut || !view) return;
    Promise.all([COMPOSITIONS[index](), import("./scene")])
      .then(([{ build }, { mount }]) => {
        if (cancelled) return;
        const m = build();
        setContour(m.contour ?? null);
        dispose = mount(canvas, host, mode, { cut, view }, m);
        if (!dispose) setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; dispose?.(); };
  }, [index, mode]);

  if (failed) return null;

  return (
    <div className="pointer-events-none md:absolute md:inset-0">
      <div aria-hidden className="relative h-[85vw] md:absolute md:inset-0 md:h-auto">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="max-w-5xl mx-auto px-6 pb-8 md:pb-0 md:absolute md:inset-x-0 md:bottom-6 flex justify-end">
        <div className="grid justify-items-end gap-2">
          <dl className="grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-1 items-baseline">
            <dt className="meta" aria-hidden>{index === null ? "\u00a0" : `0${index + 1} / 0${COMPOSITIONS.length}`}</dt>
            <dd />
            <dd className="pointer-events-auto flex -my-1">
              {index !== null && (
                <>
                  <button type="button" onClick={() => setIndex((index + COMPOSITIONS.length - 1) % COMPOSITIONS.length)} aria-label={`0${((index + COMPOSITIONS.length - 1) % COMPOSITIONS.length) + 1} / 0${COMPOSITIONS.length}`} className="coord px-1.5 py-1 hover:text-terracotta-dark">&larr;</button>
                  <button type="button" onClick={() => setIndex((index + 1) % COMPOSITIONS.length)} aria-label={`0${((index + 1) % COMPOSITIONS.length) + 1} / 0${COMPOSITIONS.length}`} className="coord px-1.5 py-1 hover:text-terracotta-dark">&rarr;</button>
                </>
              )}
            </dd>
            <dt className="meta" aria-hidden>CONTOUR</dt><dd className="coord whitespace-pre min-w-[21ch]" aria-hidden>{contour === null ? "" : `${contour.toFixed(1)} m`}</dd><dd aria-hidden />
            <dt className="meta" aria-hidden>CUT</dt><dd className="coord whitespace-pre min-w-[21ch]" aria-hidden ref={cutRef} /><dd aria-hidden />
            <dt className="meta" aria-hidden>VIEW</dt><dd className="coord whitespace-pre min-w-[21ch]" aria-hidden ref={viewRef} /><dd aria-hidden />
          </dl>
        </div>
      </div>
    </div>
  );
}
