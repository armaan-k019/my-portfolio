"use client";

import { useState } from "react";
import Image from "next/image";
import { albums, type Album, type Photo } from "../../../content/photography";
import { AnimatePresence, motion } from "framer-motion";

export default function PhotographyPage() {
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold text-brown mb-1">Photography</h1>
      <div className="w-10 h-[3px] bg-terracotta mb-10" />

      {/* Album grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {albums.map((album) => (
          <button
            key={album.slug}
            onClick={() => setSelectedAlbum(album)}
            className="text-left group cursor-pointer"
          >
            <div className="relative h-[260px] rounded-xl overflow-hidden">
              {/* Background image or gradient placeholder */}
              <div
                className="absolute inset-0 group-hover:scale-105 transition-transform duration-300"
                style={{ background: album.coverGradient }}
              >
                <Image
                  src={album.cover}
                  alt={album.title}
                  fill
                  className="object-cover opacity-80"
                />
              </div>
              {/* Dark gradient overlay on bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              {/* Text overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h2 className="font-semibold text-white text-lg">{album.title}</h2>
                <p className="text-sm text-white/80">{album.location}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Album expanded view */}
      <AnimatePresence>
        {selectedAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-cream/95 overflow-y-auto"
          >
            <div className="max-w-5xl mx-auto px-6 py-8">
              <button
                onClick={() => setSelectedAlbum(null)}
                className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-6"
              >
                &larr; Back to albums
              </button>
              <h2 className="text-xl font-semibold text-darkblue mb-1">{selectedAlbum.title}</h2>
              <p className="text-sm text-brown-light mb-2">{selectedAlbum.location}</p>
              <p className="text-sm text-brown-light mb-8">{selectedAlbum.caption}</p>
              <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
                {selectedAlbum.photos.map((photo, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxPhoto(photo)}
                    className="break-inside-avoid block w-full cursor-pointer"
                  >
                    <div className="relative rounded-lg overflow-hidden bg-cream-dark">
                      <Image
                        src={photo.src}
                        alt={photo.alt}
                        width={600}
                        height={450}
                        className="w-full h-auto object-cover hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>
                    {photo.caption && (
                      <p className="text-xs text-brown-light mt-1.5 text-left">{photo.caption}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setLightboxPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-w-4xl w-full max-h-[85vh]"
            >
              <Image
                src={lightboxPhoto.src}
                alt={lightboxPhoto.alt}
                width={1200}
                height={900}
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              />
              {lightboxPhoto.caption && (
                <p className="text-sm text-white/80 text-center mt-3">{lightboxPhoto.caption}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
