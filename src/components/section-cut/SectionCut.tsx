"use client";

import { useEffect, useRef, useState } from "react";
import { BUILDINGS, buildingOfTheDay } from "./buildings";

// Decorative canvas behind the hero text: a line model after a real building,
// sectioned by the pointer. three and each building load on demand so the
// rest of the site never pays for them; if WebGL is missing, nothing renders
// and the hero stands as plain text.
export default function SectionCut() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cutRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<HTMLSpanElement>(null);
  const ptrRef = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  const [hasPointer, setHasPointer] = useState(true);
  // The day's building is chosen on the client: the page is static, so the
  // server cannot know the visitor's date.
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    setIndex(buildingOfTheDay());
  }, []);

  useEffect(() => {
    if (index === null) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const host = canvas?.closest("section");
    const cut = cutRef.current, view = viewRef.current, ptr = ptrRef.current;
    if (!canvas || !host || !cut || !view || !ptr) return;
    // Touch and coarse pointers get one static frame; reduced motion keeps
    // the cut under the pointer but drops every autonomous movement.
    const mode = !matchMedia("(pointer: fine)").matches ? "static"
      : matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced"
      : "live";
    setHasPointer(mode !== "static");
    Promise.all([BUILDINGS[index].load(), import("./scene")])
      .then(([building, { mount }]) => {
        if (cancelled) return;
        dispose = mount(canvas, host, mode, { cut, view, ptr }, building.build());
        if (!dispose) setFailed(true);
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; dispose?.(); };
  }, [index]);

  if (failed) return null;
  const b = index === null ? null : BUILDINGS[index];
  const at = (d: number) => ((index ?? 0) + d + BUILDINGS.length) % BUILDINGS.length;

  return (
    <div className="pointer-events-none md:absolute md:inset-0">
      <div aria-hidden className="relative h-[85vw] md:absolute md:inset-0 md:h-auto">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="max-w-5xl mx-auto px-6 pb-8 md:pb-0 md:absolute md:inset-x-0 md:bottom-6 flex justify-end">
        <div className="grid justify-items-end gap-2">
          {b && (
            <div className="flex items-center gap-2">
              <p className="meta uppercase">
                {b.name} &middot; after {b.architect} &middot; {b.year}
              </p>
              {BUILDINGS.length > 1 && (
                <span className="pointer-events-auto flex">
                  <button type="button" onClick={() => setIndex(at(-1))} aria-label={BUILDINGS[at(-1)].name} className="coord px-1.5 py-1 hover:text-terracotta-dark">&larr;</button>
                  <button type="button" onClick={() => setIndex(at(1))} aria-label={BUILDINGS[at(1)].name} className="coord px-1.5 py-1 hover:text-terracotta-dark">&rarr;</button>
                </span>
              )}
            </div>
          )}
          <dl aria-hidden className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 items-baseline">
            <dt className="meta">CUT</dt><dd className="coord whitespace-pre" ref={cutRef} />
            <dt className="meta">VIEW</dt><dd className="coord whitespace-pre" ref={viewRef} />
            <dt className="meta" hidden={!hasPointer}>PTR</dt>
            <dd className="coord whitespace-pre" ref={ptrRef} hidden={!hasPointer} />
          </dl>
        </div>
      </div>
    </div>
  );
}
