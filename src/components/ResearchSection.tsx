"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Modal from "./Modal";
import type { ResearchEntry } from "@/lib/mdx";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export default function ResearchSection({ entries }: { entries: ResearchEntry[] }) {
  const [selected, setSelected] = useState<ResearchEntry | null>(null);

  return (
    <>
      <div className="space-y-4">
        {entries.map((entry, i) => {
          const accent = entry.category === "cs" ? "#2D5A27" : entry.category === "intersection" ? "#1E3A5F" : "#4A7A44";
          return (
            <motion.button
              key={entry.slug}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setSelected(entry)}
              className="group card card-hover block w-full text-left p-5 overflow-hidden"
            >
              <span
                className="absolute left-0 top-0 h-full w-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ backgroundColor: accent }}
              />
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-display text-lg font-semibold text-darkblue leading-snug mb-1">{entry.title}</h3>
                  {entry.status && (
                    <p className="meta text-terracotta/80 mb-1.5">{entry.status}</p>
                  )}
                  <p className="text-[13px] text-brown-light line-clamp-2 leading-relaxed">{entry.preview}</p>
                </div>
                <span className="meta whitespace-nowrap shrink-0 mt-1">
                  {entry.date === "Ongoing" ? "Ongoing" : new Date(entry.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="bg-darkblue -mx-6 -mt-6 px-6 py-5 rounded-t-2xl mb-5">
              <h3 className="font-display text-xl font-semibold text-white leading-snug">{selected.title}</h3>
              {selected.status && (
                <p className="text-[11px] uppercase tracking-wide text-tan-light mt-1.5">{selected.status}</p>
              )}
            </div>

            {selected.authors && (
              <p className="text-xs text-brown-light mb-3">
                <span className="font-semibold text-brown">Authors:</span> {selected.authors}
              </p>
            )}

            {/* Modal body paragraph (from MDX content, first paragraph) */}
            <div className="text-sm text-brown-light leading-relaxed mb-5">
              {selected.content.split(/\n## /)[0].trim().split("\n").filter(Boolean).map((p, i) => (
                <p key={i} className="mb-3">{p}</p>
              ))}
            </div>

            {/* Full abstract (for entries that have ## Abstract in content) */}
            {selected.content.includes("## Abstract") && (
              <div className="mb-5">
                <h4 className="text-sm font-semibold text-brown mb-2">Abstract</h4>
                <p className="text-sm text-brown-light leading-relaxed">
                  {selected.content.split("## Abstract")[1].trim()}
                </p>
              </div>
            )}

            {selected.keywords && (
              <p className="text-xs text-brown-light mb-4">
                <span className="font-semibold text-brown">Keywords:</span> {selected.keywords}
              </p>
            )}

            {(selected.projectLink || selected.projectLinks) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selected.projectLink && (
                  <a
                    href={selected.projectLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-1.5 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors"
                  >
                    View project &rarr;
                  </a>
                )}
                {selected.projectLinks?.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-1.5 text-sm font-medium border border-darkblue text-darkblue rounded-lg hover:bg-darkblue hover:text-white transition-colors"
                  >
                    {link.label} &rarr;
                  </a>
                ))}
              </div>
            )}

            {selected.footer && (
              <div className="border-t border-tan/30 pt-4 mt-4">
                <p className="text-xs text-brown-light italic">{selected.footer}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
