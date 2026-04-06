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
  // ── Rho Technologies - parametric architecture PoC ──────────────────────────
  "rho": {
    company: "Rho Technologies",
    role: "Software Engineer",
    accentColor: "#CC4729",
    headline: "Parametric structural optimization, built from scratch",
    pitch: "Rho Parametric Architect is a real-time topology optimization dashboard with AI-assisted structural feedback. It demonstrates deep systems thinking, 3D rendering, and applied ML - the kind of full-stack technical depth I'd bring to Rho.",
    sections: [],
    url: "/demos/rho",
  },

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

  // ── Jeeves Competitive Intelligence Agent - AI-powered competitor research ──
  "jeeves#$": {
    company: "Jeeves",
    role: "Competitive Intelligence Agent",
    accentColor: "#C9A84C",
    headline: "AI-powered competitive intelligence for fintech sales teams",
    pitch: "Jeeves Intel is a full competitive intelligence agent - live web scraping via Apify, Claude-powered analysis, persona-aware reporting (Sales / Product / Executive), and objection handling. Built on the original open-source Jeeves agent, migrated from OpenAI to Anthropic.",
    sections: [],
    url: "/demos/jeeves",
  },

  // ── Wispr Flow - ASL pipeline concept demo ──────────────────────────────────
  "wisprflow": {
    company: "Wispr Flow",
    role: "Concept Integration Demo",
    accentColor: "#6C47FF",
    headline: "Making voice dictation accessible to deaf & hard-of-hearing users",
    pitch: "A concept bridge: TensorFlow.js hand-pose CV recognizes ASL signs from a webcam, converts them to words, and feeds that text stream into Wispr Flow - no microphone, no cloud ASR, no specialized hardware.",
    sections: [],
    url: "/demos/wisprflow",
  },

  // ── Corgi Insurance - AI Model Risk Monitor ────────────────────────────────
  "corgi": {
    company: "Corgi Insurance",
    role: "Insurtech · AI Liability · Model Risk",
    accentColor: "#d97706",
    headline: "AI Model Risk Monitor",
    pitch: "Detect model drift in your AI systems and automatically assess how it impacts your liability risk exposure — powered by clustering and Claude.",
    sections: [],
    url: "/demos/corgi",
  },

  // ── AthenaHQ - GEO Visibility Checker ──────────────────────────────────────
  "athena-hq": {
    company: "AthenaHQ",
    role: "GEO · AI Search · Brand Intelligence",
    accentColor: "#1a2744",
    headline: "GEO Visibility Checker",
    pitch: "Track how your brand appears in AI-generated search responses across industry prompts — and get actionable recommendations to improve your AI search presence.",
    sections: [],
    url: "/demos/athena-hq",
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
