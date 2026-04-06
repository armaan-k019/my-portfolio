"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import type {
  UrbanAnalysisResult,
  OverpassPoint,
  IncomeBracket,
} from "../../api/urban-gpt/route";

const UrbanGPTMap = dynamic(() => import("./UrbanGPTMap"), { ssr: false });

// ─── Constants ────────────────────────────────────────────────────────────────

const RADIUS_VALUES: number[] = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  25, 30, 35, 40, 45, 50,
];

const DEFAULT_RADIUS_INDEX = 3; // 2 miles

interface LayerState {
  transit: boolean;
  parks: boolean;
  restaurants: boolean;
  schools: boolean;
  hospitals: boolean;
  flood: boolean;
  heat: boolean;
  zoning: boolean;
}

const LAYER_CONFIG: {
  key: keyof LayerState;
  label: string;
  color: string;
  markerColor: string;
}[] = [
  { key: "transit",     label: "Transit",  color: "bg-darkblue",    markerColor: "#1E3A5F" },
  { key: "parks",       label: "Parks",    color: "bg-sage",        markerColor: "#6B8F6E" },
  { key: "restaurants", label: "Dining",   color: "bg-tan",         markerColor: "#D4A96A" },
  { key: "schools",     label: "Schools",  color: "bg-terracotta",  markerColor: "#2D5A27" },
  { key: "hospitals",   label: "Health",   color: "bg-brown-light", markerColor: "#4A6B4A" },
];

const SPECIALTY_LAYER_CONFIG: { key: "flood" | "heat" | "zoning"; label: string }[] = [
  { key: "flood",  label: "Flood Risk" },
  { key: "heat",   label: "Heat Island" },
  { key: "zoning", label: "Zoning" },
];


// ─── New data layer types ──────────────────────────────────────────────────────

interface FloodZone {
  zone: string;
  subtype: string;
  sfha: boolean;
  rings: number[][][];
}

interface FloodData {
  zoneAtLocation: string;
  zoneName: string;
  isHighRisk: boolean;
  isModerateRisk: boolean;
  isMinimalRisk: boolean;
  description: string;
  sfha: boolean;
  nearbyZones: FloodZone[];
  error?: string;
}

interface HeatData {
  currentTempC: number;
  referenceTempC: number;
  deltaC: number;
  intensityScore: number;
  intensityLabel: string;
  greenSpacePct: number;
  recommendation: string;
  error?: string;
}

interface ZoningData {
  zoneCode: string | null;
  zoneName: string;
  zoneType: "residential" | "commercial" | "industrial" | "mixed" | "agricultural" | "institutional" | "unknown";
  source: "arcgis" | "osm";
  city: string;
  dataQuality: "official" | "estimated";
  disclaimer: string;
  aiSummary: string;
  aiDesignNote: string;
  zoningCodeUrl: string;
  gisUrl: string;
  error?: string;
}

type ActiveTab = "demographics" | "flood" | "heat" | "zoning";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number | null): string {
  if (n === null) return "-";
  return `$${n.toLocaleString()}`;
}

function fmtDensity(n: number | null, unit: "miles" | "km"): string {
  if (n === null) return "-";
  const val = unit === "km" ? Math.round(n / 2.58999) : n;
  return `${val.toLocaleString()} / sq ${unit === "km" ? "km" : "mi"}`;
}

function fmtRadius(radiusIndex: number, unit: "miles" | "km"): string {
  const miles = RADIUS_VALUES[radiusIndex];
  if (unit === "km") {
    const km = miles * 1.60934;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }
  return `${miles < 5 ? miles.toFixed(1) : miles} mi`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "-";
  return `${n}%`;
}

function fmtNum(n: number | null, suffix = ""): string {
  if (n === null) return "-";
  return `${n.toLocaleString()}${suffix}`;
}


