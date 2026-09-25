"use client";

// The citation chips under the sheet. SPEC.md section 12.
//
// Every bracketed reference Claude wrote becomes one chip. A chip whose path
// matched a field of an available layer is live: hovering it highlights the
// panel that carries the field, so the claim and its evidence are on screen
// together. A chip whose path matched nothing is struck through and says so,
// because a citation that is not a data field is the one thing the server side
// check exists to surface.
//
// This is an HTML strip beneath the drawing, not part of it. The exported SVG
// carries the citations inline in the brief text and nothing from here.

import { extractCitations } from "@/lib/datum/brief/citations";

/**
 * The panel that carries each layer's fields. A citation is `layer.path`, so
 * the layer name is everything before the first dot.
 */
const PANEL_FOR_LAYER: Record<string, string> = {
  sun: "sun-path",
  climate: "climate",
  topo: "topography-section",
  seismic: "seismic",
  soil: "soil",
  osm: "site-plan",
  walkshed: "walk-shed",
  flood: "flood-summary",
  census: "demographics",
};

/** The group a citation points at, or null when nothing on the sheet owns it. */
export function panelForCitation(citation: string): string | null {
  const layer = citation.split(".")[0];
  // The wind roses are their own panel, drawn from the climate envelope.
  if (citation.startsWith("climate.wind")) return "wind-rose";
  return PANEL_FOR_LAYER[layer] ?? null;
}

interface Props {
  briefText: string;
  validCitations: string[];
  invalidCitations: string[];
  /** Called with the group id to highlight, or null to clear it. */
  onHighlight: (groupId: string | null) => void;
}

export default function CitationChips({
  briefText,
  validCitations,
  invalidCitations,
  onHighlight,
}: Props) {
  const valid = new Set(validCitations);
  const invalid = new Set(invalidCitations);
  const citations = extractCitations(briefText);
  if (citations.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-line)] px-5 py-4">
      <p className="eyebrow">
        {valid.size} verified {valid.size === 1 ? "citation" : "citations"}
        {invalid.size > 0
          ? `, ${invalid.size} not a data field`
          : ", every reference is a field on this sheet"}
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5" data-citation-chips>
        {citations.map((citation) => {
          // A citation the server did not put in either list is treated as
          // invalid: only a path it matched against the envelopes is verified.
          const isValid = valid.has(citation) && !invalid.has(citation);
          const panel = isValid ? panelForCitation(citation) : null;
          return (
            <li key={citation}>
              <span
                data-citation-chip={citation}
                data-citation-valid={isValid ? "true" : "false"}
                data-citation-panel={panel ?? ""}
                title={isValid ? `Highlights the ${panel} panel` : "not a data field"}
                onMouseEnter={() => onHighlight(panel)}
                onMouseLeave={() => onHighlight(null)}
                onFocus={() => onHighlight(panel)}
                onBlur={() => onHighlight(null)}
                tabIndex={0}
                className={
                  "coord inline-block rounded-full border px-2.5 py-1 text-[11px] leading-none " +
                  (isValid
                    ? "cursor-default border-[var(--color-line)] text-[var(--color-brown)] hover:border-[var(--color-terracotta)] hover:text-[var(--color-terracotta)]"
                    : "cursor-help border-[var(--color-terracotta)] text-[var(--color-terracotta)] line-through")
                }
              >
                {citation}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
