"use client";

import { useState } from "react";
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

// Phase A: a textarea and a stubbed response with three fixed precedents and a
// placeholder bubble diagram. Phase B wires Claude and dynamic precedent selection.
interface Precedent {
  name: string;
  architect: string;
  year: string;
  location: string;
  why: string;
  steal: string;
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
  };
}

const SAMPLE_BRIEF =
  "A small public library on a narrow urban lot in Atlanta. Reading room, children's area, a community room that can open to the street after hours. Tight budget, north facing frontage, we want it to feel quiet inside and generous outside.";

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

  async function interpret() {
    if (!brief.trim()) return;
    setLoading(true);
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
                Precedent driven design: three buildings worth stealing from, and a first diagram.
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

          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What this is
            </h2>
            <p className="leading-relaxed text-sm" style={{ color: SUBTEXT }}>
              Every good scheme starts somewhere, and in practice it usually starts with a precedent someone remembers. The Precedent Interpreter makes that step explicit. You describe the project, and Claude names three buildings worth studying for it, says what each one solved that your project also has to solve, and pulls the transferable moves into a first bubble diagram. It is a starting point, not a design.
            </p>
          </section>
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What Illoca does today
            </h2>
            <p className="leading-relaxed text-sm mb-5" style={{ color: SUBTEXT }}>
              Illoca is building tools for the earliest, fuzziest stage of architectural design, where a brief has to become a first idea. Precedent study is how architects have always done this, and it is still mostly a memory exercise: whoever in the room has seen the most buildings wins.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
                  Today: precedent by recall
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>Precedents come from whoever happens to remember one</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>The reason a precedent is relevant stays in someone's head</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>Transferable moves are never separated from the parts that do not apply</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>The first diagram is drawn from scratch, after the precedent conversation is over</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.accent + "50", backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: C.accent }}>
                  With the Precedent Interpreter
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Three precedents chosen against the actual program, site, and constraints</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Each one comes with a stated reason and a specific move to take from it</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>The moves are synthesized into a bubble diagram you can react to in the first meeting</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Grounded in a curated precedent library so the buildings are real and the facts are checked</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              How it works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                {
                  title: "Read the brief",
                  body: "Program, site, aspiration, constraint. Claude identifies the problems the project has to solve, which is what precedents are matched on. Phase A skips the reading and returns fixed picks.",
                },
                {
                  title: "Pick three precedents",
                  body: "Canonical buildings that solved a similar problem well. Phase A hardcodes Salk, Yokohama, and Vals; Phase B selects from a grounded library with hallucination checks.",
                },
                {
                  title: "Synthesize a first diagram",
                  body: "The stolen moves become adjacency bubbles and a short narrative. Phase A draws a placeholder; Phase B generates the diagram from the synthesis.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border p-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.accent }} />
                    <p className="text-xs font-semibold" style={{ color: HEADING }}>{card.title}</p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: LABEL }}>{card.body}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>Why this is the right demo for Illoca</p>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                The hardest part of early design is not generating options, it is knowing where to look. A precedent engine that explains itself gives a small studio the recall of a large one, and gives the first meeting something concrete to argue with.
              </p>
            </div>
          </section>

          {/* Try it */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>
              Try it
            </h2>
            <p className="text-sm mb-4" style={{ color: LABEL }}>
              Describe the project: program, site, what you want it to feel like, what constrains it. Get three precedents and a starting diagram.
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
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={interpret}
                  disabled={!brief.trim() || loading}
                  className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: "#fff" }}
                >
                  {loading ? "Interpreting..." : "Find precedents"}
                </button>
                <button
                  onClick={() => setBrief(SAMPLE_BRIEF)}
                  className="text-sm font-semibold px-4 py-2 rounded-lg border transition-opacity hover:opacity-70"
                  style={{ borderColor: C.cardBorder, color: SUBTEXT, backgroundColor: C.cardBg }}
                >
                  Use a sample brief
                </button>
              </div>
              {error && <p className="text-xs mt-2" style={{ color: "#ef4444" }}>{error}</p>}
            </div>

            {result && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {result.precedents.map((p) => (
                    <div key={p.name} className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                      <p className="text-sm font-black leading-tight mb-0.5" style={{ color: HEADING }}>{p.name}</p>
                      <p className="text-[10px] font-mono mb-3" style={{ color: LABEL }}>{p.architect}, {p.year}. {p.location}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>Why this precedent</p>
                      <p className="text-xs leading-relaxed mb-3" style={{ color: SUBTEXT }}>{p.why}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.accent }}>Key move to steal</p>
                      <p className="text-xs leading-relaxed" style={{ color: HEADING }}>{p.steal}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border p-5 shadow-sm grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-5" style={{ borderColor: C.accent + "50", backgroundColor: C.cardBg }}>
                  {/* Placeholder bubble diagram. Phase B generates this from the synthesis. */}
                  <svg viewBox="0 0 200 200" className="w-full max-w-[220px] mx-auto" role="img" aria-label="Bubble diagram placeholder">
                    <rect width="200" height="200" rx="10" fill={C.bg} />
                    {result.synthesis.bubbles.map((b) => (
                      <g key={b.label}>
                        <circle cx={b.x} cy={b.y} r={b.r} fill={C.accentBg} stroke={C.accent} strokeWidth="1.5" />
                        <text x={b.x} y={b.y + 3} textAnchor="middle" fontSize="8" fontFamily="ui-monospace, monospace" fill={C.text}>{b.label}</text>
                      </g>
                    ))}
                  </svg>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: C.accent }}>Starting point</p>
                    <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>{result.synthesis.narrative}</p>
                  </div>
                </div>
              </div>
            )}

          </section>

        </div>

        {/* Footer */}
        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs leading-relaxed" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Illoca. Phase A scaffold: the interactive tool returns stubbed data.
          </p>
        </footer>

      </div>
    </>
  );
}
