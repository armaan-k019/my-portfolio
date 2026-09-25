"use client";

// The site sheet application. SPEC.md sections 3, 6, 11.
//
// Address, confirm map, progressive panels, streaming brief, SVG export. The
// orchestration lives in analysis.ts; this file is the composition and the
// export, which is the one thing that must never produce an invalid file.

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { buildSheetGroups, sheetDocument, sheetFileName } from "@/lib/datum/sheet/sheet";
import type { SheetContext } from "@/lib/datum/sheet/sheet";
import { LAYER_NAMES, type LayerEnvelope, type LayerName } from "@/lib/datum/types";
import AddressField from "./AddressField";
import LayerRail from "./panels/LayerRail";
import SheetCanvas from "./panels/SheetCanvas";
import { briefFailedChecks } from "@/lib/datum/brief/citations";
import { useAnalysis } from "./analysis";

// Leaflet is a heavy client dependency and belongs to this one component.
const ConfirmMap = dynamic(() => import("./ConfirmMap"), {
  ssr: false,
  loading: () => (
    <div className="card flex h-[420px] items-center justify-center">
      <p className="meta">Loading the map</p>
    </div>
  ),
});

/**
 * `?test=1` marks the run as a test so the e2e site rows are flagged. The
 * server honours it only when DATUM_ALLOW_TEST_FLAG=1, so it does nothing in
 * production whatever the query string says.
 */
function readTestFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("test") === "1";
}

export default function SiteSheetApp() {
  const [isTest] = useState(readTestFlag);
  const analysis = useAnalysis(isTest);
  const [exportError, setExportError] = useState<string | null>(null);

  const {
    stage,
    point,
    site,
    layers,
    brief,
    error,
    loadingCount,
    started,
    suggest,
    geocode,
    confirm,
    retry,
    reset,
  } = analysis;

  const ctx: SheetContext = useMemo(() => {
    const settled: Partial<Record<LayerName, LayerEnvelope<unknown>>> = {};
    const loading: LayerName[] = [];
    for (const layer of LAYER_NAMES) {
      const state = layers[layer];
      if (state === "loading") loading.push(layer);
      else if (state) settled[layer] = state;
    }
    return {
      site: {
        lat: point?.lat ?? 0,
        lng: point?.lng ?? 0,
        locality: site?.locality ?? point?.locality ?? null,
        tractGeoid: site?.tract?.geoid ?? null,
      },
      generatedAt: new Date().toISOString(),
      layers: settled,
      brief:
        brief.text.trim().length > 0
          ? {
              text: brief.text,
              validCitations: brief.validCitations,
              invalidCitations: brief.invalidCitations,
            }
          : null,
      loading,
    };
  }, [brief, layers, point, site]);

  const groups = useMemo(() => buildSheetGroups(ctx), [ctx]);

  const unverified =
    brief.status === "done" &&
    briefFailedChecks({
      invalidCitations: brief.invalidCitations,
      validCitations: brief.validCitations,
      uncitedNumericSentences: brief.uncitedNumericSentences,
    });

  const exportSheet = useCallback(() => {
    setExportError(null);
    // The export is the same builder strings, joined. Nothing is re-derived, so
    // the file cannot disagree with the screen.
    const svg = sheetDocument({ ...ctx, loading: [] });

    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (parsed.getElementsByTagName("parsererror").length > 0) {
      const detail = parsed.getElementsByTagName("parsererror")[0].textContent;
      console.error("[datum] export failed validation", detail);
      setExportError("Export failed validation");
      return;
    }

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sheetFileName(ctx.site.lat, ctx.site.lng, ctx.generatedAt);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [ctx]);

  return (
    <div className="space-y-8">
      {stage === "idle" || stage === "geocoding" ? (
        <AddressField
          onSubmit={geocode}
          suggest={suggest}
          busy={stage === "geocoding"}
        />
      ) : null}

      {error ? (
        <p
          className="text-sm text-[var(--color-terracotta)]"
          role="alert"
          data-datum-error
        >
          {error}
        </p>
      ) : null}

      {stage === "confirm" && point ? (
        <ConfirmMap
          lat={point.lat}
          lng={point.lng}
          displayName={point.displayName}
          onConfirm={confirm}
          onChange={reset}
          busy={false}
        />
      ) : null}

      {started ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">
                {loadingCount > 0
                  ? `${loadingCount} of ${LAYER_NAMES.length} sources in flight`
                  : "All sources settled"}
              </p>
              <p className="coord mt-2 text-[var(--color-brown-light)]">
                {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : ""}
                {site?.locality ? `  ${site.locality}` : ""}
                {site?.memoryStatus === "offline"
                  ? "  Site Memory offline, this analysis will not be saved"
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {exportError ? (
                <span className="meta text-[var(--color-terracotta)]">
                  {exportError}
                </span>
              ) : null}
              <button
                type="button"
                onClick={exportSheet}
                disabled={loadingCount > 0}
                data-datum-export
                className="rounded-full bg-[var(--color-ink)] px-6 py-2.5 text-sm font-medium text-[var(--color-paper)] transition-opacity disabled:opacity-40"
              >
                Export SVG
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-full border border-[var(--color-line)] px-6 py-2.5 text-sm text-[var(--color-brown)]"
              >
                New site
              </button>
            </div>
          </div>

          {unverified ? (
            <p
              className="border border-[var(--color-terracotta)] px-4 py-3 text-sm text-[var(--color-terracotta)]"
              data-brief-unverified
            >
              This brief failed citation checks; treat it as unverified
            </p>
          ) : null}

          {brief.status === "error" && brief.error ? (
            <p className="meta text-[var(--color-terracotta)]">{brief.error}</p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <SheetCanvas
              groups={groups}
              loadingCount={loadingCount}
              briefStatus={brief.status}
              validCitations={brief.validCitations}
              invalidCitations={brief.invalidCitations}
            />
            <LayerRail layers={layers} onRetry={retry} />
          </div>

          <div className="tick-rule" />
          <p className="meta">
            Export is enabled once every source has settled. Unavailable panels
            export as unavailable panels, never blank and never with a stand in
            value.
          </p>
        </>
      ) : null}
    </div>
  );
}
