"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type PromptStyle = "informational" | "comparison" | "recommendation";
type MentionTier = "primary" | "secondary" | "brief" | "none";
type PageState = "input" | "loading" | "results";

interface BrandScore {
  brand: string;
  tier: MentionTier;
  score: number;
}

interface PromptResult {
  prompt: string;
  responseText: string;
  brandScores: BrandScore[];
  failed?: boolean;
}

interface GEORecommendation {
  title: string;
  explanation: string;
  difficulty: "Easy" | "Medium" | "Advanced";
  category: "Content" | "Technical" | "PR" | "Positioning";
}

interface LoadingStep {
  text: string;
  error?: boolean;
}

interface ComputedScores {
  totalScore: Record<string, number>;
  mentionCount: Record<string, number>;
  primaryCount: Record<string, number>;
  shareOfVoice: Record<string, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<MentionTier, { label: string; icon: string; color: string; bg: string }> = {
  primary:   { label: "Primary",  icon: "🟢", color: "#16a34a", bg: "#f0fdf4" },
  secondary: { label: "Secondary",icon: "🟡", color: "#ca8a04", bg: "#fefce8" },
  brief:     { label: "Brief",    icon: "🔵", color: "#2563eb", bg: "#eff6ff" },
  none:      { label: "Absent",   icon: "⚪", color: "#9ca3af", bg: "#f9fafb" },
};

const DIFF_CONFIG: Record<string, { color: string; bg: string }> = {
  Easy:     { color: "#16a34a", bg: "#f0fdf4" },
  Medium:   { color: "#ca8a04", bg: "#fefce8" },
  Advanced: { color: "#dc2626", bg: "#fef2f2" },
};

const CAT_CONFIG: Record<string, { color: string; bg: string }> = {
  Content:     { color: "#7c3aed", bg: "#f5f3ff" },
  Technical:   { color: "#0369a1", bg: "#f0f9ff" },
  PR:          { color: "#be185d", bg: "#fdf2f8" },
  Positioning: { color: "#b45309", bg: "#fffbeb" },
};

function computeScores(results: PromptResult[], allBrands: string[]): ComputedScores {
  const totalScore: Record<string, number> = {};
  const mentionCount: Record<string, number> = {};
  const primaryCount: Record<string, number> = {};

  for (const b of allBrands) {
    totalScore[b] = 0;
    mentionCount[b] = 0;
    primaryCount[b] = 0;
  }

  for (const r of results.filter(r => !r.failed)) {
    for (const bs of r.brandScores) {
      if (totalScore[bs.brand] !== undefined) {
        totalScore[bs.brand] += bs.score;
        if (bs.score > 0) mentionCount[bs.brand]++;
        if (bs.tier === "primary") primaryCount[bs.brand]++;
      }
    }
  }

  const totalAll = Object.values(totalScore).reduce((a, b) => a + b, 0);
  const shareOfVoice: Record<string, number> = {};
  for (const b of allBrands) {
    shareOfVoice[b] = totalAll > 0 ? Math.round((totalScore[b] / totalAll) * 100) : 0;
  }

  return { totalScore, mentionCount, primaryCount, shareOfVoice };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SOVChart({
  allBrands,
  userBrand,
  scores,
}: {
  allBrands: string[];
  userBrand: string;
  scores: ComputedScores;
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  const sorted = [...allBrands].sort((a, b) => scores.totalScore[b] - scores.totalScore[a]);
  const max = Math.max(...allBrands.map(b => scores.totalScore[b]), 1);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280] mb-4">
        AI Share of Voice — Simulated across 5 industry prompts
      </h3>
      <div className="space-y-3">
        {sorted.map((brand) => {
          const isUser = brand === userBrand;
          const pct = Math.round((scores.totalScore[brand] / max) * 100);
          return (
            <div key={brand}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium ${isUser ? "text-[#1a2744]" : "text-[#374151]"}`}>
                  {brand}
                  {isUser && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#1a2744]/10 text-[#1a2744]">You</span>}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#6b7280]">{scores.totalScore[brand]}/15</span>
                  <span className={`text-xs font-semibold ${isUser ? "text-[#1a2744]" : "text-[#6b7280]"}`}>
                    {scores.shareOfVoice[brand]}% SOV
                  </span>
                </div>
              </div>
              <div className="h-7 bg-[#f3f4f6] rounded-lg overflow-hidden">
                <div
                  className="h-full rounded-lg transition-all duration-700 ease-out flex items-center pl-2"
                  style={{
                    width: animated ? `${Math.max(pct, 2)}%` : "0%",
                    backgroundColor: isUser ? "#1a2744" : "#9ca3af",
                  }}
                >
                  {pct > 15 && (
                    <span className="text-[10px] font-semibold text-white/90 truncate">
                      {scores.totalScore[brand]} pts
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromptTable({
  results,
  allBrands,
  userBrand,
}: {
  results: PromptResult[];
  allBrands: string[];
  userBrand: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280] mb-4">
        Prompt Breakdown
      </h3>
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] min-w-[200px]">Prompt</th>
              {allBrands.map(b => (
                <th key={b} className="px-3 py-3 text-xs font-semibold text-[#6b7280] min-w-[110px]">
                  <span className={b === userBrand ? "text-[#1a2744] font-bold" : ""}>{b}</span>
                </th>
              ))}
              <th className="px-3 py-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const isExp = expanded === i;
              return (
                <>
                  <tr
                    key={i}
                    className={`border-b border-[#e5e7eb] cursor-pointer hover:bg-[#f9fafb] transition-colors ${isExp ? "bg-[#f0f9ff]" : ""}`}
                    onClick={() => setExpanded(isExp ? null : i)}
                  >
                    <td className="px-4 py-3 text-[#374151] text-xs leading-relaxed max-w-[260px]">
                      {r.failed ? (
                        <span className="text-[#9ca3af] italic">Analysis unavailable</span>
                      ) : (
                        <span className="line-clamp-2">&ldquo;{r.prompt}&rdquo;</span>
                      )}
                    </td>
                    {allBrands.map(b => {
                      const bs = r.brandScores.find(s => s.brand === b);
                      const tier = bs?.tier ?? "none";
                      const cfg = TIER_CONFIG[tier];
                      return (
                        <td key={b} className="px-3 py-3 text-center">
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ color: cfg.color, backgroundColor: cfg.bg }}
                          >
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-[#9ca3af] text-xs text-center">
                      {isExp ? "▲" : "▼"}
                    </td>
                  </tr>
                  {isExp && !r.failed && (
                    <tr key={`${i}-exp`} className="bg-[#f0f9ff] border-b border-[#e5e7eb]">
                      <td colSpan={allBrands.length + 2} className="px-4 py-4">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280] mb-2">
                          Claude&apos;s simulated AI response
                        </p>
                        <p className="text-xs text-[#374151] leading-relaxed whitespace-pre-wrap">
                          {r.responseText}
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[#9ca3af]">Click any row to see the simulated AI response.</p>
    </div>
  );
}

function BrandScorecard({
  brand,
  results,
  scores,
  totalPrompts,
}: {
  brand: string;
  results: PromptResult[];
  scores: ComputedScores;
  totalPrompts: number;
}) {
  const mentionRate = Math.round((scores.mentionCount[brand] / totalPrompts) * 100);
  const total = scores.totalScore[brand];

  const strongestIdx = results.reduce((best, r, i) => {
    const s = r.brandScores.find(b => b.brand === brand)?.score ?? 0;
    const bests = results[best]?.brandScores.find(b => b.brand === brand)?.score ?? -1;
    return s > bests ? i : best;
  }, 0);

  const weakestIdx = results.reduce((worst, r, i) => {
    const s = r.brandScores.find(b => b.brand === brand)?.score ?? 99;
    const worsts = results[worst]?.brandScores.find(b => b.brand === brand)?.score ?? 99;
    return s < worsts ? i : worst;
  }, 0);

  const stats = [
    { label: "Total Score", value: `${total} / ${totalPrompts * 3}`, sub: "max 3pts per prompt" },
    { label: "Share of Voice", value: `${scores.shareOfVoice[brand]}%`, sub: "vs all brands analyzed" },
    { label: "Mention Rate", value: `${mentionRate}%`, sub: `${scores.mentionCount[brand]} of ${totalPrompts} prompts` },
    { label: "Primary Mentions", value: `${scores.primaryCount[brand]}`, sub: "led the AI response" },
    {
      label: "Strongest Prompt",
      value: TIER_CONFIG[results[strongestIdx]?.brandScores.find(b => b.brand === brand)?.tier ?? "none"].label,
      sub: `"${results[strongestIdx]?.prompt.slice(0, 45)}…"`,
    },
    {
      label: "Weakest Prompt",
      value: TIER_CONFIG[results[weakestIdx]?.brandScores.find(b => b.brand === brand)?.tier ?? "none"].label,
      sub: `"${results[weakestIdx]?.prompt.slice(0, 45)}…"`,
    },
  ];

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280] mb-4">
        {brand} Scorecard
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-[#e5e7eb] bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af] mb-1">{s.label}</p>
            <p className="text-xl font-bold text-[#1a2744] mb-0.5 leading-tight">{s.value}</p>
            <p className="text-[10px] text-[#9ca3af] leading-snug">{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompetitorTable({
  allBrands,
  userBrand,
  scores,
  totalPrompts,
}: {
  allBrands: string[];
  userBrand: string;
  scores: ComputedScores;
  totalPrompts: number;
}) {
  const sorted = [...allBrands].sort((a, b) => scores.totalScore[b] - scores.totalScore[a]);
  const maxScore = Math.max(...allBrands.map(b => scores.totalScore[b]));
  const maxMention = Math.max(...allBrands.map(b => scores.mentionCount[b]));
  const maxPrimary = Math.max(...allBrands.map(b => scores.primaryCount[b]));

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280] mb-4">
        Competitor Comparison
      </h3>
      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280]">Brand</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#6b7280] text-right">Total Score</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#6b7280] text-right">Mention Rate</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#6b7280] text-right">Primary Mentions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((brand) => {
              const isUser = brand === userBrand;
              const rate = Math.round((scores.mentionCount[brand] / totalPrompts) * 100);
              return (
                <tr key={brand} className={`border-b border-[#e5e7eb] last:border-0 ${isUser ? "bg-[#1a2744]/[0.03]" : ""}`}>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${isUser ? "text-[#1a2744]" : "text-[#374151]"}`}>
                      {brand}
                    </span>
                    {isUser && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#1a2744]/10 text-[#1a2744]">You</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold ${scores.totalScore[brand] === maxScore ? "text-[#16a34a]" : "text-[#374151]"}`}>
                      {scores.totalScore[brand]}/15
                      {scores.totalScore[brand] === maxScore && <span className="ml-1 text-[10px]">🏆</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm ${scores.mentionCount[brand] === maxMention ? "font-semibold text-[#16a34a]" : "text-[#374151]"}`}>
                      {rate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm ${scores.primaryCount[brand] === maxPrimary ? "font-semibold text-[#16a34a]" : "text-[#374151]"}`}>
                      {scores.primaryCount[brand]}
                      {scores.primaryCount[brand] === maxPrimary && maxPrimary > 0 && <span className="ml-1 text-[10px]">🏆</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecommendationsPanel({
  recommendations,
  loading,
}: {
  recommendations: GEORecommendation[];
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[#1a2744] p-6 sm:p-8">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#60a5fa] mb-1">
          Powered by Claude
        </p>
        <h3 className="text-xl font-bold text-white">GEO Recommendations</h3>
        <p className="text-sm text-[#94a3b8] mt-1">
          Specific, actionable steps to improve your AI search presence — grounded in your results.
        </p>
      </div>

      {loading && recommendations.length === 0 && (
        <div className="flex items-center gap-3 py-6">
          <div className="w-4 h-4 rounded-full border-2 border-[#60a5fa]/30 border-t-[#60a5fa] animate-spin" />
          <span className="text-sm text-[#94a3b8]">Generating recommendations…</span>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recommendations.map((rec, i) => {
            const diffCfg = DIFF_CONFIG[rec.difficulty] ?? DIFF_CONFIG.Medium;
            const catCfg  = CAT_CONFIG[rec.category]   ?? CAT_CONFIG.Content;
            return (
              <div key={i} className="rounded-xl bg-white/[0.06] border border-white/10 p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-white leading-snug">{rec.title}</h4>
                  <span
                    className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: diffCfg.color, backgroundColor: diffCfg.bg }}
                  >
                    {rec.difficulty}
                  </span>
                </div>
                <p className="text-xs text-[#cbd5e1] leading-relaxed mb-3">{rec.explanation}</p>
                <span
                  className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: catCfg.color, backgroundColor: catCfg.bg }}
                >
                  {rec.category}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AthenaHQPage() {
  // ── Form state ───────────────────────────────────────────────────────────────
  const [brand, setBrand]           = useState("");
  const [description, setDescription] = useState("");
  const [comp1, setComp1]           = useState("");
  const [comp2, setComp2]           = useState("");
  const [comp3, setComp3]           = useState("");
  const [industry, setIndustry]     = useState("");
  const [promptStyle, setPromptStyle] = useState<PromptStyle>("informational");

  // ── App state ────────────────────────────────────────────────────────────────
  const [pageState, setPageState]       = useState<PageState>("input");
  const [steps, setSteps]               = useState<LoadingStep[]>([]);
  const [promptResults, setPromptResults] = useState<PromptResult[]>([]);
  const [recommendations, setRecommendations] = useState<GEORecommendation[]>([]);
  const [recsLoading, setRecsLoading]   = useState(false);
  const [globalError, setGlobalError]   = useState("");

  const stepsEndRef = useRef<HTMLDivElement>(null);

  const addStep = useCallback((text: string, error = false) => {
    setSteps(prev => [...prev, { text, error }]);
  }, []);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  const competitors = [comp1, comp2, comp3].filter(Boolean);

  // ── Analysis flow ─────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!brand.trim() || !industry.trim()) return;

    setPageState("loading");
    setSteps([]);
    setPromptResults([]);
    setRecommendations([]);
    setRecsLoading(false);
    setGlobalError("");

    try {
      // Step 1: generate prompts
      addStep("Generating industry prompts…");
      const genRes = await fetch("/api/athena-hq/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, description, competitors, industry, promptStyle }),
        signal: AbortSignal.timeout(25000),
      });
      const rawGen = await genRes.text();
      let prompts: string[] = [];
      try {
        prompts = (JSON.parse(rawGen) as { prompts: string[] }).prompts;
      } catch {
        throw new Error("Failed to parse prompts from API.");
      }
      if (!prompts?.length) throw new Error("No prompts returned.");
      addStep(`✓ Generated ${prompts.length} ${promptStyle} prompts`);

      // Steps 2–6: analyze prompts in parallel, add steps as each completes
      const allBrands = [brand, ...competitors];
      const collected: PromptResult[] = [];

      const analyzeOne = async (prompt: string, idx: number): Promise<PromptResult> => {
        addStep(`Analyzing prompt ${idx + 1} of ${prompts.length}: "${prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt}"`);
        try {
          const res = await fetch("/api/athena-hq/analyze-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, brand, description, competitors }),
            signal: AbortSignal.timeout(25000),
          });
          const text = await res.text();
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = JSON.parse(text) as PromptResult;

          // Ensure all brands have a score entry
          for (const b of allBrands) {
            if (!data.brandScores.find(s => s.brand === b)) {
              data.brandScores.push({ brand: b, tier: "none", score: 0 });
            }
          }

          addStep(`✓ Prompt ${idx + 1}: "${prompt.slice(0, 50)}…" — scored`);
          return data;
        } catch {
          addStep(`⚠ Prompt ${idx + 1}: analysis unavailable`, true);
          return { prompt, responseText: "", brandScores: allBrands.map(b => ({ brand: b, tier: "none" as MentionTier, score: 0 })), failed: true };
        }
      };

      const settled = await Promise.allSettled(prompts.map((p, i) => analyzeOne(p, i)));
      for (const r of settled) {
        if (r.status === "fulfilled") collected.push(r.value);
      }

      // Step 7: scoring
      addStep("Scoring brand mentions…");
      setPromptResults(collected);

      // Transition to results
      setPageState("results");

      // Step 8: recommendations (non-blocking, shows up after results render)
      setRecsLoading(true);
      addStep("Generating GEO recommendations…");
      try {
        const recsRes = await fetch("/api/athena-hq/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand, description, industry, competitors, promptResults: collected }),
          signal: AbortSignal.timeout(25000),
        });
        const recsText = await recsRes.text();
        const recsData = JSON.parse(recsText) as { recommendations: GEORecommendation[] };
        setRecommendations(recsData.recommendations ?? []);
        addStep("✓ GEO recommendations ready");
      } catch {
        addStep("⚠ Recommendations unavailable", true);
      } finally {
        setRecsLoading(false);
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setPageState("input");
    }
  };

  const handleReset = () => {
    setPageState("input");
    setSteps([]);
    setPromptResults([]);
    setRecommendations([]);
    setGlobalError("");
  };

  // ── Computed values ──────────────────────────────────────────────────────────
  const allBrands = [brand, ...competitors];
  const scores = promptResults.length > 0 ? computeScores(promptResults, allBrands) : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f9fafb] font-sans">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="bg-[#1a2744] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-0.5">
              <span className="text-xl font-bold tracking-tight">AthenaHQ</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#60a5fa]/20 text-[#93c5fd] border border-[#60a5fa]/20">
                GEO Visibility Checker · Powered by Claude
              </span>
            </div>
            <p className="text-xs text-[#94a3b8] leading-relaxed max-w-xl">
              Generative Engine Optimization (GEO) is the practice of optimizing your brand&apos;s presence in AI-generated search responses.
              This tool simulates how AI models mention your brand vs. competitors across real industry prompts.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-[#64748b]">Demo by</p>
            <Link href="/" className="text-xs text-[#93c5fd] hover:underline">Armaan Kazi</Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* ── INPUT ─────────────────────────────────────────────────────────── */}
        {pageState === "input" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8 space-y-6">

              {globalError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {globalError}
                </div>
              )}

              {/* Brand */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
                  Your Brand
                </label>
                <input
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="e.g. Stripe, Notion, Linear"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] bg-white text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#1a2744] transition-colors"
                />
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="One-line description or website (gives Claude context)"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] bg-white text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#1a2744] transition-colors"
                />
              </div>

              {/* Competitors */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
                  Competitors <span className="font-normal normal-case text-[#9ca3af]">(optional, up to 3)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    [comp1, setComp1],
                    [comp2, setComp2],
                    [comp3, setComp3],
                  ].map(([val, set], i) => (
                    <input
                      key={i}
                      value={val as string}
                      onChange={e => (set as (v: string) => void)(e.target.value)}
                      placeholder={`Competitor ${i + 1}`}
                      className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] bg-white text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#1a2744] transition-colors"
                    />
                  ))}
                </div>
              </div>

              {/* Industry */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
                  Industry / Category
                </label>
                <input
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  placeholder='e.g. "business banking", "project management software", "sustainable skincare"'
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] bg-white text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#1a2744] transition-colors"
                />
              </div>

              {/* Prompt style */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-widest text-[#6b7280]">
                  Target Prompt Style
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["informational", "comparison", "recommendation"] as PromptStyle[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setPromptStyle(s)}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-all ${
                        promptStyle === s
                          ? "bg-[#1a2744] text-white border-[#1a2744]"
                          : "bg-white text-[#374151] border-[#e5e7eb] hover:border-[#1a2744]/30"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#9ca3af]">
                  {promptStyle === "informational" && 'Generates "What is the best X?" style queries'}
                  {promptStyle === "comparison"    && 'Generates "X vs Y vs Z" style queries'}
                  {promptStyle === "recommendation" && 'Generates "Recommend a tool for..." style queries'}
                </p>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!brand.trim() || !industry.trim()}
                className="w-full py-3 rounded-xl bg-[#1a2744] text-white text-sm font-semibold hover:bg-[#243460] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Analyze AI Visibility →
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────────── */}
        {pageState === "loading" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-4 h-4 rounded-full border-2 border-[#1a2744]/20 border-t-[#1a2744] animate-spin" />
                <h2 className="text-sm font-semibold text-[#1a2744]">Running GEO analysis for {brand}…</h2>
              </div>
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div key={i} className={`flex items-start gap-2 text-sm ${step.error ? "text-amber-600" : "text-[#374151]"}`}>
                    <span className="mt-0.5 shrink-0">{step.error ? "⚠" : "✓"}</span>
                    <span className="leading-snug">{step.text}</span>
                  </div>
                ))}
                {steps.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-[#9ca3af] pt-1">
                    <div className="w-3 h-3 rounded-full border-2 border-[#9ca3af]/30 border-t-[#9ca3af] animate-spin" />
                    <span>Working…</span>
                  </div>
                )}
              </div>
              <div ref={stepsEndRef} />
            </div>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────────────── */}
        {pageState === "results" && scores && (
          <div className="space-y-8">

            {/* Ongoing steps (recommendations loading) */}
            {(recsLoading || steps.some(s => s.error)) && (
              <div className="bg-white rounded-xl border border-[#e5e7eb] px-5 py-4">
                <div className="space-y-1.5">
                  {steps.slice(-3).map((s, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs ${s.error ? "text-amber-600" : "text-[#6b7280]"}`}>
                      <span>{s.error ? "⚠" : "✓"}</span>
                      <span>{s.text}</span>
                    </div>
                  ))}
                  {recsLoading && (
                    <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                      <div className="w-3 h-3 rounded-full border-2 border-[#9ca3af]/30 border-t-[#9ca3af] animate-spin" />
                      <span>Generating recommendations…</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SOV Chart */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <SOVChart allBrands={allBrands} userBrand={brand} scores={scores} />
            </div>

            {/* Prompt breakdown table */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <PromptTable results={promptResults} allBrands={allBrands} userBrand={brand} />
            </div>

            {/* Scorecard */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <BrandScorecard
                brand={brand}
                results={promptResults}
                scores={scores}
                totalPrompts={promptResults.length}
              />
            </div>

            {/* Competitor table */}
            {allBrands.length > 1 && (
              <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
                <CompetitorTable
                  allBrands={allBrands}
                  userBrand={brand}
                  scores={scores}
                  totalPrompts={promptResults.length}
                />
              </div>
            )}

            {/* Recommendations */}
            <RecommendationsPanel recommendations={recommendations} loading={recsLoading} />

            {/* Disclaimer */}
            <div className="rounded-xl bg-[#f3f4f6] border border-[#e5e7eb] px-5 py-4 space-y-1">
              <p className="text-xs text-[#6b7280] leading-relaxed">
                This demo simulates GEO visibility using Claude as a proxy for AI search engines. Real-world GEO monitoring requires tracking
                live responses across ChatGPT, Perplexity, Gemini, and other models over time.{" "}
                <a href="https://athenahq.ai" target="_blank" rel="noopener noreferrer" className="text-[#1a2744] underline hover:no-underline">
                  Visit athenahq.ai
                </a>{" "}
                for production-grade GEO intelligence.
              </p>
              <p className="text-[10px] text-[#9ca3af]">
                Built by Armaan Kazi as a portfolio demo. Not affiliated with AthenaHQ.
              </p>
            </div>

            {/* Reset */}
            <div className="text-center pb-4">
              <button
                onClick={handleReset}
                className="px-6 py-2.5 rounded-xl border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] hover:border-[#1a2744]/30 hover:text-[#1a2744] transition-colors"
              >
                ← Run New Analysis
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
