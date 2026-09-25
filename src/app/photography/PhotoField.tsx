"use client";

import { useEffect, useRef, useState } from "react";
import type { Photo } from "../../../content/photos";

// Where each destination sits in the field, from the Wikipedia API
// (prop=coordinates, 2026-09-25): the city's or the country's own point.
// Photos are clustered round their destination's point; exact spots are not
// recorded.
const COORDS: Record<string, [number, number]> = {
  Amsterdam: [52.37277778, 4.89361111],
  Iceland: [65, -18],
  India: [21, 78],
  London: [51.50722222, -0.1275],
  Spain: [40, -4],
  Sweden: [63, 16],
  Switzerland: [46.83333333, 8.33333333],
  Taiwan: [24, 121],
  Turkey: [39.91666667, 32.85],
  USA: [40, -100],
};

// Thumbnail width requested from the image optimizer.
const THUMB = 256;

// A field of the photographs in space, clustered by where they were taken.
// Shown only with a fine pointer and without reduced motion; the space is
// reserved in CSS so the page does not shift, and the flat list below stays
// the accessible way to every photo.
export default function PhotoField({
  photos,
  destinations,
  onOpen,
}: {
  photos: Photo[];
  destinations: { name: string; count: number }[];
  onOpen: (id: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearest, setNearest] = useState<{ name: string; count: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const openRef = useRef(onOpen);
  useEffect(() => { openRef.current = onOpen; }, [onOpen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ok = matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok) return;
    let dispose: (() => void) | null = null, cancelled = false;
    const places = destinations.filter((d) => COORDS[d.name]).map((d) => ({ ...d, lat: COORDS[d.name][0], lng: COORDS[d.name][1] }));
    const field = photos.filter((p) => COORDS[p.location]).map((p) => ({ id: p.id, src: p.src, w: p.w, h: p.h, place: p.location }));
    import("./field-scene")
      .then(({ mount }) => {
        if (cancelled) return;
        dispose = mount(canvas, field, places, "Amsterdam", THUMB, setNearest, (id) => openRef.current(id));
        if (!dispose) setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; dispose?.(); };
  }, [photos, destinations]);

  if (failed) return null;
  return (
    <div
      aria-hidden
      className="relative hidden [@media(pointer:fine)_and_(prefers-reduced-motion:no-preference)]:block h-[64vh] mb-10"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />
      <p className="meta absolute left-0 bottom-0 uppercase">
        {nearest ? <>{nearest.name} &middot; {nearest.count} plates</> : " "}
      </p>
    </div>
  );
}
