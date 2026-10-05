"use client";

// The confirm step. SPEC.md section 3 item 2.
//
// Photon mis-resolves the Miami test intersection and Nominatim resolves it, so
// this step is mandatory, not optional: nothing runs until the point is
// confirmed.
//
// Leaflet's stylesheet is imported from node_modules rather than fetched from a
// CDN. The parent imports this file with `next/dynamic` and `ssr: false`, so
// the import sits inside that boundary and the CSS is bundled with this chunk
// alone, never with the shared bundle. A third party stylesheet would put a
// render blocking request to someone else's origin on the page, and a version
// drift between the script this repo installs and the CSS that host serves
// would break the map with no local reproduction.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

/**
 * The draggable pin. The dot is styled inline because a class would have to be
 * declared in globals.css, which phase 2 may not touch, and the two class names
 * this icon carried before (`datum-pin`, `datum-pin-dot`) were declared nowhere
 * at all, so the marker rendered as an empty 18 by 18 box and the point could
 * not be seen, let alone dragged to a better one. The colours are the same
 * hex copies of the tokens the sheet builders use.
 */
const MARKER_HTML =
  '<span data-datum-marker style="display:block;box-sizing:border-box;' +
  "width:18px;height:18px;border-radius:9999px;background:#2D5A27;" +
  "border:3px solid #FBFCFA;box-shadow:0 0 0 1px #2D5A27;cursor:grab" +
  "\"></span>";

interface Props {
  lat: number;
  lng: number;
  displayName: string;
  onConfirm: (point: { lat: number; lng: number }) => void;
  onChange: () => void;
  busy: boolean;
}

export default function ConfirmMap({
  lat,
  lng,
  displayName,
  onConfirm,
  onChange,
  busy,
}: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [current, setCurrent] = useState({ lat, lng });

  useEffect(() => {
    let cancelled = false;
    let created: LeafletMap | null = null;

    async function boot() {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !container.current || map.current) return;

      created = leaflet.map(container.current, {
        center: [lat, lng],
        zoom: 17,
        scrollWheelZoom: false,
      });
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(created);

      const pin = leaflet
        .marker([lat, lng], {
          draggable: true,
          icon: leaflet.divIcon({
            className: "datum-pin",
            html: MARKER_HTML,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        })
        .addTo(created);
      pin.on("dragend", () => {
        const position = pin.getLatLng();
        setCurrent({ lat: position.lat, lng: position.lng });
      });

      map.current = created;
      marker.current = pin;
    }

    void boot();
    return () => {
      cancelled = true;
      if (created) created.remove();
      map.current = null;
      marker.current = null;
    };
  }, [lat, lng]);

  return (
    <div className="card overflow-hidden p-0" data-datum-confirm>
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-3 pt-4">
        <p className="eyebrow">Confirm the point</p>
        <p
          className="coord text-[var(--color-brown-light)]"
          data-confirm-lat={current.lat}
          data-confirm-lng={current.lng}
        >
          {current.lat.toFixed(5)}, {current.lng.toFixed(5)}
        </p>
      </div>
      <p className="px-5 pb-3 text-sm text-[var(--color-brown)]">{displayName}</p>
      <div
        ref={container}
        className="h-[340px] w-full border-y border-[var(--color-line)]"
        aria-label="Map showing the resolved address"
      />
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button
          type="button"
          onClick={() => onConfirm(current)}
          disabled={busy}
          className="rounded-full bg-[var(--color-terracotta)] px-6 py-2 text-sm font-medium text-[var(--color-paper)] transition-opacity disabled:opacity-50"
        >
          {busy ? "Analysing" : "Confirm and analyse"}
        </button>
        <button
          type="button"
          onClick={onChange}
          disabled={busy}
          className="rounded-full border border-[var(--color-line)] px-6 py-2 text-sm text-[var(--color-brown)] disabled:opacity-50"
        >
          Change address
        </button>
        <p className="meta">
          Drag the marker if the point is wrong. Nothing runs until you confirm.
        </p>
      </div>
    </div>
  );
}
