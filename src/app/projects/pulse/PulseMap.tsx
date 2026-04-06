"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useCallback } from "react";
import polyline from "@mapbox/polyline";
import type { LocationData } from "../../api/pulse/route";
import type { UnifiedEvent } from "../../api/events/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type RouteId = "red" | "blue" | "green" | "gold";

interface BusRouteDef {
  id: RouteId;
  name: string;
  color: string;
  stops: { lat: number; lng: number; name: string }[];
}

interface PulseMapProps {
  data: { locations: LocationData[] } | null;
  events: UnifiedEvent[];
  showHeatmap: boolean;
  showCircles: boolean;
  showEvents: boolean;
  routeToggles: Record<RouteId, boolean>;
  onSelectLoc: (loc: LocationData) => void;
  selectedLoc: LocationData | null;
  onBusStatusChange: (count: number, simulated: boolean) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GT_CENTER: [number, number] = [33.7756, -84.3963];
const GT_ZOOM = 15;

const BUS_ROUTE_DEFS: BusRouteDef[] = [
  {
    id: "red",
    name: "Red",
    color: "#E8392A",
    stops: [
      { lat: 33.7748, lng: -84.3963, name: "Student Center" },
      { lat: 33.7769, lng: -84.4039, name: "CRC" },
      { lat: 33.7721, lng: -84.3902, name: "North Ave Dining" },
      { lat: 33.7756, lng: -84.3963, name: "Tech Tower" },
      { lat: 33.7775, lng: -84.3958, name: "Klaus" },
      { lat: 33.7757, lng: -84.3963, name: "CULC" },
    ],
  },
  {
    id: "blue",
    name: "Blue",
    color: "#1A6FBF",
    stops: [
      { lat: 33.7694, lng: -84.3956, name: "West Village" },
      { lat: 33.7763, lng: -84.3939, name: "College of Design" },
      { lat: 33.7742, lng: -84.3964, name: "Skiles" },
      { lat: 33.7748, lng: -84.3963, name: "Student Center" },
    ],
  },
  {
    id: "green",
    name: "Green",
    color: "#2E8B57",
    stops: [
      { lat: 33.7756, lng: -84.3963, name: "Ferst Dr & Cherry" },
      { lat: 33.7780, lng: -84.4012, name: "Stamps Health" },
      { lat: 33.7769, lng: -84.4039, name: "CRC" },
      { lat: 33.7694, lng: -84.3956, name: "West Village" },
    ],
  },
  {
    id: "gold",
    name: "Gold",
    color: "#B8952A",
    stops: [
      { lat: 33.7748, lng: -84.3963, name: "Student Center" },
      { lat: 33.7771, lng: -84.3998, name: "Boggs" },
      { lat: 33.7721, lng: -84.3902, name: "North Ave Dining" },
    ],
  },
];

const CAMPUS_COORDS: { name: string; lat: number; lng: number }[] = [
  { name: "Tech Green",          lat: 33.7751, lng: -84.3963 },
  { name: "Student Center",      lat: 33.7748, lng: -84.3963 },
  { name: "Clough Commons",      lat: 33.7757, lng: -84.3963 },
  { name: "CULC",                lat: 33.7757, lng: -84.3963 },
  { name: "Klaus",               lat: 33.7775, lng: -84.3958 },
  { name: "Van Leer",            lat: 33.7764, lng: -84.4006 },
  { name: "Skiles",              lat: 33.7742, lng: -84.3964 },
  { name: "Boggs",               lat: 33.7771, lng: -84.3998 },
  { name: "Mason",               lat: 33.7756, lng: -84.3940 },
  { name: "CRC",                 lat: 33.7769, lng: -84.4039 },
  { name: "Campus Rec",          lat: 33.7769, lng: -84.4039 },
  { name: "North Ave Dining",    lat: 33.7721, lng: -84.3902 },
  { name: "West Village",        lat: 33.7694, lng: -84.3956 },
  { name: "Bobby Dodd",          lat: 33.7721, lng: -84.3929 },
  { name: "Ferst Center",        lat: 33.7747, lng: -84.3979 },
  { name: "Tech Tower",          lat: 33.7756, lng: -84.3963 },
  { name: "College of Design",   lat: 33.7763, lng: -84.3939 },
  { name: "College of Architecture", lat: 33.7756, lng: -84.3985 },
];

const CAMPUS_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  "student center":    { lat: 33.7756, lng: -84.3963 },
  "tech green":        { lat: 33.7758, lng: -84.3970 },
  "crc":               { lat: 33.7748, lng: -84.3972 },
  "culc":              { lat: 33.7760, lng: -84.3948 },
  "clough commons":    { lat: 33.7760, lng: -84.3948 },
  "klaus":             { lat: 33.7773, lng: -84.3942 },
  "college of design": { lat: 33.7756, lng: -84.3985 },
  "skiles":            { lat: 33.7763, lng: -84.3945 },
  "north ave dining":  { lat: 33.7771, lng: -84.3978 },
  "west village":      { lat: 33.7752, lng: -84.4002 },
  "tech tower":        { lat: 33.7756, lng: -84.3963 },
};

