"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix Leaflet default icon paths broken by webpack
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// 55 Mayo Rd, Edgewater, MD 21037
const OFFICE: [number, number] = [38.927, -76.5502];

export default function OfficeMapLeaflet({ className = "h-80" }: { className?: string }) {
  return (
    <div className={`w-full rounded-xl overflow-hidden border border-[#e4e4e4] ${className}`}>
      <MapContainer
        center={OFFICE}
        zoom={15}
        minZoom={11}
        maxZoom={18}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={OFFICE}>
          <Popup>Mayo Dental Family Dentistry</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
