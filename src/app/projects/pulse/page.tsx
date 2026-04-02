"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { PulseData, LocationData, Bus } from "../../api/pulse/route";

// ─── Global window augmentation ───────────────────────────────────────────────

declare global {
  interface Window {
    __pulseMapReady?: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GT_CENTER = { lat: 33.7756, lng: -84.3963 };
const GT_ZOOM   = 15;
const POLL_MS   = 10_000;

const ROUTE_COLORS: Record<string, string> = {
  red:     '#CC0000',
  blue:    '#003A8C',
  green:   '#009A44',
  gold:    '#B3A369',
};

function routeColor(routeName: string): string {
  const n = routeName.toLowerCase();
  if (n.includes('red'))  return ROUTE_COLORS.red;
  if (n.includes('blue')) return ROUTE_COLORS.blue;
  if (n.includes('grn') || n.includes('green')) return ROUTE_COLORS.green;
  if (n.includes('gold') || n.includes('yel'))  return ROUTE_COLORS.gold;
  return '#6B5244';
}

// ─── Busyness colour helpers ──────────────────────────────────────────────────

function busynessHex(score: number): string {
  if (score < 30) return '#22c55e';
  if (score < 60) return '#eab308';
  if (score < 80) return '#f97316';
  return '#ef4444';
}

function busynessLabel(score: number): string {
  if (score < 30) return 'Quiet';
  if (score < 60) return 'Moderate';
  if (score < 80) return 'Busy';
  return 'Very busy';
}

function waitLabel(loc: LocationData): string {
  if (loc.type !== 'dining' || !loc.waitTime) return '';
  return loc.waitTime === 'No wait' ? '✓ No wait' : `~${loc.waitTime}`;
}

// ─── Suggested questions ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Best study spots right now?",
  "When's CRC least busy today?",
  "Which dining hall has the shortest wait?",
  "Optimize my afternoon: eat, gym, study 2 hrs",
  "What buildings are quiet right now?",
  "Best time to eat at Chick-fil-A today?",
];

// ─── Type icons ───────────────────────────────────────────────────────────────

function typeIcon(type: LocationData['type']): string {
  switch (type) {
    case 'dining':     return '🍽';
    case 'recreation': return '💪';
    case 'outdoor':    return '🌿';
    default:           return '📚';
  }
}

// ─── Chat message type ────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PulsePage() {
  // ── Data state
  const [data,        setData]        = useState<PulseData | null>(null);
  const [mapsLoaded,  setMapsLoaded]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [secAgo,      setSecAgo]      = useState(0);
  const [fetchError,  setFetchError]  = useState(false);

  // ── Layer toggles
  const [showHeatmap,   setShowHeatmap]   = useState(true);
  const [showCircles,   setShowCircles]   = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  // ── UI state
  const [selectedLoc,   setSelectedLoc]   = useState<LocationData | null>(null);
  const [chatOpen,      setChatOpen]       = useState(false);
  const [chatMessages,  setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatInput,     setChatInput]      = useState("");
  const [chatLoading,   setChatLoading]    = useState(false);
  const [chatError,     setChatError]      = useState("");

  // ── Map / overlay refs
  const mapContainerRef  = useRef<HTMLDivElement>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef          = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatmapRef      = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circlesRef      = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const busMarkersRef   = useRef<Map<string, any>>(new Map());
  const circleAnimRef   = useRef<number>(0);
  const particleAnimRef = useRef<number>(0);
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataRef         = useRef<PulseData | null>(null);
  const layersRef       = useRef({ heatmap: true, circles: false, particles: false });
  const chatEndRef      = useRef<HTMLDivElement>(null);

  // Keep layersRef in sync
  useEffect(() => { layersRef.current = { heatmap: showHeatmap, circles: showCircles, particles: showParticles }; },
    [showHeatmap, showCircles, showParticles]);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // ── Load Google Maps ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsKey) return;
    if (window.google?.maps) { setMapsLoaded(true); return; }
    window.__pulseMapReady = () => setMapsLoaded(true);
    if (document.getElementById("pulse-maps-script")) return;
    const s = document.createElement("script");
    s.id    = "pulse-maps-script";
    s.src   = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=visualization&callback=__pulseMapReady`;
    s.async = true; s.defer = true;
    document.head.appendChild(s);
    return () => { delete window.__pulseMapReady; };
  }, [mapsKey]);

  // ── Init map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapsLoaded || !mapContainerRef.current || mapRef.current) return;
    const map = new window.google.maps.Map(mapContainerRef.current, {
      center: GT_CENTER,
      zoom:   GT_ZOOM,
      mapTypeId: 'roadmap',
      styles: [
        { elementType: 'geometry',        stylers: [{ color: '#f5f0e8' }] },
        { elementType: 'labels.text.fill',stylers: [{ color: '#5C4A3A' }] },
        { featureType: 'water',           elementType: 'geometry', stylers: [{ color: '#c9d8e8' }] },
        { featureType: 'road',            elementType: 'geometry', stylers: [{ color: '#ede5d8' }] },
        { featureType: 'road.highway',    elementType: 'geometry', stylers: [{ color: '#e0d5c5' }] },
        { featureType: 'poi.park',        elementType: 'geometry', stylers: [{ color: '#d5e4d0' }] },
        { featureType: 'poi',             elementType: 'labels',   stylers: [{ visibility: 'off' }] },
        { featureType: 'transit',         elementType: 'labels',   stylers: [{ visibility: 'off' }] },
      ],
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;
  }, [mapsLoaded]);

  // ── Fetch data ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res  = await fetch('/api/pulse', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json() as PulseData;
      setData(json);
      dataRef.current = json;
      setLastUpdated(Date.now());
      setSecAgo(0);
      setFetchError(false);
    } catch {
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  // Live "last updated X seconds ago" counter
  useEffect(() => {
    tickRef.current = setInterval(() => {
      if (lastUpdated) setSecAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [lastUpdated]);

  // ── Heatmap layer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data || !window.google?.maps?.visualization) return;

    const points = data.locations.map(loc => ({
      location: new window.google.maps.LatLng(loc.lat, loc.lng),
      weight:   loc.busyness,
    }));

    if (heatmapRef.current) {
      heatmapRef.current.setData(points);
      heatmapRef.current.setMap(showHeatmap ? mapRef.current : null);
    } else {
      heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
        data: points,
        map:  showHeatmap ? mapRef.current : null,
        radius:   40,
        opacity:  0.65,
        gradient: [
          'rgba(0,160,0,0)',
          'rgba(0,200,0,1)',
          'rgba(200,200,0,1)',
          'rgba(250,130,0,1)',
          'rgba(240,50,50,1)',
        ],
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showHeatmap, mapsLoaded]);

  // ── Pulsing circles layer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data) return;

    // Remove old circles
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    if (!showCircles) {
      cancelAnimationFrame(circleAnimRef.current);
      return;
    }

    // Create one circle per location
    circlesRef.current = data.locations.map(loc => {
      const baseRadius = 20 + (loc.busyness / 100) * 60;
      return new window.google.maps.Circle({
        map:           mapRef.current,
        center:        { lat: loc.lat, lng: loc.lng },
        radius:        baseRadius,
        fillColor:     busynessHex(loc.busyness),
        fillOpacity:   0.28,
        strokeColor:   busynessHex(loc.busyness),
        strokeOpacity: 0.7,
        strokeWeight:  1.5,
        clickable:     true,
      });
    });

    // Click listener on circles
    circlesRef.current.forEach((circle, i) => {
      circle.addListener('click', () => setSelectedLoc(data.locations[i] ?? null));
    });

    // RAF pulse animation
    let t = 0;
    function animateCircles() {
      circleAnimRef.current = requestAnimationFrame(animateCircles);
      if (document.hidden) return;
      t += 0.025;
      circlesRef.current.forEach((circle, i) => {
        const loc        = data!.locations[i];
        if (!loc) return;
        const base       = 20 + (loc.busyness / 100) * 60;
        const amplitude  = base * 0.15;
        const phase      = i * 0.6;
        const r          = base + Math.sin(t + phase) * amplitude;
        circle.setRadius(r);
        circle.setOptions({ fillOpacity: 0.18 + Math.sin(t + phase) * 0.10 });
      });
    }
    animateCircles();

    return () => cancelAnimationFrame(circleAnimRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showCircles, mapsLoaded]);

  // ── Bus markers ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data) return;

    const activeBusIds = new Set(data.buses.map(b => b.id));

    // Remove stale markers
    busMarkersRef.current.forEach((marker, id) => {
      if (!activeBusIds.has(id)) {
        marker.setMap(null);
        busMarkersRef.current.delete(id);
      }
    });

    data.buses.forEach((bus: Bus) => {
      const color = routeColor(bus.routeName);
      const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
          <text x="14" y="18" text-anchor="middle" font-size="13" fill="white">🚌</text>
        </svg>`;
      const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgIcon)}`;

      if (busMarkersRef.current.has(bus.id)) {
        const m = busMarkersRef.current.get(bus.id);
        // Smooth move via animating position
        const prev = m.getPosition();
        if (prev) {
          const steps = 20;
          let step = 0;
          const dLat = (bus.lat - prev.lat()) / steps;
          const dLng = (bus.lng - prev.lng()) / steps;
          function moveStep() {
            if (step++ >= steps) return;
            m.setPosition({ lat: prev.lat() + dLat * step, lng: prev.lng() + dLng * step });
            setTimeout(moveStep, POLL_MS / steps);
          }
          moveStep();
        }
      } else {
        const marker = new window.google.maps.Marker({
          position: { lat: bus.lat, lng: bus.lng },
          map:      mapRef.current,
          icon:     { url: iconUrl, scaledSize: new window.google.maps.Size(28, 28), anchor: new window.google.maps.Point(14, 14) },
          title:    bus.routeName,
          zIndex:   10,
        });
        marker.addListener('click', () => {
          const infoWindow = new window.google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif;padding:4px 8px;min-width:120px">
              <p style="font-weight:600;margin:0;color:${color}">${bus.routeName}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6B5244">Stinger Bus · Live</p>
            </div>`,
          });
          infoWindow.open(mapRef.current, marker);
        });
        busMarkersRef.current.set(bus.id, marker);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mapsLoaded]);

  // ── Particle canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas || !data || !showParticles) {
      if (particleAnimRef.current) cancelAnimationFrame(particleAnimRef.current);
      const c = particleCanvasRef.current;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, c.width, c.height);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match container
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; }
    };
    resize();

    // Build particle sources from busyness data (without Google Maps projection)
    // Use normalized positions based on GT campus bounding box
    const LAT_MIN = 33.770, LAT_MAX = 33.782;
    const LNG_MIN = -84.402, LNG_MAX = -84.390;

    const cvs = canvas;
    function toCanvas(lat: number, lng: number) {
      const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * cvs.width;
      const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * cvs.height;
      return { x, y };
    }

    interface Particle { x: number; y: number; vx: number; vy: number; seed: number; size: number; color: string; alpha: number }

    // Spawn particles proportional to busyness
    const particles: Particle[] = [];
    for (const loc of data.locations) {
      const count = Math.round(loc.busyness / 10);
      const base  = toCanvas(loc.lat, loc.lng);
      for (let i = 0; i < count; i++) {
        particles.push({
          x:     base.x + (Math.random() - 0.5) * 60,
          y:     base.y + (Math.random() - 0.5) * 60,
          vx:    (Math.random() - 0.5) * 0.4,
          vy:    (Math.random() - 0.5) * 0.4,
          seed:  Math.random() * Math.PI * 2,
          size:  1.2 + Math.random() * 1.4,
          color: busynessHex(loc.busyness),
          alpha: 0.5 + Math.random() * 0.35,
        });
      }
    }

    const ctx2 = ctx;
    let t = 0;
    function draw() {
      particleAnimRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;
      t += 1;
      ctx2.clearRect(0, 0, cvs.width, cvs.height);

      for (const p of particles) {
        // Organic drift using sin/cos noise
        const nx = Math.sin(t * 0.008 + p.seed)         * 0.35;
        const ny = Math.cos(t * 0.007 + p.seed * 1.3)   * 0.35;
        p.vx = p.vx * 0.96 + nx * 0.04;
        p.vy = p.vy * 0.96 + ny * 0.04;
        p.x += p.vx;
        p.y += p.vy;

        // Soft boundary wrap
        if (p.x < -10)            p.x += cvs.width  + 20;
        if (p.x > cvs.width  + 10) p.x -= cvs.width  + 20;
        if (p.y < -10)            p.y += cvs.height + 20;
        if (p.y > cvs.height + 10) p.y -= cvs.height + 20;

        ctx2.beginPath();
        ctx2.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx2.fillStyle = p.color;
        ctx2.globalAlpha = p.alpha;
        ctx2.fill();
      }
      ctx2.globalAlpha = 1;
    }
    draw();

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(particleAnimRef.current);
      window.removeEventListener('resize', resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showParticles]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      cancelAnimationFrame(circleAnimRef.current);
      cancelAnimationFrame(particleAnimRef.current);
    };
  }, []);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Chat handler ───────────────────────────────────────────────────────────
  const sendChat = useCallback(async (question: string) => {
    if (!question.trim() || chatLoading || !dataRef.current) return;
    setChatInput("");
    setChatError("");
    const userMsg: ChatMessage = { role: 'user', content: question };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/pulse-ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question, history: chatMessages.slice(-10), data: dataRef.current }),
      });
      const json = await res.json() as { answer?: string; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? 'Failed');
      setChatMessages(prev => [...prev, { role: 'assistant', content: json.answer! }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, chatMessages]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const dining    = useMemo(() => data?.locations.filter(l => l.type === 'dining')            ?? [], [data]);
  const recreation= useMemo(() => data?.locations.filter(l => l.type === 'recreation')        ?? [], [data]);
  const academic  = useMemo(() => data?.locations.filter(l => l.type === 'academic' || l.type === 'outdoor') ?? [], [data]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white flex flex-col font-sans">

      {/* ── Top status bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-5 py-2.5 bg-[#111318] border-b border-white/[0.06] text-xs select-none shrink-0 flex-wrap">
        <Link href="/#projects" className="text-white/40 hover:text-white/70 transition-colors mr-1">← Back</Link>

        <span className="font-semibold text-sm text-white tracking-tight">Pulse</span>
        <span className="text-white/20">·</span>

        <span className="text-white/50">
          {new Date().toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
        </span>

        {data?.weather && (
          <>
            <span className="text-white/20">·</span>
            <span className="text-white/60">
              {data.weather.icon} {data.weather.temp}°F · {data.weather.description}
            </span>
          </>
        )}

        <span className="text-white/20">·</span>
        <span className="flex items-center gap-1.5 text-white/40">
          <span className={`w-1.5 h-1.5 rounded-full ${fetchError ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'}`} />
          {fetchError ? 'Connection error' : lastUpdated ? `Updated ${secAgo}s ago` : 'Loading…'}
        </span>

        {data && (
          <>
            <span className="text-white/20">·</span>
            <span className="text-white/40">{data.buses.length} buses active</span>
          </>
        )}
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">

        {/* ── Map column ─────────────────────────────────────────────────── */}
        <div className="relative flex-1 min-h-[50vh] lg:min-h-0">

          {/* Map */}
          {mapsKey ? (
            <div ref={mapContainerRef} className="absolute inset-0" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111318] gap-3">
              <p className="text-white/30 text-sm">Map unavailable — Google Maps key not configured.</p>
              <p className="text-white/20 text-xs">Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your environment.</p>
            </div>
          )}

          {/* Particle canvas overlay */}
          <canvas
            ref={particleCanvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ opacity: showParticles ? 1 : 0, transition: 'opacity 0.4s' }}
          />

          {/* ── Layer toggle panel (top-left) ──────────────────────────── */}
          <div className="absolute top-3 left-3 z-10 bg-black/70 backdrop-blur-md rounded-xl border border-white/[0.08] p-3 space-y-2 min-w-[140px]">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-1">Layers</p>
            {([
              { key: 'heatmap',   label: 'Heatmap',   value: showHeatmap,   set: setShowHeatmap },
              { key: 'circles',   label: 'Circles',   value: showCircles,   set: setShowCircles },
              { key: 'particles', label: 'Particles', value: showParticles, set: setShowParticles },
            ] as const).map(({ key, label, value, set }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => set(!value)}
                  className={`w-7 h-3.5 rounded-full transition-colors relative shrink-0 cursor-pointer ${value ? 'bg-emerald-500' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm ${value ? 'left-3.5' : 'left-0.5'}`} />
                </div>
                <span className={`text-xs transition-colors ${value ? 'text-white/80' : 'text-white/30'}`}>{label}</span>
              </label>
            ))}
          </div>

          {/* ── Bus legend (bottom-left) ───────────────────────────────── */}
          <div className="absolute bottom-3 left-3 z-10 bg-black/70 backdrop-blur-md rounded-xl border border-white/[0.08] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/30 mb-2">Stinger Routes</p>
            <div className="space-y-1">
              {(['red','blue','green','gold'] as const).map(name => (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ROUTE_COLORS[name] }} />
                  <span className="text-[10px] text-white/50 capitalize">{name}</span>
                </div>
              ))}
            </div>
            {data && data.buses.length === 0 && (
              <p className="text-[10px] text-white/25 mt-2 italic">No live data</p>
            )}
          </div>

          {/* ── Selected location popup ────────────────────────────────── */}
          {selectedLoc && (
            <div className="absolute inset-x-0 bottom-3 mx-auto z-20 max-w-xs px-3">
              <div className="bg-[#141820] border border-white/[0.1] rounded-2xl p-4 shadow-2xl relative">
                <button
                  onClick={() => setSelectedLoc(null)}
                  className="absolute top-3 right-3 text-white/30 hover:text-white/70 text-lg leading-none"
                >×</button>
                <p className="text-sm font-semibold text-white mb-1">{selectedLoc.name}</p>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${selectedLoc.busyness}%`, backgroundColor: busynessHex(selectedLoc.busyness) }} />
                  </div>
                  <span className="text-xs font-medium shrink-0" style={{ color: busynessHex(selectedLoc.busyness) }}>{selectedLoc.busyness}%</span>
                </div>
                <div className="flex gap-3 text-[11px] text-white/40">
                  <span style={{ color: busynessHex(selectedLoc.busyness) }}>{selectedLoc.status}</span>
                  {selectedLoc.waitTime && <span>· {selectedLoc.waitTime}</span>}
                  <span>· Peak: {selectedLoc.peakHours}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Location cards panel ───────────────────────────────────────── */}
        <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 bg-[#0d0f14] border-t lg:border-t-0 lg:border-l border-white/[0.06] overflow-y-auto flex flex-col">

          {/* Section: Dining */}
          <CardSection title="Dining" icon="🍽">
            {dining.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={setSelectedLoc} />)}
          </CardSection>

          {/* Section: Recreation */}
          <CardSection title="Recreation" icon="💪">
            {recreation.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={setSelectedLoc} />)}
          </CardSection>

          {/* Section: Study Spots & Outdoors */}
          <CardSection title="Buildings & Study Spots" icon="📚">
            {academic.map(loc => <LocationCard key={loc.id} loc={loc} onSelect={setSelectedLoc} />)}
          </CardSection>

          {/* Disclaimer */}
          <div className="px-4 pb-6 pt-2">
            <p className="text-[10px] text-white/20 leading-relaxed italic">
              Pulse uses modeled crowd data based on class schedules and historical patterns.
              Bus locations are live. Dining and CRC busyness is estimated, not real-time sensor data.
            </p>
          </div>
        </aside>
      </div>

      {/* ── Ask Pulse floating button ────────────────────────────────────── */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl text-sm font-semibold transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #B3A369 0%, #C1513A 100%)', color: 'white' }}
        >
          <span className="text-base">✦</span> Ask Pulse
        </button>
      )}

      {/* ── Chat panel ───────────────────────────────────────────────────── */}
      {chatOpen && (
        <div className="fixed bottom-0 right-0 z-40 flex flex-col w-full sm:w-[420px] h-[70vh] bg-[#111318] border-t sm:border-l border-white/[0.08] shadow-2xl sm:rounded-tl-2xl">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base">✦</span>
              <span className="font-semibold text-sm text-white">Ask Pulse</span>
              <span className="text-[10px] text-white/30 font-normal">GT Campus Assistant</span>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-white/30 hover:text-white/70 text-xl leading-none">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatMessages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-white/30 text-center py-2">Ask anything about campus right now.</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendChat(s)}
                      className="text-[11px] px-3 py-1.5 rounded-full border border-white/[0.1] text-white/50 hover:text-white/80 hover:border-white/20 transition-colors bg-white/[0.03]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#B3A369]/20 text-white/90 rounded-br-sm'
                      : 'bg-white/[0.06] text-white/80 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] px-3 py-2 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {chatError && <p className="text-xs text-red-400 text-center">{chatError}</p>}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form
            className="px-3 pb-3 pt-2 shrink-0 border-t border-white/[0.06]"
            onSubmit={e => { e.preventDefault(); sendChat(chatInput); }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about campus…"
                className="flex-1 px-3 py-2 text-sm rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#B3A369]/50 transition-colors"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading || !data}
                className="px-3 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-30"
                style={{ background: '#B3A369', color: '#0a0c10' }}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CardSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.05]">
      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 flex items-center gap-1.5">
          <span>{icon}</span>{title}
        </p>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function LocationCard({ loc, onSelect }: { loc: LocationData; onSelect: (l: LocationData) => void }) {
  const color = busynessHex(loc.busyness);
  const wait  = waitLabel(loc);
  return (
    <button
      onClick={() => onSelect(loc)}
      className="w-full text-left px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-white/80 flex items-center gap-1.5">
          <span className="text-base leading-none">{typeIcon(loc.type)}</span>
          {loc.name}
        </span>
        <span className="text-[10px] font-semibold shrink-0 mt-0.5" style={{ color }}>{busynessLabel(loc.busyness)}</span>
      </div>

      {/* Busyness bar */}
      <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${loc.busyness}%`, backgroundColor: color }} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/25">
        <span>{loc.peakHours}</span>
        {wait && <span style={{ color: loc.busyness < 30 ? '#22c55e' : color }}>{wait}</span>}
      </div>

      {/* Sub-scores for CRC */}
      {loc.subScores && (
        <div className="mt-2 space-y-1">
          {loc.subScores.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="text-[10px] text-white/30 w-16 shrink-0">{s.label}</span>
              <div className="flex-1 h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: busynessHex(s.score) }} />
              </div>
              <span className="text-[10px] text-white/25 w-6 text-right">{s.score}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
