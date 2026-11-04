"use client";

import { usePathname } from "next/navigation";
import { sectionFor } from "@/lib/sections";

// The Website section is set in one plain sans: the display serif and the
// monospace metadata layer both fall back to a Helvetica stack there. The
// chooser at / and the other three sections keep their own type. Sizes,
// weights, tracking and colour are untouched; only the families change.
const PLAIN = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const CSS = `html:root{--font-plain:${PLAIN};--font-sans:var(--font-plain);--font-serif:var(--font-plain);--font-mono:var(--font-plain);--font-fraunces:var(--font-plain);--font-plex-mono:var(--font-plain)}html:root body,html:root .font-sans{font-family:var(--font-plain)}`;

export default function PlainType() {
  const pathname = usePathname();
  if (pathname === "/" || sectionFor(pathname).id !== "website") return null;
  return <style>{CSS}</style>;
}
