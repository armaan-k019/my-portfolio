"use client";

import { motion, useReducedMotion } from "framer-motion";

// The Portfolio tile's backdrop: a drawing sheet whose plan lines draw
// themselves in, with a title block that says the work is in progress.
// Decorative only: it is not a drawing of any real project.
const WALLS = [
  "M60 60 H260 V200 H60 Z",
  "M60 120 H150 V200",
  "M150 60 V95",
  "M200 120 H260",
  "M200 120 V160",
  "M100 200 V230 H220 V200",
];
const GRID = Array.from({ length: 13 }, (_, i) => 20 + i * 25);

export default function DraftingSheet() {
  const reduce = useReducedMotion();
  return (
    <svg aria-hidden viewBox="0 0 320 250" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full p-[12%] pb-[30%]">
      {GRID.map((x) => (
        <line key={`v${x}`} x1={x} y1="0" x2={x} y2="250" stroke="#2C3E50" strokeOpacity="0.06" />
      ))}
      {GRID.slice(0, 10).map((y) => (
        <line key={`h${y}`} x1="0" y1={y} x2="320" y2={y} stroke="#2C3E50" strokeOpacity="0.06" />
      ))}
      <rect x="8" y="8" width="304" height="234" fill="none" stroke="#2C3E50" strokeOpacity="0.5" />
      {WALLS.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke="#2C3E50"
          strokeWidth={i === 0 ? 2.2 : 1.2}
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, delay: 0.3 + i * 0.35, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
      <motion.circle
        cx="230" cy="90" r="18" fill="none" stroke="#B8862A" strokeDasharray="3 3"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6, duration: 0.8 }}
      />
      <g fontFamily="var(--font-mono)" fontSize="6" fill="#2C3E50" letterSpacing="0.6">
        <rect x="236" y="212" width="76" height="30" fill="none" stroke="#2C3E50" strokeOpacity="0.5" />
        <text x="241" y="223">SHEET A-000</text>
        <text x="241" y="235" fill="#B8862A">IN PROGRESS</text>
      </g>
    </svg>
  );
}
