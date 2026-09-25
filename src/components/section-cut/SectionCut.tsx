"use client";

import { useEffect, useRef } from "react";

// Decorative canvas behind the hero text. three is loaded on demand so the
// rest of the site never pays for it; if WebGL is missing, nothing renders.
export default function SectionCut() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    import("./scene").then(({ mount }) => {
      if (cancelled || !canvasRef.current) return;
      dispose = mount(canvasRef.current);
      if (!dispose) canvasRef.current.remove();
    });
    return () => { cancelled = true; dispose?.(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      tabIndex={-1}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
