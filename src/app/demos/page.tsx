"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { demos, type DemoConfig } from "@/lib/demos";

// ─── Password screen ────────────────────────────────────────────────────────

function PasswordScreen({ onUnlock }: { onUnlock: (config: DemoConfig, password: string) => void }) {
  const [code, setCode]     = useState("");
  const [error, setError]   = useState(false);
  const [shaking, setShake] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    const normalized = trimmed.toLowerCase();
    // rho demo
    if (trimmed === "rho") {
      sessionStorage.setItem("demo_access", "rho");
      setError(false);
      onUnlock(demos["rho"]!, trimmed);
      return;
    }
    // mayo dental demo (case-insensitive)
    if (normalized === "mayodental") {
      sessionStorage.setItem("demo_access", "mayo dental keer");
      setError(false);
      onUnlock(demos["mayodentalkeer"]!, trimmed);
      return;
    }
    // jeeves demo
    if (trimmed === "jeeves") {
      sessionStorage.setItem("demo_access", "jeeves#$");
      setError(false);
      onUnlock(demos["jeeves#$"]!, trimmed);
      return;
    }
    // wisprflow demo
    if (trimmed === "wisprflow") {
      sessionStorage.setItem("demo_access", "wisprflow");
      setError(false);
      onUnlock(demos["wisprflow"]!, trimmed);
      return;
    }
    // athena-hq demo
    if (trimmed === "athenaHQ" || normalized === "athenahq") {
      sessionStorage.setItem("demo_access", "athena-hq");
      setError(false);
      onUnlock(demos["athena-hq"]!, trimmed);
      return;
    }
    const config = demos[trimmed];
    if (config) {
      setError(false);
      onUnlock(config, trimmed);
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-xs text-terracotta hover:text-terracotta-dark transition-colors mb-10 inline-block">
          &larr; Back to portfolio
        </Link>

        <h1 className="text-2xl font-semibold text-darkblue mb-3">Demos</h1>
        <div className="space-y-2 mb-8">
          <p className="text-sm text-brown-light leading-relaxed">
            Each page here is built specifically for a company I&apos;m interested in working with, tailored to the role, the team, and what I think they actually care about.
          </p>
          <p className="text-sm text-brown-light leading-relaxed">
            The goal isn&apos;t just to show that I can code. It&apos;s to show how I think about problems, what I choose to build, and how I&apos;d contribute from day one.
          </p>
          <p className="text-sm text-brown-light leading-relaxed">
            If I&apos;m actively building something for you, this is also where you can check in on progress and see where things are at. Feel free to reach out with any questions or concerns as always.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className={shaking ? "animate-[shake_0.4s_ease]" : ""}>
            <label className="block text-xs font-medium text-brown-light mb-1.5">
              Access code
            </label>
            <input
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(false); }}
              placeholder="Enter your access code"
              autoFocus
              className={`w-full px-3 py-2.5 text-sm rounded-lg border bg-white text-brown placeholder:text-brown-light/40 focus:outline-none transition-colors ${
                error ? "border-red-300 focus:border-red-400" : "border-tan/50 focus:border-terracotta"
              }`}
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-500">
                Invalid access code.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={code.trim().length === 0}
            className="w-full py-2.5 rounded-lg bg-terracotta text-white text-sm font-medium hover:bg-terracotta-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Continue
          </button>
        </form>

        <p className="mt-6 text-xs text-brown-light/60 text-center">
          Don&apos;t have a code?{" "}
          <a href="mailto:archarmaan@gmail.com" className="text-terracotta hover:underline">
            Reach out at archarmaan@gmail.com
          </a>
        </p>
      </div>

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

// ─── Demo view ──────────────────────────────────────────────────────────────

