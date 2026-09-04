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

// Phase A: three preloaded passages, a stubbed DNA extraction, and a placeholder
// where the Marble world will render. Phase B wires Claude and the Marble API.
interface Passage {
  id: string;
  title: string;
  source: string;
  text: string;
}

interface SpatialDNA {
  materiality: string;
  scale: string;
  light: string;
  mood: string;
  composition: string;
  temperature: string;
  summary: string;
  annotations: { element: string; why: string }[];
}

const PASSAGES: Passage[] = [
  {
    id: "library",
    title: "The endless library",
    source: "After Borges, The Library of Babel",
    text:
      "The gallery is hexagonal, and from each of its six sides another gallery opens, identical, and from each of those six more. Shelves line five walls floor to ceiling. The sixth holds a narrow passage and a spiral stair that climbs and descends past sight. A lamp hangs at the center of every room, and its light is insufficient and unceasing.",
  },
  {
    id: "home",
    title: "The house at the end of the road",
    source: "Original passage, a childhood home",
    text:
      "The kitchen was the warmest room and the smallest, and the whole house seemed to lean toward it. Afternoon came through one west window and lay on the linoleum in a long yellow rectangle that the dog followed across the floor. The ceilings were low enough that my father ducked in the doorway, and the walls were the color of weak tea.",
  },
  {
    id: "stanza",
    title: "The quiet before evening",
    source: "Original stanza, after Rilke",
    text:
      "The hour leans down and touches the stone; the courtyard holds its breath. A single tree, stripped and black, stands at the center of a gray so wide it has no edge, and the sky lowers itself slowly, the way a hand comes to rest on a shoulder.",
  },
];