const PHYSICAL_RADIUS: Record<string, number> = {
  chick_fil_a: 25, panda: 25, north_ave: 55, west_village: 55, crc: 90,
  clough: 45, student_center: 45, tech_green: 70, van_leer: 35,
  boggs: 32, skiles: 32, mason: 30, design: 30, tech_tower: 22,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function busynessHex(score: number): string {
  if (score < 30) return "#22c55e";
  if (score < 60) return "#eab308";
  if (score < 80) return "#f97316";
  return "#ef4444";
}

function heatWeight(busyness: number): number {
  if (busyness < 30) return 0.2;
  if (busyness < 60) return 0.6;
  return 1.0;
}

function physRadius(id: string): number {
  return PHYSICAL_RADIUS[id] ?? 30;
}

function matchEventCoords(location: string): { lat: number; lng: number } | null {
  const lower = location.toLowerCase();
  for (const c of CAMPUS_COORDS) {
    if (lower.includes(c.name.toLowerCase())) return { lat: c.lat, lng: c.lng };
  }
  for (const [key, coords] of Object.entries(CAMPUS_LOCATIONS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
}

function eventTypePinColor(type: UnifiedEvent["type"]): string {
  switch (type) {
    case "party":
    case "social":   return "#a855f7";
    case "official": return "#0d9488";
    case "popup":    return "#d97706";
    case "sports":   return "#2563eb";
    case "lecture":  return "#4f46e5";
    default:         return "#6b7280";
  }
}

function createBusIconUrl(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 36; canvas.height = 36;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(18, 18, 16, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
  ctx.font = "18px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🚌", 18, 18);
  return canvas.toDataURL();
}

function busPopupContent(color: string, routeName: string, nextStop: string, atStop: boolean): string {
  return `<div style="font-family:sans-serif;padding:6px 10px;max-width:210px;line-height:1.4">
    <p style="font-weight:700;margin:0 0 2px;color:${color};font-size:13px">Route: ${routeName}</p>
    <p style="margin:0 0 2px;font-size:11px;color:#555">Status: <span style="color:#888;font-style:italic">Simulated position</span></p>
    <p style="margin:0;font-size:11px;color:#555">${atStop ? "At stop:" : "Next stop:"} <strong>${nextStop}</strong></p>
  </div>`;
}

function findNextStop(
  stops: { lat: number; lng: number; name: string }[],
  path: [number, number][],
  waypointIdx: number
): string {
  const SEARCH = Math.min(path.length, 80);
  for (let i = 0; i < SEARCH; i++) {
    const pt = path[(waypointIdx + i) % path.length];
    if (!pt) continue;
    const [lat, lng] = pt;
    for (const stop of stops) {
      if (Math.abs(lat - stop.lat) < 0.001 && Math.abs(lng - stop.lng) < 0.001) {
        return stop.name;
      }
    }
  }
  return stops[0]?.name ?? "";
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PulseMap({
  data,
  events,
  showHeatmap,
  showCircles,
  showEvents,
  routeToggles,
  onSelectLoc,
  selectedLoc,
  onBusStatusChange,
}: PulseMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatmapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circlesRef = useRef<L.Circle[]>([]);
  const locationMarkersRef = useRef<L.Marker[]>([]);
  const eventMarkersRef = useRef<L.Marker[]>([]);
  const busMarkersRef = useRef<L.Marker[]>([]);
  const routePolylinesRef = useRef<Record<string, L.Polyline>>({});
  const routePathsRef = useRef<Record<string, [number, number][]>>({});
  const simBusesRef = useRef<{
    routeId: RouteId;
    routeName: string;
    routeColor: string;
    stops: { lat: number; lng: number; name: string }[];
    path: [number, number][];
    waypointIdx: number;
    progress: number;
    stopTimer: number;
    nextStopName: string;
    marker: L.Marker;
  }[]>([]);
  const simAnimFrameRef = useRef<number>(0);
  const circleAnimRef = useRef<number>(0);
  const routeTogglesPropRef = useRef(routeToggles);

  // Keep routeToggles ref in sync for use inside rAF callbacks
  useEffect(() => { routeTogglesPropRef.current = routeToggles; }, [routeToggles]);

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: GT_CENTER,
      zoom: GT_ZOOM,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
      maxBounds: [[33.760, -84.420], [33.790, -84.375]],
      maxBoundsViscosity: 1.0,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Fetch and draw bus routes
    fetch("/api/bus-routes", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { routes: { id: string; name: string; color: string; encodedPolyline: string }[] }) => {
        const routes = d.routes ?? [];
        routes.forEach((route) => {
          const key = route.name.toLowerCase() as RouteId;
          if (routePathsRef.current[key]) return;

          // Decode with @mapbox/polyline — returns [[lat, lng], ...]
          const path = polyline.decode(route.encodedPolyline) as [number, number][];
          routePathsRef.current[key] = path;

          const visible = routeTogglesPropRef.current[key] ?? true;
          const poly = L.polyline(path, {
            color: route.color,
            weight: 3,
            opacity: 0.85,
          });
          if (visible) poly.addTo(map);
          routePolylinesRef.current[key] = poly;
        });
        startSimulation();
      })
      .catch((err) => console.error("[PulseMap] Failed to fetch bus routes:", err));

    return () => {
      cancelAnimationFrame(simAnimFrameRef.current);
      cancelAnimationFrame(circleAnimRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync route polyline visibility ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    BUS_ROUTE_DEFS.forEach((route) => {
      const poly = routePolylinesRef.current[route.id];
      if (!poly) return;
      if (routeToggles[route.id]) {
        if (!mapRef.current.hasLayer(poly)) poly.addTo(mapRef.current);
      } else {
        if (mapRef.current.hasLayer(poly)) poly.remove();
      }
    });
  }, [routeToggles]);

  // ── Pan to selected location ──────────────────────────────────────────────────
  useEffect(() => {
    if (selectedLoc && mapRef.current) {
      mapRef.current.panTo([selectedLoc.lat, selectedLoc.lng]);
    }
  }, [selectedLoc]);

  // ── Bus simulation ────────────────────────────────────────────────────────────
  const startSimulation = useCallback(() => {
    if (!mapRef.current) return;

    cancelAnimationFrame(simAnimFrameRef.current);
    busMarkersRef.current.forEach((m) => m.remove());
    busMarkersRef.current = [];
    simBusesRef.current = [];

    const pathsReady = BUS_ROUTE_DEFS.some((r) => (routePathsRef.current[r.id]?.length ?? 0) > 1);
    if (!pathsReady) return;

    BUS_ROUTE_DEFS.forEach((route) => {
      if (!routeTogglesPropRef.current[route.id]) return;
      const path = routePathsRef.current[route.id];
      if (!path || path.length < 4) return;

      ([0, Math.floor(path.length / 2)] as const).forEach((startIdx) => {
        const initialNextStop = findNextStop(route.stops, path, startIdx);
        const iconUrl = createBusIconUrl(route.color);
        const icon = L.icon({
          iconUrl,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        const marker = L.marker([path[startIdx][0], path[startIdx][1]], { icon, zIndexOffset: 1000, title: `Route: ${route.name}` })
          .addTo(mapRef.current);

        marker.bindPopup(busPopupContent(route.color, route.name, initialNextStop, false));
        busMarkersRef.current.push(marker);
        simBusesRef.current.push({
          routeId: route.id,
          routeName: route.name,
          routeColor: route.color,
          stops: route.stops,
          path,
          waypointIdx: startIdx,
          progress: 0,
          stopTimer: 0,
          nextStopName: initialNextStop,
          marker,
        });
      });
    });

    onBusStatusChange(simBusesRef.current.length, true);

    const SPEED = 0.25;
    let lastTs: number | null = null;

    function tick(ts: number) {
      if (lastTs === null) lastTs = ts;
      const dt = Math.min(ts - lastTs, 100);
      lastTs = ts;

      simBusesRef.current.forEach((bus) => {
        if (!routeTogglesPropRef.current[bus.routeId]) return;

        if (bus.stopTimer > 0) { bus.stopTimer -= dt; return; }

        bus.progress += SPEED * (dt / 1000);

        if (bus.progress >= 1) {
          bus.progress -= 1;
          bus.waypointIdx = (bus.waypointIdx + 1) % bus.path.length;

          const pt = bus.path[bus.waypointIdx];
          if (pt) {
            const [lat, lng] = pt;
            let atStop = false;
            for (const stop of bus.stops) {
              if (Math.abs(lat - stop.lat) < 0.001 && Math.abs(lng - stop.lng) < 0.001) {
                bus.stopTimer = 4000;
                bus.nextStopName = stop.name;
                bus.marker.getPopup()?.setContent(busPopupContent(bus.routeColor, bus.routeName, stop.name, true));
                atStop = true;
                break;
              }
            }
            if (!atStop) {
              const next = findNextStop(bus.stops, bus.path, bus.waypointIdx);
              if (next !== bus.nextStopName) {
                bus.nextStopName = next;
                bus.marker.getPopup()?.setContent(busPopupContent(bus.routeColor, bus.routeName, next, false));
              }
            }
          }
        }

        const cur = bus.path[bus.waypointIdx];
        const next = bus.path[(bus.waypointIdx + 1) % bus.path.length];
        if (cur && next) {
          const lat = cur[0] + (next[0] - cur[0]) * bus.progress;
          const lng = cur[1] + (next[1] - cur[1]) * bus.progress;
          bus.marker.setLatLng([lat, lng]);
        }
      });

      simAnimFrameRef.current = requestAnimationFrame(tick);
    }

    simAnimFrameRef.current = requestAnimationFrame(tick);
  }, [onBusStatusChange]);

  // ── Heatmap ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L_any = L as any;
    if (!L_any.heatLayer) return;

    const points = data.locations.map(
      (loc) => [loc.lat, loc.lng, heatWeight(loc.busyness)] as [number, number, number]
    );

    if (heatmapRef.current) {
      heatmapRef.current.setLatLngs(points);
      if (showHeatmap) {
        if (!mapRef.current.hasLayer(heatmapRef.current)) heatmapRef.current.addTo(mapRef.current);
      } else {
        if (mapRef.current.hasLayer(heatmapRef.current)) heatmapRef.current.remove();
      }
    } else {
      heatmapRef.current = L_any.heatLayer(points, {
        radius: 40,
        blur: 20,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.0: "rgba(0,160,0,0)",
          0.25: "rgba(0,200,0,1)",
          0.5: "rgba(200,200,0,1)",
          0.75: "rgba(250,130,0,1)",
          1.0: "rgba(240,50,50,1)",
        },
      });
      if (showHeatmap) heatmapRef.current.addTo(mapRef.current);
    }
  }, [data, showHeatmap]);

  // ── Location pin markers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data) return;

    locationMarkersRef.current.forEach((m) => m.remove());
    locationMarkersRef.current = [];

    locationMarkersRef.current = data.locations.map((loc) => {
      const color = busynessHex(loc.busyness);
      const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18C24 5.373 18.627 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="4.5" fill="white" opacity="0.9"/>
      </svg>`;
      const icon = L.divIcon({
        html: svgPin,
        className: "",
        iconSize: [24, 30],
        iconAnchor: [12, 30],
      });
      const marker = L.marker([loc.lat, loc.lng], { icon, zIndexOffset: 500, title: loc.name })
        .addTo(mapRef.current);
      marker.on("click", () => onSelectLoc(loc));
      return marker;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Pulsing circles ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !data) return;

    circlesRef.current.forEach((c) => c.remove());
    circlesRef.current = [];
    cancelAnimationFrame(circleAnimRef.current);

    if (!showCircles) return;

    circlesRef.current = data.locations.map((loc) => {
      const baseRadius = physRadius(loc.id) + (loc.busyness / 100) * 30;
      const color = busynessHex(loc.busyness);
      const circle = L.circle([loc.lat, loc.lng], {
        radius: baseRadius,
        color,
        fillColor: color,
        fillOpacity: 0.28,
        weight: 1.5,
        opacity: 0.7,
      }).addTo(mapRef.current);
      circle.on("click", () => onSelectLoc(loc));
      return circle;
    });

    let t = 0;
    function animateCircles() {
      circleAnimRef.current = requestAnimationFrame(animateCircles);
      if (document.hidden) return;
      t += 0.025;
      circlesRef.current.forEach((circle, i) => {
        const loc = data!.locations[i];
        if (!loc) return;
        const base = physRadius(loc.id) + (loc.busyness / 100) * 30;
        const amplitude = base * 0.15;
        const phase = i * 0.6;
        const r = base + Math.sin(t + phase) * amplitude;
        circle.setRadius(r);
        circle.setStyle({ fillOpacity: 0.18 + Math.sin(t + phase) * 0.10 });
      });
    }
    animateCircles();

    return () => cancelAnimationFrame(circleAnimRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showCircles]);

  // ── Event markers ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    eventMarkersRef.current.forEach((m) => m.remove());
    eventMarkersRef.current = [];

    if (!showEvents) return;

    events
      .filter((e) => e.onCampus && e.location)
      .forEach((event) => {
        const coords = matchEventCoords(event.location!);
        if (!coords) return;

        const pinColor = eventTypePinColor(event.type);
        const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 24 30">
          <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 18 12 18s12-9 12-18C24 5.373 18.627 0 12 0z" fill="${pinColor}" stroke="white" stroke-width="1.5"/>
          <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-family="sans-serif">📅</text>
        </svg>`;
        const icon = L.divIcon({
          html: svgPin,
          className: "",
          iconSize: [22, 28],
          iconAnchor: [11, 28],
        });
        const marker = L.marker([coords.lat, coords.lng], { icon, zIndexOffset: 700, title: event.title })
          .addTo(mapRef.current);
        marker.bindPopup(`<div style="font-family:sans-serif;padding:4px 8px;max-width:200px">
          <p style="font-weight:600;margin:0;color:${pinColor};font-size:13px">${event.title}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#555">${event.date}${event.time ? " · " + event.time : ""}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#555">${event.location}</p>
          <p style="margin:2px 0 0;font-size:10px;color:#888">${event.organization}</p>
        </div>`);
        eventMarkersRef.current.push(marker);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, showEvents]);

  return <div ref={mapContainerRef} className="absolute inset-0" />;
}
