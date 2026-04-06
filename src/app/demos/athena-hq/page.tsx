"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import ThemeToggle, { MY_STYLE, type PageColors } from "@/components/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptItem {
  prompt: string;
  volume: "High" | "Medium" | "Low";
  priority: boolean;
}

interface PromptLibrary {
  informational: PromptItem[];
  comparison: PromptItem[];
  recommendation: PromptItem[];
}

interface SovRow {
  prompt: string;
  response: string;
  scores: Record<string, number>;
}

interface SovResult {
  rows: SovRow[];
  totals: Record<string, number>;
  sov: Record<string, number>;
}

type SignalLevel = "strong" | "weak" | "none";

interface CitationResult {
  audit: Record<string, Record<string, SignalLevel>>;
  top_gaps: string[];
}

interface ContentBrief {
  title: string;
  content_type: string;
  target_prompt: string;
  citation_gap_addressed: string;
  why_it_works: string;
  h1: string;
  meta_description: string;
  key_talking_points: string[];
  urgency: "Quick Win" | "Medium Term" | "Strategic";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SAMPLE = {
  brand: "AthenaHQ",
  description: "AI-powered GEO and brand visibility platform",
  competitors: ["Semrush", "Ahrefs", "Brandwatch"],
  industry: "AI search optimization",
};

const LOADING_STEPS = [
  "Building prompt library for your category…",
  "Running informational prompt analysis…",
  "Running comparison prompt analysis…",
  "Running recommendation prompt analysis…",
  "Auditing citation sources…",
  "Identifying content gaps…",
  "Generating content briefs…",
];

const SOURCE_TYPES: { key: string; label: string }[] = [
  { key: "review_sites", label: "Review Sites" },
  { key: "news_press", label: "News / Press" },
  { key: "community", label: "Community" },
  { key: "documentation", label: "Docs" },
  { key: "analyst_reports", label: "Analyst" },
  { key: "comparison_pages", label: "Comparison" },
];

const URGENCY_BADGE: Record<string, string> = {
  "Quick Win": "bg-green-50 text-green-700 border border-green-200",
  "Medium Term": "bg-yellow-50 text-yellow-700 border border-yellow-200",
  "Strategic": "bg-blue-50 text-blue-700 border border-blue-200",
};

const INTENT_BADGE: Record<string, string> = {
  Informational: "bg-purple-50 text-purple-700 border border-purple-200",
  Comparison: "bg-orange-50 text-orange-700 border border-orange-200",
  Recommendation: "bg-teal-50 text-teal-700 border border-teal-200",
};

const VOLUME_COLOR: Record<string, string> = {
  High: "text-green-600",
  Medium: "text-yellow-600",
  Low: "text-gray-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreLabel(score: number): { label: string; bg: string; text: string } {
  if (score === 3) return { label: "Primary", bg: "bg-green-100", text: "text-green-800" };
  if (score === 2) return { label: "Secondary", bg: "bg-yellow-100", text: "text-yellow-800" };
  if (score === 1) return { label: "Brief", bg: "bg-blue-100", text: "text-blue-800" };
  return { label: "Absent", bg: "bg-gray-100", text: "text-gray-400" };
}

function signalIcon(level: SignalLevel) {
  if (level === "strong") return <span title="Strong signal">✅</span>;
  if (level === "weak") return <span title="Weak signal">⚠️</span>;
  return <span title="No signal">❌</span>;
}

async function callApi<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const json = JSON.parse(raw) as { result?: T; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.result as T;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionProgress({ sections, navy }: { sections: boolean[]; navy: string }) {
  const labels = ["Prompt Library", "Share of Voice", "Content Briefs"];
  return (
    <div className="flex items-center gap-3 mb-8 flex-wrap">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full transition-all duration-500"
            style={{ backgroundColor: sections[i] ? navy : "#D1D5DB" }}
          />
          <span className="text-xs font-medium" style={{ color: sections[i] ? navy : "#9CA3AF" }}>
            {label}
          </span>
          {i < labels.length - 1 && <span className="text-gray-200 text-xs ml-1">/</span>}
        </div>
      ))}
    </div>
  );
}

