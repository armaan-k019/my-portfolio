"use client";

import { useState } from "react";
import Image from "next/image";
import Modal from "./Modal";
import { workEntries, type WorkEntry } from "../../content/work";

function LogoWithFallback({ src, alt, imageClassName }: { src: string; alt: string; imageClassName?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="text-sm font-semibold text-center leading-snug text-darkblue">
        {alt}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={160}
      height={100}
      className={imageClassName ?? "object-contain max-h-20 w-auto"}
      onError={() => setFailed(true)}
    />
  );
}

export default function WorkSection() {
  const [selected, setSelected] = useState<WorkEntry | null>(null);

  return (
    <>
      <ul style={{ borderTop: "var(--rule)" }}>
        {workEntries.map((entry) => (
          <li key={entry.name} style={{ borderBottom: "var(--rule)" }}>
            <button
              onClick={() => setSelected(entry)}
              className="group grid w-full grid-cols-1 sm:grid-cols-[minmax(0,15rem)_1fr_auto] gap-x-6 gap-y-1 py-4 text-left items-baseline"
            >
              <span className="font-display text-lg font-semibold text-ink group-hover:text-terracotta transition-colors">
                {entry.name}
                {entry.type === "studentOrg" && <span className="meta ml-2">Student Org</span>}
              </span>
              <span className="text-sm text-brown-light">{entry.role}</span>
              <span className="meta whitespace-nowrap">{entry.dates}</span>
            </button>
          </li>
        ))}
      </ul>

      <Modal open={!!selected} onClose={() => setSelected(null)} titleId="work-modal-title">
        {selected && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 flex items-center justify-center overflow-hidden">
                <LogoWithFallback src={selected.logo} alt={selected.name} imageClassName="object-contain max-h-10 max-w-10 w-auto h-auto" />
              </div>
              <div>
                <h3 id="work-modal-title" className="font-display text-xl font-semibold text-ink">{selected.name}</h3>
                <p className="text-sm text-brown-light">{selected.role}</p>
              </div>
            </div>
            <hr className="rule mb-4" />
            <p className="text-xs text-brown-light mb-4">{selected.dates}</p>
            <ul className="space-y-2">
              {selected.bullets.map((bullet, i) => (
                <li key={i} className="text-sm text-brown-light flex gap-2">
                  <span className="text-terracotta mt-1 shrink-0">&bull;</span>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </>
  );
}
