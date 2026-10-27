// The four sites the chooser at / links to. Website, Portfolio, and a
// read-only view of the Lab live in this app; Workflow will be a separate
// deployment on its own subdomain.
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
    href: "https://workflow.armaankazi.com",
    note: "Coming soon",
    external: true,
    building: true,
  },
];
