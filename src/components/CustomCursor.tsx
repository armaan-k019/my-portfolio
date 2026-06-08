"use client";

import { useEffect, useRef, useState } from "react";

// A surveyor's reticle: a precise crosshair at the exact point, a lagging
// registration ring, and a live lat/long readout — so the pointer is an
// instrument of the atlas, not a decoration. Desktop + motion-on only.
export default function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const coordRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia?.("(pointer: fine)").matches;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    setEnabled(true);
    document.body.classList.add("cursor-none");

    let mxv = innerWidth / 2, myv = innerHeight / 2;
    let rx = mxv, ry = myv;
    let raf = 0, shown = false;

    const move = (e: MouseEvent) => {
      mxv = e.clientX; myv = e.clientY;
      if (!shown) { shown = true; setVisible(true); }
      const t = e.target as HTMLElement | null;
      setHovering(!!t?.closest?.("a, button, [data-cursor], input, textarea, select, label, [role='button']"));
    };
    const leave = () => { shown = false; setVisible(false); };
    window.addEventListener("mousemove", move, { passive: true });
    document.addEventListener("mouseleave", leave);

    const loop = () => {
      rx += (mxv - rx) * 0.16; ry += (myv - ry) * 0.16;
      if (ringRef.current) ringRef.current.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      if (reticleRef.current) reticleRef.current.style.transform = `translate(${mxv}px, ${myv}px) translate(-50%, -50%)`;
      if (coordRef.current) {
        coordRef.current.style.transform = `translate(${mxv + 18}px, ${myv + 14}px)`;
        const lat = 33.749 + (0.5 - myv / innerHeight) * 0.05;
        const lon = 84.388 + (mxv / innerWidth - 0.5) * 0.06;
        coordRef.current.textContent = `${lat.toFixed(4)}°N ${lon.toFixed(4)}°W`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("cursor-none");
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseleave", leave);
    };
  }, []);

  if (!enabled) return null;
  const ink = "rgba(45,90,39,0.7)";

  return (
    <div className="pointer-events-none fixed inset-0 z-[110]" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s" }}>
      {/* lagging registration ring */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 rounded-full"
        style={{
          width: hovering ? 30 : 16,
          height: hovering ? 30 : 16,
          border: `1px solid ${ink}`,
          background: hovering ? "rgba(45,90,39,0.05)" : "transparent",
          transition: "width 0.25s var(--ease-out-expo), height 0.25s var(--ease-out-expo), background 0.25s",
        }}
      />
      {/* precise crosshair reticle */}
      <div ref={reticleRef} className="fixed top-0 left-0">
        <svg width="28" height="28" viewBox="-14 -14 28 28" style={{ overflow: "visible" }}>
          <line x1="-13" y1="0" x2="-5" y2="0" stroke={ink} strokeWidth="1" />
          <line x1="5" y1="0" x2="13" y2="0" stroke={ink} strokeWidth="1" />
          <line x1="0" y1="-13" x2="0" y2="-5" stroke={ink} strokeWidth="1" />
          <line x1="0" y1="5" x2="0" y2="13" stroke={ink} strokeWidth="1" />
          <circle cx="0" cy="0" r="1.2" fill={ink} />
        </svg>
      </div>
      {/* live coordinate readout */}
      <div ref={coordRef} className="fixed top-0 left-0 coord whitespace-nowrap" style={{ opacity: hovering ? 0.95 : 0.55 }} />
    </div>
  );
}
