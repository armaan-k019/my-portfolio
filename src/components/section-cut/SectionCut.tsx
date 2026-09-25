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
    <div aria-hidden className="relative h-[85vw] md:absolute md:inset-0 md:h-auto pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-x-0 bottom-6 max-w-5xl mx-auto px-6 flex justify-end">
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 items-baseline">
          <dt className="meta">CUT</dt><dd className="coord whitespace-pre" ref={cutRef} />
          <dt className="meta">VIEW</dt><dd className="coord whitespace-pre" ref={viewRef} />
          <dt className="meta">PTR</dt><dd className="coord whitespace-pre" ref={ptrRef} />
        </dl>
      </div>
    </div>
  );
}
