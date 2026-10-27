import Link from "next/link";

// Back to the chooser at /, the first thing in every section's header. The
// lab (kazi_lab) draws the same link, so the four sections read as one site.
export default function AllSitesLink() {
  return (
    <Link
      href="/"
      aria-label="All sites"
      title="Back to the four sites"
      className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-brown-light transition-colors hover:text-terracotta"
    >
      <GridIcon />
      <span className="hidden sm:inline">All sites</span>
    </Link>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.1}>
      <rect x="1" y="1" width="4" height="4" />
      <rect x="7" y="1" width="4" height="4" />
      <rect x="1" y="7" width="4" height="4" />
      <rect x="7" y="7" width="4" height="4" />
    </svg>
  );
}
