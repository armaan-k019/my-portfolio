"use client";

import { useEffect, useRef, useState } from "react";

// Decorative canvas behind the hero text. three is loaded on demand so the
// rest of the site never pays for it; if WebGL is missing, nothing renders
// and the hero stands as plain text.
export default function SectionCut() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cutRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<HTMLSpanElement>(null);
  const ptrRef = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  const [hasPointer, setHasPointer] = useState(true);

  useEffect(() => {
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
    import("./scene")
      .then(({ mount }) => {
        if (cancelled) return;
        dispose = mount(canvas, host, mode, { cut, view, ptr });
        if (!dispose) setFailed(true);
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; dispose?.(); };
  }, []);

  if (failed) return null;
  return (
    <div aria-hidden className="pointer-events-none md:absolute md:inset-0">
      <div className="relative h-[85vw] md:absolute md:inset-0 md:h-auto">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="max-w-5xl mx-auto px-6 pb-8 md:pb-0 md:absolute md:inset-x-0 md:bottom-6 flex justify-end">
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 items-baseline">
          <dt className="meta">CUT</dt><dd className="coord whitespace-pre" ref={cutRef} />
          <dt className="meta">VIEW</dt><dd className="coord whitespace-pre" ref={viewRef} />
          <dt className="meta" hidden={!hasPointer}>PTR</dt>
          <dd className="coord whitespace-pre" ref={ptrRef} hidden={!hasPointer} />
        </dl>
      </div>
    </div>
  );
}
