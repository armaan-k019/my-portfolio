"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

interface DemoCard {
  slug: string;
  company: string;
  role: string;
  headline: string;
  pitch: string;
  accentColor: string;
  url: string;
}

const demoCards: DemoCard[] = [
  {
    slug: "rho",
    company: "Rho Technologies",
    role: "Software Engineer",
    headline: "Parametric structural optimization, built from scratch",
    pitch: "A real-time topology optimization dashboard with AI-assisted structural feedback. Deep systems thinking, 3D rendering, and applied ML.",
    accentColor: "#CC4729",
    url: "/demos/rho",
  },
  {
    slug: "athena-hq",
    company: "AthenaHQ",
    role: "GEO · AI Search · Brand Intelligence",
    headline: "GEO Visibility Checker",
    pitch: "Track how your brand appears in AI-generated search responses across industry prompts — and get actionable recommendations to improve your AI search presence.",
    accentColor: "#1a2744",
    url: "/demos/athena-hq",
  },
  {
    slug: "jeeves",
    company: "Jeeves",
    role: "Competitive Intelligence Agent",
    headline: "AI-powered competitive intelligence for fintech sales teams",
    pitch: "Live web scraping via Apify, Claude-powered analysis, persona-aware reporting (Sales / Product / Executive), and objection handling.",
    accentColor: "#C9A84C",
    url: "/demos/jeeves",
  },
  {
    slug: "weave",
    company: "Weave",
    role: "Healthcare SaaS · Patient Engagement",
    headline: "No-Show Recovery Sequencer",
    pitch: "Generate a complete multi-touch patient recovery sequence — actual SMS and email copy for every touchpoint before and after a missed appointment.",
    accentColor: "#00B5A3",
    url: "/demos/weave",
  },
  {
    slug: "whop",
    company: "Whop",
    role: "Creator Economy · Conversion · AI Critique",
    headline: "Page Roaster",
    pitch: "Paste your Whop product page and get a brutally honest AI critique of your copy, pricing, conversion strategy, and affiliate setup — with specific rewrites.",
    accentColor: "#7c3aed",
    url: "/demos/whop",
  },
  {
    slug: "harper",
    company: "Harper Insurance",
    role: "Insurtech · Commercial Lines · AI Underwriting",
    headline: "Business Coverage Profiler",
    pitch: "Enter your business profile and get a structured commercial insurance recommendation — coverage lines, priority tiers, premium estimates, and gap analysis.",
    accentColor: "#0f1f3d",
    url: "/demos/harper",
  },
  {
    slug: "sideshift",
    company: "SideShift.ai",
    role: "Crypto · Swap Routing · DeFi",
    headline: "Swap Route Optimizer",
    pitch: "Find the optimal multi-hop route for any crypto swap — minimizing fees, confirmation time, and slippage across 200+ assets.",
    accentColor: "#f97316",
    url: "/demos/sideshift",
  },
  {
    slug: "wisprflow",
    company: "Wispr Flow",
    role: "Concept Integration Demo",
    headline: "Making voice dictation accessible to deaf & hard-of-hearing users",
    pitch: "TensorFlow.js hand-pose CV recognizes ASL signs from a webcam, converts them to words, and feeds that text stream into Wispr Flow — no microphone needed.",
    accentColor: "#6C47FF",
    url: "/demos/wisprflow",
  },
];

export default function DemosPage() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-10 inline-block"
        >
          &larr; Back to portfolio
        </Link>

        <h1 className="text-2xl font-semibold text-darkblue mb-3">Demos</h1>
        <p className="text-sm text-brown-light leading-relaxed max-w-2xl mb-10">
          Each of these was built specifically for a company I was interested in working with — tailored to the role, the team, and what I think they actually care about. The goal isn&apos;t just to show that I can code. It&apos;s to show how I think about problems and what I&apos;d contribute from day one.
        </p>

        <div className="grid md:grid-cols-2 gap-5">
          <AnimatePresence mode="popLayout">
            {demoCards.map((demo, i) => (
              <motion.div
                key={demo.slug}
                layout
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: "easeOut" }}
                onMouseEnter={() => setHovered(demo.slug)}
                onMouseLeave={() => setHovered(null)}
              >
                <Link href={demo.url} className="block h-full">
                  <div
                    className="bg-white rounded-xl p-5 shadow-sm hover:shadow-md border-l-4 hover:-translate-y-1 transition-all duration-200 h-full"
                    style={{
                      borderLeftColor: hovered === demo.slug ? demo.accentColor : "transparent",
                      backgroundColor: hovered === demo.slug ? demo.accentColor + "06" : "white",
                    }}
                  >
                    <div className="flex items-start justify-between mb-1 gap-2">
                      <h3 className="font-medium text-brown">{demo.company}</h3>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0"
                        style={{
                          color: demo.accentColor,
                          borderColor: demo.accentColor + "50",
                          backgroundColor: demo.accentColor + "12",
                        }}
                      >
                        {demo.role.split(" · ")[0]}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-brown-light mb-2">{demo.headline}</p>
                    <p className="text-xs text-brown-light/70 line-clamp-2 leading-relaxed">{demo.pitch}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
