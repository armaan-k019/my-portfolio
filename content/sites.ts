// The four sites the chooser at / links to. Website and Portfolio live in this
// app; Lab and Workflow are separate deployments on their own subdomains.
export interface Site {
  index: string;
  name: string;
  blurb: string;
  href: string;
  // Shown under the blurb: the address, plus a status when it matters.
  note: string;
  external: boolean;
}

export const sites: Site[] = [
  {
    index: "01",
    name: "Website",
    blurb: "Profile, experience, projects, demos, photography, and writing.",
    href: "/home",
    note: "armaankazi.com/home",
    external: false,
  },
  {
    index: "02",
    name: "Portfolio",
    blurb: "Architecture work.",
    href: "/architecture",
    note: "In progress",
    external: false,
  },
  {
    index: "03",
    name: "Lab",
    blurb: "kazi lab, a multi-agent research lab over a corpus of academic papers.",
    href: "https://lab.armaankazi.com",
    note: "lab.armaankazi.com · view only",
    external: true,
  },
  {
    index: "04",
    name: "Workflow",
    blurb: "The Claude Code skills, subagents, and hooks I work with, and the build runs they produced.",
    href: "https://workflow.armaankazi.com",
    note: "workflow.armaankazi.com",
    external: true,
  },
];
