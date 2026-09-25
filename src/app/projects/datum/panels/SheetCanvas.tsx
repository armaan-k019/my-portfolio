"use client";

// The on screen sheet. PHASE-2-sheet.md step 2.4.
//
// One shared <svg viewBox="0 0 2592 1728"> that scales to the container width.
// Each top level group is the string the builder produced, rendered through
// dangerouslySetInnerHTML: the same strings the export concatenates, so what is
// on screen is what is exported. The builders escape every text value, and no
// string here carries anything a user typed.

import { GROUP_ORDER } from "@/lib/datum/sheet/layout";
import { buildSheetDefs } from "@/lib/datum/sheet/sheet";

/**
 * The loading hairline animates on screen only. It lives here, not in a builder
 * and not in globals.css: the exported document carries no style element and no
 * animation, and nothing outside this page needs the rule.
 */
const PULSE_CSS =
  ".datum-pulse{animation:datum-pulse 1.6s ease-in-out infinite}" +
  "@keyframes datum-pulse{0%,100%{opacity:.18}50%{opacity:.6}}" +
  "@media (prefers-reduced-motion:reduce){.datum-pulse{animation:none}}";

interface Props {
  groups: Record<string, string>;
  loadingCount: number;
  briefStatus: string;
}

export default function SheetCanvas({ groups, loadingCount, briefStatus }: Props) {
  return (
    <div
      className="card overflow-hidden p-0"
      data-datum-sheet
      data-loading-count={loadingCount}
      data-brief-status={briefStatus}
    >
      <svg
        viewBox="0 0 2592 1728"
        className="block w-full"
        role="img"
        aria-label="Site analysis sheet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>{PULSE_CSS}</style>
        <g dangerouslySetInnerHTML={{ __html: buildSheetDefs() }} />
        <rect x={0} y={0} width={2592} height={1728} fill="#FBFCFA" />
        {GROUP_ORDER.map((id) => (
          <g
            key={id}
            data-group={id}
            dangerouslySetInnerHTML={{ __html: groups[id] ?? "" }}
          />
        ))}
      </svg>
    </div>
  );
}
