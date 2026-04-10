"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const SAMPLE_COPY = `Welcome to Alpha Signals Pro

Get access to my daily trading signals with 80%+ win rate. I've been trading for 5 years and turned $10k into $180k. Join my community of traders who are making consistent profits every day.

What you get:
- Daily buy/sell signals
- Live trading room access
- My personal watchlist
- 24/7 Discord support

Don't miss out on the next big move. Join now and start making money today.

Price: $97/month
Cancel anytime.`;

const LOADING_LINES = [
  "Reading your page...",
  "Oh.",
  "Okay, we have a lot to work with here.",
  "Running conversion analysis...",
  "Checking if your copy would survive a scroll...",
  "Generating the hard truths...",
];

const GRADE_COLOR: Record<string, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

const STAT_BADGE = (val: string, goodVals: string[]) => {
  const isGood = goodVals.includes(val);
  const isMid = val === "Medium" || val === "Needs Work";
  return isGood
    ? "bg-green-950 text-green-400 border border-green-800"
    : isMid
    ? "bg-yellow-950 text-yellow-400 border border-yellow-800"
    : "bg-red-950 text-red-400 border border-red-800";
};

const PURPLE = "#7c3aed";
const BG = "#0a0a0a";
const CARD = "#111111";
const BORDER = "#222222";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoastDimension {
  name: string;
  emoji: string;
  score: number;
  roast: string;
  fix: string;
}

interface RoastResult {
  overall_grade: "A" | "B" | "C" | "D" | "F";
  one_liner: string;
  conversion_potential: "Low" | "Medium" | "High";
  trust_score: "Low" | "Medium" | "High";
  affiliate_ready: "Yes" | "Needs Work" | "No";
  dimensions: RoastDimension[];
  headline_original: string;
  headline_rewrite: string;
  headline_reasoning: string;
  description_rewrite: string;
  description_reasoning: string;
  pricing_rewrite: string;
  pricing_reasoning: string;
  affiliate_assessment: string;
  affiliate_commission_recommendation: string;
  affiliate_pitch_lines: [string, string, string];
  one_thing: string;
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Swipe Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="text-xs font-bold px-3 py-1.5 rounded-lg border transition-all"
      style={{
        borderColor: copied ? "#22c55e" : PURPLE,
        color: copied ? "#22c55e" : PURPLE,
        backgroundColor: copied ? "#052e16" : "transparent",
      }}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────

function ScoreBar({ score, animate }: { score: number; animate: boolean }) {
  const [width, setWidth] = useState(0);
  const pct = (score / 10) * 100;
  const color = score >= 7 ? "#22c55e" : score >= 5 ? "#eab308" : "#ef4444";

  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setWidth(pct), 50);
      return () => clearTimeout(t);
    }
  }, [animate, pct]);

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "#222222" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: animate ? `${width}%` : `${pct}%`,
            backgroundColor: color,
            transition: animate ? "width 600ms ease-out" : "none",
          }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums shrink-0 min-w-[32px] text-right" style={{ color }}>
        {score}/10
      </span>
    </div>
  );
}

// ── TypewriterLine ────────────────────────────────────────────────────────────

function TypewriterLine({ text, active, dim }: { text: string; active: boolean; dim: boolean }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!active) { setDisplayed(""); return; }
    setDisplayed("");
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 40);
    return () => clearInterval(interval);
  }, [active, text]);

  if (!active && displayed === "") return null;

  return (
    <p
      className="text-sm font-mono"
      style={{
        color: dim ? "#4b5563" : PURPLE,
        opacity: dim ? 0.5 : 1,
      }}
    >
      {!dim && (
        <span className="inline-block w-2 h-2 rounded-full mr-2 animate-pulse" style={{ backgroundColor: PURPLE }} />
      )}
      {dim ? text : displayed}
    </p>
  );
}

// ── AnimatedGrade ─────────────────────────────────────────────────────────────

function AnimatedGrade({ grade }: { grade: string }) {
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    // bounce: 0.5 -> 1.1 -> 1.0
    const t1 = setTimeout(() => setScale(1.1), 50);
    const t2 = setTimeout(() => setScale(1.0), 250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [grade]);

  return (
    <div
      className="font-black leading-none tabular-nums"
      style={{
        color: GRADE_COLOR[grade],
        fontSize: "120px",
        marginBottom: "28px",
        transform: `scale(${scale})`,
        transition: "transform 150ms ease-out",
        display: "inline-block",
      }}
    >
      {grade}
    </div>
  );
}

// ── StrikethroughHeadline ─────────────────────────────────────────────────────

function StrikethroughHeadline({ text, rewrite, reasoning }: { text: string; rewrite: string; reasoning: string }) {
  const [strikeWidth, setStrikeWidth] = useState(0);
  const [showRewrite, setShowRewrite] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setStrikeWidth(100), 100);
    const t2 = setTimeout(() => setShowRewrite(true), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="rounded-xl border" style={{ backgroundColor: "#0a0a0a", borderColor: BORDER, padding: "20px", marginBottom: "16px" }}>
      <div style={{ marginBottom: "16px" }}>
        <p className="font-bold uppercase tracking-wide" style={{ color: "#4b5563", fontSize: "10px", marginBottom: "6px" }}>
          Your headline
        </p>
        <div className="relative inline-block" style={{ color: "#4b5563", fontSize: "13px", opacity: 0.7 }}>
          {text}
          <div
            className="absolute left-0 top-1/2 h-px"
            style={{
              backgroundColor: "#ef4444",
              width: `${strikeWidth}%`,
              transition: "width 300ms ease-out",
            }}
          />
        </div>
      </div>
      <div
        style={{
          borderTop: `1px solid ${BORDER}`,
          paddingTop: "16px",
          opacity: showRewrite ? 1 : 0,
          transition: "opacity 300ms ease-out",
        }}
      >
        <p className="font-bold uppercase tracking-wide" style={{ color: PURPLE, fontSize: "10px", marginBottom: "8px" }}>
          The rewrite
        </p>
        <p className="font-black leading-snug" style={{ fontSize: "20px" }}>{rewrite}</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function WhopPage() {
  const [activeTab, setActiveTab] = useState<"paste" | "sample">("paste");
  const [pageCopy, setPageCopy] = useState("");
  const [niche, setNiche] = useState("");
  const [price, setPrice] = useState("");
  const [hasAffiliate, setHasAffiliate] = useState(true);

  const [loading, setLoading] = useState(false);
  const [loadingLineIndex, setLoadingLineIndex] = useState(0);
  const [shownLines, setShownLines] = useState<number[]>([]);
  const [result, setResult] = useState<RoastResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [barsAnimated, setBarsAnimated] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  function useSample() {
    setPageCopy(SAMPLE_COPY);
    setNiche("Day trading signals");
    setPrice("$97/month");
    setHasAffiliate(true);
    setActiveTab("paste");
  }

  function reset() {
    setResult(null);
    setError(null);
    setLoadingLineIndex(0);
    setShownLines([]);
    setBarsAnimated(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setLoadingLineIndex(0);
    setShownLines([0]);
    setBarsAnimated(false);

    // Typewriter loading: reveal each line after the previous finishes typing + 600ms pause
    for (let i = 0; i < LOADING_LINES.length; i++) {
      setLoadingLineIndex(i);
      const typeDuration = LOADING_LINES[i].length * 40 + 600;
      await new Promise(r => setTimeout(r, typeDuration));
      if (i < LOADING_LINES.length - 1) setShownLines(prev => [...prev, i + 1]);
    }

    try {
      const res = await fetch("/api/demos/whop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageCopy, niche, price, hasAffiliate }),
      });
      const raw = await res.text();
      const json = JSON.parse(raw) as { result?: RoastResult; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result!);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => setBarsAnimated(true), 300);
      }, 100);
    } catch (err) {
      console.error("[whop] error:", err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = pageCopy.trim().length > 20 && niche.trim().length > 0 && price.trim().length > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG, color: "#ffffff" }}>
      {/* Header */}
      <header className="px-6 py-5 border-b" style={{ borderColor: "#222222", backgroundColor: "#050505" }}>
        <div className="w-full max-w-[860px] mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight" style={{ color: "#ffffff" }}>Whop Page Roaster</h1>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{ borderColor: PURPLE + "60", color: PURPLE, backgroundColor: PURPLE + "15" }}
              >
                Built for Whop creators
              </span>
            </div>
            <p className="text-sm" style={{ color: "#9ca3af" }}>
              Paste your product page. Get roasted. Ship better.
            </p>
          </div>
          <span className="text-xs mt-1" style={{ color: "#6b7280" }}>
            Demo by{" "}
            <Link href="/" className="hover:text-gray-400 underline transition-colors" style={{ color: "#9ca3af" }}>
              Armaan Kazi
            </Link>
          </span>
        </div>
      </header>

      <div className="w-full max-w-[860px] mx-auto px-6 py-10" style={{ minWidth: 0 }}>

        {/* Back link */}
        <Link
          href="/demos"
          className="text-xs transition-colors mb-8 inline-block hover:text-gray-400"
          style={{ color: "#4b5563" }}
        >
          &#8592; Back to Demos
        </Link>

        {/* Section A */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#6b7280" }}>
            What Whop does today
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border p-4" style={{ backgroundColor: "#111111", borderColor: BORDER }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#6b7280" }}>
                Today: creator storefront
              </p>
              <div className="space-y-2">
                {["Product page with title + description", "Pricing block", "Affiliate program setup", "Purchase button"].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5" style={{ color: "#4b5563" }}>&#x2022;</span>
                    <span className="text-xs" style={{ color: "#9ca3af" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border p-4" style={{ backgroundColor: "#111111", borderColor: PURPLE + "40" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: PURPLE }}>
                With Page Roaster
              </p>
              <div className="space-y-2">
                {["Instant AI critique of your copy and pricing", "Specific headline, description, and pricing rewrites", "Conversion potential + trust score", "Affiliate pitch line suggestions"].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5" style={{ color: PURPLE }}>✓</span>
                    <span className="text-xs" style={{ color: "#e5e7eb" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section B */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#6b7280" }}>
            What this demo adds
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#9ca3af" }}>
            Whop gives creators the infrastructure to sell, but knowing <em style={{ color: "#e5e7eb" }}>why</em> a page isn&apos;t converting is still guesswork. This tool analyzes your page copy the way a conversion expert would: grading your headline, description, pricing framing, and affiliate structure, then writing specific alternatives you can actually use.
          </p>
        </section>

        {/* Section C */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#6b7280" }}>
            Why it&apos;s better
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              {
                title: "Specific, not generic",
                body: "Every rewrite is based on your actual copy, not a template. The feedback addresses what your page says, not what a typical page says.",
              },
              {
                title: "Grades that mean something",
                body: "The rubric is calibrated to be honest. Most pages score C or D. An A is rare. If your page scores well, it actually scored well.",
              },
              {
                title: "Affiliate-aware",
                body: "Most conversion tools ignore affiliate programs entirely. This one evaluates your commission structure and generates pitch lines affiliates would actually use.",
              },
            ].map(card => (
              <div key={card.title} className="rounded-xl border p-4" style={{ backgroundColor: "#111111", borderColor: BORDER }}>
                <p className="text-xs font-bold mb-2" style={{ color: "#e5e7eb" }}>{card.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: "#6b7280" }}>{card.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border px-5 py-4" style={{ borderColor: PURPLE + "40", backgroundColor: PURPLE + "0d" }}>
            <p className="text-xs font-bold mb-1" style={{ color: PURPLE }}>Why This Is Different</p>
            <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>
              Whop creators lose revenue not because their product is bad, but because their page doesn&apos;t communicate value clearly. This turns &ldquo;why isn&apos;t my page converting&rdquo; from a vague question into a specific, fixable list.
            </p>
          </div>
        </section>

        {/* Try it label */}
        <p className="text-xs font-bold uppercase tracking-widest mb-6" style={{ color: "#6b7280" }}>
          Try it
        </p>

        {/* Input form */}
        {!result && (
          <div className="rounded-2xl border mb-8" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: BORDER }}>
              {(["paste", "sample"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); if (tab === "sample") useSample(); }}
                  className="flex-1 py-3.5 text-sm font-bold transition-all"
                  style={{
                    color: activeTab === tab ? PURPLE : "#6b7280",
                    borderBottom: activeTab === tab ? `2px solid ${PURPLE}` : "2px solid transparent",
                    backgroundColor: "transparent",
                  }}
                >
                  {tab === "paste" ? "Paste Your Page" : "Use Sample Page"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: "#6b7280" }}>
                  YOUR PAGE COPY
                </label>
                <textarea
                  value={pageCopy}
                  onChange={e => setPageCopy(e.target.value)}
                  placeholder="Paste your Whop product page copy here: title, description, pricing, what's included, everything."
                  rows={10}
                  className="w-full px-4 py-3 text-sm rounded-xl border focus:outline-none resize-none transition-colors"
                  style={{ backgroundColor: "#0a0a0a", borderColor: BORDER, color: "white" }}
                  onFocus={e => (e.currentTarget.style.borderColor = PURPLE + "80")}
                  onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: "#6b7280" }}>YOUR NICHE</label>
                  <input
                    type="text"
                    value={niche}
                    onChange={e => setNiche(e.target.value)}
                    placeholder="e.g. trading signals"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none transition-colors"
                    style={{ backgroundColor: "#0a0a0a", borderColor: BORDER, color: "white" }}
                    onFocus={e => (e.currentTarget.style.borderColor = PURPLE + "80")}
                    onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: "#6b7280" }}>PRICE POINT</label>
                  <input
                    type="text"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="e.g. $97/month"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none transition-colors"
                    style={{ backgroundColor: "#0a0a0a", borderColor: BORDER, color: "white" }}
                    onFocus={e => (e.currentTarget.style.borderColor = PURPLE + "80")}
                    onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: "#6b7280" }}>AFFILIATE PROGRAM?</label>
                  <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: BORDER }}>
                    {[true, false].map(val => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setHasAffiliate(val)}
                        className="flex-1 py-2.5 text-sm font-bold transition-all"
                        style={{
                          backgroundColor: hasAffiliate === val ? PURPLE : "transparent",
                          color: hasAffiliate === val ? "white" : "#6b7280",
                        }}
                      >
                        {val ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full py-4 rounded-xl text-base font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                style={{ backgroundColor: PURPLE, color: "white" }}
              >
                Roast It
              </button>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl border p-8 mb-8" style={{ backgroundColor: CARD, borderColor: BORDER }}>
            <div className="space-y-2">
              {shownLines.map(i => (
                <TypewriterLine
                  key={i}
                  text={LOADING_LINES[i]}
                  active={i === loadingLineIndex}
                  dim={i < loadingLineIndex}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-900 bg-red-950 p-4 mb-8 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-6">

            {/* 1. Overall Grade */}
            <div
              className="rounded-2xl border text-center px-6 py-10 sm:px-8 sm:py-12"
              style={{ backgroundColor: CARD, borderColor: BORDER }}
            >
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#4b5563", marginBottom: "20px" }}>
                Overall Roast Score
              </p>
              <div style={{ marginBottom: "28px" }}>
                <AnimatedGrade grade={result.overall_grade} />
              </div>
              <p className="font-semibold max-w-xl mx-auto leading-relaxed" style={{ color: "#e5e7eb", fontSize: "16px", marginBottom: "32px" }}>
                &ldquo;{result.one_liner}&rdquo;
              </p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <span className={`font-bold rounded-full ${STAT_BADGE(result.conversion_potential, ["High"])}`} style={{ fontSize: "13px", padding: "8px 16px" }}>
                  Conversion Potential: {result.conversion_potential}
                </span>
                <span className={`font-bold rounded-full ${STAT_BADGE(result.trust_score, ["High"])}`} style={{ fontSize: "13px", padding: "8px 16px" }}>
                  Trust Score: {result.trust_score}
                </span>
                <span className={`font-bold rounded-full ${STAT_BADGE(result.affiliate_ready, ["Yes"])}`} style={{ fontSize: "13px", padding: "8px 16px" }}>
                  Affiliate Ready: {result.affiliate_ready}
                </span>
              </div>
            </div>

            {/* 2. Dimension Breakdown */}
            <div>
              <h2 className="text-lg font-black mb-4 tracking-tight">The Roast: 5 Dimensions</h2>
              <div className="space-y-4">
                {result.dimensions.map((dim, i) => (
                  <div
                    key={i}
                    className="rounded-xl"
                    style={{
                      backgroundColor: CARD,
                      border: `1px solid ${BORDER}`,
                      borderLeftColor: PURPLE,
                      borderLeftWidth: "4px",
                      padding: "24px",
                      minHeight: "120px",
                      opacity: barsAnimated ? 1 : 0,
                      transform: barsAnimated ? "translateY(0)" : "translateY(8px)",
                      transition: `opacity 300ms ease-out ${i * 100}ms, transform 300ms ease-out ${i * 100}ms`,
                    }}
                  >
                    <div className="mb-3">
                      <h3 className="font-black" style={{ fontSize: "15px", marginBottom: "10px" }}>
                        {dim.emoji} {dim.name}
                      </h3>
                      <ScoreBar score={dim.score} animate={barsAnimated} />
                    </div>
                    <p className="leading-relaxed" style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "16px", marginTop: "12px" }}>
                      {dim.roast}
                    </p>
                    <div className="rounded-lg border" style={{ backgroundColor: "#0a0a0a", borderColor: BORDER, padding: "14px 16px" }}>
                      <p className="font-bold uppercase tracking-wide" style={{ color: PURPLE, fontSize: "11px", marginBottom: "6px" }}>
                        The Fix
                      </p>
                      <p className="leading-relaxed" style={{ color: "#d1d5db", fontSize: "14px" }}>{dim.fix}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Rewrite Lab */}
            <div
              className="rounded-2xl border overflow-hidden"
              style={{ backgroundColor: "#0d0d1a", borderColor: PURPLE + "40" }}
            >
              <div className="px-6 py-5 border-b" style={{ borderColor: PURPLE + "30" }}>
                <h2 className="text-lg font-black tracking-tight">The Rewrite Lab</h2>
                <p className="text-xs mt-1" style={{ color: "#6b7280" }}>
                  What this page should actually say
                </p>
              </div>

              <div className="space-y-0 divide-y" style={{ borderColor: BORDER }}>
                {/* Headline */}
                <div style={{ padding: "28px" }}>
                  <p className="font-bold uppercase tracking-widest" style={{ color: PURPLE, fontSize: "11px", marginBottom: "20px" }}>
                    A. Headline Rewrite
                  </p>
                  <StrikethroughHeadline
                    text={result.headline_original}
                    rewrite={result.headline_rewrite}
                    reasoning={result.headline_reasoning}
                  />
                  <p className="leading-relaxed" style={{ color: "#6b7280", fontSize: "13px" }}>
                    {result.headline_reasoning}
                  </p>
                </div>

                {/* Description */}
                <div style={{ padding: "28px" }}>
                  <p className="font-bold uppercase tracking-widest" style={{ color: PURPLE, fontSize: "11px", marginBottom: "20px" }}>
                    B. Description Rewrite
                  </p>
                  <div className="rounded-xl border" style={{ backgroundColor: "#0a0a0a", borderColor: BORDER, padding: "20px", marginBottom: "16px" }}>
                    <p className="leading-relaxed whitespace-pre-wrap" style={{ color: "#e5e7eb", fontSize: "14px" }}>{result.description_rewrite}</p>
                  </div>
                  <p className="leading-relaxed" style={{ color: "#6b7280", fontSize: "13px" }}>
                    {result.description_reasoning}
                  </p>
                </div>

                {/* Pricing */}
                <div style={{ padding: "28px" }}>
                  <p className="font-bold uppercase tracking-widest" style={{ color: PURPLE, fontSize: "11px", marginBottom: "20px" }}>
                    C. Pricing Block Rewrite
                  </p>
                  <div
                    className="rounded-xl border font-mono whitespace-pre-wrap leading-relaxed"
                    style={{ backgroundColor: "#0a0a0a", borderColor: PURPLE + "50", color: "#d1d5db", padding: "20px", fontSize: "14px", marginBottom: "16px" }}
                  >
                    {result.pricing_rewrite}
                  </div>
                  <p className="leading-relaxed" style={{ color: "#6b7280", fontSize: "13px" }}>
                    {result.pricing_reasoning}
                  </p>
                </div>
              </div>
            </div>

            {/* 4. Affiliate Intelligence */}
            {hasAffiliate && (
              <div className="rounded-2xl border p-6" style={{ backgroundColor: CARD, borderColor: BORDER }}>
                <h2 className="text-lg font-black mb-1 tracking-tight">Affiliate Intelligence</h2>
                <p className="text-xs mb-5" style={{ color: "#6b7280" }}>
                  Is your program actually shareable?
                </p>

                <div className="space-y-4 mb-6">
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: "#0a0a0a", borderColor: BORDER }}>
                    <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#4b5563" }}>
                      Current Setup Assessment
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: "#d1d5db" }}>{result.affiliate_assessment}</p>
                  </div>
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: "#0a0a0a", borderColor: PURPLE + "40" }}>
                    <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: PURPLE }}>
                      Recommended Commission Rate
                    </p>
                    <p className="text-sm font-semibold" style={{ color: "#d1d5db" }}>{result.affiliate_commission_recommendation}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#4b5563" }}>
                    Plug-and-Play Affiliate Pitch Lines
                  </p>
                  <div className="space-y-3">
                    {result.affiliate_pitch_lines.map((line, i) => (
                      <div key={i} className="rounded-lg border" style={{ backgroundColor: "#0a0a0a", borderColor: BORDER, padding: "16px" }}>
                        <p className="leading-relaxed" style={{ color: "#d1d5db", fontSize: "14px", marginBottom: "12px" }}>
                          &ldquo;{line}&rdquo;
                        </p>
                        <CopyButton text={line} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. One Thing */}
            <div
              className="rounded-2xl border text-center"
              style={{ backgroundColor: "#0d0d1a", borderColor: PURPLE + "40", padding: "32px 24px" }}
            >
              <p className="font-bold uppercase tracking-widest" style={{ color: "#4b5563", fontSize: "11px", marginBottom: "24px" }}>
                The single highest-leverage thing you can do right now:
              </p>
              <p
                className="font-black leading-relaxed max-w-xl mx-auto"
                style={{ color: PURPLE, fontSize: "clamp(18px, 4vw, 22px)", marginBottom: "40px" }}
              >
                {result.one_thing}
              </p>
              <p className="font-semibold" style={{ color: "#6b7280", fontSize: "14px", marginBottom: "16px" }}>
                Ready to ship a better page?
              </p>
              <a
                href="https://whop.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-xl font-black transition-all hover:opacity-90"
                style={{ backgroundColor: PURPLE, color: "white", fontSize: "15px", padding: "14px 36px" }}
              >
                Open Whop &rarr;
              </a>
              <p style={{ color: "#374151", fontSize: "13px", marginTop: "16px" }}>
                Whop takes 3% on sales. No monthly fees. 100K+ creators.
              </p>
            </div>

            {/* Reset */}
            <div className="text-center pb-4">
              <button
                onClick={reset}
                className="text-sm transition-colors"
                style={{ color: "#4b5563" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#9ca3af")}
                onMouseLeave={e => (e.currentTarget.style.color = "#4b5563")}
              >
                &#8592; Roast a different page
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center" style={{ borderColor: BORDER }}>
        <p className="text-xs leading-relaxed" style={{ color: "#374151" }}>
          This roast is AI-generated and for educational purposes only. Results are illustrative.{" "}
          Built by{" "}
          <Link href="/" className="hover:text-gray-500 underline transition-colors">
            Armaan Kazi
          </Link>{" "}
          (not affiliated with Whop)
        </p>
      </footer>
    </div>
  );
}
