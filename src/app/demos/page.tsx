"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { demos, type DemoConfig } from "@/lib/demos";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

interface DemoCard {
  slug: string;
  company: string;
  headline: string;
  pitch: string;
  url: string;
}

const ACCENT = "#2d5a27";

const demoCards: DemoCard[] = [
  {
    slug: "rho",
    company: "Rho",
    headline: "Drift Detection",
    pitch: "Spend anomaly detection for finance teams.",
    url: "/demos/rho",
  },
  {
    slug: "athena-hq",
    company: "AthenaHQ",
    headline: "GEO Visibility Checker",
    pitch: "Track how your brand appears in AI-generated search responses across industry prompts and get actionable recommendations to improve your AI search presence.",
    url: "/demos/athena-hq",
  },
  {
    slug: "whop",
    company: "Whop",
    headline: "Page Roaster",
    pitch: "Paste your Whop product page and get a brutally honest AI critique of your copy, pricing, conversion strategy, and affiliate setup, with specific rewrites.",
    url: "/demos/whop",
  },
  {
    slug: "sideshift",
    company: "SideShift.ai",
    headline: "Swap Route Optimizer",
    pitch: "Find the optimal multi-hop route for any crypto swap, minimizing fees, confirmation time, and slippage across 200+ assets.",
    url: "/demos/sideshift",
  },
  {
    slug: "wisprflow",
    company: "Wispr Flow",
    headline: "ASL sign language to voice dictation",
    pitch: "TensorFlow.js hand-pose CV recognizes ASL signs from a webcam, converts them to words, and feeds that text stream into Wispr Flow with no microphone needed.",
    url: "/demos/wisprflow",
  },
  {
    slug: "midjourney",
    company: "Midjourney",
    headline: "Prompt Autopsy + 3D Parallax",
    pitch: "Paste any Midjourney prompt and image URL. Get a full token-by-token autopsy, a reusable style DNA block, and a live 3D parallax scene reconstructed from your image.",
    url: "/demos/midjourney",
  },
];

// ─── Password section ────────────────────────────────────────────────────────

function PrivateSection() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShake] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    const normalized = trimmed.toLowerCase();

    if (normalized === "mayodental") {
      sessionStorage.setItem("demo_access", "mayo dental keer");
      router.push("/demos/mayo-dental");
      return;
    }

    const config: DemoConfig | undefined = demos[trimmed] ?? demos[normalized];
    if (config?.url) {
      sessionStorage.setItem("demo_access", trimmed);
      router.push(config.url);
      return;
    }

    setError(true);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  return (
    <div className="mt-16 pt-10 border-t border-tan/30">
      <p className="text-xs font-medium text-brown-light mb-4">Have an access code?</p>
      <form onSubmit={handleSubmit} className={`flex gap-2 max-w-xs ${shaking ? "animate-[shake_0.4s_ease]" : ""}`}>
        <input
          type="password"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(false); }}
          placeholder="Enter access code"
          className={`flex-1 px-3 py-2 text-sm rounded-lg border bg-white text-brown placeholder:text-brown-light/40 focus:outline-none transition-colors ${
            error ? "border-red-300 focus:border-red-400" : "border-tan/50 focus:border-terracotta"
          }`}
        />
        <button
          type="submit"
          disabled={code.trim().length === 0}
          className="px-4 py-2 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Go
        </button>
      </form>
      {error && <p className="mt-1.5 text-xs text-red-500">Invalid access code.</p>}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DemosPage() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Link
          href="/"
          className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-10 inline-block"
        >
          &larr; Back to portfolio
        </Link>

        <h1 className="text-2xl font-semibold text-darkblue mb-3">Demos</h1>
        <p className="text-sm text-brown-light leading-relaxed max-w-xl mb-10">
          Company-specific projects, each built around one problem I wanted to dig into.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
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
                      borderLeftColor: hovered === demo.slug ? ACCENT : "transparent",
                      backgroundColor: hovered === demo.slug ? ACCENT + "0d" : "white",
                    }}
                  >
                    <h3 className="font-medium text-brown mb-1">{demo.company}</h3>
                    <p className="text-xs text-brown-light leading-relaxed">{demo.headline}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <PrivateSection />

        <p className="mt-8 text-xs text-brown-light/50">
          Additional demos available on{" "}
          <a
            href="https://github.com/armaan-k019"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brown-light transition-colors"
          >
            GitHub &rarr;
          </a>
        </p>
      </div>
    </div>
  );
}
