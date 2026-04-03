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

// ─── Schedule-aware particle / pedestrian system ─────────────────────────────

const MWF_SLOTS_H = [8.083, 9.083, 10.083, 11.083, 12.083, 13.083, 14.083, 15.083];
const TR_SLOTS_H  = [8.0, 9.5, 11.0, 12.5, 14.0, 15.5, 17.0];

type LocType = 'academic' | 'dining' | 'residential' | 'recreation' | 'outdoor' | 'offcampus';
type FlowMode = 'pre_class' | 'post_class' | 'lunch' | 'morning' | 'evening' | 'idle';

const PARTICLE_LOCS: { lat: number; lng: number; type: LocType }[] = [
  // Academic buildings
  { lat: 33.7773, lng: -84.3966, type: 'academic' },   // Klaus
  { lat: 33.7763, lng: -84.3960, type: 'academic' },   // Van Leer
  { lat: 33.7755, lng: -84.3975, type: 'academic' },   // Skiles
  { lat: 33.7748, lng: -84.3961, type: 'academic' },   // Clough / CULC
  { lat: 33.7760, lng: -84.3985, type: 'academic' },   // Boggs Chemistry
  { lat: 33.7769, lng: -84.3963, type: 'academic' },   // Mason
  { lat: 33.7755, lng: -84.3938, type: 'academic' },   // College of Design
  // Dining
  { lat: 33.7734, lng: -84.3964, type: 'dining' },     // Student Center / Chick-fil-A
  { lat: 33.7748, lng: -84.3940, type: 'dining' },     // North Ave Dining
  { lat: 33.7723, lng: -84.3949, type: 'dining' },     // West Village Dining
  // Residential
  { lat: 33.7792, lng: -84.3920, type: 'residential' }, // Woodruff / East campus dorms
  { lat: 33.7742, lng: -84.4005, type: 'residential' }, // Hefner / West dorms
  { lat: 33.7812, lng: -84.3960, type: 'residential' }, // North Ave dorms
  { lat: 33.7768, lng: -84.3930, type: 'residential' }, // Glenn / Field / Harris
  // Recreation
  { lat: 33.7766, lng: -84.3951, type: 'recreation' },  // CRC
  // Outdoor
  { lat: 33.7760, lng: -84.3956, type: 'outdoor' },     // Tech Green
  // Off-campus (Midtown)
  { lat: 33.7712, lng: -84.3868, type: 'offcampus' },   // Midtown MARTA station
  { lat: 33.7698, lng: -84.3900, type: 'offcampus' },   // 5th St restaurants / Midtown
];

function getCampusFlow(now: Date): FlowMode {
  const day = now.getDay();
  const h   = now.getHours() + now.getMinutes() / 60;
  if (day === 0 || day === 6) return 'idle';
  const isMWF = day === 1 || day === 3 || day === 5;
  const isTR  = day === 2 || day === 4;
  const slots = isMWF ? MWF_SLOTS_H : isTR ? TR_SLOTS_H : [];
  const durH  = isMWF ? 50 / 60 : 75 / 60;
  if (h >= 11.5 && h <= 13.5) return 'lunch';
  for (const s of slots) {
    if (h >= s - 0.2 && h < s)                return 'pre_class';
    if (h >= s + durH && h < s + durH + 0.25) return 'post_class';
  }
  if (h >= 6.5 && h < 9)  return 'morning';
  if (h >= 17  && h < 21) return 'evening';
  return 'idle';
}

function walkerColor(type: LocType): string {
  switch (type) {
    case 'academic':    return '#B3A369';  // GT gold
    case 'dining':      return '#f97316';  // orange
    case 'residential': return '#60a5fa';  // blue
    case 'recreation':  return '#4ade80';  // green
    case 'outdoor':     return '#86efac';  // light green
    case 'offcampus':   return '#c084fc';  // purple
  }
}

interface Walker {
  lat: number; lng: number;
  dlat: number; dlng: number;
  life: number; maxLife: number;
  color: string; size: number; alpha: number;
}

