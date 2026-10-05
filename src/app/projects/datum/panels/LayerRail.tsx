"use client";

// The per layer status rail beside the sheet. PHASE-2-sheet.md step 2.4.
//
// The sheet itself carries the unavailable panels; this rail carries the retry
// buttons, because a button inside an SVG that is also an export target would
// have to be stripped before download, and stripping is how a sheet and its
// file drift apart.

import type { LayerName } from "@/lib/datum/types";
import { LAYER_NAMES } from "@/lib/datum/types";
import type { LayerState } from "../analysis";

interface Props {
  layers: Partial<Record<LayerName, LayerState>>;
  onRetry: (layer: LayerName) => void;
}

const LABEL: Record<LayerName, string> = {
  sun: "Sun path",
  climate: "Climate and wind",
  topo: "Topography",
  seismic: "Seismic",
  soil: "Soil",
  osm: "Figure ground",
  walkshed: "Walk shed",
  flood: "Flood",
  census: "Demographics",
};

function statusOf(state: LayerState | undefined): string {
  if (state === undefined) return "waiting";
  if (state === "loading") return "loading";
  return state.status;
}

export default function LayerRail({ layers, onRetry }: Props) {
  return (
    <div className="card p-5" data-datum-rail>
      <p className="eyebrow">Sources</p>
      <div className="hairline mt-3" />
      <ul className="mt-3 space-y-2.5">
        {LAYER_NAMES.map((layer) => {
          const state = layers[layer];
          const status = statusOf(state);
          const envelope = state && state !== "loading" ? state : null;
          const retryable =
            envelope?.status === "unavailable" &&
            envelope.unavailable?.retryable === true;
          return (
            <li key={layer} data-layer={layer} data-layer-status={status}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-[var(--color-brown)]">
                  {LABEL[layer]}
                </span>
                <span
                  className="meta shrink-0"
                  style={{
                    color:
                      status === "unavailable"
                        ? "var(--color-terracotta)"
                        : undefined,
                  }}
                >
                  {status === "unavailable" && envelope?.unavailable
                    ? envelope.unavailable.code
                    : status}
                </span>
              </div>
              {envelope?.unavailable ? (
                <p className="mt-1 text-xs leading-snug text-[var(--color-brown-light)]">
                  {envelope.unavailable.message}
                </p>
              ) : null}
              {retryable ? (
                <button
                  type="button"
                  onClick={() => onRetry(layer)}
                  data-retry={layer}
                  className="mt-1.5 rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-terracotta)]"
                >
                  Retry{layer === "osm" ? " (also refires the walk shed)" : ""}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
