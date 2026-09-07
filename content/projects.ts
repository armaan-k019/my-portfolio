export type Category = "cs" | "architecture" | "intersection";

export interface Project {
  slug: string;
  title: string;
  description: string;
  blurb: string;
  stack: string[];
  category: Category;
  status?: "In Progress" | "Coming Soon";
  link?: string;
  github?: string;
}

export const projects: Project[] = [
  {
    slug: "archipedia",
    title: "Archipedia",
    category: "intersection",
    blurb: "A multi-modal architectural precedent retrieval tool.",
    description: "Archipedia is a real-time architectural precedent search tool that combines patch-level visual embeddings, LLM-expanded metadata, and climate cues to surface nuanced design relationships beyond simple visual similarity. Built on a dataset of 9,800+ ArchDaily images, it enables designers to steer retrieval across visual, contextual, and geographic dimensions through an interactive interface.",
    stack: ["DINOv2", "Python", "Next.js", "LLM", "ArchDaily API"],
    link: "https://archipedia.ai",
  },
  {
    slug: "urban-gpt",
    title: "UrbanGPT",
    category: "intersection",
    blurb: "Site intelligence for architects: demographic and urban data at your fingertips.",
    description: "UrbanGPT pulls demographic, economic, and spatial data for any architecture site and surfaces design-relevant insights automatically. Enter an address and receive median income, household composition, density, transit access, and AI-generated design implications to guide early-stage decisions.",
    stack: ["Next.js", "Census API", "OpenStreetMap", "Claude API"],
    github: "https://github.com/armaan-k019/urban-gpt",
  },
];
