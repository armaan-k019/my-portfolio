// Passwords are stored client-side and are not cryptographically secure.
// This is intentional - this is a portfolio demo system, not a security-critical application.
// Do not store sensitive information in demo pages.

export interface DemoSection {
  type: 'text' | 'embed';
  title: string;
  content?: string;       // for type: "text"
  projectSlug?: string;   // for type: "embed" - matches /projects/[slug]
}

export interface DemoConfig {
  company: string;
  role: string;
  accentColor: string;
  logo?: string;
  headline: string;
  pitch: string;
  sections: DemoSection[];
  url?: string; // if set, redirect here after auth instead of rendering DemoView
}

export const demos: Record<string, DemoConfig> = {
  // ── Mayo Dental Family Dentistry - website redesign client deliverable ──────
  "mayodentalkeer": {
    company: "Mayo Dental Family Dentistry",
    role: "Web Design Client",
    accentColor: "#2B7A78",
    headline: "Website redesign for a real dental practice",
    pitch: "A full website redesign for Mayo Dental Family Dentistry - a real client deliverable, not a concept.",
    sections: [],
    url: "/demos/mayo-dental",
  },

  // ── Midjourney — prompt autopsy + 3D parallax viewer ──────────────────────
  "midjourney": {
    company: "Midjourney",
    role: "Prompt Research",
    accentColor: "#FF3366",
    headline: "Prompt Autopsy + 3D Parallax",
    pitch: "Paste any Midjourney prompt and image URL. Get a full token-by-token autopsy showing which words drove which visual choices, a reusable style DNA block, and a live 3D parallax scene reconstructed from your image.",
    sections: [],
    url: "/demos/midjourney",
  },

  // ── Erebor — de-banking risk scorer ──────────────────────────────────────
  "erebor": {
    company: "Erebor",
    role: "Banking · Crypto · Risk Assessment",
    accentColor: "#c9a84c",
    headline: "De-banking Risk Scorer",
    pitch: "Find out how likely your company is to lose banking access and which services are most at risk. Built for crypto, AI, defense, and innovation-economy companies.",
    sections: [],
    url: "/demos/erebor",
  },

  // ── Example entry - test the full flow at /demos with password "demo123" ──
  "demo123": {
    company: "Acme Corp",
    role: "Software Engineer",
    accentColor: "#FF6B35",
    headline: "What I built for you",
    pitch: "Fine Print is an AI-powered document analysis tool that surfaces hidden loopholes and ambiguous clauses in any document. It demonstrates my ability to build end-to-end AI products with clean UX, exactly the kind of work I'd bring to Acme.",
    sections: [
      {
        type: "text",
        title: "The Problem",
        content: "Legal documents, contracts, and dense policy text are full of exploitable gaps that most people never notice. Reading the fine print carefully takes hours and most people don't bother.",
      },
      {
        type: "text",
        title: "My Solution",
        content: "Fine Print uses Claude to instantly surface genuine loopholes, ambiguities, and exploitable clauses in any uploaded document. Upload a PDF or paste text and get a structured breakdown in seconds.",
      },
      {
        type: "embed",
        title: "Live Demo",
        projectSlug: "fine-print",
      },
      {
        type: "text",
        title: "Why I'd Be a Great Fit",
        content: "I built this end-to-end, from the document parsing pipeline to the Claude API integration to the UI. I'm comfortable owning full product slices and shipping fast without sacrificing quality.",
      },
    ],
  },
};
