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
      <div style={{ borderTop: "var(--rule)" }}>
        {entries.map((entry, i) => {
          return (
            <motion.button
              key={entry.slug}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => setSelected(entry)}
              style={{ borderBottom: "var(--rule)" }}
              className="group block w-full text-left py-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-display text-lg font-semibold text-darkblue leading-snug mb-1 group-hover:text-terracotta transition-colors">{entry.title}</h3>
                  {(entry.conference || entry.status) && (
                    <p className="flex flex-wrap items-baseline gap-x-2 mb-1.5">
                      {entry.conference && (
                        <span className="text-base font-semibold text-terracotta">{entry.conference}</span>
                      )}
                      {entry.status && <span className="meta text-terracotta/80">{entry.status}</span>}
                    </p>
                  )}
                  {entry.disclaimer && (
                    <p className="text-xs text-brown-light italic mb-1.5">{entry.disclaimer}</p>
                  )}
                  <p className="text-[13px] text-brown-light line-clamp-2 leading-relaxed">{entry.preview}</p>
                </div>
                <span className="meta whitespace-nowrap shrink-0 mt-1">
                  {entry.date === "Ongoing" ? "Ongoing" : new Date(entry.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} titleId="research-modal-title">
        {selected && (
          <div>
            <div className="mb-4">
              <h3 id="research-modal-title" className="font-display text-xl font-semibold text-ink leading-snug">{selected.title}</h3>
              {(selected.conference || selected.status) && (
                <p className="flex flex-wrap items-baseline gap-x-2 mt-1.5">
                  {selected.conference && (
                    <span className="text-base font-semibold text-terracotta">{selected.conference}</span>
                  )}
                  {selected.status && <span className="meta text-terracotta/80">{selected.status}</span>}
                </p>
              )}
              {selected.disclaimer && (
                <p className="text-xs text-brown-light italic mt-1.5">{selected.disclaimer}</p>
              )}
            </div>
            <hr className="rule mb-4" />

            {selected.authors && (
              <p className="text-xs text-brown-light mb-3">
                <span className="font-semibold text-brown">Authors:</span> {selected.authors}
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
              <div>
                <p className="text-xs text-brown-light italic">{selected.footer}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
