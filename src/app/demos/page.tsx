"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { demos, type DemoConfig } from "@/lib/demos";

interface DemoCard {
  slug: string;
  company: string;
  headline: string;
  pitch: string;
  url: string;
}

const demoCards: DemoCard[] = [
  {
    slug: "world-labs",
    company: "World Labs",
    headline: "Ekphrasis: words to walkable worlds",
    pitch: "Pick a passage, get a spatial DNA reading, and see a 3D world generated from that reading with every major choice annotated.",
    url: "/demos/world-labs",
  },
  {
    slug: "illoca",
    company: "Illoca",
    headline: "The Precedent Interpreter",
    pitch: "Describe a project and get three precedent buildings, what to steal from each, and a first bubble diagram to start from.",
    url: "/demos/illoca",
  },
  {
    slug: "rho",
    company: "Rho",
    headline: "Drift Detection + Candidate Trajectory",
    pitch: "Two builds for Rho: spend anomaly detection for finance teams, and a hiring lens that plots candidates by trajectory and audits their claims against corroborating evidence.",
    url: "/demos/rho",
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
          className={`flex-1 px-3 py-2 text-sm rounded-lg border bg-white text-brown placeholder:text-brown-light/40 transition-colors ${
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
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="font-display display-lg font-semibold text-ink mb-4">Demos</h1>
        <p className="text-sm text-brown-light leading-relaxed max-w-xl mb-2">
          Company-specific projects, each built around one problem I wanted to dig into.
        </p>
        <div className="tick-rule mb-10 mt-6" />

        <ul style={{ borderTop: "var(--rule)" }}>
          {demoCards.map((demo) => (
            <li
              key={demo.slug}
              style={{ borderBottom: "var(--rule)" }}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_1fr] gap-x-6 gap-y-1 py-5 items-baseline"
            >
              <Link
                href={demo.url}
                className="font-display text-lg font-semibold text-ink hover:text-terracotta transition-colors"
              >
                {demo.company}
              </Link>
              <div>
                <p className="text-sm text-ink">{demo.headline}</p>
                <p className="text-sm text-brown-light leading-relaxed mt-1">{demo.pitch}</p>
                {demo.slug === "rho" && <p className="meta mt-2">This Demo Worked!</p>}
              </div>
            </li>
          ))}
        </ul>

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
