"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ThemeToggle, { MY_STYLE, type PageColors } from "@/components/ThemeToggle";

const ParallaxViewer = dynamic(() => import("./ParallaxViewer"), { ssr: false });

// ── Constants ─────────────────────────────────────────────────────────────────

const MJ_PINK = "#FF3366";

const COMPANY_STYLE: PageColors = {
  bg: "#0a0a0a",
  cardBg: "#1a1a1a",
  cardBorder: "#2a2a2a",
  text: "#ffffff",
  muted: "#a0a0a0",
  dim: "#606060",
  accent: MJ_PINK,
  accentBg: MJ_PINK + "18",
  headerBg: "#0a0a0a",
  headerBorder: "#2a2a2a",
  headerText: "#ffffff",
};

const SAMPLE_PROMPT =
  "Misty mountain peaks shrouded in golden hour light, volumetric fog rolling through valleys, cinematic wide angle lens, ultra-realistic photography style, dramatic atmosphere, 8k resolution --ar 16:9 --v 6 --q 2";

const SAMPLE_IMAGE_URL =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80";

const LOADING_STEPS = [
  "Fetching image...",
  "Running depth estimation...",
  "Reconstructing 3D geometry...",
  "Analyzing prompt tokens...",
  "Extracting style DNA...",
  "Generating rewrite...",
  "Finalizing...",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface AutopsyToken {
  token: string;
  impact: "High" | "Medium" | "Low";
  effect: string;
}

interface MidjourneyAnalysis {
  autopsy: AutopsyToken[];
  styleDNA: string;
  rewrite: string;
  summary: string;
}

interface AnalysisResults {
  depthMap: string;
  originalImage: string;
  analysis: MidjourneyAnalysis;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function impactColor(impact: string, accent: string) {
  if (impact === "High") return "#ef4444";
  if (impact === "Medium") return "#f59e0b";
  return "#22c55e";
}

function impactBg(impact: string) {
  if (impact === "High") return "rgba(239,68,68,0.12)";
  if (impact === "Medium") return "rgba(245,158,11,0.12)";
  return "rgba(34,197,94,0.12)";
}

function impactBorder(impact: string) {
  if (impact === "High") return "rgba(239,68,68,0.4)";
  if (impact === "Medium") return "rgba(245,158,11,0.4)";
  return "rgba(34,197,94,0.4)";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MidjourneyPage() {
  const [theme, setTheme] = useState<"my" | "company">("my");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const C = theme === "my" ? MY_STYLE : COMPANY_STYLE;
  const ACCENT = C.accent;

  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    };
  }, []);

  function loadSample() {
    setPrompt(SAMPLE_PROMPT);
    setImageUrl(SAMPLE_IMAGE_URL);
    setResults(null);
    setError(null);
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !imageUrl.trim()) return;

    setLoading(true);
    setResults(null);
    setError(null);
    setLoadingStep(0);

    stepIntervalRef.current = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 1800);

    try {
      const [depthRes, analyzeRes] = await Promise.all([
        fetch("/api/demos/midjourney/depth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl }),
        }),
        fetch("/api/demos/midjourney/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }),
      ]);

      const [depthData, analyzeData] = await Promise.all([
        depthRes.json() as Promise<{ depthMap?: string; originalImage?: string; error?: string }>,
        analyzeRes.json() as Promise<{ result?: MidjourneyAnalysis; error?: string }>,
      ]);

      if (depthData.error) throw new Error(depthData.error);
      if (analyzeData.error) throw new Error(analyzeData.error);
      if (!depthData.depthMap || !depthData.originalImage || !analyzeData.result) {
        throw new Error("Incomplete response from one or both APIs.");
      }

      setResults({
        depthMap: depthData.depthMap,
        originalImage: depthData.originalImage,
        analysis: analyzeData.result,
      });

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
        stepIntervalRef.current = null;
      }
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg, color: C.text }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        className="px-6 py-5 border-b"
        style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}
      >
        <div className="max-w-[900px] mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                Prompt Autopsy + 3D Parallax
              </h1>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{
                  borderColor: MJ_PINK + "55",
                  color: MJ_PINK,
                  backgroundColor: MJ_PINK + "12",
                }}
              >
                Built for Midjourney
              </span>
            </div>
            <p className="text-sm" style={{ color: C.muted }}>
              Understand what you made. Recreate what you loved. Step inside it.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs" style={{ color: C.dim }}>
              Demo by{" "}
              <Link
                href="/"
                className="underline hover:opacity-70 transition-opacity"
                style={{ color: C.muted }}
              >
                Armaan Kazi
              </Link>
            </span>
            <ThemeToggle
              theme={theme}
              onChange={setTheme}
              companyAccent={MJ_PINK}
              darkContext={theme === "company"}
            />
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="max-w-[900px] mx-auto px-6 py-10">

        {/* ── Section A: What Midjourney does today ───────────────────────── */}
        <section className="mb-10">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: C.dim }}
          >
            What Midjourney does today
          </p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
            Midjourney generates images from text prompts. It is extraordinarily powerful, but most
            users do not know why their outputs look the way they do, cannot reliably reproduce a
            style they liked, and have no way to explore the spatial depth hidden in a generated
            image.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: C.dim }}
              >
                Today
              </p>
              <ul className="space-y-2">
                {["Prompt entered", "Image generated", "Saved to gallery"].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: C.muted }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: C.dim }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="rounded-xl border p-5"
              style={{ backgroundColor: C.cardBg, borderColor: MJ_PINK + "40" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: MJ_PINK }}
              >
                With This Demo
              </p>
              <ul className="space-y-2">
                {[
                  "Prompt entered",
                  "Image generated",
                  "Prompt autopsied",
                  "Style DNA extracted",
                  "Scene reconstructed in 3D",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: C.muted }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: MJ_PINK }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            className="rounded-xl overflow-x-auto"
            style={{ border: `1px solid ${C.cardBorder}` }}
          >
            <div style={{ minWidth: 480 }}>
              <div
                className="grid grid-cols-3 px-4 py-2"
                style={{ backgroundColor: C.bg }}
              >
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: C.dim }}
                />
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: C.dim }}
                >
                  Today
                </span>
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: MJ_PINK }}
                >
                  With Demo
                </span>
              </div>
              {[
                [
                  "What you learn",
                  "Whether you like the image",
                  "Why it looks the way it does and how to replicate it",
                ],
                [
                  "Output",
                  "Image file",
                  "Prompt autopsy + style DNA block + 3D parallax scene",
                ],
                [
                  "Next step",
                  "Try a new prompt",
                  "Paste the style DNA into your next prompt and get consistent results",
                ],
              ].map(([label, today, demo], i) => (
                <div
                  key={label}
                  className="grid grid-cols-3 px-4 py-3"
                  style={{ backgroundColor: i % 2 === 1 ? C.bg : C.cardBg }}
                >
                  <span className="text-xs font-medium pr-2" style={{ color: C.text }}>
                    {label}
                  </span>
                  <span className="text-xs pr-2" style={{ color: C.muted }}>
                    {today}
                  </span>
                  <span className="text-xs font-medium pr-2" style={{ color: MJ_PINK }}>
                    {demo}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section B: What this demo adds ──────────────────────────────── */}
        <section className="mb-10">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: C.dim }}
          >
            What this demo adds
          </p>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            This tool does two things no Midjourney interface does. First, it runs your prompt
            through an AI analysis that tells you exactly which tokens drove which visual choices,
            extracts a reusable style DNA block you can drop into future prompts, and rewrites your
            original prompt to close the gap between what you described and what you got. Second, it
            uses depth estimation to reconstruct your image as a 3D parallax scene you can pan
            around with your mouse, revealing the spatial depth Midjourney built into the image.
          </p>
        </section>

        {/* ── Section C: Why it's better ──────────────────────────────────── */}
        <section className="mb-10">
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: C.dim }}
          >
            Why it&apos;s better
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                title: "Most people underprompt",
                body: "The average Midjourney user gets generic results because they do not know which words carry the most visual weight. The autopsy shows you exactly which parts of your prompt did the work.",
              },
              {
                title: "Style consistency is Midjourney's hardest problem",
                body: "Reproducing a look across multiple images is guesswork without a reusable style DNA. This extracts one from any image you already love.",
              },
              {
                title: "Midjourney renders depth",
                body: "Every Midjourney image has spatial information baked in. The 3D viewer surfaces that depth so you can actually move through the scene.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl border p-5"
                style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
              >
                <p
                  className="text-sm font-semibold mb-2"
                  style={{ color: C.text }}
                >
                  {card.title}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section D: Why this is different callout ─────────────────────── */}
        <section className="mb-12">
          <div
            className="rounded-xl border-l-4 px-6 py-5"
            style={{
              backgroundColor: MJ_PINK + "0c",
              borderLeftColor: MJ_PINK,
              borderTop: `1px solid ${MJ_PINK}22`,
              borderRight: `1px solid ${MJ_PINK}22`,
              borderBottom: `1px solid ${MJ_PINK}22`,
            }}
          >
            <p className="text-sm font-medium italic" style={{ color: C.text }}>
              "Every other Midjourney tool helps you generate. This one helps you understand."
            </p>
          </div>
        </section>

        {/* ── Interactive tool ─────────────────────────────────────────────── */}
        <section>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: C.dim }}
          >
            Try it
          </p>

          <form onSubmit={handleAnalyze} className="space-y-3 mb-6">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: C.muted }}
              >
                Midjourney Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Paste the prompt you used in Midjourney..."
                rows={3}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl resize-none focus:outline-none transition-colors"
                style={{
                  backgroundColor: C.cardBg,
                  border: `1px solid ${C.cardBorder}`,
                  color: C.text,
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = MJ_PINK + "66")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = C.cardBorder)
                }
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: C.muted }}
              >
                Image URL{" "}
                <span style={{ color: C.dim }}>
                  (direct image link — Unsplash, CDN, etc.)
                </span>
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl focus:outline-none transition-colors"
                style={{
                  backgroundColor: C.cardBg,
                  border: `1px solid ${C.cardBorder}`,
                  color: C.text,
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = MJ_PINK + "66")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = C.cardBorder)
                }
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={loadSample}
                className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all border"
                style={{
                  backgroundColor: "transparent",
                  borderColor: C.cardBorder,
                  color: C.muted,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.muted)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.cardBorder)}
              >
                Load Sample
              </button>
              <button
                type="submit"
                disabled={loading || !prompt.trim() || !imageUrl.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: MJ_PINK, color: "#ffffff" }}
              >
                {loading ? "Running..." : "Analyze + View"}
              </button>
            </div>
          </form>

          {/* Loading state */}
          {loading && (
            <div
              className="rounded-xl border p-6 mb-6 flex flex-col items-center gap-3"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <div
                className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: MJ_PINK, borderTopColor: "transparent" }}
              />
              <p className="text-sm" style={{ color: C.muted }}>
                {LOADING_STEPS[loadingStep]}
              </p>
              <div className="flex gap-1 mt-1">
                {LOADING_STEPS.map((_, i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor:
                        i <= loadingStep ? MJ_PINK : C.cardBorder,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="rounded-xl border px-5 py-4 mb-6 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                borderColor: "rgba(239,68,68,0.3)",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          {/* Results */}
          {results && (
            <div ref={resultsRef} className="scroll-mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Left: 3D Viewer */}
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ backgroundColor: "#080808", borderColor: C.cardBorder }}
                >
                  <div
                    className="px-4 py-2.5 border-b flex items-center justify-between"
                    style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}
                  >
                    <span
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: MJ_PINK }}
                    >
                      3D Scene
                    </span>
                    <span className="text-[10px]" style={{ color: C.dim }}>
                      Click and drag to explore
                    </span>
                  </div>
                  <div style={{ height: 340 }}>
                    <ParallaxViewer
                      imageDataUrl={results.originalImage}
                      depthMapDataUrl={results.depthMap}
                    />
                  </div>
                </div>

                {/* Right: Analysis */}
                <div className="space-y-4">

                  {/* Prompt Autopsy */}
                  <div
                    className="rounded-xl border p-5"
                    style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
                  >
                    <p
                      className="text-xs font-bold uppercase tracking-widest mb-3"
                      style={{ color: C.dim }}
                    >
                      Prompt Autopsy
                    </p>
                    <div className="space-y-2">
                      {results.analysis.autopsy.map((item, i) => (
                        <div
                          key={i}
                          className="rounded-lg border px-3 py-2.5"
                          style={{
                            backgroundColor: impactBg(item.impact),
                            borderColor: impactBorder(item.impact),
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="font-mono text-xs font-semibold"
                              style={{ color: C.text }}
                            >
                              {item.token}
                            </span>
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: impactBg(item.impact),
                                color: impactColor(item.impact, ACCENT),
                                border: `1px solid ${impactBorder(item.impact)}`,
                              }}
                            >
                              {item.impact}
                            </span>
                          </div>
                          <p className="text-xs" style={{ color: C.muted }}>
                            {item.effect}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Style DNA */}
                  <div
                    className="rounded-xl border p-5"
                    style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: C.dim }}
                      >
                        Style DNA
                      </p>
                      <button
                        onClick={() => copyToClipboard(results.analysis.styleDNA, "dna")}
                        className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all"
                        style={{
                          backgroundColor: copied === "dna" ? MJ_PINK + "22" : C.bg,
                          color: copied === "dna" ? MJ_PINK : C.dim,
                          border: `1px solid ${copied === "dna" ? MJ_PINK + "44" : C.cardBorder}`,
                        }}
                      >
                        {copied === "dna" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <div
                      className="rounded-lg p-3 font-mono text-xs leading-relaxed"
                      style={{
                        backgroundColor: theme === "company" ? "#0a0a0a" : "#f3f4f6",
                        color: theme === "company" ? MJ_PINK : "#374151",
                        border: `1px solid ${C.cardBorder}`,
                      }}
                    >
                      {results.analysis.styleDNA}
                    </div>
                  </div>

                  {/* Rewritten Prompt */}
                  <div
                    className="rounded-xl border p-5"
                    style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: C.dim }}
                      >
                        Rewritten Prompt
                      </p>
                      <button
                        onClick={() =>
                          copyToClipboard(results.analysis.rewrite, "rewrite")
                        }
                        className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all"
                        style={{
                          backgroundColor:
                            copied === "rewrite" ? MJ_PINK + "22" : C.bg,
                          color: copied === "rewrite" ? MJ_PINK : C.dim,
                          border: `1px solid ${copied === "rewrite" ? MJ_PINK + "44" : C.cardBorder}`,
                        }}
                      >
                        {copied === "rewrite" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <div
                      className="rounded-lg p-3 font-mono text-xs leading-relaxed"
                      style={{
                        backgroundColor: theme === "company" ? "#0a0a0a" : "#f3f4f6",
                        color: theme === "company" ? "#e0e0e0" : "#374151",
                        border: `1px solid ${C.cardBorder}`,
                      }}
                    >
                      {results.analysis.rewrite}
                    </div>
                  </div>

                  {/* Summary */}
                  <div
                    className="rounded-xl border px-5 py-4"
                    style={{
                      backgroundColor: MJ_PINK + "0a",
                      borderColor: MJ_PINK + "30",
                    }}
                  >
                    <p
                      className="text-xs font-bold uppercase tracking-widest mb-2"
                      style={{ color: MJ_PINK }}
                    >
                      Summary
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                      {results.analysis.summary}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Footer nav ───────────────────────────────────────────────────── */}
        <footer
          className="mt-16 pt-8 border-t"
          style={{ borderColor: C.cardBorder }}
        >
          <Link
            href="/demos"
            className="text-sm transition-colors hover:opacity-70"
            style={{ color: C.dim }}
          >
            &larr; Back to demos
          </Link>
        </footer>
      </div>
    </div>
  );
}