function spawnWalker(flow: FlowMode): Walker {
  let fromPool: typeof PARTICLE_LOCS;
  let toPool:   typeof PARTICLE_LOCS;
  switch (flow) {
    case 'pre_class':
      fromPool = PARTICLE_LOCS.filter(l => l.type === 'residential' || l.type === 'dining' || l.type === 'outdoor');
      toPool   = PARTICLE_LOCS.filter(l => l.type === 'academic');
      break;
    case 'post_class':
      fromPool = PARTICLE_LOCS.filter(l => l.type === 'academic');
      toPool   = PARTICLE_LOCS.filter(l => l.type !== 'academic');
      break;
    case 'lunch':
      fromPool = PARTICLE_LOCS.filter(l => l.type === 'academic' || l.type === 'residential');
      toPool   = PARTICLE_LOCS.filter(l => l.type === 'dining' || l.type === 'outdoor');
      break;
    case 'morning':
      fromPool = PARTICLE_LOCS.filter(l => l.type === 'residential');
      toPool   = PARTICLE_LOCS.filter(l => l.type === 'academic' || l.type === 'dining');
      break;
    case 'evening':
      fromPool = PARTICLE_LOCS.filter(l => l.type === 'academic' || l.type === 'recreation');
      toPool   = PARTICLE_LOCS.filter(l => l.type === 'residential' || l.type === 'offcampus');
      break;
    default: // idle / weekend
      fromPool = PARTICLE_LOCS.filter(l => l.type !== 'offcampus');
      toPool   = PARTICLE_LOCS.filter(l => l.type !== 'offcampus');
  }
  const from = fromPool[Math.floor(Math.random() * fromPool.length)];
  let to     = toPool[Math.floor(Math.random() * toPool.length)];
  if (to === from) to = toPool[(toPool.indexOf(to) + 1) % toPool.length] ?? to;

  const j = 0.00022;
  const sLat = from.lat + (Math.random() - 0.5) * j;
  const sLng = from.lng + (Math.random() - 0.5) * j;
  const eLat = to.lat   + (Math.random() - 0.5) * j;
  const eLng = to.lng   + (Math.random() - 0.5) * j;
  const frames = 90 + Math.floor(Math.random() * 150); // 1.5–4 s @ 60 fps

  return {
    lat: sLat, lng: sLng,
    dlat: (eLat - sLat) / frames,
    dlng: (eLng - sLng) / frames,
    life: 0, maxLife: frames,
    color: walkerColor(from.type),
    size:  1.4 + Math.random() * 1.2,
    alpha: 0.55 + Math.random() * 0.35,
  };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlayRef      = useRef<any>(null);

  // Keep layersRef in sync
  useEffect(() => { layersRef.current = { heatmap: showHeatmap, circles: showCircles, particles: showParticles }; },
    [showHeatmap, showCircles, showParticles]);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  // ── Load Google Maps ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (window.google?.maps) { setMapsLoaded(true); return; }
    window.__pulseMapReady = () => setMapsLoaded(true);
    if (document.getElementById("pulse-maps-script")) return;
    if (!mapsKey) return; // no key — stay in loading state, show spinner
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
      gestureHandling: 'greedy',
    });
    mapRef.current = map;

    // OverlayView for lat/lng → pixel projection in the particle system
    const overlay = new window.google.maps.OverlayView();
    overlay.draw = () => {};
    overlay.onAdd = () => {};
    overlay.onRemove = () => {};
    overlay.setMap(map);
    overlayRef.current = overlay;
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
      if (!activeBusIds.has(id)) { marker.setMap(null); busMarkersRef.current.delete(id); }
    });

    data.buses.forEach((bus: Bus) => {
      const color = routeColor(bus.routeName);

      // Arrow-shaped bus icon that rotates with heading
      const heading = bus.heading ?? 0;
      const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <g transform="rotate(${heading},16,16)">
          <circle cx="16" cy="16" r="13" fill="${color}" stroke="white" stroke-width="2.5"/>
          <polygon points="16,5 21,22 16,18 11,22" fill="white" opacity="0.9"/>
        </g>
      </svg>`;
      const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgIcon)}`;
      const iconSpec = {
        url:        iconUrl,
        scaledSize: new window.google.maps.Size(32, 32),
        anchor:     new window.google.maps.Point(16, 16),
      };

      if (busMarkersRef.current.has(bus.id)) {
        const m = busMarkersRef.current.get(bus.id);
        const prev = m.getPosition();
        if (prev) {
          // Smooth interpolation over 30 steps across the poll interval
          const steps  = 30;
          const stepMs = POLL_MS / steps;
          let step = 0;
          const fromLat = prev.lat();
          const fromLng = prev.lng();
          const dLat    = (bus.lat - fromLat) / steps;
          const dLng    = (bus.lng - fromLng) / steps;
          function moveStep() {
            if (step >= steps) return;
            step++;
            m.setPosition({ lat: fromLat + dLat * step, lng: fromLng + dLng * step });
            setTimeout(moveStep, stepMs);
          }
          moveStep();
        }
        // Update icon in case heading changed
        m.setIcon(iconSpec);
      } else {
        const marker = new window.google.maps.Marker({
          position: { lat: bus.lat, lng: bus.lng },
          map:      mapRef.current,
          icon:     iconSpec,
          title:    bus.routeName,
          zIndex:   10,
        });
        marker.addListener('click', () => {
          const iw = new window.google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif;padding:4px 8px;min-width:120px">
              <p style="font-weight:600;margin:0;color:${color}">${bus.routeName}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6B5244">Stinger Bus · Live</p>
            </div>`,
          });
          iw.open(mapRef.current, marker);
        });
        busMarkersRef.current.set(bus.id, marker);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mapsLoaded]);

  // ── Particle / pedestrian canvas ──────────────────────────────────────────
  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas || !showParticles) {
      if (particleAnimRef.current) cancelAnimationFrame(particleAnimRef.current);
      const c = particleCanvasRef.current;
      if (c) { const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height); }
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; }
    };
    resize();
    window.addEventListener('resize', resize);

    const walkers: Walker[] = [];
    const MAX_WALKERS = 120;
    const SPAWN_PER_FRAME = 2;

    const cvs = canvas;
    const ctx2 = ctx;

    function draw() {
      particleAnimRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;

      ctx2.clearRect(0, 0, cvs.width, cvs.height);

      // Get Maps projection if available (precise pixel placement on the map)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proj: any = overlayRef.current?.getProjection?.();

      // Spawn new walkers up to cap
      const flow = getCampusFlow(new Date());
      for (let i = 0; i < SPAWN_PER_FRAME && walkers.length < MAX_WALKERS; i++) {
        walkers.push(spawnWalker(flow));
      }

      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i];
        w.lat  += w.dlat;
        w.lng  += w.dlng;
        w.life += 1;
        if (w.life >= w.maxLife) { walkers.splice(i, 1); continue; }

        // Fade in first 10% of life, fade out last 10%
        const progress = w.life / w.maxLife;
        const fade = progress < 0.1 ? progress * 10 : progress > 0.9 ? (1 - progress) * 10 : 1;

        let px: number, py: number;
        if (proj) {
          const pt = proj.fromLatLngToContainerPixel(
            new window.google.maps.LatLng(w.lat, w.lng)
          );
          if (!pt) continue;
          px = pt.x; py = pt.y;
        } else {
          // Fallback: manual linear projection using GT campus bounding box
          const LAT_MIN = 33.770, LAT_MAX = 33.782;
          const LNG_MIN = -84.406, LNG_MAX = -84.386;
          px = ((w.lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * cvs.width;
          py = ((LAT_MAX - w.lat) / (LAT_MAX - LAT_MIN)) * cvs.height;
        }

        ctx2.beginPath();
        ctx2.arc(px, py, w.size, 0, Math.PI * 2);
        ctx2.fillStyle = w.color;
        ctx2.globalAlpha = w.alpha * fade;
        ctx2.fill();
      }
      ctx2.globalAlpha = 1;
    }
    draw();

    return () => {
      cancelAnimationFrame(particleAnimRef.current);
      window.removeEventListener('resize', resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showParticles]);

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

          {/* Map — always rendered; shown once Maps initialises */}
          <div ref={mapContainerRef} className="absolute inset-0 bg-[#111318]" />
          {!mapsLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <p className="text-white/25 text-xs">Loading map…</p>
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
