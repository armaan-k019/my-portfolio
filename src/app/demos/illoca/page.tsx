"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #2d5a27; --ct-accent-bg: #eef2ec;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
`;

interface Precedent {
  id: string;
  name: string;
  architect: string;
  year: number;
  location: string;
  why: string;
  steal: string;
  worksDoesntWork: string;
}

interface Bubble {
  label: string;
  x: number;
  y: number;
  r: number;
}

interface IllocaResult {
  precedents: Precedent[];
  synthesis: {
    narrative: string;
    bubbles: Bubble[];
    note: string;
  };
  sketch_next: string[];
}

const EXAMPLE_BRIEFS = [
  {
    label: "Community center",
    text: "A 12,000-sq-ft community center in an aging suburban downtown. Needs a cafe, flexible meeting rooms, and a small performance space. Budget is tight. The site slopes; we want it to feel civic but not intimidating, and the after-hours programming should blur the boundary between public and private.",
  },
  {
    label: "Small house",
    text: "A 1,500-sq-ft house on a steep, wooded lot. Open living for a young family. Limited budget. The site faces north; we need to capture light but maintain privacy from neighbors. Heating costs are a concern. We want a sense of connection to the forest.",
  },
  {
    label: "Art gallery",
    text: "A 3,000-sq-ft gallery in a historic warehouse district. Variable ceiling heights, column grid is fixed. We show contemporary art and want diffuse north light in the main gallery. The street frontage should be a threshold, not a barrier. A small storage and preparation area is needed.",
  },
  {
    label: "Workshop",
    text: "A 5,000-sq-ft workshop for furniture makers and crafts people. Open floor plan with flexible zoning. Natural light for detailed work. A 12-ft minimum clear height. A small gathering space for community classes. Existing structure is a former industrial shed.",
  },
];

const LOADING_MESSAGES = [
  "Screening the reference corpus.",
  "Identifying relevant precedents.",
  "Analyzing spatial moves.",
  "Synthesizing a diagram.",
];

export default function IllocaPage() {
  const C = CSS_VAR_COLORS;
  const PAGE_BG = C.bg;
  const HEADING = C.text;
  const SUBTEXT = C.muted;
  const LABEL = C.dim;

  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<IllocaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 1200);
    return () => clearInterval(timer);
  }, [loading]);

  async function interpret() {
    if (!brief.trim()) return;
    setLoading(true);
    setLoadingMessageIndex(0);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/demos/illoca/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const json = (await res.json()) as { result?: IllocaResult; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "No result returned.");
      setResult(json.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: PAGE_BG }}>
        {/* Header */}
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  The Precedent Interpreter
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.accent + "50", color: C.accent, backgroundColor: C.accent + "12" }}
                >
                  Built for Illoca
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Describe your project. Get three precedents and a starting diagram.
              </p>
            </div>
            <div className="flex-shrink-0">
              <span className="text-xs" style={{ color: C.dim }}>
                Demo by{" "}
                <Link href="/" className="underline hover:opacity-70 transition-opacity" style={{ color: C.muted }}>
                  Armaan Kazi
                </Link>
              </span>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-10">
          {/* Back link */}
          <Link
            href="/demos"
            className="text-xs transition-colors mb-8 inline-block hover:opacity-70"
            style={{ color: C.muted }}
          >
            &#8592; Back to Demos
          </Link>

          {/* Why precedents */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              Why this matters
            </h2>
            <p className="leading-relaxed text-sm" style={{ color: SUBTEXT }}>
              Every good scheme starts with a precedent someone remembers. In practice, precedent study is how architects have always moved from brief to first idea. The recalled precedent carries spatial moves, structural logic, material strategies, and atmospheric intent that are otherwise invisible. This tool makes that memory explicit and grounded in a curated precedent library so the buildings are real and the facts are checked.
            </p>
          </section>

          {/* What Illoca does */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              How this fits Illoca
            </h2>
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>
                Upstream of Tracing Paper
              </p>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                Illoca builds tools for the fuzziest stage of early design, where a brief must become a first idea. Precedent study is foundational to that move. This engine does the recall so a small studio has the precedent knowledge of a large one, and gives the first meeting something concrete to react to before pencil hits paper.
              </p>
            </div>
          </section>

          {/* The tool */}
          <section className="mb-12">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              Describe your project
            </h2>
            <p className="text-sm mb-4" style={{ color: LABEL }}>
              Program, site, aspirations, constraints. Include square footage if you know it, site conditions, and what feeling you want the building to give.
            </p>

            <div className="rounded-xl border p-4 shadow-sm mb-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Program, site, aspirations, constraints"
                rows={5}
                className="w-full text-sm rounded-lg border px-3 py-2 mb-3 focus:outline-none"
                style={{ borderColor: C.cardBorder, backgroundColor: C.bg, color: HEADING }}
              />
              <div className="flex gap-2 flex-wrap mb-3">
                <button
                  onClick={interpret}
                  disabled={!brief.trim() || loading}
                  className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: "#fff" }}
                >
                  {loading ? LOADING_MESSAGES[loadingMessageIndex] : "Find precedents"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_BRIEFS.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => setBrief(ex.text)}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-opacity hover:opacity-70"
                    style={{ borderColor: C.cardBorder, color: SUBTEXT, backgroundColor: C.cardBg }}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{error}</p>}
            </div>

            {/* Result */}
            {result && (
              <div className="space-y-6">
                {/* Submitted brief */}
                <div className="rounded-xl border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.bg }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: LABEL }}>
                    Project brief
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    {brief}
                  </p>
                </div>

                {/* Three precedents */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
                    Three precedents
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {result.precedents.map((p, i) => (
                      <div
                        key={p.id}
                        className="rounded-xl border p-4 shadow-sm"
                        style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}
                      >
                        <p className="text-sm font-black leading-tight mb-0.5" style={{ color: HEADING }}>
                          {p.name}
                        </p>
                        <p className="text-[10px] font-mono mb-3" style={{ color: LABEL }}>
                          {p.architect}, {p.year}. {p.location}
                        </p>

                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>
                          Why this precedent
                        </p>
                        <p className="text-xs leading-relaxed mb-3" style={{ color: SUBTEXT }}>
                          {p.why}
                        </p>

                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.accent }}>
                          Move to steal
                        </p>
                        <p className="text-xs leading-relaxed mb-3" style={{ color: HEADING }}>
                          {p.steal}
                        </p>

                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>
                          Where it works and where it doesn't
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                          {p.worksDoesntWork}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Synthesis */}
                <div className="rounded-xl border p-5 shadow-sm" style={{ borderColor: C.accent + "50", backgroundColor: C.cardBg }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: C.accent }}>
                    Synthesis
                  </p>
                  <svg
                    viewBox="0 0 200 200"
                    className="w-full max-w-sm mx-auto mb-4 rounded-lg"
                    style={{ backgroundColor: C.bg, border: `1px solid ${C.cardBorder}` }}
                    role="img"
                    aria-label="Bubble diagram"
                  >
                    {result.synthesis.bubbles.map((b) => (
                      <g key={b.label}>
                        <circle
                          cx={b.x}
                          cy={b.y}
                          r={b.r}
                          fill={C.accentBg}
                          stroke={C.accent}
                          strokeWidth="1.5"
                          opacity="0.8"
                        />
                        <text
                          x={b.x}
                          y={b.y + 3}
                          textAnchor="middle"
                          fontSize="9"
                          fontFamily="ui-monospace, monospace"
                          fill={C.text}
                          fontWeight="500"
                        >
                          {b.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: SUBTEXT }}>
                    {result.synthesis.narrative}
                  </p>
                  <p className="text-[10px]" style={{ color: LABEL }}>
                    {result.synthesis.note}
                  </p>
                </div>

                {/* Sketch next */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
                    What to sketch next
                  </p>
                  <div className="rounded-xl border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                    <ol className="space-y-2">
                      {result.sketch_next.map((item, i) => (
                        <li key={i} className="flex gap-3 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                          <span className="flex-shrink-0" style={{ color: LABEL }}>
                            {i + 1}.
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* How this works */}
          <section className="mb-10 border-t pt-10" style={{ borderColor: C.cardBorder }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              How this works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                {
                  title: "Understand the brief",
                  body: "You describe the program, site, aspirations, and constraints. Claude identifies the core problems the design must solve.",
                },
                {
                  title: "Match precedents",
                  body: "From a grounded library of real, canonical buildings, three precedents are selected for solving similar problems well.",
                },
                {
                  title: "Extract moves and synthesize",
                  body: "Each precedent yields one specific spatial or structural move. These are combined into a bubble diagram and starting narrative.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border p-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.accent }} />
                    <p className="text-xs font-semibold" style={{ color: HEADING }}>
                      {card.title}
                    </p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: LABEL }}>
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Methodology tie-ins */}
          <section className="mb-10 border-t pt-10" style={{ borderColor: C.cardBorder }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              About this tool
            </h2>
            <div className="space-y-3 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
              <p>
                This tool automates the precedent-driven design methodology I used on my own studio work. See{" "}
                <Link href="/projects/framed" className="underline hover:opacity-70" style={{ color: C.muted }}>
                  Framed
                </Link>{" "}
                for the manual version: three canonical precedents (Guggenheim spiral, PAMM lightness, Steven Holl's Winter House) merged into a new architectural parti.
              </p>
              <p>
                The precedent selection logic here draws on research in multi-modal architectural precedent retrieval. If you are interested in the academic framing, see the CAADRIA 2026 Archipedia paper on computational precedent systems.
              </p>
              <p>
                This is a phase one tool. It operates upstream of Illoca's Tracing Paper, which handles the iterative sketching and refinement. Precedent study is foundational. What follows is design.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs leading-relaxed" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Illoca. Precedents are real. Facts are checked against a curated library.
          </p>
        </footer>
      </div>
    </>
  );
}