export default function WorldLabsPage() {
  const C = CSS_VAR_COLORS;
  const PAGE_BG = C.bg;
  const HEADING = C.text;
  const SUBTEXT = C.muted;
  const LABEL = C.dim;

  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [dna, setDna] = useState<SpatialDNA | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeText = selected ? PASSAGES.find((p) => p.id === selected)?.text ?? "" : custom;

  async function extract(id: string | null, text: string) {
    setLoading(true);
    setError(null);
    setDna(null);
    try {
      const res = await fetch("/api/demos/world-labs/extract-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passageId: id, text }),
      });
      const json = (await res.json()) as { result?: SpatialDNA; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "No DNA returned.");
      setDna(json.result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function pick(id: string) {
    setSelected(id);
    setCustom("");
    void extract(id, PASSAGES.find((p) => p.id === id)?.text ?? "");
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
                  Ekphrasis
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.accent + "50", color: C.accent, backgroundColor: C.accent + "12" }}
                >
                  Built for World Labs
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Words in, a walkable world out, with the reasoning in between made visible.
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
              Ekphrasis is the old word for describing a work of art in words. This runs it backward: a passage of prose or verse goes in, a walkable three dimensional world comes out. In between, Claude reads the text the way an architect reads a brief, pulling out materiality, scale, light, mood, composition, and temperature, and then explains which of those readings drove which decision in the space.
            </p>
          </section>
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What World Labs does today
            </h2>
            <p className="leading-relaxed text-sm mb-5" style={{ color: SUBTEXT }}>
              World Labs builds Marble, a model that generates explorable 3D worlds from text and images. The output is remarkable. The gap is in the input: a raw sentence carries a lot of unstated spatial intent, and the world can only render what the prompt makes explicit.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
                  Today: prompt goes straight to the model
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>The user's sentence is the whole brief, with all its spatial ambiguity intact</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>Two people typing the same passage get different worlds and no way to say why</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>There is no record of which words in the text produced which qualities in the space</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: LABEL }}>&#8226;</span>
                    <span>Iterating means rewriting the prompt blind</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.accent + "50", backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: C.accent }}>
                  With Ekphrasis
                </p>
                <ul className="space-y-2">
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Claude extracts a structured spatial reading first, then the world is generated from that</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>The reading is visible and editable, so the user can correct the interpretation before rendering</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Every major spatial choice in the world is annotated with the line of text that caused it</span>
                  </li>
                  <li className="flex gap-2 text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                    <span style={{ color: C.accent }}>&#10003;</span>
                    <span>Literary passages become a shared vocabulary for briefing a world model</span>
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
                  title: "Read the text for space",
                  body: "Six axes: materiality, scale, light, mood, composition, temperature. Claude fills each one from the passage and states the evidence. Phase A returns a stubbed reading.",
                },
                {
                  title: "Generate the world from the reading",
                  body: "The structured DNA becomes the Marble prompt, so the world inherits the interpretation rather than the raw sentence. Phase B wires the API; Phase A shows a placeholder.",
                },
                {
                  title: "Annotate the choices",
                  body: "The world comes back with a short list of decisions and the phrase in the text that justified each one, so the interpretation is inspectable.",
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
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>Why this is the right demo for World Labs</p>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                Marble's ceiling is set by how well the brief is understood. Putting an interpretive layer in front of it makes the model legible: you can see what it read, argue with it, and get a world that matches the text on purpose.
              </p>
            </div>
          </section>

          {/* Try it */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>
              Try it
            </h2>
            <p className="text-sm mb-4" style={{ color: LABEL }}>
              Pick a passage or paste your own. Claude reads it for spatial DNA, then the world renders from that reading.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Panel 1: text */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>1. The text</p>
                <div className="space-y-2 mb-3">
                  {PASSAGES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pick(p.id)}
                      className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                      style={{
                        borderColor: selected === p.id ? C.accent : C.cardBorder,
                        backgroundColor: selected === p.id ? C.accentBg : C.bg,
                      }}
                    >
                      <p className="text-xs font-semibold" style={{ color: HEADING }}>{p.title}</p>
                      <p className="text-[10px]" style={{ color: LABEL }}>{p.source}</p>
                    </button>
                  ))}
                </div>
                <textarea
                  value={custom}
                  onChange={(e) => { setCustom(e.target.value); setSelected(null); }}
                  placeholder="Or paste your own passage"
                  rows={4}
                  className="w-full text-xs rounded-lg border px-3 py-2 mb-2 focus:outline-none"
                  style={{ borderColor: C.cardBorder, backgroundColor: C.bg, color: HEADING }}
                />
                <button
                  onClick={() => extract(null, custom)}
                  disabled={!custom.trim() || loading}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: "#fff" }}
                >
                  {loading ? "Reading..." : "Read this passage"}
                </button>
                {activeText && (
                  <p className="text-[11px] leading-relaxed mt-3 italic" style={{ color: SUBTEXT }}>{activeText}</p>
                )}
              </div>

              {/* Panel 2: spatial DNA */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>2. Spatial DNA</p>
                {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
                {!dna && !loading && !error && (
                  <p className="text-xs" style={{ color: LABEL }}>Select a passage to extract its spatial qualities.</p>
                )}
                {loading && (
                  <div className="space-y-2 animate-pulse">
                    {[1, 0.8, 0.9, 0.7, 1, 0.6].map((w, i) => (
                      <div key={i} className="h-3 rounded" style={{ width: `${w * 100}%`, backgroundColor: C.cardBorder }} />
                    ))}
                  </div>
                )}
                {dna && (
                  <div className="space-y-2.5">
                    {([
                      ["Materiality", dna.materiality],
                      ["Scale", dna.scale],
                      ["Light", dna.light],
                      ["Mood", dna.mood],
                      ["Composition", dna.composition],
                      ["Temperature", dna.temperature],
                    ] as const).map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.accent }}>{k}</p>
                        <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>{v}</p>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t" style={{ borderColor: C.cardBorder }}>
                      <p className="text-xs leading-relaxed font-medium" style={{ color: HEADING }}>{dna.summary}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel 3: the world */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>3. The world</p>
                {/* TODO(phase-b): replace this block with the Marble embed. World Labs
                    returns a viewer URL per generated world; mount it in an iframe here
                    and cache one world per preloaded passage. */}
                <div
                  className="rounded-lg aspect-[4/3] flex items-center justify-center mb-3"
                  style={{ background: "linear-gradient(160deg, #1a2a1a 0%, #2d5a27 55%, #0f1a0f 100%)" }}
                >
                  <p className="text-[11px] font-mono text-center px-4" style={{ color: "#c9d6c4" }}>
                    3D world renders here<br />
                    <span style={{ color: "#8aa585" }}>Marble embed, Phase B</span>
                  </p>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: LABEL }}>Why the world looks this way</p>
                {dna ? (
                  <ul className="space-y-2">
                    {dna.annotations.map((a, i) => (
                      <li key={i} className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        <span className="font-semibold" style={{ color: HEADING }}>{a.element}: </span>{a.why}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs" style={{ color: LABEL }}>Annotations appear once a passage is read.</p>
                )}
              </div>
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
            . Not affiliated with World Labs. Phase A scaffold: the interactive tool returns stubbed data.
          </p>
        </footer>

      </div>
    </>
  );
}