function gentrificationColor(level: string | null): string {
  if (!level) return "text-brown-light";
  if (level === "Low") return "text-sage";
  if (level === "Medium") return "text-tan";
  if (level === "High") return "text-terracotta";
  return "text-terracotta";
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1 align-middle">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-3.5 h-3.5 rounded-full bg-brown-light/20 text-brown-light/70 text-[9px] font-bold leading-none flex items-center justify-center hover:bg-tan/40 transition-colors"
        aria-label="Info"
      >
        ?
      </button>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 rounded-lg bg-darkblue text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-darkblue" />
        </span>
      )}
    </span>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  tooltip,
  score,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  score?: number;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-1 flex items-center">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </p>
      <p className={`text-xl font-semibold leading-tight ${valueColor ?? "text-darkblue"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-brown-light mt-0.5">{sub}</p>}
      {score !== undefined && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-tan/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-darkblue transition-all duration-500"
              style={{ width: `${score}%` }}
            />
          </div>
          <p className="text-[10px] text-brown-light mt-1">{score} / 100</p>
        </div>
      )}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-brown mb-2 uppercase tracking-wide">
      {children}
    </p>
  );
}

// ─── Income distribution chart ───────────────────────────────────────────────

function IncomeChart({ brackets, mean }: { brackets: IncomeBracket[]; mean: number | null }) {
  if (brackets.length === 0) return null;
  const max = Math.max(...brackets.map(b => b.count));
  return (
    <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-3 col-span-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-2 flex items-center gap-1">
        Income Distribution
        <Tooltip text="Household count by income bracket (ACS 5-year). Shape indicates income spread. Wide distributions signal inequality; tight peaks signal homogeneity." />
      </p>
      <div className="flex items-end gap-0.5 h-16">
        {brackets.map((b) => {
          const isMean = mean !== null && Math.abs(b.midpoint - mean) === Math.min(...brackets.map(x => Math.abs(x.midpoint - mean!)));
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div
                className={`w-full rounded-sm transition-all ${isMean ? "bg-terracotta" : "bg-darkblue/40 group-hover:bg-darkblue/60"}`}
                style={{ height: `${Math.max(3, (b.count / max) * 56)}px` }}
              />
              <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-darkblue text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                {b.label}: {b.count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-brown-light/50">{brackets[0]?.label}</span>
        {mean !== null && (
          <span className="text-[9px] text-terracotta font-medium">mean ≈ ${mean.toLocaleString()}</span>
        )}
        <span className="text-[9px] text-brown-light/50">{brackets[brackets.length - 1]?.label}</span>
      </div>
    </div>
  );
}

// ─── Panel skeleton / error ───────────────────────────────────────────────────

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`rounded-xl bg-tan/10 ${i === 0 ? "h-24" : "h-16"}`} />
      ))}
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-tan/30 bg-white/40 px-4 py-8 text-center">
      <p className="text-sm text-brown-light mb-3">{message}</p>
      <button
        onClick={onRetry}
        className="text-xs text-terracotta hover:text-terracotta-dark transition-colors underline"
      >
        Retry
      </button>
    </div>
  );
}

// ─── Flood Panel ──────────────────────────────────────────────────────────────

function FloodPanel({
  data,
  loading,
  error,
  onRetry,
}: {
  data: FloodData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <PanelSkeleton rows={4} />;
  if (error || !data) return <PanelError message={error ?? "No flood data available for this location."} onRetry={onRetry} />;
  if (data.error) return <PanelError message={data.error} onRetry={onRetry} />;

  const badgeBg = data.isHighRisk
    ? "bg-red-100 text-red-700 border-red-200"
    : data.isModerateRisk
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-green-100 text-green-700 border-green-200";

  const riskColor = data.isHighRisk
    ? "text-red-600"
    : data.isModerateRisk
    ? "text-amber-600"
    : "text-green-700";

  const riskLabel = data.isHighRisk
    ? "High Risk"
    : data.isModerateRisk
    ? "Moderate Risk"
    : data.isMinimalRisk
    ? "Minimal Risk"
    : "Undetermined";

  const uniqueNearbyZones = [...new Set(data.nearbyZones.map(z => z.zone))].slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className={`text-lg font-bold px-3 py-1 rounded-lg border ${badgeBg}`}>
            ZONE {data.zoneAtLocation}
          </span>
          <div className="text-right">
            <div className={`text-sm font-semibold ${riskColor}`}>{riskLabel}</div>
            <div className="text-xs text-brown-light">{data.zoneName}</div>
          </div>
        </div>
        <p className="text-sm text-brown leading-relaxed">{data.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Special Flood Hazard Area"
          value={data.sfha ? "Yes" : "No"}
          valueColor={data.sfha ? "text-red-600" : "text-green-700"}
          tooltip="SFHA zones (A, AE, VE, etc.) have a 1% or greater annual chance of flooding. Flood insurance is federally required for mortgaged properties in SFHA zones."
        />
        <StatCard
          label="Nearby Zone Types"
          value={uniqueNearbyZones.length > 0 ? uniqueNearbyZones.join(", ") : "—"}
          sub="within 0.05° radius"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-brown-light/60">Source: FEMA National Flood Hazard Layer</p>
        <a
          href="https://msc.fema.gov/portal/search"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-terracotta hover:text-terracotta-dark transition-colors"
        >
          View FEMA Flood Map →
        </a>
      </div>
    </div>
  );
}

// ─── Heat Island Panel ────────────────────────────────────────────────────────

function HeatPanel({
  data,
  loading,
  error,
  onRetry,
}: {
  data: HeatData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <PanelSkeleton rows={4} />;
  if (error || !data) return <PanelError message={error ?? "Heat island data unavailable."} onRetry={onRetry} />;

  const scoreColor =
    data.intensityScore < 4
      ? "text-blue-600"
      : data.intensityScore < 7
      ? "text-amber-600"
      : "text-red-600";

  const impactText =
    data.intensityScore < 4
      ? "Minimal impact on cooling energy demand."
      : data.intensityScore < 7
      ? "This heat island effect increases cooling energy demand by an estimated 5–10% and can raise peak temperatures by 1–3°C compared to surrounding rural areas."
      : "This level of heat island effect increases cooling energy demand by an estimated 10–20% and can raise peak temperatures by 3–6°C compared to surrounding rural areas.";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-4">
        <p className={`text-3xl font-bold ${scoreColor}`}>
          {data.intensityScore.toFixed(1)}
          <span className="text-lg font-normal text-brown-light"> / 10</span>
        </p>
        <p className="text-sm font-medium text-brown mt-0.5">{data.intensityLabel} Heat Island Effect</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Surface Temp" value={`${data.currentTempC}°C`} tooltip="Current surface temperature at the analysis location (Open-Meteo)." />
        <StatCard label="Rural Reference" value={`${data.referenceTempC}°C`} tooltip="Surface temperature ~5 miles from the site used as a rural baseline." />
        <StatCard label="Difference" value={`+${data.deltaC}°C`} valueColor={data.deltaC > 3 ? "text-red-600" : "text-amber-600"} tooltip="Temperature delta between urban location and rural reference — the core heat island signal." />
      </div>

      <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-2">
          Green Space Coverage
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-tan/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-sage transition-all duration-500"
              style={{ width: `${data.greenSpacePct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-darkblue shrink-0">{data.greenSpacePct}%</span>
        </div>
        <p className="text-[10px] text-brown-light mt-1">estimated from park count within radius</p>
      </div>

      <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-1">Impact</p>
        <p className="text-sm text-brown leading-relaxed">{impactText}</p>
      </div>

      <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-1">
          Design Recommendation
        </p>
        <p className="text-sm text-brown leading-relaxed">{data.recommendation}</p>
      </div>
    </div>
  );
}

