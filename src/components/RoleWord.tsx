"use client";

import { useEffect, useState } from "react";

const ROLE_WORDS = ["student", "researcher", "artist", "engineer"];

// The rotating role in the hero bio, with its article. Holds on the first
// word under reduced motion; the server render is the first word too, so the
// sentence reads correctly before and without JavaScript.
export default function RoleWord() {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let tick: ReturnType<typeof setInterval> | undefined, swap: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (reduce.matches) { setI(0); setShown(true); return; }
      tick = setInterval(() => {
        setShown(false);
        swap = setTimeout(() => { setI((n) => (n + 1) % ROLE_WORDS.length); setShown(true); }, 300);
      }, 3400);
    };
    const stop = () => { clearInterval(tick); clearTimeout(swap); };
    const restart = () => { stop(); start(); };
    start();
    reduce.addEventListener("change", restart);
    return () => { stop(); reduce.removeEventListener("change", restart); };
  }, []);

  const word = ROLE_WORDS[i];
  // The word sits in a box as wide as the longest word, so the sentence
  // never reflows as words change. The sizer is drawn from CSS content, so it
  // is not part of the page text.
  return (
    <span className="inline-block transition-opacity duration-300" style={{ opacity: shown ? 1 : 0 }}>
      {/^[aeiou]/i.test(word) ? "an" : "a"}{" "}
      <span className="inline-grid font-semibold text-terracotta after:content-['researcher'] after:[grid-area:1/1] after:invisible after:h-0">
        <span className="[grid-area:1/1] justify-self-start border-b-2 border-current pb-px">{word}</span>
      </span>
    </span>
  );
}