function BriefCard({ brief, brand, navy }: { brief: ContentBrief; brand: string; navy: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyBrief() {
    const text = `CONTENT BRIEF
Title: ${brief.title}
Type: ${brief.content_type}
Urgency: ${brief.urgency}

Target Prompt: ${brief.target_prompt}
Citation Gap Addressed: ${brief.citation_gap_addressed}

Why It Works:
${brief.why_it_works}

H1: ${brief.h1}
Meta Description: ${brief.meta_description}

Key Talking Points:
${brief.key_talking_points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start gap-2 flex-wrap mb-3">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
            {brief.content_type}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${URGENCY_BADGE[brief.urgency]}`}>
            {brief.urgency}
          </span>
        </div>
        <h3 className="font-bold text-gray-900 text-base leading-snug mb-3">{brief.title}</h3>
        <div className="space-y-1.5 mb-3">
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Targets:</span> {brief.target_prompt}
          </p>
          <p className="text-xs text-gray-500">
            <span className="font-semibold text-gray-700">Fills gap:</span> {brief.citation_gap_addressed}
          </p>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">{brief.why_it_works}</p>
      </div>

      {/* Expandable section */}
      <div className="border-t border-gray-100">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
        >
          <span>Full brief details</span>
          <span className="transition-transform duration-200" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            ↓
          </span>
        </button>

        {expanded && (
          <div className="px-5 pb-5 space-y-3 border-t border-gray-100 pt-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">H1</p>
              <p className="text-sm text-gray-800 font-medium">{brief.h1}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Meta Description</p>
              <p className="text-sm text-gray-600">{brief.meta_description}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Key Talking Points</p>
              <ul className="space-y-1">
                {brief.key_talking_points.map((pt, i) => (
                  <li key={i} className="text-sm text-gray-600 flex gap-2">
                    <span className="text-gray-300 flex-shrink-0">•</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-4">
        <button
          onClick={copyBrief}
          className="w-full py-2 rounded-lg border text-xs font-semibold transition-all"
          style={{
            borderColor: copied ? "#16A34A" : navy,
            color: copied ? "#16A34A" : navy,
            backgroundColor: copied ? "#F0FDF4" : "transparent",
          }}
        >
          {copied ? "✓ Copied" : "Copy Brief"}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AthenaHQPage() {
  const [theme, setTheme] = useState<"my" | "company">("my");
  const COMPANY_STYLE: PageColors = {
    bg: "#f8fafc",
    cardBg: "#ffffff",
    cardBorder: "#e2e8f0",
    text: "#1a2744",
    muted: "#64748b",
    dim: "#94a3b8",
    accent: "#1a2744",
    accentBg: "rgba(26,39,68,0.06)",
    headerBg: "#1a2744",
    headerBorder: "#2a3754",
    headerText: "#ffffff",
  };
  const C = theme === "my" ? MY_STYLE : COMPANY_STYLE;
  const NAVY = C.accent;

  const [form, setForm] = useState({
    brand: "",
    description: "",
    competitors: ["", "", ""],
    industry: "",
  });

  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const [promptLib, setPromptLib] = useState<PromptLibrary | null>(null);
  const [sovResult, setSovResult] = useState<SovResult | null>(null);
  const [citationResult, setCitationResult] = useState<CitationResult | null>(null);
  const [briefs, setBriefs] = useState<ContentBrief[] | null>(null);

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const resultsRef = useRef<HTMLDivElement>(null);

  const sectionsComplete = [!!promptLib, !!sovResult, !!briefs];

  function loadSample() {
    setForm({
      brand: SAMPLE.brand,
      description: SAMPLE.description,
      competitors: SAMPLE.competitors,
      industry: SAMPLE.industry,
    });
    setPromptLib(null);
    setSovResult(null);
    setCitationResult(null);
    setBriefs(null);
    setError(null);
  }

  function reset() {
    setPromptLib(null);
    setSovResult(null);
    setCitationResult(null);
    setBriefs(null);
    setError(null);
    setStepIndex(-1);
  }

  function toggleRow(i: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function step(index: number, delay = 0) {
    if (delay) await new Promise(r => setTimeout(r, delay));
    setStepIndex(index);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPromptLib(null);
    setSovResult(null);
    setCitationResult(null);
    setBriefs(null);
    setStepIndex(0);

    try {
      // ── Step 1: Prompt Library ────────────────────────────────────────────
      const competitors = form.competitors.filter(c => c.trim());
      const lib = await callApi<PromptLibrary>("/api/demos/athena-hq/prompts", {
        brand: form.brand,
        industry: form.industry,
        competitors,
      });
      setPromptLib(lib);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);

      // ── Steps 2-4: SOV (9 prompts, 3 per group) ──────────────────────────
      await step(1, 300);
      const sovPrompts = [
        ...lib.informational.slice(0, 3).map(p => p.prompt),
        ...lib.comparison.slice(0, 3).map(p => p.prompt),
        ...lib.recommendation.slice(0, 3).map(p => p.prompt),
      ];
      await step(2, 800);
      await step(3, 1200);

      const sov = await callApi<SovResult>("/api/demos/athena-hq/sov", {
        brand: form.brand,
        competitors,
        prompts: sovPrompts,
      });
      setSovResult(sov);

      // ── Step 5: Citation Audit ────────────────────────────────────────────
      await step(4, 300);
      const citation = await callApi<CitationResult>("/api/demos/athena-hq/citation", {
        brand: form.brand,
        competitors,
        responses: sov.rows.map(r => r.response),
      });
      setCitationResult(citation);

      // ── Steps 6-7: Briefs ─────────────────────────────────────────────────
      await step(5, 300);
      await step(6, 600);

      const userSov = sov.sov[form.brand] ?? 0;
      const compSov = competitors.map(c => `${c}: ${sov.sov[c] ?? 0}%`).join(", ");
      const gapSummary = citation.top_gaps.join("; ");

      const briefData = await callApi<ContentBrief[]>("/api/demos/athena-hq/briefs", {
        brand: form.brand,
        industry: form.industry,
        sovSummary: `${form.brand} has ${userSov}% share of voice. Competitors: ${compSov}`,
        citationGaps: citation.top_gaps,
        prompts: sovPrompts,
      });
      setBriefs(briefData);
    } catch (err) {
      console.error("[athena] pipeline error:", err);
      setError(String(err));
    } finally {
      setLoading(false);
      setStepIndex(-1);
    }
  }

  const allBrands = [form.brand, ...form.competitors.filter(c => c.trim())];
  const canSubmit = form.brand.trim().length > 0 && form.industry.trim().length > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      {/* ── Header ── */}
      <header className="px-6 py-4" style={{ backgroundColor: C.headerBg, borderBottomColor: C.headerBorder }}>
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="font-bold text-xl tracking-tight" style={{ color: C.headerText }}>AthenaHQ</span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-white/20 text-white/60 uppercase tracking-widest">
                GEO Intelligence Suite
              </span>
            </div>
            <p className="text-xs leading-relaxed max-w-2xl" style={{ color: theme === "my" ? C.muted : "rgba(255,255,255,0.55)" }}>
              Generative Engine Optimization is how brands win in AI search. This tool shows you which prompts to track, how you appear across those prompts vs. competitors, where your citations are missing, and exactly what content to create to close the gap.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: theme === "my" ? C.muted : "rgba(255,255,255,0.30)" }}>
              Demo by{" "}
              <Link href="/" className="underline transition-colors hover:opacity-80" style={{ color: theme === "my" ? C.accent : "rgba(255,255,255,0.30)" }}>
                Armaan Kazi
              </Link>
            </span>
            <ThemeToggle theme={theme} onChange={setTheme} companyAccent={COMPANY_STYLE.accent} darkContext={theme === "company"} />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* ── Back link ─────────────────────────────────────────────────────── */}
        <Link href="/demos" className="text-xs text-gray-500 hover:text-gray-700 transition-colors mb-8 inline-block">← Back to Demos</Link>

        {/* ── Section A: What AthenaHQ does today ───────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>What AthenaHQ does today</p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: C.muted }}>
            AthenaHQ tracks how brands appear in AI-generated search results across ChatGPT, Perplexity, Gemini, and AI Overviews. It shows you whether your brand is being mentioned, and how often, when users ask AI engines questions in your category.
          </p>

          {/* Today vs With Demo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>Today</p>
              <ul className="space-y-2">
                {["Brand query", "AI engine", "Mention detected", "Visibility score"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.dim }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: NAVY + "33" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: NAVY }}>With This Demo</p>
              <ul className="space-y-2">
                {["Brand query", "AI engine", "Mention scored", "Citation source audited", "Content gap identified", "Brief generated"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: NAVY }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Comparison table */}
          <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${C.cardBorder}` }}>
            <div style={{ minWidth: 480 }}>
              <div className="grid grid-cols-3 px-4 py-2" style={{ backgroundColor: C.bg }}>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }}></span>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }}>Today</span>
                <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: NAVY }}>With Demo</span>
              </div>
              {[
                ["What you learn", "Whether you appear", "Why you appear, where from, and what to create"],
                ["Output", "Share of voice score", "Prompt library + SOV + citation audit + content briefs"],
                ["Next step", "Track and monitor", "Diagnose gaps and act"],
              ].map(([label, today, demo], i) => (
                <div key={label} className="grid grid-cols-3 px-4 py-3" style={{ backgroundColor: i % 2 === 1 ? C.bg : C.cardBg }}>
                  <span className="text-xs font-medium pr-2" style={{ color: C.text }}>{label}</span>
                  <span className="text-xs pr-2" style={{ color: C.muted }}>{today}</span>
                  <span className="text-xs font-medium pr-2" style={{ color: NAVY }}>{demo}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section B: What this demo adds ────────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>What this demo adds</p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: C.muted }}>
            The GEO Intelligence Suite runs the full Monitor → Diagnose → Act workflow in one pass. It generates the prompts you should be tracking, runs them against Claude as a proxy for AI search engines, audits which citation source types (review sites, press, community, docs, analyst reports) are being picked up for your brand vs. competitors, and produces specific content briefs to close the gaps.
          </p>
        </section>

        {/* ── Section C: Why it's better ────────────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>Why it&apos;s better</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              {
                title: "From monitoring to action",
                body: "Most GEO tools stop at visibility scores. This demo goes three layers deeper: it tells you which specific prompts matter, which source types are missing from your citation profile, and exactly what content to create and why.",
              },
              {
                title: "Citation audit is the missing layer",
                body: "AI models cite certain source types (review sites, press mentions, community threads) when recommending brands. Knowing your share of voice is useful. Knowing which source types are absent from your citation profile tells you where to invest.",
              },
              {
                title: "Content briefs, not just data",
                body: "The output isn't a dashboard. It's four ready-to-use content briefs with H1s, meta descriptions, talking points, and reasoning grounded in your actual audit results.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="rounded-xl border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: NAVY }} />
                  <p className="text-xs font-semibold" style={{ color: C.text }}>{title}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border px-5 py-4" style={{ backgroundColor: C.bg, borderColor: C.cardBorder }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>Why This Is Different</p>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              Most GEO tools tell you how visible you are. This one tells you why you&apos;re invisible and what to build to fix it.
            </p>
          </div>
        </section>

        {/* ── Section D: Try it label ────────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>Try it</h2>
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>Enter your brand, up to 3 competitors, and your industry category to generate a full GEO intelligence report.</p>
        </div>

        {/* ── Input Form ── */}
        {!promptLib && (
          <div className="rounded-2xl border shadow-sm p-6 mb-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg" style={{ color: C.text }}>GEO Analysis Setup</h2>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>Enter your brand and up to 3 competitors to benchmark</p>
              </div>
              <button
                type="button"
                onClick={loadSample}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: C.cardBorder, color: C.muted }}
              >
                Load Sample
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Brand Name *</label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={e => setForm({ ...form, brand: e.target.value })}
                    placeholder="e.g. AthenaHQ"
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                    style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Industry / Category *</label>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={e => setForm({ ...form, industry: e.target.value })}
                    placeholder="e.g. AI search optimization"
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                    style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Brand Description</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="e.g. AI-powered GEO and brand visibility platform"
                    className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                    style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>
                  Competitors <span className="font-normal" style={{ color: C.dim }}>(up to 3)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {form.competitors.map((c, i) => (
                    <input
                      key={i}
                      type="text"
                      value={c}
                      onChange={e => {
                        const updated = [...form.competitors];
                        updated[i] = e.target.value;
                        setForm({ ...form, competitors: updated });
                      }}
                      placeholder={`Competitor ${i + 1}`}
                      className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                      style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                style={{ backgroundColor: NAVY }}
              >
                {loading ? "Running analysis…" : "Run GEO Analysis →"}
              </button>
            </form>
          </div>
        )}

        {/* ── Loading Steps ── */}
        {loading && (
          <div className="rounded-2xl border shadow-sm p-8 mb-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: C.dim }}>Running analysis</p>
            <div className="space-y-3">
              {LOADING_STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i < stepIndex ? (
                    <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs flex-shrink-0">✓</span>
                  ) : i === stepIndex ? (
                    <span className="w-5 h-5 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: NAVY, borderTopColor: "transparent" }} />
                  ) : (
                    <span className="w-5 h-5 rounded-full border flex-shrink-0" style={{ borderColor: C.cardBorder }} />
                  )}
                  <span className="text-sm" style={{ color: i <= stepIndex ? C.text : C.dim }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Results ── */}
        {promptLib && (
          <div ref={resultsRef} className="space-y-10">
            <SectionProgress sections={sectionsComplete} navy={NAVY} />

            {/* ═══ SECTION 1: PROMPT LIBRARY ════════════════════════════════ */}
            <section>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: NAVY }}>1</span>
                  <h2 className="font-bold text-xl" style={{ color: C.text }}>Prompts to Track</h2>
                </div>
                <p className="text-sm ml-8" style={{ color: C.muted }}>Your GEO monitoring baseline: the queries where AI models decide which brands to recommend in your category.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                {(["informational", "comparison", "recommendation"] as const).map((group) => (
                  <div key={group} className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                    <div
                      className="px-4 py-3 border-b"
                      style={{ borderColor: C.cardBorder, backgroundColor: group === "informational" ? "#F5F3FF" : group === "comparison" ? "#FFF7ED" : "#F0FDFA" }}
                    >
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${INTENT_BADGE[group.charAt(0).toUpperCase() + group.slice(1)]}`}>
                        {group.charAt(0).toUpperCase() + group.slice(1)}
                      </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: C.cardBorder }}>
                      {promptLib[group].map((item, i) => (
                        <div key={i} className="px-4 py-3 relative" style={{ borderColor: C.cardBorder }}>
                          {item.priority && (
                            <span
                              className="absolute top-3 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded text-white uppercase tracking-wide"
                              style={{ backgroundColor: NAVY }}
                            >
                              Priority
                            </span>
                          )}
                          <p className="text-xs leading-relaxed pr-12" style={{ color: C.text }}>{item.prompt}</p>
                          <p className={`text-[10px] mt-1 font-semibold ${VOLUME_COLOR[item.volume]}`}>
                            {item.volume} volume
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <span className="font-bold">Note:</span> AthenaHQ tracks prompts like these across ChatGPT, Perplexity, Gemini, and AI Overviews in real time. This demo uses Claude as a proxy.
                </p>
              </div>
            </section>

            {/* ═══ SECTION 2: SHARE OF VOICE ════════════════════════════════ */}
            {sovResult && (
              <section>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: NAVY }}>2</span>
                    <h2 className="font-bold text-xl" style={{ color: C.text }}>AI Share of Voice</h2>
                  </div>
                  <p className="text-sm ml-8" style={{ color: C.muted }}>Simulated across 9 industry prompts (3 per intent type).</p>
                </div>

                {/* SOV Bar Chart */}
                <div className="rounded-xl border shadow-sm p-6 mb-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                  <h3 className="text-sm font-bold mb-4" style={{ color: C.text }}>Share of Voice</h3>
                  <div className="space-y-3">
                    {allBrands.filter(b => b).sort((a, b) => (sovResult.sov[b] ?? 0) - (sovResult.sov[a] ?? 0)).map((brand) => {
                      const pct = sovResult.sov[brand] ?? 0;
                      const isUser = brand === form.brand;
                      return (
                        <div key={brand}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-700">{brand}</span>
                            <span className="text-xs font-bold" style={{ color: isUser ? NAVY : "#6B7280" }}>{pct}%</span>
                          </div>
                          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: isUser ? NAVY : "#D1D5DB" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] mt-4 leading-relaxed" style={{ color: C.dim }}>
                    Claude's training data may favor brands with stronger documentation. Newer brands may be underrepresented independent of product quality.
                  </p>
                </div>

                {/* Prompt Breakdown Table */}
                <div className="rounded-xl border shadow-sm overflow-hidden mb-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                  <div className="px-5 py-3 border-b" style={{ borderColor: C.cardBorder }}>
                    <h3 className="text-sm font-bold" style={{ color: C.text }}>Prompt Breakdown</h3>
                    <p className="text-xs mt-0.5" style={{ color: C.dim }}>Click any row to see the Claude response</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ backgroundColor: C.bg, borderColor: C.cardBorder }}>
                          <th className="text-left px-4 py-2.5 font-semibold min-w-[200px]" style={{ color: C.muted }}>Prompt</th>
                          {allBrands.filter(b => b).map(b => (
                            <th key={b} className="px-3 py-2.5 font-semibold text-center whitespace-nowrap" style={{ color: b === form.brand ? NAVY : C.muted }}>
                              {b}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sovResult.rows.map((row, i) => (
                          <>
                            <tr
                              key={i}
                              className="border-b cursor-pointer transition-colors"
                              style={{ borderColor: C.cardBorder }}
                              onClick={() => toggleRow(i)}
                            >
                              <td className="px-4 py-3 leading-snug" style={{ color: C.text }}>{row.prompt}</td>
                              {allBrands.filter(b => b).map(b => {
                                const s = scoreLabel(row.scores[b] ?? 0);
                                return (
                                  <td key={b} className="px-3 py-3 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${s.bg} ${s.text}`}>
                                      {s.label}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                            {expandedRows.has(i) && row.response && (
                              <tr key={`exp-${i}`} style={{ backgroundColor: C.bg }}>
                                <td colSpan={allBrands.filter(b => b).length + 1} className="px-4 py-4">
                                  <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: C.dim }}>Claude's response</p>
                                  <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: C.muted }}>{row.response}</p>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Citation Audit */}
                {citationResult && (
                  <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                    <div className="px-5 py-3 border-b" style={{ borderColor: C.cardBorder }}>
                      <h3 className="text-sm font-bold" style={{ color: C.text }}>Citation Source Audit</h3>
                      <p className="text-xs mt-0.5" style={{ color: C.dim }}>Which source types AI models detected for each brand</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b" style={{ backgroundColor: C.bg, borderColor: C.cardBorder }}>
                            <th className="text-left px-4 py-2.5 font-semibold" style={{ color: C.muted }}>Brand</th>
                            {SOURCE_TYPES.map(st => (
                              <th key={st.key} className="px-3 py-2.5 font-semibold text-center whitespace-nowrap" style={{ color: C.muted }}>{st.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {allBrands.filter(b => b && citationResult.audit[b]).map(brand => (
                            <tr key={brand} className="border-b" style={{ borderColor: C.cardBorder }}>
                              <td className="px-4 py-3 font-semibold" style={{ color: brand === form.brand ? NAVY : C.text }}>{brand}</td>
                              {SOURCE_TYPES.map(st => (
                                <td key={st.key} className="px-3 py-3 text-center">
                                  {signalIcon((citationResult.audit[brand]?.[st.key] ?? "none") as SignalLevel)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {citationResult.top_gaps.length > 0 && (
                      <div className="m-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-xs font-bold text-amber-700 mb-2">{form.brand}: Top Citation Gaps</p>
                        <ul className="space-y-1">
                          {citationResult.top_gaps.map((gap, i) => (
                            <li key={i} className="text-xs text-amber-700 flex gap-2">
                              <span className="flex-shrink-0">⚠</span>
                              {gap}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ═══ SECTION 3: CONTENT BRIEFS ════════════════════════════════ */}
            {briefs && (
              <section>
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: NAVY }}>3</span>
                    <h2 className="font-bold text-xl" style={{ color: C.text }}>Content Action Plan</h2>
                  </div>
                  <p className="text-sm ml-8" style={{ color: C.muted }}>Based on your citation gaps and SOV performance, identifying 4 specific content pieces that would improve your AI search presence.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {briefs.map((brief, i) => (
                    <BriefCard key={i} brief={brief} brand={form.brand} navy={NAVY} />
                  ))}
                </div>
              </section>
            )}

            {/* Reset */}
            {!loading && (
              <div className="text-center pb-8">
                <button
                  onClick={reset}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Analyze a different brand
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="border-t px-6 py-8 mt-10" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
        <div className="max-w-5xl mx-auto text-center space-y-2">
          <p className="text-xs leading-relaxed max-w-2xl mx-auto" style={{ color: C.dim }}>
            This demo simulates GEO intelligence using Claude as a proxy. Real GEO monitoring requires live tracking across ChatGPT, Perplexity, Gemini, and AI Overviews over time.{" "}
            <a href="https://athenahq.ai" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: C.muted }}>
              Visit athenahq.ai
            </a>{" "}
            for production-grade GEO intelligence.
          </p>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="transition-colors hover:opacity-80" style={{ color: C.muted }}>
              Armaan Kazi
            </Link>
            {" "}· Not affiliated with AthenaHQ
          </p>
        </div>
      </footer>
    </div>
  );
}