// ─── Zoning Panel ─────────────────────────────────────────────────────────────

function ZoningPanel({
  data,
  loading,
  error,
  onRetry,
}: {
  data: ZoningData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) return <PanelSkeleton rows={4} />;
  if (error || !data) return <PanelError message={error ?? "Zoning data unavailable."} onRetry={onRetry} />;
  if (data.error) return <PanelError message={data.error} onRetry={onRetry} />;

  const badgeColors: Record<string, string> = {
    residential:   "bg-blue-100 text-blue-700 border-blue-200",
    commercial:    "bg-orange-100 text-orange-700 border-orange-200",
    industrial:    "bg-gray-100 text-gray-600 border-gray-200",
    mixed:         "bg-purple-100 text-purple-700 border-purple-200",
    agricultural:  "bg-green-100 text-green-700 border-green-200",
    institutional: "bg-indigo-100 text-indigo-700 border-indigo-200",
    unknown:       "bg-tan/20 text-brown-light border-tan/30",
  };
  const badgeClass = badgeColors[data.zoneType] ?? badgeColors.unknown;

  return (
    <div className="space-y-3">
      {/* Zone header */}
      <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-4">
        <div className="flex items-start gap-3 mb-3">
          {data.zoneCode && (
            <span className={`text-lg font-bold px-3 py-1 rounded-lg border shrink-0 ${badgeClass}`}>
              {data.zoneCode}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brown leading-snug">{data.zoneName}</p>
            {data.city && <p className="text-xs text-brown-light mt-0.5">{data.city}</p>}
          </div>
          {/* Data quality indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`w-2 h-2 rounded-full ${data.dataQuality === "official" ? "bg-green-500" : "bg-amber-400"}`} />
            <span className="text-[10px] text-brown-light capitalize">{data.dataQuality}</span>
          </div>
        </div>
        {data.aiSummary && (
          <p className="text-sm text-brown-light leading-relaxed">{data.aiSummary}</p>
        )}
      </div>

      {/* AI design note */}
      {data.aiDesignNote && (
        <div className="rounded-xl border border-tan/30 bg-white/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-1">
            Design Implication
          </p>
          <p className="text-sm text-brown leading-relaxed">{data.aiDesignNote}</p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-brown-light/60 leading-relaxed px-1">{data.disclaimer}</p>

      {/* Links */}
      <div className="flex flex-col gap-2">
        <a
          href={data.zoningCodeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-terracotta hover:text-terracotta-dark transition-colors"
        >
          Find {data.city ? `${data.city} ` : ""}zoning code →
        </a>
        <a
          href={data.gisUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-terracotta hover:text-terracotta-dark transition-colors"
        >
          View on municipal GIS →
        </a>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UrbanGPTPage() {
  const [address, setAddress] = useState("");
  const [place, setPlace] = useState<{ lat: number; lng: number; formatted: string } | null>(null);
  const [unit, setUnit] = useState<"miles" | "km">("miles");
  const [radiusIndex, setRadiusIndex] = useState(DEFAULT_RADIUS_INDEX);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UrbanAnalysisResult | null>(null);
  const [layers, setLayers] = useState<LayerState>({
    transit: true, parks: true, restaurants: true, schools: true, hospitals: true,
    flood: false, heat: false, zoning: false,
  });
  const [suggestions, setSuggestions] = useState<{ display: string; lat: number; lng: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // New data layer state
  const [floodData, setFloodData] = useState<FloodData | null>(null);
  const [floodLoading, setFloodLoading] = useState(false);
  const [floodError, setFloodError] = useState<string | null>(null);

  const [heatData, setHeatData] = useState<HeatData | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [heatError, setHeatError] = useState<string | null>(null);

  const [zoningData, setZoningData] = useState<ZoningData | null>(null);
  const [zoningLoading, setZoningLoading] = useState(false);
  const [zoningError, setZoningError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>("demographics");

  const nominatimRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nominatimAbortRef = useRef<AbortController | null>(null);

  const addressInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasResultRef = useRef(false);
  const currentPlaceRef = useRef<{ lat: number; lng: number; formatted: string } | null>(null);
  const currentRadiusIndexRef = useRef(DEFAULT_RADIUS_INDEX);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doAnalyzeRef = useRef<any>(null);

  const radiusInMiles = RADIUS_VALUES[radiusIndex];

  // ── Nominatim suggestion search ────────────────────────────────────────────

  useEffect(() => {
    if (nominatimRef.current) clearTimeout(nominatimRef.current);
    nominatimAbortRef.current?.abort();
    if (!address.trim() || address.length < 2) { setSuggestions([]); return; }
    nominatimRef.current = setTimeout(async () => {
      const controller = new AbortController();
      nominatimAbortRef.current = controller;
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=6&countrycodes=us&addressdetails=0`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "Accept-Language": "en", "User-Agent": "UrbanGPT/1.0" },
        });
        const data = await res.json() as { display_name: string; lat: string; lon: string }[];
        setSuggestions(data.map(d => ({ display: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) })));
        setShowSuggestions(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSuggestions([]);
      }
    }, 150);
    return () => {
      if (nominatimRef.current) clearTimeout(nominatimRef.current);
      nominatimAbortRef.current?.abort();
    };
  }, [address]);

  // ── Core analysis ──────────────────────────────────────────────────────────

  const fetchLayerData = useCallback(
    (lat: number, lng: number, parksCount: number, place: { lat: number; lng: number; formatted: string }) => {
      // Reset
      setFloodData(null); setFloodLoading(true); setFloodError(null);
      setHeatData(null);  setHeatLoading(true);  setHeatError(null);
      setZoningData(null); setZoningLoading(true); setZoningError(null);

      const safeJson = async (label: string, r: Response) => {
        const text = await r.text();
        console.log(`[urban-gpt] ${label} raw (${r.status}):`, text.slice(0, 200));
        return JSON.parse(text);
      };

      Promise.allSettled([
        fetch(`/api/flood-risk?lat=${lat}&lng=${lng}`).then(r => safeJson("flood-risk", r)),
        fetch(`/api/heat-island?lat=${lat}&lng=${lng}&parksCount=${parksCount}`).then(r => safeJson("heat-island", r)),
        fetch(`/api/zoning?lat=${lat}&lng=${lng}`).then(r => safeJson("zoning", r)),
      ]).then(([flood, heat, zoning]) => {
        if (flood.status === "fulfilled") setFloodData(flood.value as FloodData);
        else setFloodError("Flood data unavailable for this location.");
        setFloodLoading(false);

        if (heat.status === "fulfilled") setHeatData(heat.value as HeatData);
        else setHeatError("Heat island data unavailable.");
        setHeatLoading(false);

        if (zoning.status === "fulfilled") setZoningData(zoning.value as ZoningData);
        else setZoningError("Zoning data unavailable for this location.");
        setZoningLoading(false);
      });

      // suppress unused var lint
      void place;
    },
    []
  );

  const doAnalyze = useCallback(
    async (pl: { lat: number; lng: number; formatted: string }, ri: number) => {
      const rMeters = RADIUS_VALUES[ri] * 1609.344;
      setLoading(true);
      setError("");
      setActiveTab("demographics");
      try {
        const res = await fetch("/api/urban-gpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pl.lat, lng: pl.lng, radiusM: rMeters, unit, address: pl.formatted }),
        });
        const rawText = await res.text();
        console.log("[urban-gpt] raw response:", rawText.slice(0, 300));
        let data: UrbanAnalysisResult & { error?: string };
        try {
          data = JSON.parse(rawText) as UrbanAnalysisResult & { error?: string };
        } catch {
          throw new Error(`Server returned non-JSON (status ${res.status}): ${rawText.slice(0, 120)}`);
        }
        if (!res.ok) throw new Error(data.error || "Analysis failed.");
        setResult(data);
        hasResultRef.current = true;

        // Fire layer data in parallel (non-blocking)
        const parksCount = (data as UrbanAnalysisResult).overpass?.parks?.length ?? 0;
        fetchLayerData(pl.lat, pl.lng, parksCount, pl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        setFloodLoading(false);
        setHeatLoading(false);
        setZoningLoading(false);
      } finally {
        setLoading(false);
      }
    },
    [unit, fetchLayerData]
  );

  useEffect(() => { doAnalyzeRef.current = doAnalyze; }, [doAnalyze]);

  async function geocodeAddress(addr: string): Promise<{ lat: number; lng: number; formatted: string } | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=us`;
      const res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "UrbanGPT/1.0" } });
      const data = await res.json() as { lat: string; lon: string; display_name: string }[];
      if (!data.length) return null;
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), formatted: data[0].display_name };
    } catch {
      return null;
    }
  }

  const handleAnalyze = async () => {
    if (place) { doAnalyze(place, radiusIndex); return; }
    if (!address.trim()) return;
    setLoading(true);
    setError("");
    try {
      const geo = await geocodeAddress(address.trim());
      if (!geo) { setError("Could not find that address. Try being more specific."); setLoading(false); return; }
      setPlace(geo);
      currentPlaceRef.current = geo;
      doAnalyze(geo, radiusIndex);
    } catch {
      setError("Geocoding failed. Please try again.");
      setLoading(false);
    }
  };

  // Retry handlers for layer panels
  const retryFlood = useCallback(() => {
    if (!result) return;
    setFloodLoading(true); setFloodError(null); setFloodData(null);
    fetch(`/api/flood-risk?lat=${result.lat}&lng=${result.lng}`)
      .then(async r => { const t = await r.text(); console.log("[urban-gpt] flood-risk retry raw:", t.slice(0, 200)); return JSON.parse(t); })
      .then(d => { setFloodData(d as FloodData); setFloodLoading(false); })
      .catch(e => { console.error("[urban-gpt] flood retry error:", e); setFloodError("Flood data unavailable."); setFloodLoading(false); });
  }, [result]);

  const retryHeat = useCallback(() => {
    if (!result) return;
    const parksCount = result.overpass.parks.length;
    setHeatLoading(true); setHeatError(null); setHeatData(null);
    fetch(`/api/heat-island?lat=${result.lat}&lng=${result.lng}&parksCount=${parksCount}`)
      .then(async r => { const t = await r.text(); console.log("[urban-gpt] heat-island retry raw:", t.slice(0, 200)); return JSON.parse(t); })
      .then(d => { setHeatData(d as HeatData); setHeatLoading(false); })
      .catch(e => { console.error("[urban-gpt] heat retry error:", e); setHeatError("Heat island data unavailable."); setHeatLoading(false); });
  }, [result]);

  const retryZoning = useCallback(() => {
    if (!result) return;
    setZoningLoading(true); setZoningError(null); setZoningData(null);
    fetch(`/api/zoning?lat=${result.lat}&lng=${result.lng}`)
      .then(async r => { const t = await r.text(); console.log("[urban-gpt] zoning retry raw:", t.slice(0, 200)); return JSON.parse(t); })
      .then(d => { setZoningData(d as ZoningData); setZoningLoading(false); })
      .catch(e => { console.error("[urban-gpt] zoning retry error:", e); setZoningError("Zoning data unavailable."); setZoningLoading(false); });
  }, [result]);

  // ── Debounced re-analyze on radius change ──────────────────────────────────

  useEffect(() => {
    currentRadiusIndexRef.current = radiusIndex;
    if (!hasResultRef.current || !currentPlaceRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (currentPlaceRef.current) doAnalyze(currentPlaceRef.current, currentRadiusIndexRef.current);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [radiusIndex, doAnalyze]);

  // ── Derived display values ─────────────────────────────────────────────────

  const totalAmenities = result
    ? result.overpass.transit.length + result.overpass.parks.length +
      result.overpass.restaurants.length + result.overpass.schools.length +
      result.overpass.hospitals.length
    : 0;

  // Specialty layer dot color (dynamic based on data)
  function specialtyDotColor(key: "flood" | "heat" | "zoning"): string {
    if (!layers[key]) return "bg-brown-light/20";
    if (key === "flood") {
      if (!floodData) return "bg-brown-light/30";
      return floodData.isHighRisk ? "bg-red-400" : floodData.isModerateRisk ? "bg-amber-400" : "bg-green-500";
    }
    if (key === "heat") {
      if (!heatData) return "bg-brown-light/30";
      const s = heatData.intensityScore;
      return s < 4 ? "bg-blue-400" : s < 7 ? "bg-amber-400" : "bg-red-400";
    }
    if (key === "zoning") {
      if (!zoningData) return "bg-brown-light/30";
      const map: Record<string, string> = {
        residential: "bg-blue-400", commercial: "bg-orange-400",
        industrial: "bg-gray-400", mixed: "bg-purple-400",
        agricultural: "bg-green-500", institutional: "bg-indigo-400", unknown: "bg-brown-light/40",
      };
      return map[zoningData.zoneType] ?? "bg-brown-light/30";
    }
    return "bg-brown-light/20";
  }

  function specialtyLayerBadge(key: "flood" | "heat" | "zoning"): string | null {
    if (key === "flood" && floodData && !floodData.error) return floodData.zoneAtLocation;
    if (key === "heat" && heatData) return `${heatData.intensityScore.toFixed(1)}`;
    if (key === "zoning" && zoningData && !zoningData.error && zoningData.zoneCode !== "N/A") return zoningData.zoneCode;
    return null;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <Link href="/#projects" className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-8 inline-block">
        &larr; Back to projects
      </Link>

      {/* Header */}
      <header className="max-w-2xl mb-10">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-darkblue">UrbanGPT</h1>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-darkblue/10 text-darkblue border-darkblue/30">
            CS × Architecture
          </span>
        </div>
        <p className="text-brown-light leading-relaxed">
          Enter any US address to get a data dashboard on its urban context including demographics, transit
          access, amenity density, and AI-generated design implications.
        </p>
      </header>

      {/* Input */}
      <div className="max-w-2xl rounded-xl border border-tan/30 bg-white/40 p-5 mb-8">
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-brown-light mb-1.5">
            Address
          </label>
          <div className="relative">
            <input
              ref={addressInputRef}
              type="text"
              value={address}
              onChange={(e) => { setAddress(e.target.value); if (!e.target.value) { setPlace(null); setSuggestions([]); } }}
              onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="e.g. 123 Peachtree St NE, Atlanta, GA"
              className="w-full rounded-lg border border-tan/40 bg-cream-dark/20 px-3 py-2.5 text-sm text-brown placeholder:text-brown-light/50 focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50 transition-colors"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl border border-tan/30 bg-white/95 backdrop-blur-sm shadow-lg overflow-hidden">
                {suggestions.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={`w-full text-left px-4 py-2.5 text-sm text-brown hover:bg-tan/10 transition-colors ${i > 0 ? "border-t border-tan/20" : ""}`}
                      onMouseDown={() => {
                        setAddress(s.display);
                        setPlace({ lat: s.lat, lng: s.lng, formatted: s.display });
                        currentPlaceRef.current = { lat: s.lat, lng: s.lng, formatted: s.display };
                        setSuggestions([]);
                        setShowSuggestions(false);
                        setError("");
                      }}
                    >
                      {s.display}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-end mb-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-brown-light mb-1.5">Unit</label>
            <div className="flex rounded-lg border border-tan/40 overflow-hidden text-sm">
              {(["miles", "km"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setUnit(u)}
                  className={`px-4 py-2 font-medium transition-colors ${unit === u ? "bg-darkblue text-white" : "bg-white/40 text-brown-light hover:text-brown hover:bg-tan/10"}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold uppercase tracking-wide text-brown-light mb-1.5">
              Radius: <span className="text-darkblue font-bold">{fmtRadius(radiusIndex, unit)}</span>
            </label>
            <input type="range" min={0} max={RADIUS_VALUES.length - 1} value={radiusIndex}
              onChange={(e) => setRadiusIndex(parseInt(e.target.value))}
              className="w-full accent-darkblue h-1.5 cursor-pointer" />
            <div className="flex justify-between text-[10px] text-brown-light/60 mt-0.5">
              <span>{unit === "km" ? "0.8 km" : "0.5 mi"}</span>
              <span>{unit === "km" ? "80 km" : "50 mi"}</span>
            </div>
          </div>
        </div>

        <button onClick={handleAnalyze} disabled={!address.trim() || loading}
          className="w-full px-5 py-2.5 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? "Analyzing site…" : "Analyze Site"}
        </button>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-terracotta/10 border border-terracotta/20 text-sm text-terracotta">{error}</div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="w-6 h-6 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
          <p className="text-sm text-brown-light">Fetching demographic, transit, and spatial data…</p>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            {(result.overpassError || (result.overpass.timedOutCategories?.length ?? 0) > 0 || result.overpass.radiusCapped) && (
              <div className="mb-4 p-3 rounded-lg bg-tan/10 border border-tan/30 text-xs text-brown-light space-y-1.5">
                {(result.overpassError || (result.overpass.timedOutCategories?.length ?? 0) > 0) && (
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      ⚠{" "}
                      {result.overpass.timedOutCategories && result.overpass.timedOutCategories.length > 0
                        ? `${result.overpass.timedOutCategories.join(", ")} data timed out — showing available results.`
                        : "OpenStreetMap data timed out. Amenity counts may be incomplete."}
                    </span>
                    <button onClick={handleAnalyze} className="shrink-0 text-xs font-medium text-darkblue underline hover:no-underline">Retry</button>
                  </div>
                )}
                {result.overpass.radiusCapped && (
                  <p>ℹ Amenity data shown for 5 mi radius — demographic data covers the full selected radius.</p>
                )}
              </div>
            )}

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Map */}
              <div className="lg:sticky lg:top-6 self-start">
                <div className="relative rounded-xl overflow-hidden border border-tan/30 shadow-sm">
                  <div className="w-full h-[480px]">
                    <UrbanGPTMap
                      result={result}
                      layers={layers}
                      floodData={floodData}
                      heatData={heatData}
                      zoningData={zoningData}
                    />
                  </div>

                  {/* Layer toggle */}
                  <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl border border-tan/20 shadow-sm p-3">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-brown-light mb-2">Layers</p>
                    <div className="flex flex-col gap-1.5">
                      {/* Original amenity layers */}
                      {LAYER_CONFIG.map(({ key, label, color }) => {
                        const categoryName = key === "restaurants" ? "dining" : key === "hospitals" ? "health" : key;
                        const count = result?.overpass[key as keyof typeof result.overpass] as OverpassPoint[] | undefined;
                        const countNum = Array.isArray(count) ? count.length : 0;
                        const timedOut = result?.overpass.timedOutCategories?.includes(categoryName);
                        return (
                          <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <div className={`w-3 h-3 rounded-full shrink-0 ${layers[key] ? color : "bg-brown-light/20"} transition-colors`} />
                            <span className={`text-xs transition-colors flex-1 ${layers[key] ? "text-brown" : "text-brown-light/50"}`}>{label}</span>
                            {loading ? (
                              <span className="text-[9px] text-brown-light/40 animate-pulse">…</span>
                            ) : result ? (
                              timedOut ? (
                                <span className="text-[9px] text-tan/70 italic">timeout</span>
                              ) : countNum === 0 ? (
                                <span className="text-[9px] text-brown-light/40 italic">none</span>
                              ) : (
                                <span className="text-[9px] font-semibold text-darkblue">{countNum}</span>
                              )
                            ) : null}
                            <input type="checkbox" checked={layers[key]}
                              onChange={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                              className="sr-only" />
                          </label>
                        );
                      })}

                      {/* Divider */}
                      <div className="h-px bg-tan/30 my-0.5" />

                      {/* Specialty overlay layers */}
                      {SPECIALTY_LAYER_CONFIG.map(({ key, label }) => {
                        const badge = specialtyLayerBadge(key);
                        return (
                          <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <div className={`w-3 h-3 rounded-full shrink-0 ${specialtyDotColor(key)} transition-colors`} />
                            <span className={`text-xs transition-colors flex-1 ${layers[key] ? "text-brown" : "text-brown-light/50"}`}>{label}</span>
                            {badge && layers[key] ? (
                              <span className="text-[9px] font-semibold text-darkblue">{badge}</span>
                            ) : (floodLoading && key === "flood") || (heatLoading && key === "heat") || (zoningLoading && key === "zoning") ? (
                              <span className="text-[9px] text-brown-light/40 animate-pulse">…</span>
                            ) : null}
                            <input type="checkbox" checked={layers[key]}
                              onChange={() => {
                                const newVal = !layers[key];
                                setLayers((prev) => ({ ...prev, [key]: newVal }));
                                if (newVal) setActiveTab(key as ActiveTab);
                              }}
                              className="sr-only" />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amenity badge */}
                  <div className="absolute top-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-xl border border-tan/20 shadow-sm px-3 py-1.5">
                    <p className="text-[10px] text-brown-light">
                      <><span className="font-semibold text-darkblue">{totalAmenities}</span> points</>
                    </p>
                  </div>
                </div>
              </div>

              {/* Dashboard */}
              <div className="overflow-y-auto">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-3">
                  {result.address} · {fmtRadius(radiusIndex, unit)} radius
                </p>

                {/* Tab bar */}
                <div className="flex border-b border-tan/30 mb-4 overflow-x-auto">
                  {(["demographics", "flood", "heat", "zoning"] as const).map((tab) => {
                    const labels: Record<ActiveTab, string> = {
                      demographics: "Demographics",
                      flood: "Flood",
                      heat: "Heat",
                      zoning: "Zoning",
                    };
                    return (
                      <button
                        key={tab}
                        onClick={() => {
                          setActiveTab(tab);
                          if (tab !== "demographics") {
                            setLayers((prev) => ({ ...prev, [tab]: true }));
                          }
                        }}
                        className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                          activeTab === tab
                            ? "border-darkblue text-darkblue"
                            : "border-transparent text-brown-light hover:text-brown"
                        }`}
                      >
                        {labels[tab]}
                      </button>
                    );
                  })}
                </div>

                {/* Demographics tab */}
                {activeTab === "demographics" && (
                  <>
                    <SectionHeading>Demographics</SectionHeading>
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <StatCard label="Median Income" value={fmtCurrency(result.census.medianIncome)}
                        sub={result.census.tractName || undefined}
                        tooltip="Median household income for the census tract containing the address (ACS 5-year estimate)." />
                      <StatCard label="Mean Income" value={fmtCurrency(result.census.meanIncome)}
                        sub={result.census.incomeStdDev ? `σ = ${fmtCurrency(result.census.incomeStdDev)}` : undefined}
                        tooltip="Mean (average) household income. Higher than median indicates a right-skewed distribution." />
                      <IncomeChart brackets={result.census.incomeBrackets} mean={result.census.meanIncome} />
                      <StatCard label="Population" value={fmtNum(result.census.population)}
                        tooltip="Total population of the census tract." />
                      <StatCard label="Pop. Density" value={fmtDensity(result.census.populationDensity, unit)}
                        tooltip="People per square mile/km in the census tract." />
                      <StatCard label="Median Age" value={fmtNum(result.census.medianAge, " yrs")}
                        tooltip="Median age of residents." />
                      <StatCard label="Gender Split"
                        value={result.census.malePct !== null && result.census.femalePct !== null ? `${result.census.malePct}% M / ${result.census.femalePct}% F` : "-"}
                        tooltip="Male/female population breakdown (ACS 5-year)." />
                      <StatCard label="Avg. Household Size" value={fmtNum(result.census.avgHouseholdSize)}
                        tooltip="Average number of people per household." />
                      <StatCard label="Unemployed" value={fmtNum(result.census.unemployedPop)}
                        tooltip="Number of residents in the labor force who are unemployed." />
                      <StatCard label="Est. Homeless" value={fmtNum(result.census.estHomelessPop)}
                        tooltip="ACS imputed estimate of homeless population." />
                      <StatCard label="Bachelor's Degree+" value={fmtPct(result.census.bachelorsOrHigherPct)}
                        tooltip="Share of adults with a bachelor's degree or higher." />
                      <StatCard label="Non-Hisp. White" value={fmtPct(result.census.nonHispanicWhitePct)}
                        tooltip="Demographic context for understanding community character." />
                      <StatCard label="Gini Coefficient" value={fmtNum(result.census.gini)}
                        sub={result.computed.incomeInequalityLabel ?? undefined}
                        tooltip="Income inequality index from 0 (equal) to 1 (maximally unequal)." />
                    </div>

                    <SectionHeading>Housing</SectionHeading>
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <StatCard label="Median Home Value" value={fmtCurrency(result.census.medianHomeValue)}
                        tooltip="Median value of owner-occupied housing units." />
                      <StatCard label="Median Gross Rent" value={fmtCurrency(result.census.medianGrossRent)}
                        tooltip="Median monthly rent including utilities." />
                      <StatCard label="Vacancy Rate" value={fmtPct(result.census.vacancyRate)}
                        tooltip="Share of housing units that are vacant." />
                    </div>

                    {result.census.tempF !== null && (
                      <>
                        <SectionHeading>Climate</SectionHeading>
                        <div className="grid grid-cols-2 gap-2 mb-5">
                          <StatCard label="Current Temp."
                            value={`${result.census.tempF}°F`}
                            sub={result.census.tempC !== null ? `${result.census.tempC}°C` : undefined}
                            tooltip="Current outdoor temperature at this location (Open-Meteo)." />
                        </div>
                      </>
                    )}

                    <SectionHeading>Mobility</SectionHeading>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                      <StatCard label="Travel Time" value={fmtNum(result.census.meanTravelTime, " min")}
                        tooltip="Mean commute time to work." />
                      <StatCard label="Transit Stops" value={String(result.overpass.transit.length)}
                        tooltip="Bus stops, subway entrances, and rail stations within the study radius." />
                      <StatCard label="Parks" value={String(result.overpass.parks.length)}
                        tooltip="Parks and green spaces within the study radius." />
                      <StatCard label="Dining" value={String(result.overpass.restaurants.length)}
                        tooltip="Restaurants, cafes, and bars within the study radius." />
                      <StatCard label="Schools" value={String(result.overpass.schools.length)}
                        tooltip="Schools and universities within the study radius." />
                      <StatCard label="Health Clinics" value={String(result.overpass.hospitals.length)}
                        tooltip="Hospitals and clinics within the study radius." />
                    </div>

                    <SectionHeading>Computed Scores</SectionHeading>
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <StatCard label="Walkability" value={String(result.scores.walkability)} score={result.scores.walkability}
                        tooltip="Derived from transit stops, parks, and restaurants relative to radius." />
                      <StatCard label="Bike Friendliness" value={String(result.scores.bikeFriendliness)} score={result.scores.bikeFriendliness}
                        tooltip="Derived from parks and dedicated bike infrastructure (OSM) relative to radius." />
                    </div>

                    <SectionHeading>Computed Indicators</SectionHeading>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <StatCard
                        label="Affordability Ratio"
                        value={result.computed.affordabilityRatio ? `${result.computed.affordabilityRatio}×` : "-"}
                        sub={
                          result.computed.affordabilityRatio
                            ? result.computed.affordabilityRatio < 3 ? "Affordable"
                              : result.computed.affordabilityRatio < 5 ? "Moderate"
                              : result.computed.affordabilityRatio < 8 ? "Unaffordable"
                              : "Severely unaffordable"
                            : undefined
                        }
                        tooltip="Median home value ÷ median household income." />
                      <StatCard
                        label="Income Inequality"
                        value={fmtNum(result.census.gini)}
                        sub={result.computed.incomeInequalityLabel ?? undefined}
                        tooltip="Gini coefficient interpreted as an inequality label." />
                      <StatCard
                        label="Gentrification Pressure"
                        value={result.computed.gentrificationPressure ?? "-"}
                        valueColor={gentrificationColor(result.computed.gentrificationPressure)}
                        tooltip="Composite of rent-to-income ratio and education level." />
                    </div>
                  </>
                )}

                {/* Flood tab */}
                {activeTab === "flood" && (
                  <>
                    <SectionHeading>Flood Risk</SectionHeading>
                    <FloodPanel data={floodData} loading={floodLoading} error={floodError} onRetry={retryFlood} />
                  </>
                )}

                {/* Heat tab */}
                {activeTab === "heat" && (
                  <>
                    <SectionHeading>Urban Heat Island</SectionHeading>
                    <HeatPanel data={heatData} loading={heatLoading} error={heatError} onRetry={retryHeat} />
                  </>
                )}

                {/* Zoning tab */}
                {activeTab === "zoning" && (
                  <>
                    <SectionHeading>Zoning</SectionHeading>
                    <ZoningPanel data={zoningData} loading={zoningLoading} error={zoningError} onRetry={retryZoning} />
                  </>
                )}
              </div>
            </div>

            {/* AI Insights - full width */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
              className="rounded-xl border border-tan/30 bg-white/40 overflow-hidden">
              <div className="bg-darkblue px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-0.5">AI Design Implications</p>
                  <p className="text-white/70 text-sm">Generated by Claude · for design research only</p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/60 border border-white/15">AI</span>
              </div>

              <div className="px-6 py-4 border-b border-tan/20 bg-white/20">
                <p className="text-sm text-brown leading-relaxed">{result.ai.summary}</p>
              </div>

              {result.ai.communityProfile && (
                <div className="px-6 py-4 border-b border-tan/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown-light mb-2">Community Profile</p>
                  <p className="text-sm text-brown leading-relaxed">{result.ai.communityProfile}</p>
                </div>
              )}

              {result.ai.culturalContext && (
                <div className="px-6 py-4 border-b border-tan/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown-light mb-2">Cultural Context</p>
                  <p className="text-sm text-brown leading-relaxed">{result.ai.culturalContext}</p>
                </div>
              )}

              {result.ai.dataInsights && result.ai.dataInsights.length > 0 && (
                <div className="px-6 py-4 border-b border-tan/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown-light mb-3">Data Insights</p>
                  <div className="flex flex-col gap-3">
                    {result.ai.dataInsights.map((item, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-tan mt-2" />
                        <div>
                          <p className="text-xs font-semibold text-darkblue mb-0.5">{item.metric}</p>
                          <p className="text-sm text-brown-light leading-relaxed">{item.insight}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.ai.recommendations && result.ai.recommendations.length > 0 && (
                <div className="px-6 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown-light mb-3">Design Recommendations</p>
                  <div className="flex flex-col gap-3">
                    {result.ai.recommendations.map((rec, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-darkblue/10 text-darkblue text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-darkblue mb-0.5">{rec.title}</p>
                          <p className="text-sm text-brown-light leading-relaxed">{rec.explanation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

            <p className="text-xs text-brown-light/50 italic text-center mt-6">
              UrbanGPT is a design research tool. Always verify data with official sources before making design decisions.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
