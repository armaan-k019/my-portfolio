import type { CSSProperties } from "react";

// Static decorative layer: film grain + architectural crop marks and mono
// captions that frame the viewport like a drawing sheet. No client JS.

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

function Mark({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const top = pos[0] === "t";
  const left = pos[1] === "l";
  const edge = "1px solid rgba(45,90,39,0.3)";
  const style: CSSProperties = {
    top: top ? "4.6rem" : undefined,
    bottom: top ? undefined : "1.1rem",
    left: left ? "1.1rem" : undefined,
    right: left ? undefined : "1.1rem",
    borderTop: top ? edge : undefined,
    borderBottom: top ? undefined : edge,
    borderLeft: left ? edge : undefined,
    borderRight: left ? undefined : edge,
  };
  return <span className="fixed w-2.5 h-2.5 z-30 hidden md:block" style={style} aria-hidden />;
}

export default function Frame() {
  return (
    <>
      {/* film grain — sits over the canvas, under content */}
      <div
        aria-hidden
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{ backgroundImage: GRAIN, opacity: 0.05, mixBlendMode: "multiply" }}
      />
      {/* crop marks */}
      <Mark pos="tl" />
      <Mark pos="tr" />
      <Mark pos="bl" />
      <Mark pos="br" />
      {/* mono captions */}
      <span className="meta fixed bottom-[1.4rem] left-[2.4rem] z-30 hidden md:block opacity-60" aria-hidden>
        33.7490&deg; N &middot; 84.3880&deg; W
      </span>
      <span className="meta fixed bottom-[1.4rem] right-[2.4rem] z-30 hidden md:block opacity-60" aria-hidden>
        PORTFOLIO / 2026
      </span>
    </>
  );
}
