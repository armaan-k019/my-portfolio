"use client";

import { useState } from "react";
import Image from "next/image";
import Modal from "./Modal";

export interface SketchbookEntry {
  src: string;
  caption?: string;
}

export default function SketchbookGrid({ entries }: { entries: SketchbookEntry[] }) {
  const [selected, setSelected] = useState<SketchbookEntry | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {entries.map((entry) => (
          <button
            key={entry.src}
            onClick={() => setSelected(entry)}
            aria-haspopup="dialog"
            className="card overflow-hidden text-left cursor-pointer"
          >
            <div className="relative aspect-[3/4] bg-cream-dark">
              <Image
                src={entry.src}
                alt={entry.caption ?? "Sketchbook page"}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
              />
            </div>
            {entry.caption && (
              <p className="font-mono text-[11px] text-brown-light px-3 py-2">{entry.caption}</p>
            )}
          </button>
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} panelClassName="max-w-3xl">
        {selected && (
          <figure>
            <Image
              src={selected.src}
              alt={selected.caption ?? "Sketchbook page"}
              width={1200}
              height={1600}
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full h-auto max-h-[80vh] object-contain"
            />
            {selected.caption && (
              <figcaption className="font-mono text-[11px] text-brown-light mt-3">{selected.caption}</figcaption>
            )}
          </figure>
        )}
      </Modal>
    </>
  );
}
