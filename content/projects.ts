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
}

export const projects: Project[] = [
  {
    slug: "edo-commons",
    title: "Edo",
    category: "architecture",
    blurb: "Adaptive reuse of the Quarry Yards in Atlanta, inspired by the Edo period of Japan.",
    description: "A proposal for the adaptive reuse of the Quarry Yards site in Atlanta, inspired by the communal and ecological principles of Japan's Edo period. The project reimagines an underutilized industrial landscape as a mixed-use commons rooted in community ownership, ecological restoration, and shared infrastructure.",
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
  },
  {
    slug: "acoustic-form",
    title: "Acoustic Form",
    category: "intersection",
    blurb: "A 3D acoustic simulation tool for architectural shapes.",
    description: "A browser-based tool that lets architects define a closed 3D shape by inputting vertices or describing it in natural language, then visualizes how sound waves propagate within that volume. Designed to give architects an intuitive, early-stage read on the acoustic behavior of a space before detailed modeling.",
    stack: ["Three.js", "Next.js", "Claude API"],
  },
  {
    slug: "yield",
    title: "Yield",
    category: "cs",
    blurb: "A live report card on your stock portfolio.",
    description: "Input your stock holdings and get a real-time portfolio report card powered by live NYSE data and AI analysis. Grades your diversification, volatility profile, cap size mix, and day performance.",
    stack: ["Next.js", "Polygon.io", "Claude API", "Recharts"],
  },
  {
    slug: "tempo",
    title: "Tempo",
    category: "cs",
    blurb: "A guided visual journey through any song.",
    description: "Search any song and watch a generative visual landscape come alive as it plays. Powered by Spotify's audio features, Tempo maps music into a living, breathing visualization that moves with the song in real time.",
    stack: ["Next.js", "Spotify API", "Three.js"],
  },
  {
    slug: "fine-print",
    title: "Fine Print",
    category: "cs",
    blurb: "Paste any rule set or document and find every loophole in it.",
    description: "An AI-powered tool that analyzes any rule-based text (game rules, contracts, legal documents, terms of service) and systematically identifies ambiguities, edge cases, and exploitable gaps. Part practical tool, part creative exercise in adversarial thinking.",
    stack: ["Next.js", "Claude API"],
  },
];
