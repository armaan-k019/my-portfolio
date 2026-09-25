"use client";

import { useEffect, useRef, useState } from "react";
import type { Mode } from "./scene";

// Whole UTC days since the epoch: the same seed for every visitor on a given
// calendar day, turning over at midnight UTC.
const today = () => Math.floor(Date.now() / 86_400_000);
// The contour interval the generator uses, stated in the readout.
const CONTOUR = "1.0 m";

// Decorative canvas behind the hero text: a generated landscape and the
// structure surveyed into it, sectioned by the pointer. three and the
// generator load on demand so the rest of the site never pays for them; if
// WebGL is missing, nothing renders and the hero stands as plain text.
export default function SectionCut() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cutRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  // The day's seed is chosen on the client: the page is static, so the
  // server cannot know the visitor's date.
  const [seed, setSeed] = useState<number | null>(null);
  // Touch and coarse pointers get one static frame; reduced motion keeps the
  // cut under the pointer but drops every autonomous movement. Re-read when
  // either preference changes while the page is open.
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const fine = matchMedia("(pointer: fine)"), reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const pick = () => setMode(!fine.matches ? "static" : reduce.matches ? "reduced" : "live");
    pick();
    setSeed(today());
    fine.addEventListener("change", pick);
    reduce.addEventListener("change", pick);
    return () => { fine.removeEventListener("change", pick); reduce.removeEventListener("change", pick); };
  }, []);

  useEffect(() => {
    if (seed === null || mode === null) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const host = canvas?.closest("section");
    const cut = cutRef.current, view = viewRef.current;
    if (!canvas || !host || !cut || !view) return;
    Promise.all([import("./landscape"), import("./scene")])
      .then(([{ build }, { mount }]) => {
        if (cancelled) return;
        dispose = mount(canvas, host, mode, { cut, view }, build(seed));
        if (!dispose) setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; dispose?.(); };
  }, [seed, mode]);

  if (failed) return null;

  return (
    <div className="pointer-events-none md:absolute md:inset-0">
      <div aria-hidden className="relative h-[85vw] md:absolute md:inset-0 md:h-auto">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="max-w-5xl mx-auto px-6 pb-8 md:pb-0 md:absolute md:inset-x-0 md:bottom-6 flex justify-end">
        <div className="grid justify-items-end gap-2">
          <dl className="grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-1 items-baseline">
            <dt className="meta">SEED</dt>
            <dd className="coord whitespace-pre min-w-[21ch]">{seed ?? ""}</dd>
            <dd className="pointer-events-auto flex -my-1">
              {seed !== null && (
                <>
                  <button type="button" onClick={() => setSeed(seed - 1)} aria-label={`Seed ${seed - 1}`} className="coord px-1.5 py-1 hover:text-terracotta-dark">&larr;</button>
                  <button type="button" onClick={() => setSeed(seed + 1)} aria-label={`Seed ${seed + 1}`} className="coord px-1.5 py-1 hover:text-terracotta-dark">&rarr;</button>
                </>
              )}
            </dd>
            <dt className="meta" aria-hidden>CONTOUR</dt><dd className="coord whitespace-pre min-w-[21ch]" aria-hidden>{CONTOUR}</dd><dd aria-hidden />
            <dt className="meta" aria-hidden>CUT</dt><dd className="coord whitespace-pre min-w-[21ch]" aria-hidden ref={cutRef} /><dd aria-hidden />
            <dt className="meta" aria-hidden>VIEW</dt><dd className="coord whitespace-pre min-w-[21ch]" aria-hidden ref={viewRef} /><dd aria-hidden />
          </dl>
        </div>
      </div>
    </div>
  );
}
