"use client";

// The on screen sheet. PHASE-2-sheet.md step 2.4.
//
// Each top level group is the string the builder produced, rendered through
// dangerouslySetInnerHTML: the same strings the export concatenates, so what is
// on screen is what is exported. The builders escape every text value, and no
// string here carries anything a user typed.
//
// The <svg> itself belongs to SheetViewer, which owns the viewBox: the sheet is
// read at a zoom the reader chooses rather than squeezed into the column. The
// content below is identical either way, and the export never sees the view.
//
// The citation chips sit under the drawing as HTML, and hovering one dims every
// panel but the one that carries the cited field (SPEC section 12). Nothing
// about that state reaches the export: `buildSheet` is called with its own
// context and never sees the highlight.

import { useState } from "react";
import { GROUP_ORDER } from "@/lib/datum/sheet/layout";
import { buildSheetDefs } from "@/lib/datum/sheet/sheet";
import CitationChips from "./CitationChips";
import SheetViewer from "./SheetViewer";

/**
 * The loading hairline animates on screen only, and the highlight dims the
 * panels a hovered chip does not cite. Both live here, not in a builder and not
 * in globals.css: the exported document carries no style element, no animation,
 * and no highlight, and nothing outside this page needs the rules.
 */
const SHEET_CSS =
  ".datum-pulse{animation:datum-pulse 1.6s ease-in-out infinite}" +
  "@keyframes datum-pulse{0%,100%{opacity:.18}50%{opacity:.6}}" +
  "g[data-group]{transition:opacity .15s ease-in-out}" +
  'svg[data-highlighting="true"] g[data-group]:not([data-highlight="true"])' +
  "{opacity:.15}" +
  "@media (prefers-reduced-motion:reduce){.datum-pulse{animation:none}" +
  "g[data-group]{transition:none}}";

interface Props {
  groups: Record<string, string>;
  loadingCount: number;
  briefStatus: string;
  /** The brief as written, which is where the chips read their citations. */
  briefText: string;
  /** The server's verdict on the brief's citations, for the acceptance checks. */
  validCitations: string[];
  invalidCitations: string[];
}

export default function SheetCanvas({
  groups,
  loadingCount,
  briefStatus,
  briefText,
  validCitations,
  invalidCitations,
}: Props) {
  const [highlight, setHighlight] = useState<string | null>(null);

  return (
    <div
      className="card overflow-hidden p-0"
      data-datum-sheet
      data-loading-count={loadingCount}
      data-brief-status={briefStatus}
      data-brief-valid={validCitations.join(" ")}
      data-brief-invalid={invalidCitations.join(" ")}
      data-highlight-group={highlight ?? ""}
    >
      <SheetViewer highlighting={highlight !== null}>
        <style>{SHEET_CSS}</style>
        <g dangerouslySetInnerHTML={{ __html: buildSheetDefs() }} />
        <rect x={0} y={0} width={2592} height={1728} fill="#FBFCFA" />
        {GROUP_ORDER.map((id) => (
          <g
            key={id}
            data-group={id}
            data-highlight={id === highlight ? "true" : undefined}
            dangerouslySetInnerHTML={{ __html: groups[id] ?? "" }}
          />
        ))}
      </SheetViewer>
      <CitationChips
        briefText={briefText}
        validCitations={validCitations}
        invalidCitations={invalidCitations}
        onHighlight={setHighlight}
      />
    </div>
  );
}
