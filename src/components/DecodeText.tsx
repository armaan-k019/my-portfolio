"use client";

import { useEffect, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>*+#&×";

// Monospace "decode" reveal — text resolves out of scrambled glyphs. On-brand
// with the technical metadata layer. Honours reduced-motion (renders plainly).
export default function DecodeText({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const [out, setOut] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setOut(text); return; }
    const total = text.length;
    let raf = 0;
    let startAt = 0;
    const run = (t: number) => {
      if (!startAt) startAt = t + delay;
      const elapsed = t - startAt;
      if (elapsed < 0) { raf = requestAnimationFrame(run); return; }
      const revealed = Math.floor((elapsed / (total * 38)) * total);
      let s = "";
      for (let i = 0; i < total; i++) {
        if (text[i] === " ") { s += " "; continue; }
        s += i < revealed ? text[i] : CHARS[(Math.random() * CHARS.length) | 0];
      }
      setOut(s);
      if (revealed < total) raf = requestAnimationFrame(run);
      else setOut(text);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [text, delay]);

  return <span ref={ref} className={className}>{out}</span>;
}
