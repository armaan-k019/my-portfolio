"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { PHOTOS, DESTINATIONS, type Photo } from "../../../content/photos";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({
  photo,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  index,
  total,
}: {
  photo: Photo;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  index: number;
  total: number;
}) {
  const touchStartX = useRef<number>(0);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  // Prevent scroll on body
  useEffect(() => {
    document.body.style.overflow = "hidden";
    window.__lenis?.stop();
    return () => { document.body.style.overflow = ""; window.__lenis?.start(); };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Prev arrow */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          aria-label="Previous photo"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          aria-label="Next photo"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Photo + caption */}
      <div
        className="flex flex-col items-center gap-3 px-16 max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const delta = e.changedTouches[0].clientX - touchStartX.current;
          if (delta > 50 && hasPrev) onPrev();
          if (delta < -50 && hasNext) onNext();
        }}
      >
        <div className="relative" style={{ maxHeight: "85vh", maxWidth: "90vw" }}>
          <Image
            src={photo.src}
            alt={photo.location}
            width={photo.w}
            height={photo.h}
            style={{ maxHeight: "85vh", maxWidth: "90vw", width: "auto", height: "auto", objectFit: "contain" }}
            className="rounded-lg shadow-2xl"
            priority
            unoptimized={photo.src.startsWith("http")}
          />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-white/60 text-xs font-medium tracking-wide uppercase">{photo.location}</p>
          <span className="text-white/30 text-xs">{index + 1} / {total}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Photo card ───────────────────────────────────────────────────────────────

function PhotoCard({ photo, onClick }: { photo: Photo; onClick: () => void }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      onClick={onClick}
      className="block w-full break-inside-avoid mb-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D5A27]"
      aria-label={`Open photo from ${photo.location}`}
    >
      {/* Inner div owns the rounding, clip, and skeleton background.
          No fixed aspect-ratio here — the Image's natural height drives the layout. */}
      <div className="relative rounded-lg overflow-hidden bg-[#D8E6D8]">
        <Image
          src={photo.src}
          alt={photo.location}
          width={photo.w}
          height={photo.h}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          style={{ width: "100%", height: "auto", display: "block" }}
          className={`transition-all duration-300 group-hover:scale-[1.02] ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />

        {/* Hover overlay — location label */}
        <div
          className="absolute inset-x-0 bottom-0 h-16 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end pb-2.5 px-3"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
        >
          <span className="text-white text-[11px] font-medium tracking-wide">
            {photo.location}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PhotographyPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [fading, setFading] = useState(false);
  const [pendingFilter, setPendingFilter] = useState("All");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Photo[]>(PHOTOS);

  // Shuffle once on mount so the grid shows a different arrangement each visit
  useEffect(() => {
    setPhotos(shuffle(PHOTOS));
  }, []);

  const filteredPhotos = useMemo(
    () => activeFilter === "All" ? photos : photos.filter(p => p.location === activeFilter),
    [activeFilter, photos]
  );

  const handleFilterChange = useCallback((dest: string) => {
    if (dest === activeFilter) return;
    setPendingFilter(dest);
    setFading(true);
  }, [activeFilter]);

  // After fade-out, apply the filter and fade back in
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => {
      setActiveFilter(pendingFilter);
      setFading(false);
    }, 150);
    return () => clearTimeout(t);
  }, [fading, pendingFilter]);

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const goPrev = useCallback(() => setLightboxIndex(i => i !== null && i > 0 ? i - 1 : i), []);
  const goNext = useCallback(() => setLightboxIndex(i => i !== null && i < filteredPhotos.length - 1 ? i + 1 : i), [filteredPhotos.length]);

  return (
    <div className="min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 pt-12 pb-6">
        <p className="eyebrow mb-3">Field survey</p>
        <h1 className="font-display display-lg font-semibold text-ink mb-3">Photography</h1>
        <p className="meta">
          {DESTINATIONS.length} STATIONS &middot; {PHOTOS.length} PLATES &middot; SURVEYED ON FOOT
        </p>
      </div>

      {/* ── Filter pills ───────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className="flex flex-wrap gap-2">
          {/* All pill */}
          <button
            onClick={() => handleFilterChange("All")}
            className={`font-mono text-[11px] tracking-wide uppercase px-3 py-1.5 rounded-full border transition-all ${
              activeFilter === "All"
                ? "bg-[#2D5A27] text-white border-[#2D5A27] shadow-sm"
                : "bg-transparent text-[#4A6B4A] border-[#D8E6D8] hover:border-[#2D5A27] hover:text-[#2D5A27]"
            }`}
          >
            All ({PHOTOS.length})
          </button>

          {DESTINATIONS.map((dest) => (
            <button
              key={dest.name}
              onClick={() => handleFilterChange(dest.name)}
              className={`font-mono text-[11px] tracking-wide uppercase px-3 py-1.5 rounded-full border transition-all ${
                activeFilter === dest.name
                  ? "bg-[#2D5A27] text-white border-[#2D5A27] shadow-sm"
                  : "bg-transparent text-[#4A6B4A] border-[#D8E6D8] hover:border-[#2D5A27] hover:text-[#2D5A27]"
              }`}
            >
              {dest.name} ({dest.count})
            </button>
          ))}
        </div>
      </div>

      {/* ── Masonry grid ───────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <div
          className={`columns-1 sm:columns-2 lg:columns-3 gap-2 transition-opacity duration-150 ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        >
          {filteredPhotos.map((photo, i) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onClick={() => openLightbox(i)}
            />
          ))}
        </div>

        {filteredPhotos.length === 0 && (
          <p className="text-center text-[#7A9B7A] text-sm py-20">No photos in this destination yet.</p>
        )}
      </div>

      {/* ── Closing banner ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 pb-20 pt-4">
        <div className="border-t border-[#D8E6D8] pt-10 text-center">
          <p className="text-sm text-[#4A6B4A]">
            More to come. I&apos;m always shooting.
          </p>
        </div>
      </div>

      {/* ── Lightbox ───────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && filteredPhotos[lightboxIndex] && (
        <Lightbox
          photo={filteredPhotos[lightboxIndex]}
          onClose={closeLightbox}
          onPrev={goPrev}
          onNext={goNext}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < filteredPhotos.length - 1}
          index={lightboxIndex}
          total={filteredPhotos.length}
        />
      )}
    </div>
  );
}
