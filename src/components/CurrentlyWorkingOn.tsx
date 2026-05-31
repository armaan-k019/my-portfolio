"use client";

import { useState } from "react";
import Modal from "./Modal";

const wipProjects = [
  {
    title: "Climate-Responsive Architecture from Indigenous Materials",
    description: "An investigation into vernacular building systems in Africa that use locally sourced, indigenous materials to achieve climate responsiveness without mechanical systems. Grounded in the idea that the most sustainable architecture is often the oldest.",
    status: "In Progress",
    statusColor: "bg-sage/20 text-sage border-sage/30",
  },
];

export default function CurrentlyWorkingOn() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-terracotta rounded-2xl px-7 py-5 mb-8 flex items-center justify-between gap-4 shadow-md hover:shadow-xl hover:-translate-y-0.5 hover:bg-terracotta-dark transition-all duration-200 cursor-pointer group ring-1 ring-terracotta/30 hover:ring-terracotta/60"
      >
        <div className="flex items-center gap-4">
          {/* Pulse dot */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tan opacity-90" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-tan" />
          </span>
          <div className="text-left">
            <span className="block text-base md:text-lg font-semibold text-white leading-tight">Currently Working On</span>
            <span className="block text-xs text-white/70 mt-0.5 sm:hidden">Tap to view</span>
            <span className="hidden sm:block text-xs text-white/75 mt-0.5">
              Climate-responsive architecture from indigenous materials.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-xs font-medium text-white/85 group-hover:text-white transition-colors">
            View details
          </span>
          <svg className="w-5 h-5 text-white/80 group-hover:text-white group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div>
          <div className="bg-terracotta -mx-6 -mt-6 px-6 py-4 rounded-t-xl mb-5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tan opacity-90" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tan" />
              </span>
              <h3 className="text-lg font-semibold text-white">Currently Working On</h3>
            </div>
          </div>
          <div className="space-y-5">
            {wipProjects.map((project) => (
              <div key={project.title}>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-terracotta truncate min-w-0">{project.title}</h4>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${project.statusColor}`}>
                    {project.status}
                  </span>
                </div>
                <p className="text-sm text-brown-light leading-relaxed">{project.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
