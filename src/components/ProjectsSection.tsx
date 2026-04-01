"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import CategoryTag from "./CategoryTag";
import type { Category, Project } from "../../content/projects";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const filters: { label: string; value: Category | "all" }[] = [
  { label: "All", value: "all" },
  { label: "CS", value: "cs" },
  { label: "Architecture", value: "architecture" },
  { label: "CS \u00d7 Architecture", value: "intersection" },
];

function getHoverBorderClass(category: Category) {
  switch (category) {
    case "cs": return "hover:border-l-terracotta hover:bg-terracotta/5";
    case "architecture": return "hover:border-l-sage hover:bg-sage/5";
    case "intersection": return "hover:border-l-darkblue hover:bg-darkblue/5";
  }
}

export default function ProjectsSection({ projects }: { projects: Project[] }) {
  const [activeFilter, setActiveFilter] = useState<Category | "all">("all");

  const filtered = activeFilter === "all"
    ? projects
    : projects.filter((p) => p.category === activeFilter);

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
              activeFilter === f.value
                ? f.value === "cs"
                  ? "bg-terracotta text-white border-terracotta shadow-sm"
                  : f.value === "architecture"
                  ? "bg-sage text-white border-sage shadow-sm"
                  : f.value === "intersection"
                  ? "bg-darkblue text-white border-darkblue shadow-sm"
                  : "bg-brown text-white border-brown shadow-sm"
                : "bg-transparent text-brown-light border-tan/50 hover:border-tan"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-5">
        <AnimatePresence mode="popLayout">
          {filtered.map((project, i) => (
            <motion.div
              key={project.slug}
              layout
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              className="relative h-full"
            >
              <Link href={`/projects/${project.slug}`} className="block h-full">
                <div
                  className={`bg-white rounded-xl p-5 shadow-sm hover:shadow-md border-l-4 border-l-transparent hover:-translate-y-1 transition-all duration-200 h-full ${getHoverBorderClass(project.category)}`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-medium text-brown">{project.title}</h3>
                    <CategoryTag category={project.category} />
                  </div>
                  <p className="text-sm text-brown-light mb-3">{project.blurb}</p>
                  {project.status && (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        project.status === "Coming Soon"
                          ? "bg-tan/20 text-tan border-tan/40"
                          : "bg-sage/20 text-sage border-sage/40"
                      }`}
                    >
                      {project.status}
                    </span>
                  )}
                </div>
              </Link>
              {project.link && (
                <a
                  href={project.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-3 right-3 z-10 w-6 h-6 flex items-center justify-center rounded-md text-brown-light/40 hover:text-terracotta hover:bg-terracotta/10 transition-colors"
                  aria-label={`Visit ${project.title}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
