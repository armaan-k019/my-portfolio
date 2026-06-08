// The atlas persistent chrome: a survey margin (graticule rulers + crop
// marks), a compass rose, the region legend keying the latent key-map, and a
// paper grain. Static, no client JS. This is what makes every screen read as
// one page of a single bound atlas.

import { REGIONS, REGION_ORDER } from "@/lib/latent-atlas";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

const TICKS = "repeating-linear-gradient(to bottom, rgba(45,90,39,0.28) 0 1px, transparent 1px 26px)";

function Compass() {
  return (
    <div className="fixed top-[4.7rem] right-6 z-30 hidden md:block" aria-hidden>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-terracotta/60">
        <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
        <path d="M20 6 L23 20 L20 24 L17 20 Z" fill="currentColor" opacity="0.8" />
        <path d="M20 34 L17 20 L20 24 L23 20 Z" fill="currentColor" opacity="0.25" />
        <line x1="20" y1="2" x2="20" y2="6" stroke="currentColor" strokeWidth="0.75" />
        <line x1="2" y1="20" x2="6" y2="20" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
        <line x1="34" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
      </svg>
      <span className="block text-center coord mt-0.5 text-terracotta/70">N</span>
    </div>
  );
}

export default function AtlasFrame() {
  return (
    <>
      {/* paper grain */}
      <div
        aria-hidden
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{ backgroundImage: GRAIN, opacity: 0.05, mixBlendMode: "multiply" }}
      />
      {/* survey margin: graticule rulers on the vertical edges */}
      <div aria-hidden className="fixed left-0 top-0 bottom-0 w-1.5 z-20 hidden md:block pointer-events-none" style={{ backgroundImage: TICKS, opacity: 0.5 }} />
      <div aria-hidden className="fixed right-0 top-0 bottom-0 w-1.5 z-20 hidden md:block pointer-events-none" style={{ backgroundImage: TICKS, opacity: 0.5 }} />

      <Compass />

      {/* region legend: keys the latent map. Glyph plus color, dual encoded. */}
      <div className="fixed bottom-5 left-6 z-30 hidden lg:flex flex-col gap-1" aria-hidden>
        <span className="meta text-brown-light/60 mb-0.5">LEGEND</span>
        {REGION_ORDER.map((id) => {
          const r = REGIONS[id];
          return (
            <span key={r.id} className="flex items-center gap-1.5">
              <span className="coord" style={{ color: `rgb(${r.color})` }}>{r.glyph}</span>
              <span className="coord text-brown-light/70">{r.id}</span>
            </span>
          );
        })}
      </div>

      {/* sheet caption */}
      <span className="meta fixed bottom-5 right-6 z-30 hidden md:block opacity-60" aria-hidden>
        ATLAS &middot; 33.7490&deg;N 84.3880&deg;W
      </span>
    </>
  );
}