function DemoView({ config, onExit }: { config: DemoConfig; onExit: () => void }) {
  return (
    <div className="min-h-screen bg-[#FFFFFF] flex flex-col">
      {/* Header */}
      <header
        className="border-b px-6 py-4"
        style={{ borderBottomColor: config.accentColor + "40", backgroundColor: config.accentColor + "08" }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {config.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logo} alt={config.company} className="h-8 w-auto object-contain" />
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-lg text-[#1A2A1A] leading-tight">{config.company}</h1>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ color: config.accentColor, borderColor: config.accentColor + "50", backgroundColor: config.accentColor + "12" }}
                >
                  {config.role}
                </span>
              </div>
              <p className="text-xs text-[#4A6B4A]">
                Built by{" "}
                <Link href="/" className="hover:underline" style={{ color: config.accentColor }}>
                  Armaan Kazi
                </Link>
              </p>
            </div>
          </div>

          <button
            onClick={onExit}
            className="text-xs text-[#7A9B7A] hover:text-[#1A2A1A] transition-colors border border-[#D8E6D8] rounded-lg px-3 py-1.5"
          >
            Exit demo
          </button>
        </div>
      </header>

      {/* Accent strip */}
      <div className="h-0.5 w-full" style={{ backgroundColor: config.accentColor }} />

      {/* Hero pitch */}
      <div className="max-w-4xl mx-auto px-6 pt-12 pb-8 w-full">
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: config.accentColor }}>
          Built for {config.company}
        </p>
        <h2 className="text-2xl font-semibold text-[#1A2A1A] mb-3">{config.headline}</h2>
        <p className="text-[#4A6B4A] leading-relaxed max-w-2xl mb-4">{config.pitch}</p>
        <p className="text-sm text-[#7A9B7A] leading-relaxed max-w-2xl border-l-2 border-[#D8E6D8] pl-4">
          This page exists because I believe the best way to show what I can do is to actually do it.
          Everything here was built from scratch. No templates, no boilerplate. I picked the problem,
          designed the system, and shipped it. That&apos;s how I work.
        </p>
      </div>

      {/* Sections */}
      <div className="max-w-4xl mx-auto px-6 pb-16 w-full space-y-10 flex-1">
        {config.sections.map((section, i) => (
          <div key={i}>
            <h3
              className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: config.accentColor }}
            >
              {section.title}
            </h3>

            {section.type === "text" && section.content && (
              <p className="text-[#1A2A1A] leading-relaxed">{section.content}</p>
            )}

            {section.type === "embed" && section.projectSlug && (
              <div className="rounded-xl overflow-hidden border border-[#D8E6D8] shadow-sm">
                <div className="bg-[#1a1a1a]/5 border-b border-[#D8E6D8] px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-[#7A9B7A] font-mono">/projects/{section.projectSlug}</span>
                  <a
                    href={`/projects/${section.projectSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:underline transition-colors"
                    style={{ color: config.accentColor }}
                  >
                    Open full screen ↗
                  </a>
                </div>
                <iframe
                  src={`/projects/${section.projectSlug}`}
                  className="w-full"
                  style={{ height: "700px", border: "none" }}
                  title={`${section.title}: ${section.projectSlug}`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <footer className="border-t border-[#D8E6D8] bg-white/40 px-6 py-14">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-lg font-semibold text-[#1A2A1A] mb-2">Interested? Let&apos;s talk.</p>
          <p className="text-sm text-[#4A6B4A] max-w-md mx-auto mb-2 leading-relaxed">
            I&apos;d love to tell you more about my work and what I could bring to {config.company}.
          </p>
          <p className="text-sm text-[#7A9B7A] max-w-md mx-auto mb-8 leading-relaxed">
            I&apos;m a fast learner, I care a lot about the craft, and I show up with opinions and a bias toward building.
            If that sounds like someone you want on your team, reach out.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="mailto:archarmaan@gmail.com"
              className="px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors"
              style={{ backgroundColor: config.accentColor }}
            >
              Email me
            </a>
            <a
              href="https://www.linkedin.com/in/kaziarmaan/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-lg text-sm font-medium border border-[#D8E6D8] text-[#4A6B4A] hover:border-[#c8bfb0] transition-colors"
            >
              LinkedIn
            </a>
          </div>
          <p className="mt-8 text-xs text-[#7A9B7A]">
            <Link href="/" className="hover:underline">Back to portfolio</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

const SESSION_KEY = "demo_auth";

export default function DemosPage() {
  const router = useRouter();
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [ready, setReady]   = useState(false);

  // Show password screen - never auto-redirect on mount
  useEffect(() => {
    setReady(true);
  }, []);

  function handleUnlock(cfg: DemoConfig, password: string) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(password));
    if (cfg.url) {
      router.push(cfg.url);
    } else {
      setConfig(cfg);
    }
  }

  function handleExit() {
    sessionStorage.removeItem(SESSION_KEY);
    setConfig(null);
  }

  if (!ready) return null;

  return config
    ? <DemoView config={config} onExit={handleExit} />
    : <PasswordScreen onUnlock={handleUnlock} />;
}
