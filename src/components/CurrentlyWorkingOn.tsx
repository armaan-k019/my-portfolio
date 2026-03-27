"use client";

import { useState } from "react";
import Modal from "./Modal";

const wipProjects = [
  {
    title: "Art Gallery on Sweet Auburn, Atlanta",
    description: "A proposed gallery space on Sweet Auburn Avenue designed to engage with Atlanta's historic cultural corridor. The project explores how architecture can serve as both archive and activation, holding memory while inviting new community.",
    status: "In Progress",
    statusColor: "bg-sage/20 text-sage border-sage/30",
  },
  {
    title: "Pavilion from Campus Waste: Campus Waste to Civic Architecture",
    description: "A pavilion designed and fabricated entirely from materials recovered from Georgia Tech's waste stream. The project asks what civic infrastructure might look like if it began not with a budget, but with what already exists.",
    status: "In Progress",
    statusColor: "bg-darkblue/20 text-darkblue border-darkblue/30",
  },
  {
    title: "Climate-Responsive Architecture from Indigenous Materials",
    description: "An investigation into vernacular building systems in Africa that use locally sourced, indigenous materials to achieve climate responsiveness without mechanical systems. Grounded in the idea that the most sustainable architecture is often the oldest.",
    status: "In Progress",
    statusColor: "bg-sage/20 text-sage border-sage/30",
  },
  {
    title: "Computer Vision Sign Language Video-to-Audio Translator",
    description: "A computer vision pipeline that interprets American Sign Language from video input and synthesizes spoken audio output in real time. Aimed at reducing communication barriers in everyday environments without requiring specialized hardware.",
    status: "In Progress",
    statusColor: "bg-terracotta/20 text-terracotta border-terracotta/30",
  },
];

export default function CurrentlyWorkingOn() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-darkblue rounded-xl px-5 py-3.5 mb-8 flex items-center justify-between gap-4 hover:brightness-110 transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-3">
          {/* Pulse dot */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terracotta opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-terracotta" />
          </span>
          <span className="text-sm font-semibold text-white">Currently Working On</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/60 hidden sm:inline">
            A gallery on Sweet Auburn, a pavilion from waste.
          </span>
          <svg className="w-4 h-4 text-white/50 group-hover:text-white/80 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div>
          <div className="bg-darkblue -mx-6 -mt-6 px-6 py-4 rounded-t-xl mb-5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terracotta opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-terracotta" />
              </span>
              <h3 className="text-lg font-semibold text-white">Currently Working On</h3>
            </div>
          </div>
          <div className="space-y-5">
            {wipProjects.map((project) => (
              <div key={project.title}>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-terracotta">{project.title}</h4>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${project.statusColor}`}>
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
