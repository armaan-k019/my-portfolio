"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type {
  UrbanAnalysisResult,
  OverpassPoint,
  OverpassData,
  IncomeBracket,
} from "../../api/urban-gpt/route";

// ─── Google Maps global types ─────────────────────────────────────────────────

declare global {
  interface Window {
    __urbanGPTMapsReady?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

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
  { key: "schools",     label: "Schools",  color: "bg-terracotta",  markerColor: "#C1513A" },
  { key: "hospitals",   label: "Health",   color: "bg-brown-light", markerColor: "#6B5244" },
];

const MAP_STYLES = [
  { elementType: "geometry",                      stylers: [{ color: "#f5f0e8" }] },
  { elementType: "labels.text.fill",              stylers: [{ color: "#6B5244" }] },
  { elementType: "labels.text.stroke",            stylers: [{ color: "#f5f0e8" }] },
  { featureType: "water",  elementType: "geometry",        stylers: [{ color: "#c9d8e8" }] },
  { featureType: "road",   elementType: "geometry",        stylers: [{ color: "#ede5d8" }] },
  { featureType: "road",   elementType: "geometry.stroke", stylers: [{ color: "#d4c8b8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e4d9ca" }] },
  { featureType: "poi",    elementType: "geometry",        stylers: [{ color: "#e8e2d5" }] },
  { featureType: "poi.park", elementType: "geometry",      stylers: [{ color: "#d5e4d0" }] },
  { featureType: "transit.station", elementType: "geometry", stylers: [{ color: "#ddd8cf" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c4b8aa" }] },
];

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
  });
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<{ display: string; lat: number; lng: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nominatimRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerGroupsRef = useRef<Map<string, any[]>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const centerMarkerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasResultRef = useRef(false);
  const currentPlaceRef = useRef<{ lat: number; lng: number; formatted: string } | null>(null);
  const currentRadiusIndexRef = useRef(DEFAULT_RADIUS_INDEX);

  const radiusInMiles = RADIUS_VALUES[radiusIndex];
  const radiusInMeters = radiusInMiles * 1609.344;
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // ── Load Google Maps ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapsKey) return; // Maps only loads if key present; Nominatim fallback handles no-key case
    if (window.google?.maps) { setMapsLoaded(true); return; }
    window.__urbanGPTMapsReady = () => setMapsLoaded(true);
    if (document.getElementById("urban-gpt-maps-script")) return;
    const script = document.createElement("script");
    script.id = "urban-gpt-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places&callback=__urbanGPTMapsReady`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    return () => { delete window.__urbanGPTMapsReady; };
  }, [mapsKey]);

  // ── Initialize Autocomplete ────────────────────────────────────────────────

  useEffect(() => {
    if (!mapsLoaded || !addressInputRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
      fields: ["formatted_address", "geometry"],
    });
    ac.addListener("place_changed", () => {
      const p = ac.getPlace();
      if (!p?.geometry?.location) return;
      const lat = p.geometry.location.lat() as number;
      const lng = p.geometry.location.lng() as number;
      const formatted = (p.formatted_address as string) ?? "";
      setAddress(formatted);
      setPlace({ lat, lng, formatted });
      currentPlaceRef.current = { lat, lng, formatted };
      setError("");
    });
  }, [mapsLoaded]);

  // ── Nominatim suggestion search (fallback when Google Maps not loaded) ─────

  useEffect(() => {
    if (mapsLoaded) { setSuggestions([]); return; } // Google handles it
    if (nominatimRef.current) clearTimeout(nominatimRef.current);
    if (!address.trim() || address.length < 3) { setSuggestions([]); return; }
    nominatimRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=5&countrycodes=us&addressdetails=0`;
        const res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "UrbanGPT/1.0" } });
        const data = await res.json() as { display_name: string; lat: string; lon: string }[];
        setSuggestions(data.map(d => ({ display: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) })));
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => { if (nominatimRef.current) clearTimeout(nominatimRef.current); };
  }, [address, mapsLoaded]);

  // ── Core analysis ──────────────────────────────────────────────────────────

  const doAnalyze = useCallback(
    async (pl: { lat: number; lng: number; formatted: string }, ri: number) => {
      const rMeters = RADIUS_VALUES[ri] * 1609.344;
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/urban-gpt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pl.lat, lng: pl.lng, radiusM: rMeters, unit, address: pl.formatted }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analysis failed.");
        setResult(data as UrbanAnalysisResult);
        hasResultRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [unit]
  );

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

  // ── Update circle radius ───────────────────────────────────────────────────

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setRadius(radiusInMeters);
    if (mapRef.current) mapRef.current.fitBounds(circleRef.current.getBounds());
  }, [radiusInMeters]);

  // ── Init / update map on result ────────────────────────────────────────────

  useEffect(() => {
    if (!result || !mapsLoaded || !mapContainerRef.current) return;
    const { lat, lng } = result;

    if (!mapRef.current) {
      const map = new window.google.maps.Map(mapContainerRef.current, {
        center: { lat, lng }, zoom: 13,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        zoomControlOptions: { position: window.google.maps.ControlPosition.RIGHT_CENTER },
        styles: MAP_STYLES,
      });
      const centerMarker = new window.google.maps.Marker({
        position: { lat, lng }, map, title: result.address, zIndex: 100,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: "#C1513A", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      });
      const circle = new window.google.maps.Circle({
        map, center: { lat, lng }, radius: result.radiusM,
        fillColor: "#1E3A5F", fillOpacity: 0.05, strokeColor: "#1E3A5F", strokeOpacity: 0.4, strokeWeight: 1.5, clickable: false,
      });
      mapRef.current = map;
      circleRef.current = circle;
      centerMarkerRef.current = centerMarker;
      map.fitBounds(circle.getBounds());
    } else {
      circleRef.current?.setCenter({ lat, lng });
      circleRef.current?.setRadius(result.radiusM);
      centerMarkerRef.current?.setPosition({ lat, lng });
      mapRef.current?.fitBounds(circleRef.current?.getBounds());
    }

    renderOverlays(result.overpass, layers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, mapsLoaded]);

  // ── Layer visibility ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current) return;
    markerGroupsRef.current.forEach((markers, key) => {
      const visible = layers[key as keyof LayerState];
      markers.forEach((m) => m.setVisible(visible));
    });
  }, [layers]);

  function renderOverlays(overpass: OverpassData, currentLayers: LayerState) {
    if (!mapRef.current) return;
    markerGroupsRef.current.forEach((g) => g.forEach((m) => m.setMap(null)));
    markerGroupsRef.current.clear();

    const cats: { key: keyof LayerState; points: OverpassPoint[]; color: string }[] = [
      { key: "transit",     points: overpass.transit,     color: "#1E3A5F" },
      { key: "parks",       points: overpass.parks,       color: "#6B8F6E" },
      { key: "restaurants", points: overpass.restaurants, color: "#D4A96A" },
      { key: "schools",     points: overpass.schools,     color: "#C1513A" },
      { key: "hospitals",   points: overpass.hospitals,   color: "#6B5244" },
    ];
    for (const { key, points, color } of cats) {
      const markers = points.map((pt) =>
        new window.google.maps.Marker({
          position: { lat: pt.lat, lng: pt.lon }, map: mapRef.current,
          visible: currentLayers[key], title: pt.name || key,
          icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: color, fillOpacity: 0.85, strokeColor: "#fff", strokeWeight: 1 },
        })
      );
      markerGroupsRef.current.set(key, markers);
    }
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const totalAmenities = result
    ? result.overpass.transit.length + result.overpass.parks.length +
      result.overpass.restaurants.length + result.overpass.schools.length +
      result.overpass.hospitals.length
    : 0;

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
            {!mapsLoaded && showSuggestions && suggestions.length > 0 && (
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
            {result.overpassError && (
              <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded-lg bg-tan/10 border border-tan/30 text-xs text-brown-light">
                <span>⚠ OpenStreetMap data timed out. Amenity counts may be incomplete.</span>
                <button onClick={handleAnalyze} className="shrink-0 text-xs font-medium text-darkblue underline hover:no-underline">Retry</button>
              </div>
            )}

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Map */}
              <div className="lg:sticky lg:top-6 self-start">
                {mapsKey ? (
                  <div className="relative rounded-xl overflow-hidden border border-tan/30 shadow-sm">
                    <div ref={mapContainerRef} className="w-full h-[480px]" />
                    {/* Layer toggle */}
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm rounded-xl border border-tan/20 shadow-sm p-3">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-brown-light mb-2">Layers</p>
                      <div className="flex flex-col gap-1.5">
                        {LAYER_CONFIG.map(({ key, label, color }) => (
                          <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <div className={`w-3 h-3 rounded-full ${layers[key] ? color : "bg-brown-light/20"} transition-colors`} />
                            <span className={`text-xs transition-colors ${layers[key] ? "text-brown" : "text-brown-light/50"}`}>{label}</span>
                            <input type="checkbox" checked={layers[key]}
                              onChange={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
                              className="sr-only" />
                          </label>
                        ))}
                      </div>
                    </div>
                    {/* Amenity badge */}
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl border border-tan/20 shadow-sm px-3 py-1.5">
                      <p className="text-[10px] text-brown-light">
                        <span className="font-semibold text-darkblue">{totalAmenities}</span> points
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-tan/30 bg-white/40 h-[480px] flex items-center justify-center">
                    <p className="text-sm text-brown-light italic">Map unavailable. API key not configured.</p>
                  </div>
                )}
              </div>

              {/* Dashboard */}
              <div className="overflow-y-auto">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brown-light mb-4">
                  {result.address} · {fmtRadius(radiusIndex, unit)} radius
                </p>

                {/* Demographics */}
                <SectionHeading>Demographics</SectionHeading>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <StatCard label="Median Income" value={fmtCurrency(result.census.medianIncome)}
                    sub={result.census.tractName || undefined}
                    tooltip="Median household income for the census tract containing the address (ACS 5-year estimate)." />
                  <StatCard label="Mean Income" value={fmtCurrency(result.census.meanIncome)}
                    sub={result.census.incomeStdDev ? `σ = ${fmtCurrency(result.census.incomeStdDev)}` : undefined}
                    tooltip="Mean (average) household income. Higher than median indicates a right-skewed distribution, with a small number of high earners pulling the average up." />
                  <IncomeChart brackets={result.census.incomeBrackets} mean={result.census.meanIncome} />
                  <StatCard label="Population" value={fmtNum(result.census.population)}
                    tooltip="Total population of the census tract." />
                  <StatCard label="Pop. Density" value={fmtDensity(result.census.populationDensity, unit)}
                    tooltip="People per square mile/km in the census tract. Higher density typically correlates with walkability and mixed-use feasibility." />
                  <StatCard label="Median Age" value={fmtNum(result.census.medianAge, " yrs")}
                    tooltip="Median age of residents. Informs programming decisions. Younger populations may prefer flexible, community-oriented spaces." />
                  <StatCard label="Gender Split"
                    value={result.census.malePct !== null && result.census.femalePct !== null ? `${result.census.malePct}% M / ${result.census.femalePct}% F` : "-"}
                    tooltip="Male/female population breakdown for the census tract (ACS 5-year estimate)." />
                  <StatCard label="Avg. Household Size" value={fmtNum(result.census.avgHouseholdSize)}
                    tooltip="Average number of people per household. Higher values suggest family-oriented neighborhoods; informs unit mix decisions." />
                  <StatCard label="Unemployed" value={fmtNum(result.census.unemployedPop)}
                    tooltip="Number of residents in the labor force who are unemployed. Contextualizes economic conditions and community programming needs." />
                  <StatCard label="Est. Homeless" value={fmtNum(result.census.estHomelessPop)}
                    tooltip="ACS imputed estimate of homeless population. Consult local PIT count for accuracy. Relevant for service-oriented programming." />
                  <StatCard label="Bachelor's Degree+" value={fmtPct(result.census.bachelorsOrHigherPct)}
                    tooltip="Share of adults with a bachelor's degree or higher. Often correlated with demand for amenity-rich, transit-oriented environments." />
                  <StatCard label="Non-Hisp. White" value={fmtPct(result.census.nonHispanicWhitePct)}
                    tooltip="Demographic context for understanding community character and cultural programming needs." />
                  <StatCard label="Gini Coefficient" value={fmtNum(result.census.gini)}
                    sub={result.computed.incomeInequalityLabel ?? undefined}
                    tooltip="Income inequality index from 0 (equal) to 1 (maximally unequal). Affects affordability programming and mixed-income housing strategy." />
                </div>

                {/* Housing */}
                <SectionHeading>Housing</SectionHeading>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <StatCard label="Median Home Value" value={fmtCurrency(result.census.medianHomeValue)}
                    tooltip="Median value of owner-occupied housing units. Signals land value and market-rate housing feasibility." />
                  <StatCard label="Median Gross Rent" value={fmtCurrency(result.census.medianGrossRent)}
                    tooltip="Median monthly rent including utilities. Key indicator for affordable housing thresholds and mixed-income programming." />
                  <StatCard label="Vacancy Rate" value={fmtPct(result.census.vacancyRate)}
                    tooltip="Share of housing units that are vacant. High vacancy may signal disinvestment; low vacancy signals housing pressure." />
                </div>

                {/* Climate */}
                {(result.census.tempF !== null) && (
                  <>
                    <SectionHeading>Climate</SectionHeading>
                    <div className="grid grid-cols-2 gap-2 mb-5">
                      <StatCard label="Current Temp."
                        value={result.census.tempF !== null ? `${result.census.tempF}°F` : "-"}
                        sub={result.census.tempC !== null ? `${result.census.tempC}°C` : undefined}
                        tooltip="Current outdoor temperature at this location (Open-Meteo). Informs passive heating/cooling strategy and outdoor comfort programming." />
                    </div>
                  </>
                )}

                {/* Mobility */}
                <SectionHeading>Mobility</SectionHeading>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                  <StatCard label="Travel Time" value={fmtNum(result.census.meanTravelTime, " min")}
                    tooltip="Mean commute time to work. Long commutes suggest poor transit access; consider how your project can reduce car dependency." />
                  <StatCard label="Transit Stops" value={String(result.overpass.transit.length)}
                    tooltip="Bus stops, subway entrances, and rail stations within the study radius (OpenStreetMap)." />
                  <StatCard label="Parks" value={String(result.overpass.parks.length)}
                    tooltip="Parks and green spaces within the study radius. Affects open space programming and stormwater strategy." />
                  <StatCard label="Dining" value={String(result.overpass.restaurants.length)}
                    tooltip="Restaurants, cafes, and bars within the study radius, used as a proxy for street-level activity and foot traffic." />
                  <StatCard label="Schools" value={String(result.overpass.schools.length)}
                    tooltip="Schools and universities within the study radius. Informs safe-route design, noise mitigation, and community programming." />
                  <StatCard label="Health Clinics" value={String(result.overpass.hospitals.length)}
                    tooltip="Hospitals and clinics within the study radius. Relevant for ADA access, emergency vehicle routing, and service adjacency." />
                </div>

                {/* Computed Scores */}
                <SectionHeading>Computed Scores</SectionHeading>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <StatCard label="Walkability" value={String(result.scores.walkability)} score={result.scores.walkability}
                    tooltip="Derived from transit stops, parks, and restaurants relative to radius. Higher = more walkable site context." />
                  <StatCard label="Bike Friendliness" value={String(result.scores.bikeFriendliness)} score={result.scores.bikeFriendliness}
                    tooltip="Derived from parks and dedicated bike infrastructure (OSM) relative to radius." />
                </div>

                {/* Computed Indicators */}
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
                    tooltip="Median home value ÷ median household income. Values above 5× indicate significant affordability pressure for buyers." />
                  <StatCard
                    label="Income Inequality"
                    value={fmtNum(result.census.gini)}
                    sub={result.computed.incomeInequalityLabel ?? undefined}
                    tooltip="Gini coefficient interpreted as an inequality label. High inequality areas benefit from mixed-income housing and community amenities." />
                  <StatCard
                    label="Gentrification Pressure"
                    value={result.computed.gentrificationPressure ?? "-"}
                    valueColor={gentrificationColor(result.computed.gentrificationPressure)}
                    tooltip="Composite of rent-to-income ratio and education level. Higher pressure suggests rapid displacement risk and informs affordability strategy." />
                </div>
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

              {/* Summary */}
              <div className="px-6 py-4 border-b border-tan/20 bg-white/20">
                <p className="text-sm text-brown leading-relaxed">{result.ai.summary}</p>
              </div>

              {/* Community Profile */}
              {result.ai.communityProfile && (
                <div className="px-6 py-4 border-b border-tan/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown-light mb-2">Community Profile</p>
                  <p className="text-sm text-brown leading-relaxed">{result.ai.communityProfile}</p>
                </div>
              )}

              {/* Cultural Context */}
              {result.ai.culturalContext && (
                <div className="px-6 py-4 border-b border-tan/20">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brown-light mb-2">Cultural Context</p>
                  <p className="text-sm text-brown leading-relaxed">{result.ai.culturalContext}</p>
                </div>
              )}

              {/* Data Insights */}
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

              {/* Design Recommendations */}
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
