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
    slug: "edo-commons",
    title: "Guest People",
    category: "architecture",
    blurb: "Precedent analysis in masonry construction through the lens of the Hakka Indenture Museum.",
    description: "A precedent study examining masonry as a structural and cultural medium, centered on the Hakka Indenture Museum. The analysis traces how load-bearing masonry encodes collective memory and communal identity, drawing connections between material honesty and the histories of displaced and indentured peoples.",
    stack: [],
  },
  {
    slug: "intersecting-realms",
    title: "Intersecting Realms",
    category: "architecture",
    blurb: "An architectural exploration of overlapping spatial and cultural boundaries.",
    description: "An architectural project exploring the intersection of distinct spatial and cultural realms, examining how boundaries between different modes of inhabitation can become generative design opportunities.",
    stack: [],
  },
  {
    slug: "framed",
    title: "Framed",
    category: "architecture",
    blurb: "Art within art: a gallery on Sweet Auburn Avenue, Atlanta.",
    description: "A proposed gallery space on Sweet Auburn Avenue designed to engage with Atlanta's historic cultural corridor. The concept of art framing art drives the design, where the building itself becomes a curated experience, holding memory while inviting new community.",
    stack: [],
    status: "In Progress",
  },
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
  {
    slug: "acoustic-form",
    title: "Acoustic Form",
    category: "intersection",
    blurb: "A 3D acoustic simulation tool for architectural shapes.",
    description: "A browser-based tool that lets architects define a closed 3D shape by inputting vertices or describing it in natural language, then visualizes how sound waves propagate within that volume. Designed to give architects an intuitive, early-stage read on the acoustic behavior of a space before detailed modeling.",
    stack: ["Three.js", "Next.js", "Claude API"],
    github: "https://github.com/armaan-k019/acoustic-form",
  },
  {
    slug: "pulse",
    title: "Pulse",
    category: "cs",
    blurb: "A live data portrait of Georgia Tech's campus.",
    description: "A live data portrait of Georgia Tech's campus: bus locations, crowd density, dining wait times, and an AI assistant that helps you navigate your day.",
    stack: ["Next.js", "Google Maps", "TransLoc API", "Claude API"],
    github: "https://github.com/armaan-k019/pulse-gt",
  },
  {
    slug: "carbon-lens",
    title: "Carbon Lens",
    category: "cs",
    blurb: "Embodied carbon estimator for early-stage architectural design decisions.",
    description: "A material embodied carbon calculator for architects. Input material quantities and receive an embodied carbon estimate benchmarked against industry standards, a visual breakdown by material category, and AI-generated substitution recommendations to reduce the building's climate impact.",
    stack: ["Next.js", "Claude API", "ICE Database v3.0"],
    github: "https://github.com/armaan-k019/carbon-lens",
  },
];
