// The four sites the chooser at / links to. All four live in this app:
// Website, Portfolio, Workflow (the read-only ark-console snapshot at /setup),
// and Lab (the read-only corvid snapshot at /lab).
// While a site is being built, its tile is not a link: clicking it says so.
export interface Site {
  index: string;
  name: string;
  blurb: string;
  href: string;
  // Shown under the blurb: the address, plus a status when it matters.
  note: string;
  external: boolean;
  building: boolean;
}

export const sites: Site[] = [
  {
    index: "01",
    name: "Website",
    blurb: "Profile, experience, projects, demos, photography, and writing.",
    href: "/home",
    note: "armaankazi.com/home",
    external: false,
    building: false,
  },
  {
    index: "02",
    name: "Portfolio",
    blurb: "Architecture work.",
    href: "/architecture",
    note: "Coming soon",
    external: false,
    building: true,
  },
  {
    index: "03",
    name: "Lab",
    blurb: "corvid, a multi-agent research lab over a corpus of academic papers.",
    href: "/lab",
    note: "armaankazi.com/lab",
    external: false,
    building: false,
  },
  {
    index: "04",
    name: "Workflow",
    blurb: "The Claude Code skills, subagents, and hooks I work with, and the build runs they produced.",
    href: "/setup",
    note: "armaankazi.com/setup",
    external: false,
    building: false,
  },
];
