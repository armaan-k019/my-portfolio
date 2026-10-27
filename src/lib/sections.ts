// The four sections the chooser at / leads to, as this app's routes see them.
// Each section gets its own header: its name links to its start, and only the
// Website carries the Experience, Projects, and Journal links.

export interface Section {
  id: "website" | "portfolio" | "lab" | "workflow";
  name: string;
  start: string;
}

export const WEBSITE: Section = { id: "website", name: "Armaan Kazi", start: "/home" };

// Sections other than the website, by route prefix.
const SECTIONS: { prefix: string; section: Section }[] = [
  { prefix: "/architecture", section: { id: "portfolio", name: "Portfolio", start: "/architecture" } },
  { prefix: "/lab", section: { id: "lab", name: "corvid", start: "/lab" } },
  { prefix: "/setup", section: { id: "workflow", name: "Workflow", start: "/setup" } },
];

export function sectionFor(pathname: string): Section {
  const hit = SECTIONS.find((s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`));
  return hit ? hit.section : WEBSITE;
}
