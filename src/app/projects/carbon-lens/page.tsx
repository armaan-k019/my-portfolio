"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";

// ─── Carbon data (ICE Database v3.0) ──────────────────────────────────────────

interface MaterialData {
  name: string;
  category: string;
  unit: string;
  kgCO2e_per_unit: number;
  density_kg_per_m3: number | null;
  alternatives: string[];
  description: string;
}

const CARBON_DATA: Record<string, MaterialData> = {
  concrete_general:       { name: "Concrete (General)",           category: "Concrete",    unit: "m³",    kgCO2e_per_unit: 300,    density_kg_per_m3: 2400, alternatives: ["concrete_30mpa","concrete_ggbs50","timber_glulam"], description: "Standard ready-mix concrete" },
  concrete_30mpa:         { name: "Concrete 30 MPa",              category: "Concrete",    unit: "m³",    kgCO2e_per_unit: 270,    density_kg_per_m3: 2400, alternatives: ["concrete_ggbs50","concrete_ggbs70"], description: "Standard structural concrete" },
  concrete_ggbs50:        { name: "Concrete 50% GGBS",            category: "Concrete",    unit: "m³",    kgCO2e_per_unit: 165,    density_kg_per_m3: 2400, alternatives: ["concrete_ggbs70"], description: "Concrete with 50% GGBS — significantly lower carbon" },
  concrete_ggbs70:        { name: "Concrete 70% GGBS",            category: "Concrete",    unit: "m³",    kgCO2e_per_unit: 100,    density_kg_per_m3: 2400, alternatives: [], description: "Concrete with 70% GGBS — lowest carbon concrete option" },
  steel_structural:       { name: "Structural Steel (Virgin)",    category: "Steel",       unit: "tonne", kgCO2e_per_unit: 2500,   density_kg_per_m3: 7850, alternatives: ["steel_recycled","timber_glulam"], description: "Primary structural steel, virgin production" },
  steel_recycled:         { name: "Structural Steel (Recycled)",  category: "Steel",       unit: "tonne", kgCO2e_per_unit: 500,    density_kg_per_m3: 7850, alternatives: [], description: "Steel from electric arc furnace using recycled content" },
  steel_rebar:            { name: "Steel Rebar",                  category: "Steel",       unit: "tonne", kgCO2e_per_unit: 1990,   density_kg_per_m3: 7850, alternatives: ["steel_rebar_recycled"], description: "Reinforcing bar for concrete" },
  steel_rebar_recycled:   { name: "Steel Rebar (Recycled)",       category: "Steel",       unit: "tonne", kgCO2e_per_unit: 660,    density_kg_per_m3: 7850, alternatives: [], description: "Recycled content rebar" },
  timber_glulam:          { name: "Glulam Timber",                category: "Timber",      unit: "m³",    kgCO2e_per_unit: -900,   density_kg_per_m3: 550,  alternatives: [], description: "Glued laminated timber — carbon negative" },
  timber_clt:             { name: "Cross Laminated Timber (CLT)", category: "Timber",      unit: "m³",    kgCO2e_per_unit: -750,   density_kg_per_m3: 500,  alternatives: [], description: "CLT panels — carbon negative structural material" },
  timber_softwood:        { name: "Sawn Softwood",                category: "Timber",      unit: "m³",    kgCO2e_per_unit: -800,   density_kg_per_m3: 500,  alternatives: [], description: "General sawn softwood timber" },
  brick_clay:             { name: "Clay Brick",                   category: "Masonry",     unit: "m³",    kgCO2e_per_unit: 360,    density_kg_per_m3: 1700, alternatives: ["brick_reclaimed","concrete_block"], description: "Standard fired clay brick" },
  brick_reclaimed:        { name: "Reclaimed Brick",              category: "Masonry",     unit: "m³",    kgCO2e_per_unit: 40,     density_kg_per_m3: 1700, alternatives: [], description: "Reclaimed clay brick — very low embodied carbon" },
  concrete_block:         { name: "Concrete Block",               category: "Masonry",     unit: "m³",    kgCO2e_per_unit: 230,    density_kg_per_m3: 1800, alternatives: ["brick_reclaimed"], description: "Standard concrete masonry unit" },
  glass_float:            { name: "Float Glass",                  category: "Glass",       unit: "m²",    kgCO2e_per_unit: 25,     density_kg_per_m3: 2500, alternatives: ["glass_triple"], description: "Standard float glass, 6mm" },
  glass_triple:           { name: "Triple Glazed Unit",           category: "Glass",       unit: "m²",    kgCO2e_per_unit: 90,     density_kg_per_m3: 2500, alternatives: [], description: "Triple glazed unit — higher upfront carbon, better thermal performance" },
  insulation_mineral_wool:{ name: "Mineral Wool Insulation",      category: "Insulation",  unit: "m³",    kgCO2e_per_unit: 33,     density_kg_per_m3: 25,   alternatives: ["insulation_cork","insulation_hemp"], description: "Standard mineral wool / rockwool insulation" },
  insulation_eps:         { name: "EPS Insulation",               category: "Insulation",  unit: "m³",    kgCO2e_per_unit: 88,     density_kg_per_m3: 20,   alternatives: ["insulation_mineral_wool","insulation_cork"], description: "Expanded polystyrene — higher carbon than mineral alternatives" },
  insulation_cork:        { name: "Cork Insulation",              category: "Insulation",  unit: "m³",    kgCO2e_per_unit: -100,   density_kg_per_m3: 120,  alternatives: [], description: "Natural cork — carbon negative insulation" },
  insulation_hemp:        { name: "Hemp Insulation",              category: "Insulation",  unit: "m³",    kgCO2e_per_unit: -35,    density_kg_per_m3: 40,   alternatives: [], description: "Hemp-based insulation — low carbon natural material" },
  aluminum_primary:       { name: "Aluminum (Primary)",           category: "Aluminum",    unit: "tonne", kgCO2e_per_unit: 11900,  density_kg_per_m3: 2700, alternatives: ["aluminum_recycled"], description: "Primary aluminum — very high embodied carbon" },
  aluminum_recycled:      { name: "Aluminum (Recycled)",          category: "Aluminum",    unit: "tonne", kgCO2e_per_unit: 1700,   density_kg_per_m3: 2700, alternatives: [], description: "Recycled aluminum — 85% lower carbon than primary" },
  flooring_carpet:        { name: "Carpet",                       category: "Flooring",    unit: "m²",    kgCO2e_per_unit: 18,     density_kg_per_m3: null, alternatives: ["flooring_timber"], description: "Standard broadloom carpet" },
  flooring_timber:        { name: "Timber Flooring",              category: "Flooring",    unit: "m²",    kgCO2e_per_unit: -12,    density_kg_per_m3: null, alternatives: [], description: "Solid timber flooring — carbon storing" },
  flooring_ceramic:       { name: "Ceramic Tiles",                category: "Flooring",    unit: "m²",    kgCO2e_per_unit: 22,     density_kg_per_m3: null, alternatives: ["flooring_timber"], description: "Standard ceramic floor tiles" },
};

