"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// recharts — loaded client-side only (uses window)
const BarChart     = dynamic(() => import("recharts").then(m => m.BarChart),     { ssr: false });
const Bar          = dynamic(() => import("recharts").then(m => m.Bar),          { ssr: false });
const XAxis        = dynamic(() => import("recharts").then(m => m.XAxis),        { ssr: false });
const YAxis        = dynamic(() => import("recharts").then(m => m.YAxis),        { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(m => m.CartesianGrid), { ssr: false });
const Tooltip      = dynamic(() => import("recharts").then(m => m.Tooltip),      { ssr: false });
const Legend       = dynamic(() => import("recharts").then(m => m.Legend),       { ssr: false });
const ReferenceLine = dynamic(() => import("recharts").then(m => m.ReferenceLine), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

type PageState = "input" | "loading" | "results";
type ModelType = "Credit Scoring" | "Content Moderation" | "Fraud Detection" | "Recommendation Engine" | "Other";
type CoverageLimit = "$500K" | "$1M" | "$2M" | "$5M" | "$10M";
type FundingStage = "Pre-Seed" | "Seed" | "Series A" | "Series B" | "Growth";

interface ClusterResult {
  center: number;
  size: number;
  outliers: number[];
  secondaryCenter?: number;
  secondarySize?: number;
}

interface DriftMetrics {
  t0Mean: number;
  t1Mean: number;
  meanShift: number;
  t0Std: number;
  t1Std: number;
  varianceChangePct: number;
  overlapPct: number;
  riskDeltaScore: number;
  riskLevel: "Low" | "Moderate" | "Significant" | "Critical";
  riskColor: string;
  t0Cluster: ClusterResult;
  t1Cluster: ClusterResult;
  secondaryClusterDetected: boolean;
  histogramData: { bin: string; t0: number; t1: number; binMid: number }[];
}

interface CorgiRecommendation {
  current_coverage_adequate: boolean;
  recommended_coverage_limit: string;
  risk_factors: string[];
  recommendations: { title: string; explanation: string; urgency: string }[];
  regulatory_note: string;
}

// ─── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_T0 = "0.82, 0.76, 0.71, 0.79, 0.83, 0.74, 0.69, 0.78, 0.85, 0.72, 0.80, 0.77, 0.73, 0.81, 0.75, 0.70, 0.84, 0.68, 0.78, 0.76, 0.83, 0.71, 0.79, 0.74, 0.87, 0.69, 0.82, 0.77, 0.73, 0.80, 0.75, 0.86, 0.71, 0.78, 0.74, 0.83, 0.68, 0.81, 0.76, 0.79";
const SAMPLE_T1 = "0.45, 0.62, 0.38, 0.55, 0.71, 0.43, 0.59, 0.34, 0.68, 0.41, 0.57, 0.29, 0.63, 0.48, 0.72, 0.36, 0.54, 0.66, 0.31, 0.58, 0.44, 0.70, 0.39, 0.61, 0.47, 0.33, 0.65, 0.52, 0.42, 0.73, 0.37, 0.56, 0.49, 0.28, 0.64, 0.46, 0.60, 0.35, 0.53, 0.67";

// ─── Client-side math ─────────────────────────────────────────────────────────

function parseValues(raw: string): number[] {
  return raw
    .split(/[\s,]+/)
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n >= 0 && n <= 1);
}

function mean(vals: number[]): number {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function std(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = mean(vals);
  return Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / vals.length);
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeOverlap(t0: number[], t1: number[]): number {
  if (!t1.length) return 0;
  const sorted = [...t0].sort((a, b) => a - b);
  // For small samples use full min-max range to avoid false zero from tight IQR
  let lo: number, hi: number;
  if (t0.length < 20) {
    lo = sorted[0];
    hi = sorted[sorted.length - 1];
  } else {
    lo = percentile(sorted, 25);
    hi = percentile(sorted, 75);
  }
  const inRange = t1.filter(v => v >= lo && v <= hi).length;
  return (inRange / t1.length) * 100;
}

// Simple 1-D DBSCAN-style clustering
function cluster1D(vals: number[], eps = 0.12, minPts = 3): ClusterResult {
  const sorted = [...vals].sort((a, b) => a - b);
  const labels: number[] = new Array(sorted.length).fill(-1); // -1 = noise
  let clusterIdx = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (labels[i] !== -1) continue;
    // Find neighbors within eps
    const neighbors = sorted
      .map((v, j) => ({ v, j }))
      .filter(({ v }) => Math.abs(v - sorted[i]) <= eps)
      .map(({ j }) => j);

    if (neighbors.length < minPts) {
      labels[i] = -1; // noise
      continue;
    }
    const cid = clusterIdx++;
    for (const j of neighbors) labels[j] = cid;
    // Expand
    const queue = [...neighbors];
    while (queue.length) {
      const cur = queue.shift()!;
      const curNeighbors = sorted
        .map((v, j) => ({ v, j }))
        .filter(({ v }) => Math.abs(v - sorted[cur]) <= eps)
        .map(({ j }) => j);
      if (curNeighbors.length >= minPts) {
        for (const j of curNeighbors) {
          if (labels[j] === -1) { labels[j] = cid; queue.push(j); }
          else if (labels[j] === -2) { labels[j] = cid; }
        }
      }
    }
  }

  // Extract clusters
  const clusterMap = new Map<number, number[]>();
  const outlierVals: number[] = [];
  sorted.forEach((v, i) => {
    const lbl = labels[i];
    if (lbl === -1) { outlierVals.push(v); return; }
    if (!clusterMap.has(lbl)) clusterMap.set(lbl, []);
    clusterMap.get(lbl)!.push(v);
  });

  const clusters = [...clusterMap.values()].sort((a, b) => b.length - a.length);
  const primary = clusters[0] ?? sorted;
  const secondary = clusters[1];

  return {
    center: Math.round(mean(primary) * 1000) / 1000,
    size: primary.length,
    outliers: outlierVals,
    secondaryCenter: secondary ? Math.round(mean(secondary) * 1000) / 1000 : undefined,
    secondarySize: secondary?.length,
  };
}

function buildHistogram(t0: number[], t1: number[]): { bin: string; t0: number; t1: number; binMid: number }[] {
  const bins: { bin: string; t0: number; t1: number; binMid: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const lo = i * 0.1;
    const hi = lo + 0.1;
    bins.push({
      bin: `${lo.toFixed(1)}–${hi.toFixed(1)}`,
      binMid: lo + 0.05,
      t0: t0.filter(v => v >= lo && (i === 9 ? v <= hi : v < hi)).length,
      t1: t1.filter(v => v >= lo && (i === 9 ? v <= hi : v < hi)).length,
    });
  }
  return bins;
}

// Piecewise linear interpolation helper
function piecewise(x: number, stops: [number, number][]): number {
  if (x <= stops[0][0]) return stops[0][1];
  if (x >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, y0] = stops[i];
    const [x1, y1] = stops[i + 1];
    if (x >= x0 && x <= x1) {
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return stops[stops.length - 1][1];
}

function computeRiskScore(meanShift: number, varianceChangePct: number, overlapPct: number): number {
  // Mean Shift component (0–100 sub-score, weight 40%)
  const meanSub = piecewise(meanShift, [
    [0.00,   0], [0.05,  10], [0.10,  25], [0.20,  50], [0.35,  75], [0.50, 100],
  ]);

  // Variance Change component (0–100 sub-score, weight 30%) — uses absolute %
  const varianceSub = piecewise(Math.abs(varianceChangePct), [
    [0,    0], [25,  10], [75,  30], [150,  60], [250, 100],
  ]);

  // Overlap component (0–100 sub-score, weight 30%) — inverted: less overlap = higher risk
  const overlapSub = piecewise(overlapPct, [
    [0,   100], [10,   60], [30,  30], [60,  10], [100,   0],
  ]);

  return Math.round(meanSub * 0.40 + varianceSub * 0.30 + overlapSub * 0.30);
}

function riskBand(score: number): { level: "Low" | "Moderate" | "Significant" | "Critical"; color: string; bg: string; label: string } {
  if (score <= 25) return { level: "Low",         color: "#16a34a", bg: "#f0fdf4", label: "Minimal Risk Change" };
  if (score <= 50) return { level: "Moderate",    color: "#ca8a04", bg: "#fefce8", label: "Review Recommended" };
  if (score <= 75) return { level: "Significant", color: "#ea580c", bg: "#fff7ed", label: "Coverage Gap Likely" };
  return               { level: "Critical",     color: "#dc2626", bg: "#fef2f2", label: "Immediate Action Required" };
}

function computeAllMetrics(t0: number[], t1: number[]): DriftMetrics {
  const t0Mean = Math.round(mean(t0) * 1000) / 1000;
  const t1Mean = Math.round(mean(t1) * 1000) / 1000;
  const meanShift = Math.round(Math.abs(t1Mean - t0Mean) * 1000) / 1000;
  const t0Std = Math.round(std(t0) * 1000) / 1000;
  const t1Std = Math.round(std(t1) * 1000) / 1000;
  const varianceChangePct = t0Std > 0 ? Math.round(((t1Std - t0Std) / t0Std) * 1000) / 10 : 0;
  const overlapPct = Math.round(computeOverlap(t0, t1) * 10) / 10;
  const riskDeltaScore = computeRiskScore(meanShift, varianceChangePct, overlapPct);
  const band = riskBand(riskDeltaScore);

  const t0Cluster = cluster1D(t0);
  const t1Cluster = cluster1D(t1);
  const secondaryClusterDetected = !!t1Cluster.secondaryCenter;

  return {
    t0Mean, t1Mean, meanShift,
    t0Std, t1Std, varianceChangePct,
    overlapPct, riskDeltaScore,
    riskLevel: band.level,
    riskColor: band.color,
    t0Cluster, t1Cluster, secondaryClusterDetected,
    histogramData: buildHistogram(t0, t1),
  };
}

// ─── Urgency badge ────────────────────────────────────────────────────────────

const URGENCY_STYLES: Record<string, { color: string; bg: string }> = {
  Low:      { color: "#16a34a", bg: "#f0fdf4" },
  Medium:   { color: "#ca8a04", bg: "#fefce8" },
  High:     { color: "#ea580c", bg: "#fff7ed" },
  Critical: { color: "#dc2626", bg: "#fef2f2" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskGauge({ score, band }: { score: number; band: ReturnType<typeof riskBand> }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score circle */}
      <div
        className="w-32 h-32 rounded-full flex flex-col items-center justify-center border-4 shadow-md"
        style={{ borderColor: band.color, backgroundColor: band.bg }}
      >
        <span className="text-4xl font-black" style={{ color: band.color }}>{score}</span>
        <span className="text-[10px] font-semibold text-[#6b7280] mt-0.5">/ 100</span>
      </div>
      <div className="text-center">
        <p className="text-sm font-bold" style={{ color: band.color }}>{band.level} Drift</p>
        <p className="text-xs text-[#6b7280]">{band.label}</p>
      </div>
    </div>
  );
}

function LoadingSteps({ steps }: { steps: { text: string; error?: boolean }[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className={`flex items-start gap-2 text-sm ${s.error ? "text-amber-600" : "text-[#374151]"}`}>
          <span className="shrink-0">{s.error ? "⚠" : "✓"}</span>
          <span className="leading-snug">{s.text}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 text-sm text-[#9ca3af] pt-1">
        <div className="w-3 h-3 rounded-full border-2 border-[#9ca3af]/30 border-t-[#9ca3af] animate-spin" />
        <span>Working…</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CorgiPage() {
  // ── Form state
  const [companyName,   setCompanyName]   = useState("");
  const [modelType,     setModelType]     = useState<ModelType>("Credit Scoring");
  const [coverage,      setCoverage]      = useState<CoverageLimit>("$1M");
  const [fundingStage,  setFundingStage]  = useState<FundingStage>("Series A");
  const [t0Raw,         setT0Raw]         = useState("");
  const [t1Raw,         setT1Raw]         = useState("");
  const [formError,     setFormError]     = useState("");

  // ── App state
  const [pageState, setPageState]   = useState<PageState>("input");
  const [steps,     setSteps]       = useState<{ text: string; error?: boolean }[]>([]);
  const [metrics,   setMetrics]     = useState<DriftMetrics | null>(null);
  const [recs,      setRecs]        = useState<CorgiRecommendation | null>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError]   = useState("");

  const stepsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  const addStep = useCallback((text: string, error = false) => {
    setSteps(prev => [...prev, { text, error }]);
  }, []);

  const loadSample = () => {
    setT0Raw(SAMPLE_T0);
    setT1Raw(SAMPLE_T1);
    setFormError("");
  };

  const handleAnalyze = async () => {
    const t0 = parseValues(t0Raw);
    const t1 = parseValues(t1Raw);
    if (t0.length < 5 || t1.length < 5) {
      setFormError("Please enter at least 5 valid values (0–1) in each field.");
      return;
    }
    setFormError("");
    setPageState("loading");
    setSteps([]);
    setMetrics(null);
    setRecs(null);
    setRecsError("");

    // Simulate sequential steps with small delays for UX
    await delay(300);  addStep("Parsing output distributions…");
    await delay(400);  addStep("Running density-based clustering on baseline…");
    await delay(400);  addStep("Running density-based clustering on recent outputs…");
    await delay(350);  addStep("Computing distribution shift metrics…");
    await delay(350);  addStep("Scoring liability risk delta…");

    // All math is synchronous — do it here
    const m = computeAllMetrics(t0, t1);
    setMetrics(m);
    setPageState("results");

    // Now call Claude
    setRecsLoading(true);
    addStep("Generating coverage recommendations…");
    try {
      const res = await fetch("/api/corgi/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName, modelType, fundingStage, currentCoverage: coverage,
          meanShift: m.meanShift,
          varianceChangePct: m.varianceChangePct,
          overlapPct: m.overlapPct,
          riskDeltaScore: m.riskDeltaScore,
          riskLevel: m.riskLevel,
          baselineClusterCenter: m.t0Cluster.center,
          recentClusterCenter: m.t1Cluster.center,
          baselineOutliers: m.t0Cluster.outliers.length,
          recentOutliers: m.t1Cluster.outliers.length,
          secondaryClusterDetected: m.secondaryClusterDetected,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      if (!res.ok) throw new Error("API error");
      const data = JSON.parse(text) as CorgiRecommendation;
      setRecs(data);
      addStep("✓ Coverage analysis ready");
    } catch {
      setRecsError("Claude coverage analysis unavailable. Please try again.");
      addStep("⚠ Coverage recommendations unavailable", true);
    } finally {
      setRecsLoading(false);
    }
  };

  const handleReset = () => {
    setPageState("input");
    setSteps([]);
    setMetrics(null);
    setRecs(null);
    setRecsError("");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const band = metrics ? riskBand(metrics.riskDeltaScore) : null;

  return (
    <div className="min-h-screen bg-[#f9fafb] font-sans">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-[#1a2744] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xl font-bold tracking-tight">🐕 Corgi Insurance</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#d97706]/20 text-[#fbbf24] border border-[#d97706]/20">
                AI Model Risk Monitor · Powered by Claude
              </span>
            </div>
            <p className="text-xs text-[#94a3b8] leading-relaxed max-w-2xl">
              As your AI model&apos;s outputs drift over time, your liability exposure changes. This tool detects distribution shifts using
              density-based clustering, scores your risk delta, and recommends whether your AI Liability coverage needs to be updated.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-[#64748b]">Demo by</p>
            <Link href="/" className="text-xs text-[#fbbf24] hover:underline">Armaan Kazi</Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* ── INPUT ─────────────────────────────────────────────────────────── */}
        {pageState === "input" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left: company context */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280]">Company Context</h2>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Company Name</label>
                <input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme FinTech"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#d97706] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">AI Model Type</label>
                <select
                  value={modelType}
                  onChange={e => setModelType(e.target.value as ModelType)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] text-[#111827] bg-white focus:outline-none focus:border-[#d97706] transition-colors"
                >
                  {["Credit Scoring", "Content Moderation", "Fraud Detection", "Recommendation Engine", "Other"].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Current AI Liability Coverage</label>
                <select
                  value={coverage}
                  onChange={e => setCoverage(e.target.value as CoverageLimit)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] text-[#111827] bg-white focus:outline-none focus:border-[#d97706] transition-colors"
                >
                  {["$500K", "$1M", "$2M", "$5M", "$10M"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Funding Stage</label>
                <select
                  value={fundingStage}
                  onChange={e => setFundingStage(e.target.value as FundingStage)}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] text-[#111827] bg-white focus:outline-none focus:border-[#d97706] transition-colors"
                >
                  {["Pre-Seed", "Seed", "Series A", "Series B", "Growth"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Right: model output data */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280]">Model Output Data</h2>
                <button
                  onClick={loadSample}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[#d97706]/40 text-[#d97706] hover:bg-[#d97706]/5 transition-colors font-medium"
                >
                  Load Sample Data
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">
                  Baseline Outputs (T0) — your stable reference period
                </label>
                <textarea
                  value={t0Raw}
                  onChange={e => { setT0Raw(e.target.value); setFormError(""); }}
                  rows={5}
                  placeholder="For best results, paste 25–50 comma-separated values (0–1 range). Example: 0.82, 0.76, 0.91, 0.88, 0.45..."
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#d97706] transition-colors resize-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">
                  Recent Outputs (T1) — your current period
                </label>
                <textarea
                  value={t1Raw}
                  onChange={e => { setT1Raw(e.target.value); setFormError(""); }}
                  rows={5}
                  placeholder="For best results, paste 25–50 comma-separated values (0–1 range) from your most recent period."
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#e5e7eb] text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#d97706] transition-colors resize-none font-mono"
                />
              </div>

              {formError && (
                <p className="text-xs text-red-600">{formError}</p>
              )}

              <button
                onClick={handleAnalyze}
                disabled={!t0Raw.trim() || !t1Raw.trim()}
                className="w-full py-3 rounded-xl bg-[#d97706] text-white text-sm font-semibold hover:bg-[#b45309] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Analyze Model Risk →
              </button>
            </div>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────────── */}
        {pageState === "loading" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-4 h-4 rounded-full border-2 border-[#d97706]/20 border-t-[#d97706] animate-spin" />
                <h2 className="text-sm font-semibold text-[#1a2744]">Running drift analysis…</h2>
              </div>
              <LoadingSteps steps={steps} />
              <div ref={stepsEndRef} />
            </div>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────────────────── */}
        {pageState === "results" && metrics && band && (
          <div className="space-y-6">

            {/* Ongoing steps strip */}
            {(recsLoading || recsError) && (
              <div className="bg-white rounded-xl border border-[#e5e7eb] px-5 py-3">
                <div className="space-y-1">
                  {steps.slice(-2).map((s, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs ${s.error ? "text-amber-600" : "text-[#6b7280]"}`}>
                      <span>{s.error ? "⚠" : "✓"}</span><span>{s.text}</span>
                    </div>
                  ))}
                  {recsLoading && (
                    <div className="flex items-center gap-2 text-xs text-[#9ca3af]">
                      <div className="w-3 h-3 rounded-full border-2 border-[#9ca3af]/30 border-t-[#9ca3af] animate-spin" />
                      <span>Generating coverage recommendations…</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 1. Drift Histogram ── */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280] mb-1">
                Output Distribution Shift
              </h3>
              <p className="text-xs text-[#9ca3af] mb-5">
                Mean shifted from <span className="font-semibold text-[#374151]">{metrics.t0Mean}</span> →{" "}
                <span className="font-semibold" style={{ color: band.color }}>{metrics.t1Mean}</span>{" "}
                ({metrics.t1Mean < metrics.t0Mean ? "−" : "+"}{metrics.meanShift.toFixed(3)})
              </p>

              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.histogramData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="bin" tick={{ fontSize: 9, fill: "#9ca3af" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 8 }}
                      formatter={(val, name) => [val, name === "t0" ? "Baseline (T0)" : "Recent (T1)"]}
                    />
                    <Legend formatter={(v: string) => v === "t0" ? "Baseline (T0)" : "Recent (T1)"} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="t0" fill="#60a5fa" opacity={0.75} radius={[3, 3, 0, 0]} minPointSize={2} barSize={30} />
                    <Bar dataKey="t1" fill="#f59e0b" opacity={0.85} radius={[3, 3, 0, 0]} minPointSize={2} barSize={30} />
                    <ReferenceLine x={metrics.histogramData.reduce((best, b) => Math.abs(b.binMid - metrics.t0Mean) < Math.abs(best.binMid - metrics.t0Mean) ? b : best, metrics.histogramData[0]).bin} stroke="#60a5fa" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: `T0 μ=${metrics.t0Mean}`, fontSize: 9, fill: "#60a5fa", position: "top" }} />
                    <ReferenceLine x={metrics.histogramData.reduce((best, b) => Math.abs(b.binMid - metrics.t1Mean) < Math.abs(best.binMid - metrics.t1Mean) ? b : best, metrics.histogramData[0]).bin} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: `T1 μ=${metrics.t1Mean}`, fontSize: 9, fill: "#f59e0b", position: "top" }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Metric stat cards */}
              <div className="grid grid-cols-3 gap-3 mt-5">
                {[
                  { label: "Mean Shift",         value: metrics.meanShift.toFixed(3),                          sub: "absolute Δ in output mean" },
                  { label: "Variance Change",     value: `${metrics.varianceChangePct > 0 ? "+" : ""}${metrics.varianceChangePct.toFixed(1)}%`, sub: "std deviation change" },
                  { label: "Distribution Overlap",value: `${metrics.overlapPct.toFixed(1)}%`,                  sub: "T1 values within T0 IQR" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af] mb-0.5">{s.label}</p>
                    <p className="text-lg font-bold text-[#1a2744]">{s.value}</p>
                    <p className="text-[10px] text-[#9ca3af]">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 2. Cluster Analysis ── */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280] mb-4">
                Density-Based Cluster Analysis
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#e5e7eb] bg-[#f0f9ff] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#60a5fa] mb-1">Baseline (T0)</p>
                  <p className="text-sm font-semibold text-[#1a2744]">
                    Cluster centered at <span className="text-[#2563eb]">{metrics.t0Cluster.center}</span>
                  </p>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    {metrics.t0Cluster.size} core points · {metrics.t0Cluster.outliers.length} outlier{metrics.t0Cluster.outliers.length !== 1 ? "s" : ""} detected
                  </p>
                  {metrics.t0Cluster.secondaryCenter && (
                    <p className="text-xs text-[#2563eb] mt-1">Secondary cluster at {metrics.t0Cluster.secondaryCenter}</p>
                  )}
                </div>

                <div className="rounded-xl border border-[#e5e7eb] bg-[#fffbeb] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#f59e0b] mb-1">Recent (T1)</p>
                  <p className="text-sm font-semibold text-[#1a2744]">
                    Cluster centered at <span style={{ color: band.color }}>{metrics.t1Cluster.center}</span>
                  </p>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    {metrics.t1Cluster.size} core points · {metrics.t1Cluster.outliers.length} outlier{metrics.t1Cluster.outliers.length !== 1 ? "s" : ""} detected
                  </p>
                  {metrics.t1Cluster.secondaryCenter && (
                    <p className="text-xs text-[#ea580c] mt-1">
                      Secondary cluster at {metrics.t1Cluster.secondaryCenter} ({metrics.t1Cluster.secondarySize} pts)
                    </p>
                  )}
                </div>
              </div>

              {metrics.secondaryClusterDetected && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <span className="text-base shrink-0">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-red-800">Bimodal Output Behavior Detected</p>
                    <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                      A secondary cluster has emerged in your recent outputs, indicating your model is producing two distinct groups of predictions.
                      This is a major liability red flag — bimodal outputs often signal algorithmic bias or systematic errors affecting a subpopulation.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── 3. Risk Delta Scorecard ── */}
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-6 sm:p-8">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#6b7280] mb-5">
                Risk Delta Scorecard
              </h3>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8">
                <RiskGauge score={metrics.riskDeltaScore} band={band} />
                <div className="flex-1 space-y-3 w-full">
                  {[
                    {
                      label: "Estimated Liability Exposure Change",
                      value: `+${Math.round(metrics.riskDeltaScore * 1.4)}%`,
                      color: band.color,
                    },
                    {
                      label: "Algorithmic Bias Risk",
                      value: metrics.riskDeltaScore <= 25 ? "Low" : metrics.riskDeltaScore <= 50 ? "Moderate" : metrics.riskDeltaScore <= 75 ? "High" : "Critical",
                      color: band.color,
                    },
                    {
                      label: "Recommended Coverage Review",
                      value: metrics.riskDeltaScore > 25 ? "Yes — review advised" : "No — within normal range",
                      color: metrics.riskDeltaScore > 25 ? "#ea580c" : "#16a34a",
                    },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3">
                      <span className="text-xs font-medium text-[#6b7280]">{item.label}</span>
                      <span className="text-sm font-bold" style={{ color: item.color }}>{item.value}</span>
                    </div>
                  ))}
                  {/* Scale legend */}
                  <div className="flex gap-2 flex-wrap pt-1">
                    {[
                      { range: "0–25", label: "Low",         color: "#16a34a" },
                      { range: "26–50", label: "Moderate",   color: "#ca8a04" },
                      { range: "51–75", label: "Significant", color: "#ea580c" },
                      { range: "76–100", label: "Critical",   color: "#dc2626" },
                    ].map(b => (
                      <span key={b.label} className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
                        style={{ color: b.color, borderColor: b.color + "40", backgroundColor: b.color + "10" }}>
                        {b.range}: {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── 4. Claude Recommendations ── */}
            <div className="rounded-2xl bg-[#1a2744] p-6 sm:p-8">
              <div className="mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#fbbf24] mb-1">Powered by Claude</p>
                <h3 className="text-xl font-bold text-white">Coverage Analysis</h3>
              </div>

              {recsLoading && !recs && (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-4 h-4 rounded-full border-2 border-[#fbbf24]/30 border-t-[#fbbf24] animate-spin" />
                  <span className="text-sm text-[#94a3b8]">Analyzing coverage against drift metrics…</span>
                </div>
              )}

              {recsError && (
                <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-[#94a3b8]">
                  {recsError}
                </div>
              )}

              {recs && (
                <div className="space-y-5">
                  {/* Coverage banner */}
                  <div className={`rounded-xl px-4 py-3 border ${recs.current_coverage_adequate ? "bg-green-900/30 border-green-700/30" : "bg-amber-900/30 border-amber-600/30"}`}>
                    <p className="text-sm font-semibold text-white">
                      {recs.current_coverage_adequate
                        ? `✅ Current coverage (${coverage}) appears adequate given detected drift levels.`
                        : `⚠️ Coverage Gap Detected — Recommend increasing from ${coverage} to ${recs.recommended_coverage_limit}`}
                    </p>
                  </div>

                  {/* Risk factors */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#60a5fa] mb-3">Risk Factors Identified</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {recs.risk_factors.map((f, i) => (
                        <div key={i} className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
                          <p className="text-xs text-[#cbd5e1] leading-relaxed">{f}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#60a5fa] mb-3">Recommended Actions</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {recs.recommendations.map((r, i) => {
                        const urg = URGENCY_STYLES[r.urgency] ?? URGENCY_STYLES.Medium;
                        return (
                          <div key={i} className="rounded-xl bg-white/[0.06] border border-white/10 p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="text-xs font-semibold text-white leading-snug">{r.title}</h4>
                              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: urg.color, backgroundColor: urg.bg }}>
                                {r.urgency}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#cbd5e1] leading-relaxed">{r.explanation}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Regulatory note */}
                  <div className="flex items-start gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                    <span className="text-sm shrink-0">⚖️</span>
                    <p className="text-[11px] text-[#94a3b8] leading-relaxed">{recs.regulatory_note}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── 5. Corgi CTA ── */}
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 text-center">
              <p className="text-sm font-semibold text-[#1a2744] mb-2">Ready to update your AI Liability coverage?</p>
              <a
                href="https://corgi.insure"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-5 py-2.5 rounded-xl bg-[#d97706] text-white text-sm font-semibold hover:bg-[#b45309] transition-colors mb-3"
              >
                Get a Quote on Corgi →
              </a>
              <p className="text-xs text-[#9ca3af] max-w-md mx-auto leading-relaxed">
                Corgi offers specialized AI liability coverage including algorithmic bias, hallucination risk, and IP infringement protection.
              </p>
            </div>

            {/* Disclaimer */}
            <div className="rounded-xl bg-[#f3f4f6] border border-[#e5e7eb] px-5 py-4 space-y-1">
              <p className="text-xs text-[#6b7280] leading-relaxed">
                This demo simulates model drift detection and risk scoring for illustrative purposes. Risk assessments are not actuarially derived
                and should not be used as the basis for real insurance decisions.{" "}
                <a href="https://corgi.insure" target="_blank" rel="noopener noreferrer" className="text-[#1a2744] underline hover:no-underline">
                  Visit corgi.insure
                </a>{" "}
                for production-grade AI liability coverage.
              </p>
              <p className="text-[10px] text-[#9ca3af]">Built by Armaan Kazi as a portfolio demo. Not affiliated with Corgi Insurance.</p>
            </div>

            {/* Reset */}
            <div className="text-center pb-4">
              <button
                onClick={handleReset}
                className="px-6 py-2.5 rounded-xl border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] hover:border-[#d97706]/40 hover:text-[#d97706] transition-colors"
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
