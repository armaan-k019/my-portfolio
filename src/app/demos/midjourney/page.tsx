"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MY_STYLE } from "@/components/ThemeToggle";

const ParallaxViewer = dynamic(() => import("./ParallaxViewer"), { ssr: false });

// ── Constants ─────────────────────────────────────────────────────────────────


const SAMPLE = {
  imageUrl: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
  prompt: "Misty mountain peaks shrouded in golden hour light, volumetric fog rolling through valleys, cinematic wide angle lens, ultra-realistic photography style, dramatic atmosphere, 8k resolution --ar 16:9 --v 6 --q 2",
};

const LOADING_STEPS = [
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
  coherenceScore: number;
  coherenceLabel: "Incoherent" | "Conflicted" | "Functional" | "Cohesive" | "Masterful";
  coherenceReason: string;
}

interface AnalysisResults {
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

function impactBarAnim(impact: string) {
  if (impact === "High") return "barFill 0.4s ease-out forwards";
  if (impact === "Medium") return "barFill 0.4s ease-out forwards";
  return "barFill 0.4s ease-out forwards";
}

function impactBarWidth(impact: string) {
  if (impact === "High") return "100%";
  if (impact === "Medium") return "60%";
  return "30%";
}

function impactWeightLabel(impact: string) {
  if (impact === "High") return "High visual weight";
  if (impact === "Medium") return "Medium visual weight";
  return "Low visual weight";
}

function coherenceColor(score: number) {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function computeWordDiff(original: string, rewrite: string): { word: string; isNew: boolean }[] {
  const origSet = new Set(
    original.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, ""))
  );
  return rewrite.split(" ").map((word) => ({
    word,
    isNew: !origSet.has(word.toLowerCase().replace(/[^a-z0-9]/g, "")),
  }));
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MidjourneyPage() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showDepth, setShowDepth] = useState(false);
  const [viewerDragging, setViewerDragging] = useState(false);
  const [depthMapUrl, setDepthMapUrl] = useState<string | null>(null);
  const [spatialOpen, setSpatialOpen] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const C = MY_STYLE;
  const ACCENT = C.accent;

  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    };
  }, []);

  function loadSample() {
    setPrompt(SAMPLE.prompt);
    setImageUrl(SAMPLE.imageUrl);
    setResults(null);
    setError(null);
    setDepthMapUrl(null);
    setSpatialOpen(false);
  }

  // Pre-populate with sample on mount
  useEffect(() => { loadSample(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setDepthMapUrl(null);
    setSpatialOpen(false);

    stepIntervalRef.current = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 1800);

    try {
      const analyzeRes = await fetch("/api/demos/midjourney/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const analyzeData = await analyzeRes.json() as { result?: MidjourneyAnalysis; error?: string };

      if (analyzeData.error) throw new Error(analyzeData.error);
      if (!analyzeData.result) throw new Error("Incomplete response from API.");

      setResults({ analysis: analyzeData.result });

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
      <style>{`
        @keyframes kenBurns {
          0%   { transform: scale(1.0) translate(0, 0); }
          50%  { transform: scale(1.06) translate(-1%, -1%); }
          100% { transform: scale(1.0) translate(0, 0); }
        }
        @keyframes barFill {
          from { width: 0; }
          to   { width: var(--bar-w); }
        }
        @keyframes coherenceFill {
          from { width: 0; }
          to   { width: var(--score-w); }
        }
      `}</style>

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
                  borderColor: C.accent + "55",
                  color: C.accent,
                  backgroundColor: C.accent + "12",
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
              style={{ backgroundColor: C.cardBg, borderColor: C.accent + "40" }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: C.accent }}
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
                      style={{ backgroundColor: C.accent }}
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
                  style={{ color: C.accent }}
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
                  <span className="text-xs font-medium pr-2" style={{ color: C.accent }}>
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
              backgroundColor: C.accent + "0c",
              borderLeftColor: C.accent,
              borderTop: `1px solid ${C.accent}22`,
              borderRight: `1px solid ${C.accent}22`,
              borderBottom: `1px solid ${C.accent}22`,
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
            <div className="rounded-xl border p-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <p className="text-xs font-semibold mb-1" style={{ color: C.text }}>Mountain landscape</p>
              <p className="text-xs font-mono leading-relaxed" style={{ color: C.muted }}>{SAMPLE.prompt}</p>
            </div>
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: C.accent, color: "#ffffff" }}
              >
                {loading ? "Running..." : "Analyze + View in 3D"}
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
                style={{ borderColor: C.accent, borderTopColor: "transparent" }}
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
                        i <= loadingStep ? C.accent : C.cardBorder,
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
            <div ref={resultsRef} className="scroll-mt-8 space-y-5">

              {/* 3D Viewer — full width */}
              <div
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: C.bg, borderColor: C.cardBorder }}
              >
                <div
                  className="px-4 py-2.5 border-b flex items-center justify-between"
                  style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}
                >
                  <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: C.accent }}
                  >
                    3D Scene
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowDepth((v) => !v)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all border"
                      style={{
                        backgroundColor: showDepth ? C.accent + "22" : "transparent",
                        color: showDepth ? C.accent : C.dim,
                        borderColor: showDepth ? C.accent + "44" : C.cardBorder,
                      }}
                    >
                      {showDepth ? "Show image" : "Show depth map"}
                    </button>
                    <span className="text-[10px]" style={{ color: C.dim }}>
                      Click and drag to explore
                    </span>
                  </div>
                </div>
                <div
                  style={{ height: 500, overflow: "hidden" }}
                  onMouseDown={() => setViewerDragging(true)}
                  onMouseUp={() => setViewerDragging(false)}
                  onMouseLeave={() => setViewerDragging(false)}
                  onTouchStart={() => setViewerDragging(true)}
                  onTouchEnd={() => setViewerDragging(false)}
                >
                  <div
                    className="w-full h-full"
                    style={{ animation: viewerDragging ? "none" : "kenBurns 8s ease-in-out infinite" }}
                  >
                    <ParallaxViewer imageUrl={imageUrl} showDepth={showDepth} onDepthReady={setDepthMapUrl} />
                  </div>
                </div>
              </div>

              {/* Spatial Analysis */}
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: C.cardBorder }}
              >
                <button
                  onClick={() => setSpatialOpen((v) => !v)}
                  className="w-full px-5 py-3 flex items-center justify-between transition-colors"
                  style={{ backgroundColor: C.cardBg }}
                >
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: C.dim }}>
                    Spatial Analysis
                  </span>
                  <span className="text-xs" style={{ color: C.dim }}>
                    {spatialOpen ? "Hide ↑" : "Show spatial analysis ↓"}
                  </span>
                </button>
                <div
                  style={{
                    maxHeight: spatialOpen ? "600px" : "0",
                    overflow: "hidden",
                    transition: "max-height 0.3s ease",
                    backgroundColor: C.cardBg,
                  }}
                >
                  <div className="px-5 pb-5">
                    {depthMapUrl ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
                              Original
                            </p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imageUrl} alt="original" className="w-full rounded-lg object-cover" style={{ aspectRatio: "16/9" }} />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
                              Depth Map
                            </p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={depthMapUrl} alt="depth map" className="w-full rounded-lg object-cover" style={{ aspectRatio: "16/9" }} />
                          </div>
                        </div>
                        <p className="text-[10px] mt-3" style={{ color: C.dim }}>
                          Depth computed in-browser using MiDaS neural network, no server calls
                        </p>
                      </>
                    ) : (
                      <p className="text-xs py-4" style={{ color: C.dim }}>
                        Computing depth map...
                      </p>
                    )}
                  </div>
                </div>
              </div>

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
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1" style={{ height: 3, backgroundColor: "rgba(0,0,0,0.08)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            borderRadius: 2,
                            backgroundColor: impactColor(item.impact, ACCENT),
                            animation: impactBarAnim(item.impact),
                            ["--bar-w" as string]: impactBarWidth(item.impact),
                          }} />
                        </div>
                        <span className="text-[10px] whitespace-nowrap" style={{ color: C.dim }}>
                          {impactWeightLabel(item.impact)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Style Coherence */}
              <div
                className="rounded-xl border p-5"
                style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
                  Style Coherence
                </p>
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-5xl font-black tabular-nums" style={{ color: coherenceColor(results.analysis.coherenceScore) }}>
                    {results.analysis.coherenceScore}
                  </span>
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: C.text }}>
                      {results.analysis.coherenceLabel}
                    </p>
                    <p className="text-[10px] leading-snug" style={{ color: C.dim }}>
                      How well your prompt tokens work together to produce a unified aesthetic
                    </p>
                  </div>
                </div>
                <div style={{ height: 4, backgroundColor: C.cardBorder, borderRadius: 2, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{
                    height: "100%",
                    borderRadius: 2,
                    backgroundColor: coherenceColor(results.analysis.coherenceScore),
                    animation: "coherenceFill 0.6s ease-out forwards",
                    ["--score-w" as string]: `${results.analysis.coherenceScore}%`,
                  }} />
                </div>
                <p className="text-xs" style={{ color: C.muted }}>
                  {results.analysis.coherenceReason}
                </p>
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
                      backgroundColor: copied === "dna" ? C.accent + "22" : C.bg,
                      color: copied === "dna" ? C.accent : C.dim,
                      border: `1px solid ${copied === "dna" ? C.accent + "44" : C.cardBorder}`,
                    }}
                  >
                    {copied === "dna" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div
                  className="rounded-lg p-3 font-mono text-xs leading-relaxed"
                  style={{
                    backgroundColor: C.bg,
                    color: C.text,
                    border: `1px solid ${C.cardBorder}`,
                  }}
                >
                  {results.analysis.styleDNA}
                </div>
              </div>

              {/* Rewritten Prompt — diff view */}
              <div
                className="rounded-xl border p-5"
                style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.dim }}>
                    Prompt Diff
                  </p>
                  <button
                    onClick={() => copyToClipboard(results.analysis.rewrite, "rewrite")}
                    className="text-[10px] font-semibold px-2 py-1 rounded-md transition-all"
                    style={{
                      backgroundColor: copied === "rewrite" ? C.accent + "22" : C.bg,
                      color: copied === "rewrite" ? C.accent : C.dim,
                      border: `1px solid ${copied === "rewrite" ? C.accent + "44" : C.cardBorder}`,
                    }}
                  >
                    {copied === "rewrite" ? "Copied!" : "Copy improved"}
                  </button>
                </div>
                {/* Original */}
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: C.dim }}>
                  Original
                </p>
                <div
                  className="rounded-lg p-3 font-mono text-xs leading-relaxed mb-3"
                  style={{
                    backgroundColor: C.bg,
                    color: C.muted,
                    border: `1px solid ${C.cardBorder}`,
                  }}
                >
                  {prompt}
                </div>
                {/* Improved with diff highlights */}
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: C.accent }}>
                  Improved
                </p>
                <div
                  className="rounded-lg p-3 font-mono text-xs leading-relaxed"
                  style={{
                    backgroundColor: C.bg,
                    border: `1px solid ${C.cardBorder}`,
                  }}
                >
                  {computeWordDiff(prompt, results.analysis.rewrite).map((token, i) => (
                    <span
                      key={i}
                      style={token.isNew ? {
                        backgroundColor: C.accentBg,
                        color: C.accent,
                        borderRadius: 3,
                        padding: "0 2px",
                      } : {
                        color: C.text,
                      }}
                    >
                      {token.word}{" "}
                    </span>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div
                className="rounded-xl border px-5 py-4"
                style={{
                  backgroundColor: C.accent + "0a",
                  borderColor: C.accent + "30",
                }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-2"
                  style={{ color: C.accent }}
                >
                  Summary
                </p>
                <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                  {results.analysis.summary}
                </p>
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
