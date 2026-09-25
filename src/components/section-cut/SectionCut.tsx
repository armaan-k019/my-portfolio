"use client";

import { useEffect, useRef, useState } from "react";

// Decorative canvas behind the hero text. three is loaded on demand so the
// rest of the site never pays for it; if WebGL is missing, nothing renders
// and the hero stands as plain text.
export default function SectionCut() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const host = canvas?.closest("section");
    if (!canvas || !host) return;
    // Touch and coarse pointers get one static frame; reduced motion keeps
    // the cut under the pointer but drops every autonomous movement.
    const mode = !matchMedia("(pointer: fine)").matches ? "static"
      : matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced"
      : "live";
    import("./scene")
      .then(({ mount }) => {
        if (cancelled) return;
        dispose = mount(canvas, host, mode);
        if (!dispose) setFailed(true);
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; dispose?.(); };
  }, []);

  if (failed) return null;
  return (
    <div aria-hidden className="relative h-[85vw] md:absolute md:inset-0 md:h-auto pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
