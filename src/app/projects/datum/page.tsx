import type { Metadata } from "next";
import SiteSheetApp from "./SiteSheetApp";

export const metadata: Metadata = {
  title: "Datum",
  description:
    "Enter an address and get an architectural site analysis sheet built from verified public data, exportable as layered vector SVG.",
};

export default function DatumPage() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 pb-24 pt-28 sm:px-10">
      <header className="max-w-3xl">
        <p className="eyebrow">Tool, site analysis</p>
        <h1 className="font-display display-lg mt-4 text-[var(--color-ink)]">
          Datum
        </h1>
        <div className="rule mt-6 w-full" />
        <p className="mt-6 text-base leading-relaxed text-[var(--color-brown)]">
          Type an address, confirm the point on the map, and Datum draws a
          36 by 24 inch site analysis sheet from ten public sources: figure
          ground and streets from OpenStreetMap, a walk shed computed from that
          street network, contours and sections from USGS 3DEP, seismic design
          values from the USGS ASCE 7-22 service, soil from the USDA SSURGO
          survey, flood hazard from the FEMA National Flood Hazard Layer,
          demographics from the Census ACS 5-year tables, and wind, climate, and
          a computed sun path from the Open-Meteo ERA5 archive.
        </p>
        <p className="mt-4 text-base leading-relaxed text-[var(--color-brown)]">
          Every number traces to a named source and a named field. A source that
          fails shows an unavailable panel with the reason and a retry button,
          never a default and never an estimate. Building heights print only
          where OpenStreetMap carries a height tag; nothing is inferred from
          floor counts. The brief is written by Claude and cites the data field
          behind every claim, and the citations are checked on the server before
          you see them.
        </p>
        <p className="meta mt-5">
          Export is true vector SVG with one named group per layer, ARCH D at
          true size, no raster tiles. It opens in Illustrator and Rhino as a
          tracing base.
        </p>
      </header>

      <div className="mt-14">
        <SiteSheetApp />
      </div>
    </main>
  );
}
