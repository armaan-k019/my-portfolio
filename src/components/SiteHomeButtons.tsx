"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The two home buttons every page carries: one back to the chooser at /, one
// to the start of the section the page belongs to. The lab (kazi_lab) draws
// the same pair, so the four sections read as one site.

interface Section {
  name: string;
  start: string;
}

const WEBSITE: Section = { name: "Website", start: "/home" };

// Sections other than the website that live in this app, by route prefix.
const SECTIONS: { prefix: string; section: Section }[] = [
  { prefix: "/architecture", section: { name: "Portfolio", start: "/architecture" } },
  { prefix: "/setup", section: { name: "Workflow", start: "/setup" } },
];

export function sectionFor(pathname: string): Section {
  const hit = SECTIONS.find((s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`));
  return hit ? hit.section : WEBSITE;
}

const buttonClass =
  "inline-flex h-7 items-center gap-1.5 border border-[var(--color-line)] px-2 sm:px-2.5 font-mono text-[11px] uppercase tracking-[0.06em] sm:tracking-[0.1em] text-brown-light transition-colors hover:text-terracotta hover:border-terracotta/40";

export default function SiteHomeButtons({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const atStart = pathname === section.start;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Link
        href="/"
        aria-label="All sites"
        title="Back to the four sites"
        className={buttonClass}
      >
        <GridIcon />
        <span className="sm:hidden">Sites</span>
        <span className="hidden sm:inline">All sites</span>
      </Link>
      <Link
        href={section.start}
        aria-label={`${section.name} home`}
        title={`Back to the start of ${section.name}`}
        onClick={() => {
          // Already on the start page: go back to its top.
          if (atStart) window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className={buttonClass}
      >
        <HouseIcon />
        <span>{section.name}</span>
      </Link>
    </div>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.2}>
      <rect x="1" y="1" width="4" height="4" />
      <rect x="7" y="1" width="4" height="4" />
      <rect x="1" y="7" width="4" height="4" />
      <rect x="7" y="7" width="4" height="4" />
    </svg>
  );
}

function HouseIcon() {
  return (
    <svg aria-hidden className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round">
      <path d="M1.5 5.5 6 1.5l4.5 4V10.5h-3v-3h-3v3h-3z" />
    </svg>
  );
}
