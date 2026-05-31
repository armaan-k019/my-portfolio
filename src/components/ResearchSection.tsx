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
      <div className="space-y-5">
        {entries.map((entry, i) => {
          const hoverClass = entry.category === "cs"
            ? "hover:border-l-terracotta hover:bg-terracotta/5"
            : entry.category === "intersection"
            ? "hover:border-l-darkblue hover:bg-darkblue/5"
            : "hover:border-l-sage hover:bg-sage/5";
          return (
            <motion.button
              key={entry.slug}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
              onClick={() => setSelected(entry)}
              className={`block w-full text-left bg-white rounded-xl p-5 shadow-sm hover:shadow-md border-l-4 border-l-transparent transition-all duration-200 ${hoverClass}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium text-darkblue">{entry.title}</h3>
                  </div>
                  {entry.status && (
                    <p className="text-xs text-brown-light mb-1">{entry.status}</p>
                  )}
                  <p className="text-sm text-brown-light line-clamp-2">{entry.preview}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs text-brown-light whitespace-nowrap">
                    {entry.date === "Ongoing" ? "Ongoing" : new Date(entry.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="bg-darkblue -mx-6 -mt-6 px-6 py-4 rounded-t-xl mb-5">
              <h3 className="text-lg font-semibold text-white leading-snug">{selected.title}</h3>
              {selected.status && (
                <p className="text-xs text-terracotta mt-1">{selected.status}</p>
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
