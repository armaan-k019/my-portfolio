"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    __mayoMapReady?: () => void;
  }
}

// 55 Mayo Rd, Edgewater, MD 21037
const OFFICE = { lat: 38.9270, lng: -76.5502 };

interface Props {
  className?: string;
}

export default function OfficeMap({ className = "h-80" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    function initMap() {
      if (!containerRef.current || !win.google?.maps || mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const G = win.google.maps as any;

      mapRef.current = new G.Map(containerRef.current, {
        center: OFFICE,
        zoom: 15,
        minZoom: 11,
        maxZoom: 18,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        zoomControl: true,
        styles: [
          { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
        ],
      });

      new G.Marker({
        position: OFFICE,
        map: mapRef.current,
        title: "Mayo Dental Family Dentistry",
      });
    }

    if (win.google?.maps) { initMap(); return; }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return;

    // Reuse an already-loading script if present
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      existing.addEventListener("load", initMap);
      return () => existing.removeEventListener("load", initMap);
    }

    window.__mayoMapReady = initMap;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=__mayoMapReady`;
    script.async = true;
    document.head.appendChild(script);

    return () => { window.__mayoMapReady = undefined; };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl overflow-hidden border border-[#e4e4e4] bg-[#e8eaf0] ${className}`}
    />
  );
}
