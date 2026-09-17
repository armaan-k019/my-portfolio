"use client";

import { useState } from "react";
import Image from "next/image";

export interface SketchbookEntry {
  src: string;
  caption?: string;
}

const ENTRIES: SketchbookEntry[] = [
  { src: "/sketchbook/page-1.jpg", caption: "[TODO: caption]" },
  { src: "/sketchbook/page-2.jpg", caption: "[TODO: caption]" },
  { src: "/sketchbook/page-3.jpg", caption: "[TODO: caption]" },
  { src: "/sketchbook/page-4.jpg", caption: "[TODO: caption]" },
  { src: "/sketchbook/page-5.jpg", caption: "[TODO: caption]" },
  { src: "/sketchbook/page-6.jpg", caption: "[TODO: caption]" },
];

function SketchbookCard({ entry }: { entry: SketchbookEntry }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div className="relative aspect-[3/4] bg-cream-dark">
        {!failed ? (
          <Image
            src={entry.src}
            alt={entry.caption ?? "Sketchbook page"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed border-line">
            <p className="font-mono text-[11px] uppercase tracking-wide text-brown-light/60 text-center px-4">
              [TODO: add image at {entry.src}]
            </p>
          </div>
        )}
      </div>
      {entry.caption && (
        <p className="font-mono text-[11px] text-brown-light px-3 py-2">{entry.caption}</p>
      )}
    </div>
  );
}

export default function SketchbookGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ENTRIES.map((entry) => (
        <SketchbookCard key={entry.src} entry={entry} />
      ))}
    </div>
  );
}
