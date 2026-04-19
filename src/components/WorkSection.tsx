"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import Modal from "./Modal";
import CurrentlyWorkingOn from "./CurrentlyWorkingOn";
import { workEntries, type WorkEntry } from "../../content/work";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

function isDark(hex?: string) {
  if (!hex) return false;
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function LogoWithFallback({ src, alt, dark, imageClassName }: { src: string; alt: string; dark?: boolean; imageClassName?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={`text-sm font-semibold text-center leading-snug ${dark ? "text-white" : "text-darkblue"}`}>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {workEntries.map((entry, i) => {
          const dark = isDark(entry.cardBg);
          return (
            <motion.button
              key={entry.name}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              onClick={() => setSelected(entry)}
              className="rounded-xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-l-4 hover:border-l-terracotta border-l-4 border-l-transparent transition-all duration-200 cursor-pointer overflow-hidden flex flex-col"
              style={{ backgroundColor: entry.cardBg || "#ffffff" }}
            >
              {/* Logo area */}
              <div className="flex-1 flex items-center justify-center p-5 min-h-[130px]">
                <LogoWithFallback src={entry.logo} alt={entry.name} dark={dark} imageClassName={entry.name === "Jeeves" ? "object-contain max-h-36 w-auto" : "object-contain max-h-20 w-auto"} />
              </div>
              {/* Company name */}
              <div className="px-3 py-3 text-center">
                <p className={`text-xs font-semibold tracking-wide uppercase ${dark ? "text-white" : "text-darkblue"}`}>
                  {entry.name}
                </p>
                {entry.type === "studentOrg" && (
                  <p className={`text-[10px] mt-0.5 ${dark ? "text-white/50" : "text-brown-light/60"}`}>
                    Student Org
                  </p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-8">
        <CurrentlyWorkingOn />
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="bg-darkblue -mx-6 -mt-6 px-6 py-4 rounded-t-xl mb-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 flex items-center justify-center">
                  <LogoWithFallback src={selected.logo} alt={selected.name} dark />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{selected.name}</h3>
                  <p className="text-sm text-white/70">{selected.role}</p>
                </div>
              </div>
            </div>
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
