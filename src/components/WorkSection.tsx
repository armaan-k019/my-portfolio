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

// A role string like "A → B" is a progression; split it into its steps.
const steps = (role: string) => role.split("→").map((t) => t.trim());

const columns = [
  { title: "Professional", entries: workEntries.filter((e) => !e.type) },
  { title: "Organizations", entries: workEntries.filter((e) => e.type === "studentOrg") },
  { title: "Research", entries: workEntries.filter((e) => e.type === "research") },
];

export default function WorkSection() {
  const [selected, setSelected] = useState<WorkEntry | null>(null);

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-14">
        {columns.map((col) => (
          <section key={col.title}>
            <h2 className="font-display text-xl font-semibold text-ink mb-1">{col.title}</h2>
            <hr className="rule mb-2" />
            <ul className="divide-y divide-line">
              {col.entries.map((entry) => {
                const roles = steps(entry.role);
                return (
                  <li key={entry.name}>
                    <button
                      onClick={() => setSelected(entry)}
                      className="group flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 py-4 text-left"
                    >
                      <span className="font-display text-lg font-semibold text-ink group-hover:text-terracotta transition-colors">
                        {entry.name}
                      </span>
                      {roles.length === 1 ? (
                        <>
                          <span className="text-sm text-brown-light">{entry.role}</span>
                          <span className="meta whitespace-nowrap basis-full">{entry.dates}</span>
                        </>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          {roles.map((r, i) => (
                            <span key={r} className="text-sm text-brown-light" style={{ paddingLeft: `${i}rem` }}>
                              {i > 0 && <span className="text-terracotta mr-1.5">&rarr;</span>}
                              {r}
                            </span>
                          ))}
                          <span className="meta whitespace-nowrap mt-1">{entry.dates}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} titleId="work-modal-title">
        {selected && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 flex items-center justify-center overflow-hidden">
                <LogoWithFallback src={selected.logo} alt={selected.name} imageClassName="object-contain max-h-10 max-w-10 w-auto h-auto" />
              </div>
              <div>
                <h3 id="work-modal-title" className="font-display text-xl font-semibold text-ink">{selected.name}</h3>
                {steps(selected.role).map((r, i) => (
                  <p key={r} className="text-sm text-brown-light" style={{ paddingLeft: `${i}rem` }}>
                    {i > 0 && <span className="text-terracotta mr-1.5">&rarr;</span>}
                    {r}
                  </p>
                ))}
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
            {selected.links && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5">
                {selected.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-terracotta underline underline-offset-4 decoration-1 hover:text-terracotta-dark transition-colors"
                  >
                    {link.label}{" "}&rarr;
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
