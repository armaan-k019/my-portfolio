// Topographic contour lines — the atlas's divider. Three stacked elevation
// curves capped with survey ticks. Replaces plain rules between regions.

export default function ContourDivider({ className = "" }: { className?: string }) {
  const lines = [
    { d: "M0 20 C 150 8 280 8 420 16 S 700 26 860 16 S 1080 4 1200 14", o: 0.5 },
    { d: "M0 14 C 160 24 300 22 440 14 S 720 4 880 14 S 1060 24 1200 12", o: 0.32 },
    { d: "M0 26 C 140 18 320 16 460 24 S 760 14 900 22 S 1100 30 1200 22", o: 0.2 },
  ];
  return (
    <div className={`relative ${className}`} aria-hidden>
      {/* end ticks */}
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-3 bg-terracotta/60" />
      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-3 bg-terracotta/60" />
      <svg
        viewBox="0 0 1200 32"
        preserveAspectRatio="none"
        className="w-full h-5"
        fill="none"
        stroke="currentColor"
      >
        {lines.map((l, i) => (
          <path key={i} d={l.d} className="text-terracotta" strokeWidth={1} style={{ opacity: l.o }} />
        ))}
      </svg>
    </div>
  );
}