const CATEGORY_COLORS: Record<string, string> = {
  Concrete:   "#8B7355",
  Steel:      "#4A7AB5",
  Timber:     "#2E8B57",
  Masonry:    "#2D5A27",
  Glass:      "#87CEEB",
  Insulation: "#B8952A",
  Aluminum:   "#555555",
  Flooring:   "#7A8C7A",
};

const BENCHMARKS: Record<string, { excellent: number; good: number; average: number; poor: number }> = {
  residential: { excellent: 300,  good: 500,  average: 750,  poor: 1000 },
  office:      { excellent: 350,  good: 600,  average: 900,  poor: 1200 },
  education:   { excellent: 300,  good: 500,  average: 700,  poor: 950  },
  healthcare:  { excellent: 400,  good: 650,  average: 950,  poor: 1300 },
  retail:      { excellent: 250,  good: 450,  average: 700,  poor: 950  },
  industrial:  { excellent: 200,  good: 350,  average: 550,  poor: 800  },
  mixed_use:   { excellent: 325,  good: 550,  average: 800,  poor: 1100 },
};

const BUILDING_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "office",      label: "Office" },
  { value: "education",   label: "Education" },
  { value: "healthcare",  label: "Healthcare" },
  { value: "retail",      label: "Retail" },
  { value: "industrial",  label: "Industrial" },
  { value: "mixed_use",   label: "Mixed Use" },
];

// Group materials by category for the dropdown
const MATERIAL_GROUPS = Object.entries(CARBON_DATA).reduce<Record<string, { key: string; mat: MaterialData }[]>>(
  (acc, [key, mat]) => {
    if (!acc[mat.category]) acc[mat.category] = [];
    acc[mat.category].push({ key, mat });
    return acc;
  }, {}
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaterialRow {
  id: string;
  materialKey: string;
  quantity: string;
}

interface ProjectInfo {
  name: string;
  buildingType: string;
  gfa: string;
  storeys: string;
  location: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCarbon(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)} MtCO₂e`;
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(1)} tCO₂e`;
  return `${v.toFixed(0)} kgCO₂e`;
}

