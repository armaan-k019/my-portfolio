"use client";

// The analyzed sites map. SPEC.md sections 13 and 14, PHASE-3 step 3.5.
//
// Circle markers at the snapped public points the memory/map route returns, on
// OpenStreetMap tiles with their attribution. The route sends 2 dp points and
// nothing else, so this component could not plot a precise location even if it
// wanted to: about a kilometre is all it is given.
//
// Leaflet's stylesheet is imported from node_modules, never from a CDN, for the
// reasons set out in ConfirmMap.tsx. The parent imports this file with
// next/dynamic and ssr: false, so the CSS stays inside this chunk.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { publicPoint } from "@/lib/datum/geo";

interface MapSite {
  publicLat: number;
  publicLng: number;
  locality: string | null;
  analyzedAt: string;
}

/** The same hex copies of the tokens the sheet builders and ConfirmMap use. */
const OTHER_SITE = "#4A6B4A";
const CURRENT_SITE = "#2D5A27";
const PAPER = "#FBFCFA";

interface Props {
  /** The confirmed point of the site on screen, snapped here for the highlight. */
  lat: number | null;
  lng: number | null;
}

export default function SitesMap({ lat, lng }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const [sites, setSites] = useState<MapSite[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/datum/memory/map");
        const body = (await response.json()) as {
          sites?: MapSite[];
          memoryStatus?: string;
        };
        if (cancelled) return;
        // An offline read returns an empty list, which is not a count of zero.
        // Saying "0 points" there would present a fallback as a measurement.
        if (
          !response.ok ||
          !Array.isArray(body.sites) ||
          body.memoryStatus === "offline"
        ) {
          setFailed(true);
          return;
        }
        setSites(body.sites);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sites) return;
    let cancelled = false;
    let created: LeafletMap | null = null;

    async function boot() {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !container.current || map.current || !sites) return;

      const here =
        lat !== null && lng !== null ? publicPoint(lat, lng) : null;

      created = leaflet.map(container.current, {
        center: here ? [here.lat, here.lng] : [39.5, -98.35],
        zoom: here ? 6 : 4,
        scrollWheelZoom: false,
      });
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        })
        .addTo(created);

      const markers: CircleMarker[] = [];
      for (const site of sites) {
        const isCurrent =
          here !== null &&
          Math.abs(site.publicLat - here.lat) < 1e-9 &&
          Math.abs(site.publicLng - here.lng) < 1e-9;
        const marker = leaflet
          .circleMarker([site.publicLat, site.publicLng], {
            radius: isCurrent ? 8 : 5,
            color: isCurrent ? CURRENT_SITE : OTHER_SITE,
            weight: isCurrent ? 3 : 1,
            fillColor: isCurrent ? CURRENT_SITE : PAPER,
            fillOpacity: isCurrent ? 0.9 : 0.6,
          })
          .addTo(created);
        marker.bindTooltip(site.locality ?? "Locality not recorded");
        markers.push(marker);
      }

      if (markers.length > 1) {
        created.fitBounds(
          leaflet.featureGroup(markers).getBounds().pad(0.2),
          { maxZoom: 9 },
        );
      }

      map.current = created;
    }

    void boot();
    return () => {
      cancelled = true;
      if (created) created.remove();
      map.current = null;
    };
  }, [lat, lng, sites]);

  return (
    <section className="card overflow-hidden p-0" data-datum-sites-map>
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-3 pt-4">
        <p className="eyebrow">Analyzed sites</p>
        <p className="meta" data-sites-count={sites ? sites.length : undefined}>
          {failed
            ? "The map of analyzed sites could not be loaded."
            : sites === null
              ? "Loading the analyzed sites"
              : `${sites.length} ${sites.length === 1 ? "point" : "points"}, snapped to about a kilometre`}
        </p>
      </div>
      <div
        ref={container}
        className="h-[420px] w-full border-t border-[var(--color-line)]"
        aria-label="Map of the sites Datum has analyzed"
      />
    </section>
  );
}
