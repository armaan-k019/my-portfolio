import { projects } from "../../../content/projects";
import { workEntries } from "../../../content/work";
import { demoCards } from "../../../content/demos";
import { sites } from "../../../content/sites";
import { getBlogPosts, getResearchEntries } from "@/lib/mdx";

// Everything the site guide is allowed to know, assembled from the same
// content modules the pages render. The guide answers only from this text, so
// a fact that is not on the site is not in its answers.

export interface GuideLink {
  href: string;
  label: string;
}

// Contact details as the Footer and ContactSection show them.
const CONTACT_LINKS: GuideLink[] = [
  { href: "mailto:archarmaan@gmail.com", label: "Email Armaan" },
  { href: "https://www.linkedin.com/in/kaziarmaan/", label: "LinkedIn" },
  { href: "https://github.com/armaan-k019", label: "GitHub" },
  { href: "https://www.instagram.com/armaankazi019/", label: "Instagram" },
  { href: "/home#contact", label: "Contact form" },
];

const PAGE_LINKS: GuideLink[] = [
  { href: "/", label: "All sites" },
  { href: "/home", label: "Website home" },
  { href: "/home#work", label: "Experience" },
  { href: "/home#projects", label: "Projects" },
  { href: "/home#research", label: "Publications" },
  { href: "/about", label: "About" },
  { href: "/demos", label: "Demos" },
  { href: "/journal", label: "Journal" },
];

// How the guide itself was made. Kept here because no content module covers it.
const GUIDE_SELF = [
  "The guide is two small green birds, Huginn (thought) and Muninn (memory), named after Odin's two ravens in Norse myth, the same pair that names Armaan's research lab.",
  "They started as the scheduler bot in that lab, a multi-agent research lab over academic papers. Each is drawn procedurally in Three.js (no model files): a lathe-turned body, a white belly panel, flippers, feet, and an antenna, animated with squash and stretch.",
  "Their answers come from Claude on the server, given only the content of this website.",
].join(" ");

function projectHref(p: (typeof projects)[number]): string {
  return p.link ?? `/projects/${p.slug}`;
}

export function guideLinks(): GuideLink[] {
  const links: GuideLink[] = [...CONTACT_LINKS, ...PAGE_LINKS];
  for (const p of projects) links.push({ href: projectHref(p), label: p.title });
  for (const d of demoCards) links.push({ href: d.url, label: `${d.company} demo` });
  for (const r of getResearchEntries()) links.push({ href: `/research/${r.slug}`, label: r.title });
  for (const b of getBlogPosts()) links.push({ href: `/blog/${b.slug}`, label: b.title });
  for (const s of sites) {
    if (!s.building) links.push({ href: s.href, label: s.name });
  }
  return links;
}

export function guideContext(): string {
  const parts: string[] = [];

  parts.push(
    "## About Armaan",
    "Armaan Kazi is a student at Georgia Tech (class of '27), double majoring in Computer Science and Architecture with a certificate in Sustainable Architecture.",
    "The About page (/about) has his sketchbook and favorites (watches, reads, listens, teams, architects, destinations).",
  );

  parts.push(
    "## Contact",
    "Email: archarmaan@gmail.com. LinkedIn: https://www.linkedin.com/in/kaziarmaan/. GitHub: https://github.com/armaan-k019. Instagram: https://www.instagram.com/armaankazi019/.",
    "There is also a contact section with a feedback form at /home#contact. For an introduction to someone Armaan has worked with, reach out to him and he will make the introduction.",
  );

  parts.push("## Sites");
  for (const s of sites) {
    parts.push(`- ${s.name} (${s.building ? "coming soon" : s.href}): ${s.blurb}`);
  }

  parts.push("## Projects (listed at /home#projects)");
  for (const p of projects) {
    parts.push(`- ${p.title} [${projectHref(p)}]: ${p.description} Built with: ${p.stack.join(", ")}.`);
  }

  parts.push("## Demos (listed at /demos)");
  for (const d of demoCards) {
    parts.push(`- ${d.company}: ${d.headline} [${d.url}]. ${d.pitch}`);
  }

  parts.push("## Publications and research (listed at /home#research)");
  for (const r of getResearchEntries()) {
    const bits = [r.venue, r.status, r.authors ? `Authors: ${r.authors}` : null].filter(Boolean).join("; ");
    parts.push(`- ${r.title} [/research/${r.slug}] (${bits}): ${r.abstract}`);
  }

  parts.push("## Experience (listed at /home#work)");
  for (const w of workEntries) {
    const role = [w.role, w.dates].filter(Boolean).join(", ");
    parts.push(`- ${w.name}${role ? ` (${role})` : ""}${w.type ? ` [${w.type}]` : ""}`);
  }

  parts.push("## Journal posts");
  for (const b of getBlogPosts()) {
    parts.push(`- ${b.title} [/blog/${b.slug}] (${b.date}): ${b.excerpt}`);
  }

  parts.push("## The guide itself", GUIDE_SELF);

  return parts.join("\n");
}