function fmtNum(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function getBenchmarkRating(perM2: number, buildingType: string): { label: string; color: string; tier: string } {
  const b = BENCHMARKS[buildingType];
  if (!b) return { label: "Select building type", color: "#7A9B7A", tier: "unknown" };
  if (perM2 <= b.excellent) return { label: "Excellent — below RIBA 2030 target",           color: "#2E8B57", tier: "excellent" };
  if (perM2 <= b.good)      return { label: "Good — below industry average",                 color: "#2A9D8F", tier: "good" };
  if (perM2 <= b.average)   return { label: "Average — meets minimum standards",             color: "#B8952A", tier: "average" };
  if (perM2 <= b.poor)      return { label: "Below average — consider substitutions",        color: "#E76F51", tier: "below" };
  return                           { label: "High carbon — significant intervention needed", color: "#2D5A27", tier: "poor" };
}

// ─── Carbon breakdown chart (SVG) ────────────────────────────────────────────

function BreakdownChart({ rows }: { rows: MaterialRow[] }) {
  // Aggregate carbon by category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(row => {
      const mat = CARBON_DATA[row.materialKey];
      if (!mat) return;
      const qty = parseFloat(row.quantity) || 0;
      const total = qty * mat.kgCO2e_per_unit;
      map[mat.category] = (map[mat.category] ?? 0) + total;
    });
    return Object.entries(map).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  if (byCategory.length === 0) return null;

  const maxAbs = Math.max(...byCategory.map(([, v]) => Math.abs(v)), 1);
  const BAR_MAX = 260; // px for the max bar width

  return (
    <div className="space-y-2">
      {byCategory.map(([cat, val]) => {
        const isNeg = val < 0;
        const pct = (Math.abs(val) / maxAbs) * BAR_MAX;
        const color = CATEGORY_COLORS[cat] ?? "#888";
        return (
          <div key={cat} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 text-[#4A6B4A] text-right truncate">{cat}</span>
            <div className="flex-1 flex items-center" style={{ minHeight: 20 }}>
              {isNeg ? (
                <div className="flex items-center justify-end" style={{ width: BAR_MAX }}>
                  <span className="text-[10px] text-emerald-600 mr-1.5 font-medium">🌿 {fmtCarbon(val)}</span>
                  <div style={{ width: pct, height: 14, backgroundColor: color, borderRadius: 3, opacity: 0.85 }} />
                </div>
              ) : (
                <div className="flex items-center">
                  <div style={{ width: pct, height: 14, backgroundColor: color, borderRadius: 3, opacity: 0.85 }} />
                  <span className="text-[10px] text-[#4A6B4A] ml-1.5">{fmtCarbon(val)}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 text-[10px] text-[#7A9B7A] mt-2 border-t border-[#D8E6D8] pt-2">
        <span className="w-24 shrink-0 text-right">← carbon stored</span>
        <span className="flex-1">carbon emitted →</span>
      </div>
    </div>
  );
}

// ─── Benchmark gauge ──────────────────────────────────────────────────────────

function BenchmarkGauge({ perM2, buildingType }: { perM2: number | null; buildingType: string }) {
  if (!perM2 || !buildingType || !BENCHMARKS[buildingType]) {
    return (
      <p className="text-xs text-[#7A9B7A] italic">
        Enter gross floor area and select a building type to see benchmark comparison.
      </p>
    );
  }
  const b = BENCHMARKS[buildingType];
  const rating = getBenchmarkRating(perM2, buildingType);
  const maxScale = b.poor * 1.3;
  const pct = Math.min((perM2 / maxScale) * 100, 100);

  const tiers = [
    { to: (b.excellent / maxScale) * 100, color: "#2E8B57", label: `≤${b.excellent}` },
    { to: (b.good     / maxScale) * 100, color: "#2A9D8F", label: `≤${b.good}` },
    { to: (b.average  / maxScale) * 100, color: "#B8952A", label: `≤${b.average}` },
    { to: (b.poor     / maxScale) * 100, color: "#E76F51", label: `≤${b.poor}` },
    { to: 100,                            color: "#2D5A27", label: `>${b.poor}` },
  ];

  return (
    <div className="space-y-3">
      {/* Segmented bar */}
      <div className="relative h-4 rounded-full overflow-hidden flex">
        {tiers.map((tier, i) => {
          const prev = tiers[i - 1]?.to ?? 0;
          const w = tier.to - prev;
          return <div key={i} style={{ width: `${w}%`, backgroundColor: tier.color, opacity: 0.6 }} />;
        })}
        {/* needle */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[#1A2A1A]"
          style={{ left: `${pct}%`, transition: "left 0.5s" }}
        />
      </div>
      {/* Labels */}
      <div className="flex justify-between text-[9px] text-[#7A9B7A]">
        {tiers.map((t, i) => <span key={i}>{t.label}</span>)}
      </div>
      {/* Rating */}
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: rating.color }} />
        <span className="text-xs font-medium" style={{ color: rating.color }}>{rating.label}</span>
      </div>
      <p className="text-[10px] text-[#7A9B7A]">
        Your project: <strong className="text-[#1A2A1A]">{fmtNum(perM2)} kgCO₂e/m²</strong>
        {" "}· Benchmarks for {BUILDING_TYPES.find(t => t.value === buildingType)?.label ?? buildingType} buildings
      </p>
    </div>
  );
}

// ─── Swap suggestions ─────────────────────────────────────────────────────────

function SwapSuggestions({ rows, onSwap }: {
  rows: MaterialRow[];
  onSwap: (rowId: string, newKey: string) => void;
}) {
  const { swaps, optimized } = useMemo(() => {
    const swapResults: { rowId: string; currentName: string; currentIntensity: number; altKey: string; altName: string; altIntensity: number; saving: number; savingPct: number; qty: number; totalSaving: number }[] = [];
    const optimizedMats: { name: string; category: string }[] = [];

    rows.forEach(row => {
      const mat = CARBON_DATA[row.materialKey];
      if (!mat) return;

      if (mat.alternatives.length === 0) {
        // Already at lowest carbon for its category
        optimizedMats.push({ name: mat.name, category: mat.category });
        return;
      }

      const qty = parseFloat(row.quantity) || 0;
      mat.alternatives.forEach(altKey => {
        const alt = CARBON_DATA[altKey];
        if (!alt) return;
        const saving = mat.kgCO2e_per_unit - alt.kgCO2e_per_unit;
        if (saving <= 0) return;
        const savingPct = (saving / Math.abs(mat.kgCO2e_per_unit)) * 100;
        swapResults.push({
          rowId: row.id, currentName: mat.name, currentIntensity: mat.kgCO2e_per_unit,
          altKey, altName: alt.name, altIntensity: alt.kgCO2e_per_unit,
          saving, savingPct, qty, totalSaving: saving * qty,
        });
      });
    });

    return {
      swaps: swapResults.sort((a, b) => b.totalSaving - a.totalSaving),
      optimized: optimizedMats,
    };
  }, [rows]);

  if (swaps.length === 0 && optimized.length === 0) return (
    <p className="text-xs text-[#7A9B7A] italic">No substitution opportunities identified for current materials.</p>
  );

  return (
    <div className="space-y-4">
      {swaps.length === 0 && (
        <p className="text-xs text-[#7A9B7A] italic">No further substitution opportunities — all materials are at their lowest available carbon intensity.</p>
      )}
      <div className="space-y-2">
      {swaps.slice(0, 6).map((s, i) => (
        <div key={i} className="rounded-xl border border-[#D8E6D8] bg-white/60 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 flex-1 min-w-0">
              <p className="text-[10px] text-[#7A9B7A] uppercase tracking-wide font-medium">Current</p>
              <p className="text-xs text-[#1A2A1A] font-medium truncate">{s.currentName}</p>
              <p className="text-[10px] text-[#7A9B7A]">{s.currentIntensity.toLocaleString()} kgCO₂e/{CARBON_DATA[rows.find(r => r.id === s.rowId)?.materialKey ?? ""]?.unit}</p>
            </div>
            <div className="text-[#7A9B7A] text-sm mt-3">→</div>
            <div className="space-y-0.5 flex-1 min-w-0 text-right">
              <p className="text-[10px] text-emerald-600 uppercase tracking-wide font-medium">Alternative</p>
              <p className="text-xs text-[#1A2A1A] font-medium truncate">{s.altName}</p>
              <p className="text-[10px] text-emerald-600">{s.altIntensity.toLocaleString()} kgCO₂e/{CARBON_DATA[s.altKey]?.unit}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[#D8E6D8] pt-2">
            {s.altIntensity < 0 ? (
              <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                🌿 Carbon positive swap
                {s.qty > 0 && <span className="text-emerald-600 font-normal">· {fmtCarbon(s.totalSaving)} total</span>}
              </span>
            ) : (
              <span className="text-[10px] text-emerald-700 font-semibold">
                Save {s.savingPct.toFixed(0)}%
                {s.qty > 0 && ` · ${fmtCarbon(s.totalSaving)} total`}
              </span>
            )}
            <button
              onClick={() => onSwap(s.rowId, s.altKey)}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors font-medium"
            >
              Apply swap
            </button>
          </div>
        </div>
      ))}
      </div>

      {optimized.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A] mb-2">Already optimized</p>
          <div className="space-y-1.5">
            {optimized.map((m, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                <span className="text-emerald-600 text-sm leading-none">✓</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-[#1A2A1A] font-medium">{m.name}</span>
                  <span className="text-[10px] text-emerald-600 ml-1.5">— lowest carbon option in category</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#7A9B7A] mt-2">
            <strong className="text-[#4A6B4A]">{optimized.length}</strong> of{" "}
            <strong className="text-[#4A6B4A]">{rows.length}</strong> materials are already at their lowest available carbon intensity
          </p>
        </div>
      )}
    </div>
  );
}

// ─── AI report renderer ───────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function applyBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderSectionBody(body: string): string {
  // Escape HTML first, then apply bold so special chars inside ** are safe
  const escaped = escapeHtml(body);
  const lines = escaped.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    const bulletMatch = line.match(/^[-•]\s+(.+)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch || numberedMatch) {
      if (!inList) { out.push("<ul>"); inList = true; }
      const content = applyBold((bulletMatch?.[1] ?? numberedMatch?.[1]) ?? line);
      out.push(`<li>${content}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p>${applyBold(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function AIReport({ text }: { text: string }) {
  const sections = text.split(/\n(?=##\s)/);
  return (
    <div className="space-y-5">
      {sections.map((section, i) => {
        const lines = section.trim().split("\n");
        const heading = lines[0].startsWith("##") ? lines[0].replace(/^##\s*/, "") : null;
        const bodyRaw = heading ? lines.slice(1).join("\n").trim() : section.trim();
        const bodyHtml = renderSectionBody(bodyRaw);
        return (
          <div key={i}>
            {i > 0 && <div className="border-t border-[#D8E6D8] mb-4" />}
            {heading && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A] mb-2">{heading}</p>
            )}
            <div
              className="text-xs text-[#1A2A1A] leading-relaxed report-body"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DEFAULT_ROWS: MaterialRow[] = [
  { id: "1", materialKey: "concrete_general", quantity: "" },
  { id: "2", materialKey: "steel_structural",  quantity: "" },
  { id: "3", materialKey: "glass_float",       quantity: "" },
];

export default function CarbonLensPage() {
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: "", buildingType: "office", gfa: "", storeys: "", location: "",
  });
  const [rows, setRows] = useState<MaterialRow[]>(DEFAULT_ROWS);
  const [aiReport, setAiReport] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);
  const reportSectionRef = useRef<HTMLElement>(null);

  // ── Derived totals ─────────────────────────────────────────────────────────

  const { totalCarbon, byRow } = useMemo(() => {
    let total = 0;
    const br: number[] = [];
    rows.forEach(row => {
      const mat = CARBON_DATA[row.materialKey];
      const qty = parseFloat(row.quantity) || 0;
      const lineTotal = mat ? qty * mat.kgCO2e_per_unit : 0;
      br.push(lineTotal);
      total += lineTotal;
    });
    return { totalCarbon: total, byRow: br };
  }, [rows]);

  const gfa = parseFloat(projectInfo.gfa) || null;
  const perM2 = gfa && gfa > 0 ? totalCarbon / gfa : null;

  // Equivalents
  const flights = Math.abs(totalCarbon / 1600).toFixed(1); // ~1600 kgCO2e per transatlantic flight
  const carYears = Math.abs(totalCarbon / 4600).toFixed(1); // ~4600 kgCO2e per year average car

  const rating = perM2 !== null && projectInfo.buildingType
    ? getBenchmarkRating(perM2, projectInfo.buildingType)
    : null;

  // ── Row mutation ───────────────────────────────────────────────────────────

  const updateRow = useCallback((id: string, field: keyof MaterialRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { id: crypto.randomUUID(), materialKey: "concrete_general", quantity: "" }]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const applySwap = useCallback((rowId: string, newKey: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, materialKey: newKey } : r));
  }, []);

  // ── AI report ─────────────────────────────────────────────────────────────

  const generateReport = async () => {
    setAiLoading(true);
    setAiError("");
    setAiReport("");
    try {
      const materials = rows.map(row => {
        const mat = CARBON_DATA[row.materialKey];
        return {
          name: mat?.name ?? row.materialKey,
          quantity: parseFloat(row.quantity) || 0,
          unit: mat?.unit ?? "",
          intensity: mat?.kgCO2e_per_unit ?? 0,
          total: (parseFloat(row.quantity) || 0) * (mat?.kgCO2e_per_unit ?? 0),
        };
      });
      const res = await fetch("/api/carbon-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectInfo,
          materials,
          totalCarbon,
          perM2,
          benchmarkRating: rating?.label ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed");
      setAiReport(data.report);
      setTimeout(() => reportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Copy report ───────────────────────────────────────────────────────────

  const copyReport = () => {
    navigator.clipboard.writeText(aiReport).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Export CSV ────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const header = "Material,Quantity,Unit,kgCO2e/unit,Total kgCO2e,Alternative Available\n";
    const body = rows.map(row => {
      const mat = CARBON_DATA[row.materialKey];
      const qty = parseFloat(row.quantity) || 0;
      const total = qty * (mat?.kgCO2e_per_unit ?? 0);
      const hasAlt = (mat?.alternatives.length ?? 0) > 0 ? "Yes" : "No";
      return `"${mat?.name ?? ""}",${qty},${mat?.unit ?? ""},${mat?.kgCO2e_per_unit ?? ""},${total.toFixed(0)},${hasAlt}`;
    }).join("\n");
    const summary = `\n\nSummary\nProject,${projectInfo.name || "Unnamed"}\nBuilding Type,${projectInfo.buildingType}\nGross Floor Area,${projectInfo.gfa || ""} m²\nTotal Carbon,${totalCarbon.toFixed(0)} kgCO2e\nPer m²,${perM2?.toFixed(0) ?? "N/A"} kgCO2e/m²\nBenchmark Rating,${rating?.label ?? "N/A"}\n`;
    const blob = new Blob([header + body + summary], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carbon-lens-${projectInfo.name || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FFFFFF]">
      <style>{`
        .report-body p { margin-bottom: 0.5rem; }
        .report-body p:last-child { margin-bottom: 0; }
        .report-body ul { list-style: disc; padding-left: 1.25rem; margin-bottom: 0.5rem; }
        .report-body li { margin-bottom: 0.25rem; }
        .report-body strong { font-weight: 600; color: #1A2A1A; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#1A2A1A]/[0.08] bg-white/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/#projects" className="text-xs text-[#7A9B7A] hover:text-[#4A6B4A] transition-colors shrink-0">
            ← Back
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-[#1A2A1A] leading-tight">Carbon Lens</h1>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-darkblue/10 text-darkblue border border-darkblue/20 uppercase tracking-wide shrink-0">
                CS × Architecture
              </span>
            </div>
            <p className="text-xs text-[#7A9B7A] mt-0.5">Embodied carbon estimator for early-stage architectural design</p>
          </div>
          <button
            onClick={exportCSV}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-[#D8E6D8] text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors bg-white/80"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── Info banner ────────────────────────────────────────────────────── */}
        <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm p-5 grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A] mb-2">What is embodied carbon?</p>
            <p className="text-xs text-[#4A6B4A] leading-relaxed">
              Embodied carbon refers to the greenhouse gas emissions produced during the manufacture, transport, and installation
              of building materials — before the building is ever occupied. It typically accounts for 20–50% of a building&apos;s
              lifetime carbon footprint and is locked in at the point of construction. Making smarter material choices early
              in design is the highest-leverage moment for reducing a building&apos;s climate impact.
            </p>
          </div>
          <div className="border-l border-[#D8E6D8] pl-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A] mb-2">Data source</p>
            <p className="text-xs text-[#4A6B4A] leading-relaxed">
              Carbon intensities from the <strong className="text-[#1A2A1A]">ICE Database v3.0</strong> (Inventory of Carbon
              and Energy, University of Bath) — the industry standard reference for embodied carbon in construction materials.
              Results are estimates for comparative design decisions, not certified assessments.
            </p>
          </div>
        </div>

        {/* ── Project info ───────────────────────────────────────────────────── */}
        <section className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#D8E6D8]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A]">Project Information</p>
          </div>
          <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-medium text-[#7A9B7A] uppercase tracking-wide mb-1">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Riverside Housing Block"
                value={projectInfo.name}
                onChange={e => setProjectInfo(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#D8E6D8] rounded-lg focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A] placeholder:text-[#7A9B7A]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[#7A9B7A] uppercase tracking-wide mb-1">Building Type</label>
              <select
                value={projectInfo.buildingType}
                onChange={e => setProjectInfo(p => ({ ...p, buildingType: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#D8E6D8] rounded-lg focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A]"
              >
                {BUILDING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[#7A9B7A] uppercase tracking-wide mb-1">Gross Floor Area (m²)</label>
              <input
                type="number"
                placeholder="e.g. 2500"
                value={projectInfo.gfa}
                onChange={e => setProjectInfo(p => ({ ...p, gfa: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#D8E6D8] rounded-lg focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A] placeholder:text-[#7A9B7A]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-[#7A9B7A] uppercase tracking-wide mb-1">Location</label>
              <input
                type="text"
                placeholder="e.g. London, UK"
                value={projectInfo.location}
                onChange={e => setProjectInfo(p => ({ ...p, location: e.target.value }))}
                className="w-full px-3 py-2 text-xs border border-[#D8E6D8] rounded-lg focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A] placeholder:text-[#7A9B7A]"
              />
            </div>
          </div>
        </section>

        {/* ── Material input table ──────────────────────────────────────────── */}
        <section className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#D8E6D8] flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A]">Material Schedule</p>
            <button
              onClick={addRow}
              className="text-[10px] px-3 py-1 rounded-lg bg-[#2D5A27]/10 text-[#2D5A27] font-medium hover:bg-[#2D5A27]/20 transition-colors border border-[#2D5A27]/20"
            >
              + Add material
            </button>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#D8E6D8] bg-[#FFFFFF]/50">
                  <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#7A9B7A] w-72">Material</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#7A9B7A] w-28">Quantity</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#7A9B7A] w-16">Unit</th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#7A9B7A] w-36">kgCO₂e / unit</th>
                  <th className="text-right px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-[#7A9B7A]">Total kgCO₂e</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E6D8]/60">
                {rows.map((row, i) => {
                  const mat = CARBON_DATA[row.materialKey];
                  const lineTotal = byRow[i] ?? 0;
                  const isNeg = lineTotal < 0;
                  const hasQty = (parseFloat(row.quantity) || 0) > 0;
                  return (
                    <tr key={row.id} className="hover:bg-[#FFFFFF]/30 transition-colors group">
                      <td className="px-5 py-3">
                        <select
                          value={row.materialKey}
                          onChange={e => updateRow(row.id, "materialKey", e.target.value)}
                          className="w-full text-xs border-0 focus:outline-none bg-transparent text-[#1A2A1A] cursor-pointer"
                        >
                          {Object.entries(MATERIAL_GROUPS).map(([cat, items]) => (
                            <optgroup key={cat} label={cat}>
                              {items.map(({ key, mat: m }) => (
                                <option key={key} value={key}>{m.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {mat && <p className="text-[10px] text-[#7A9B7A] mt-0.5 leading-tight">{mat.description}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0"
                          value={row.quantity}
                          onChange={e => updateRow(row.id, "quantity", e.target.value)}
                          className="w-24 px-2 py-1 text-xs border border-[#D8E6D8] rounded focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A] placeholder:text-[#7A9B7A]"
                        />
                      </td>
                      <td className="px-3 py-3 text-[#7A9B7A]">{mat?.unit}</td>
                      <td className="px-3 py-3">
                        <span className={`font-mono text-[11px] ${mat && mat.kgCO2e_per_unit < 0 ? "text-emerald-600" : "text-[#4A6B4A]"}`}>
                          {mat && mat.kgCO2e_per_unit < 0 && "🌿 "}
                          {mat?.kgCO2e_per_unit.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {hasQty ? (
                          <span className={`font-mono text-xs font-medium ${isNeg ? "text-emerald-600" : "text-[#1A2A1A]"}`}>
                            {isNeg && "🌿 "}{fmtCarbon(lineTotal)}
                          </span>
                        ) : (
                          <span className="text-[#7A9B7A] text-[10px]">—</span>
                        )}
                      </td>
                      <td className="pr-3">
                        <button
                          onClick={() => removeRow(row.id)}
                          className="opacity-0 group-hover:opacity-100 text-[#7A9B7A] hover:text-red-500 transition-all text-base leading-none"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[#D8E6D8]/60">
            {rows.map((row, i) => {
              const mat = CARBON_DATA[row.materialKey];
              const lineTotal = byRow[i] ?? 0;
              const isNeg = lineTotal < 0;
              return (
                <div key={row.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <select
                      value={row.materialKey}
                      onChange={e => updateRow(row.id, "materialKey", e.target.value)}
                      className="flex-1 text-xs border border-[#D8E6D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A]"
                    >
                      {Object.entries(MATERIAL_GROUPS).map(([cat, items]) => (
                        <optgroup key={cat} label={cat}>
                          {items.map(({ key, mat: m }) => <option key={key} value={key}>{m.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <button onClick={() => removeRow(row.id)} className="text-[#7A9B7A] hover:text-red-500 transition-colors shrink-0">×</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min="0" step="any" placeholder="0"
                      value={row.quantity}
                      onChange={e => updateRow(row.id, "quantity", e.target.value)}
                      className="w-28 px-2 py-1 text-xs border border-[#D8E6D8] rounded focus:outline-none focus:border-[#2D5A27] bg-white text-[#1A2A1A]"
                    />
                    <span className="text-[10px] text-[#7A9B7A]">{mat?.unit}</span>
                    <span className="ml-auto text-xs font-medium font-mono">
                      <span className={isNeg ? "text-emerald-600" : "text-[#1A2A1A]"}>
                        {(parseFloat(row.quantity) || 0) > 0 ? fmtCarbon(lineTotal) : "—"}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals footer */}
          <div className="border-t border-[#D8E6D8] px-5 py-4 bg-[#FFFFFF]/40 space-y-3">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <div>
                <p className="text-[10px] text-[#7A9B7A] uppercase tracking-wide font-medium">Total Embodied Carbon</p>
                <p className={`text-xl font-semibold mt-0.5 ${totalCarbon < 0 ? "text-emerald-600" : "text-[#1A2A1A]"}`}>
                  {totalCarbon < 0 && "🌿 "}{fmtCarbon(totalCarbon)}
                </p>
              </div>
              {perM2 !== null && (
                <div>
                  <p className="text-[10px] text-[#7A9B7A] uppercase tracking-wide font-medium">Per m²</p>
                  <p className={`text-xl font-semibold mt-0.5 ${perM2 < 0 ? "text-emerald-600" : "text-[#1A2A1A]"}`}>
                    {fmtNum(perM2)} kgCO₂e/m²
                  </p>
                </div>
              )}
            </div>
            {totalCarbon !== 0 && (
              totalCarbon < 0 ? (
                <p className="text-[10px] text-emerald-700">
                  This building stores carbon equivalent to&nbsp;
                  <strong>{flights} transatlantic flights</strong>
                  &nbsp;or&nbsp;
                  <strong>{carYears} years</strong>
                  &nbsp;of average car driving being offset
                </p>
              ) : (
                <p className="text-[10px] text-[#7A9B7A]">
                  Equivalent to&nbsp;
                  <strong className="text-[#4A6B4A]">{flights} transatlantic flights</strong>
                  &nbsp;or&nbsp;
                  <strong className="text-[#4A6B4A]">{carYears} years</strong>
                  &nbsp;of average car driving
                </p>
              )
            )}
          </div>
        </section>

        {/* ── Results grid ──────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Carbon breakdown chart */}
          <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#D8E6D8]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A]">Carbon by Category</p>
            </div>
            <div className="p-5">
              {rows.every(r => !parseFloat(r.quantity)) ? (
                <p className="text-xs text-[#7A9B7A] italic">Enter material quantities above to see the breakdown.</p>
              ) : (
                <BreakdownChart rows={rows} />
              )}
            </div>
          </div>

          {/* Benchmark comparison */}
          <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#D8E6D8]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A]">Benchmark Comparison</p>
            </div>
            <div className="p-5">
              <BenchmarkGauge perM2={perM2} buildingType={projectInfo.buildingType} />
            </div>
          </div>
        </div>

        {/* ── Swap suggestions ──────────────────────────────────────────────── */}
        <section className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#D8E6D8]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A]">Material Substitution Opportunities</p>
            <p className="text-[10px] text-[#7A9B7A] mt-0.5">Ranked by potential carbon saving — biggest wins first</p>
          </div>
          <div className="p-5">
            <SwapSuggestions rows={rows} onSwap={applySwap} />
          </div>
        </section>

        {/* ── AI report ─────────────────────────────────────────────────────── */}
        <section ref={reportSectionRef} className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#D8E6D8] flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7A9B7A]">AI Consultant Report</p>
              <p className="text-[10px] text-[#7A9B7A] mt-0.5">Expert recommendations generated by Claude</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {aiReport && (
                <button
                  onClick={copyReport}
                  className="text-xs px-3 py-2 rounded-lg border border-[#D8E6D8] text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors bg-white/80"
                >
                  {copied ? "Copied!" : "Copy report"}
                </button>
              )}
              <button
                onClick={generateReport}
                disabled={aiLoading || rows.every(r => !parseFloat(r.quantity))}
                className="text-xs px-4 py-2 rounded-lg bg-[#2D5A27] text-white font-medium hover:bg-[#1A3A16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {aiLoading ? "Generating…" : "Generate Report"}
              </button>
            </div>
          </div>
          <div className="p-5">
            {!aiReport && !aiLoading && !aiError && (
              <p className="text-xs text-[#7A9B7A] italic">
                Enter your material quantities and click &quot;Generate Report&quot; for AI-powered substitution recommendations and industry context.
              </p>
            )}
            {aiLoading && (
              <div className="flex items-center gap-2 text-xs text-[#7A9B7A]">
                <span className="w-3 h-3 rounded-full border-2 border-[#2D5A27]/30 border-t-[#2D5A27] animate-spin" />
                Consulting embodied carbon database…
              </div>
            )}
            {aiError && <p className="text-xs text-red-500">{aiError}</p>}
            {aiReport && (
              <div>
                <AIReport text={aiReport} />
                <p className="text-[10px] text-[#7A9B7A]/60 text-right mt-4">Generated by Claude (Anthropic)</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Legend ────────────────────────────────────────────────────────── */}
        <div className="pb-8">
          <p className="text-[10px] text-[#7A9B7A]/70 leading-relaxed text-center max-w-2xl mx-auto">
            Carbon intensities sourced from the ICE Database v3.0, University of Bath.
            Negative values (🌿) indicate carbon-storing materials where the biogenic carbon sequestered during tree growth
            exceeds production emissions. Results are for comparative design guidance only and should not be used for
            regulatory submissions without verification by a certified assessor.
          </p>
        </div>
      </div>
    </div>
  );
}
