"use client";

import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Polygon,
  useMap,
} from "react-leaflet";
import { useEffect } from "react";
import type {
  UrbanAnalysisResult,
  OverpassPoint,
} from "../../api/urban-gpt/route";

// ─── Types (mirrored from page.tsx) ───────────────────────────────────────────

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

interface FloodZone {
  zone: string;
  subtype: string;
  sfha: boolean;
  rings: number[][][];
}

interface FloodData {
  nearbyZones: FloodZone[];
}

interface HeatData {
  intensityScore: number;
}

interface ZoningData {
  zoneType: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getZoomForRadius(radiusM: number): number {
  const miles = radiusM / 1609.344;
  if (miles < 1) return 15;
  if (miles < 2) return 14;
  if (miles < 5) return 13;
  return 12;
}

// ─── Inner component: imperatively updates map view when result changes ────────

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 0.5 });
  }, [map, center, zoom]);
  return null;
}

// ─── POI markers for one category ─────────────────────────────────────────────

function PoiLayer({
  points,
  color,
  visible,
}: {
  points: OverpassPoint[];
  color: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <>
      {points.map((pt) => (
        <CircleMarker
          key={pt.id}
          center={[pt.lat, pt.lon]}
          radius={5}
          pathOptions={{
            color: "#fff",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.85,
          }}
        />
      ))}
    </>
  );
}

// ─── Flood polygon overlay ─────────────────────────────────────────────────────

function FloodLayer({ zones }: { zones: FloodZone[] }) {
  return (
    <>
      {zones.map((zone, zi) => {
        const z = zone.zone.toUpperCase();
        const isHigh = zone.sfha || z.startsWith("A") || z.startsWith("V");
        const isMod = z === "X" && zone.subtype?.toUpperCase().includes("500");
        const fillColor = isHigh ? "#DC3545" : isMod ? "#FFC107" : "#28A745";
        const fillOpacity = isHigh ? 0.3 : isMod ? 0.25 : 0.15;

        // Convert ESRI [lng, lat] rings to Leaflet [lat, lng]
        const positions = zone.rings.map((ring) =>
          ring.map(([lng, lat]) => [lat, lng] as [number, number])
        );

        return (
          <Polygon
            key={zi}
            positions={positions}
            pathOptions={{
              color: fillColor,
              weight: 0.5,
              opacity: 0.3,
              fillColor,
              fillOpacity,
            }}
          />
        );
      })}
    </>
  );
}

// ─── Main exported map component ──────────────────────────────────────────────

interface Props {
  result: UrbanAnalysisResult;
  layers: LayerState;
  floodData: FloodData | null;
  heatData: HeatData | null;
  zoningData: ZoningData | null;
}

const LAYER_COLORS: Record<string, string> = {
  transit:     "#1E3A5F",
  parks:       "#6B8F6E",
  restaurants: "#D4A96A",
  schools:     "#2D5A27",
  hospitals:   "#4A6B4A",
};

const ZONING_COLORS: Record<string, string> = {
  residential:   "#4A90E2",
  commercial:    "#FFA500",
  industrial:    "#808080",
  mixed:         "#9400D3",
  agricultural:  "#228B22",
  institutional: "#4B0082",
  unknown:       "#888888",
};

export default function UrbanGPTMap({ result, layers, floodData, heatData, zoningData }: Props) {
  const center: [number, number] = [result.lat, result.lng];
  const zoom = getZoomForRadius(result.radiusM);

  const heatScore = heatData?.intensityScore ?? 0;
  const heatColor = heatScore < 4 ? "#3B82F6" : heatScore < 7 ? "#F59E0B" : "#EF4444";
  const heatFillOpacity = 0.1 + (heatScore / 10) * 0.15;

  const zoningColor = ZONING_COLORS[zoningData?.zoneType ?? "unknown"] ?? "#888888";

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
      zoomControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController center={center} zoom={zoom} />

      {/* Radius circle */}
      <Circle
        center={center}
        radius={result.radiusM}
        pathOptions={{
          color: "#1E3A5F",
          weight: 1.5,
          opacity: 0.4,
          fillColor: "#1E3A5F",
          fillOpacity: 0.05,
        }}
      />

      {/* Center marker */}
      <CircleMarker
        center={center}
        radius={9}
        pathOptions={{
          color: "#fff",
          weight: 2,
          fillColor: "#2D5A27",
          fillOpacity: 1,
        }}
      />

      {/* POI layers */}
      <PoiLayer points={result.overpass.transit}     color={LAYER_COLORS.transit}     visible={layers.transit} />
      <PoiLayer points={result.overpass.parks}       color={LAYER_COLORS.parks}       visible={layers.parks} />
      <PoiLayer points={result.overpass.restaurants} color={LAYER_COLORS.restaurants} visible={layers.restaurants} />
      <PoiLayer points={result.overpass.schools}     color={LAYER_COLORS.schools}     visible={layers.schools} />
      <PoiLayer points={result.overpass.hospitals}   color={LAYER_COLORS.hospitals}   visible={layers.hospitals} />

      {/* Flood overlay */}
      {layers.flood && floodData?.nearbyZones && (
        <FloodLayer zones={floodData.nearbyZones} />
      )}

      {/* Heat overlay */}
      {layers.heat && heatData && (
        <Circle
          center={center}
          radius={result.radiusM}
          pathOptions={{
            color: "transparent",
            weight: 0,
            fillColor: heatColor,
            fillOpacity: heatFillOpacity,
          }}
        />
      )}

      {/* Zoning overlay */}
      {layers.zoning && zoningData && !("error" in zoningData && zoningData.error) && (
        <Circle
          center={center}
          radius={result.radiusM}
          pathOptions={{
            color: "transparent",
            weight: 0,
            fillColor: zoningColor,
            fillOpacity: 0.15,
          }}
        />
      )}
    </MapContainer>
  );
}
