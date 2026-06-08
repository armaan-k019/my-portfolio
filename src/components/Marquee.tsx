// Infinite kinetic ticker — mono keywords drifting across a ruled band.
// Pure CSS animation, pauses on hover. Decorative.

const ITEMS = [
  "Design", "Architecture", "Computation", "Machine Learning",
  "Shape Grammar", "Cartography", "Photography", "Research", "Latent Space", "Systems",
];

function Row() {
  return (
    <div className="flex items-center shrink-0">
      {ITEMS.map((w, i) => (
        <span key={i} className="flex items-center">
          <span className="font-mono text-sm uppercase tracking-[0.18em] text-brown-light/80 px-7">{w}</span>
          <span className="w-1.5 h-1.5 rotate-45 bg-terracotta/40 shrink-0" />
        </span>
      ))}
    </div>
  );
}

export default function Marquee() {
  return (
    <div className="relative overflow-hidden border-y border-[color:var(--color-line)] py-4 select-none group" aria-hidden>
      <div className="flex w-max marquee-track">
        <Row />
        <Row />
      </div>
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24" style={{ background: "linear-gradient(90deg, var(--color-cream), transparent)" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24" style={{ background: "linear-gradient(270deg, var(--color-cream), transparent)" }} />
    </div>
  );
}
