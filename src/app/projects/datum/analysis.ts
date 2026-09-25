"use client";

// Client side orchestration for the site sheet. SPEC.md sections 3, 7, 12.
//
// One hook owns the whole run: geocode, confirm, create the site record, fire
// the nine layer requests, then open the streaming brief once the layers have
// settled. Nothing here fetches an upstream directly: every request goes to a
// route under /api/datum.

import { useCallback, useMemo, useRef, useState } from "react";
import { LAYER_NAMES, type LayerEnvelope, type LayerName } from "@/lib/datum/types";

export type Stage = "idle" | "geocoding" | "confirm" | "analyzing" | "done";

export type LayerState = LayerEnvelope<unknown> | "loading";

export interface ResolvedPoint {
  lat: number;
  lng: number;
  displayName: string;
  locality: string | null;
}

export interface SiteRecord {
  siteId: string;
  siteKey: string;
  locality: string | null;
  tract: { geoid: string } | null;
  memoryStatus: "online" | "offline";
}

export interface BriefState {
  status: "idle" | "streaming" | "done" | "error";
  text: string;
  validCitations: string[];
  invalidCitations: string[];
  uncitedNumericSentences: number;
  error: string | null;
}

const EMPTY_BRIEF: BriefState = {
  status: "idle",
  text: "",
  validCitations: [],
  invalidCitations: [],
  uncitedNumericSentences: 0,
  error: null,
};

/**
 * SPEC section 7: everything but the walk shed fires at once; the walk shed
 * waits for osm, because the two share one Overpass fetch through the cache and
 * Overpass allows two slots per IP.
 */
const IMMEDIATE_LAYERS = LAYER_NAMES.filter((layer) => layer !== "walkshed");

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** An envelope for a layer whose request never produced one. */
function transportFailure(layer: LayerName, message: string): LayerEnvelope<unknown> {
  return {
    layer,
    status: "unavailable",
    data: null,
    source: {
      name: "Datum layer route",
      url: `/api/datum/layers/${layer}`,
      fetchedAt: new Date().toISOString(),
      cached: false,
      licence: "",
    },
    unavailable: { code: "upstream_error", message, retryable: true },
    fieldPaths: [],
  };
}

export function useAnalysis(isTest: boolean) {
  const [stage, setStage] = useState<Stage>("idle");
  const [point, setPoint] = useState<ResolvedPoint | null>(null);
  const [site, setSite] = useState<SiteRecord | null>(null);
  const [layers, setLayers] = useState<Partial<Record<LayerName, LayerState>>>({});
  const [brief, setBrief] = useState<BriefState>(EMPTY_BRIEF);
  const [error, setError] = useState<string | null>(null);

  // The envelopes as they settle, for the brief's offline fallback body. State
  // updates are batched, so the request needs a copy it can read synchronously.
  const settled = useRef<Partial<Record<LayerName, LayerEnvelope<unknown>>>>({});
  const briefStarted = useRef(false);

  const loadingCount = useMemo(
    () => LAYER_NAMES.filter((layer) => layers[layer] === "loading").length,
    [layers],
  );
  const started = stage === "analyzing" || stage === "done";

  const record = useCallback((layer: LayerName, envelope: LayerEnvelope<unknown>) => {
    settled.current[layer] = envelope;
    setLayers((previous) => ({ ...previous, [layer]: envelope }));
  }, []);

  const fetchLayer = useCallback(
    async (layer: LayerName, siteId: string) => {
      setLayers((previous) => ({ ...previous, [layer]: "loading" }));
      try {
        const response = await fetch(
          `/api/datum/layers/${layer}?site=${encodeURIComponent(siteId)}`,
        );
        const body = await readJson(response);
        if (!response.ok || !body || typeof body !== "object" || !("layer" in body)) {
          const message =
            body && typeof body === "object" && "error" in body
              ? String((body as { error: { message?: string } }).error?.message ?? "")
              : "";
          record(
            layer,
            transportFailure(
              layer,
              message.length > 0
                ? message
                : `The ${layer} request failed (HTTP ${response.status}). Retry in a moment.`,
            ),
          );
          return;
        }
        record(layer, body as LayerEnvelope<unknown>);
      } catch {
        record(
          layer,
          transportFailure(
            layer,
            `The ${layer} request could not be sent. Check the connection and retry.`,
          ),
        );
      }
    },
    [record],
  );

  const runBrief = useCallback(async (siteId: string) => {
    setBrief({ ...EMPTY_BRIEF, status: "streaming" });
    try {
      const response = await fetch("/api/datum/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, layers: settled.current }),
      });
      if (!response.ok || !response.body) {
        const body = await readJson(response);
        const message =
          body && typeof body === "object" && "error" in body
            ? String((body as { error: { message?: string } }).error?.message ?? "")
            : "The brief request failed.";
        setBrief({ ...EMPTY_BRIEF, status: "error", error: message });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";

      // Server Sent Events: blank line separated records of "event:" and
      // "data:" lines (SPEC section 12).
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const record_ = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          split = buffer.indexOf("\n\n");

          let name = "message";
          let payload = "";
          for (const rawLine of record_.split("\n")) {
            if (rawLine.startsWith("event:")) name = rawLine.slice(6).trim();
            else if (rawLine.startsWith("data:")) payload += rawLine.slice(5).trim();
          }
          if (payload.length === 0) continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (name === "delta" && typeof data.text === "string") {
            text += data.text;
            setBrief((previous) => ({ ...previous, text }));
          } else if (name === "done") {
            setBrief({
              status: "done",
              text,
              validCitations: Array.isArray(data.validCitations)
                ? (data.validCitations as string[])
                : [],
              invalidCitations: Array.isArray(data.invalidCitations)
                ? (data.invalidCitations as string[])
                : [],
              uncitedNumericSentences:
                typeof data.uncitedNumericSentences === "number"
                  ? data.uncitedNumericSentences
                  : 0,
              error: null,
            });
          } else if (name === "error") {
            setBrief({
              ...EMPTY_BRIEF,
              text,
              status: "error",
              error: typeof data.message === "string" ? data.message : "The brief failed.",
            });
          }
        }
      }
    } catch {
      setBrief({
        ...EMPTY_BRIEF,
        status: "error",
        error: "The brief stream was interrupted.",
      });
    }
  }, []);

  /** Suggestions come from Photon; the submit path never uses them. */
  const suggest = useCallback(async (query: string) => {
    const response = await fetch(`/api/datum/suggest?q=${encodeURIComponent(query)}`);
    const body = (await readJson(response)) as {
      suggestions?: Array<{ label: string; lat: number; lng: number }>;
    } | null;
    return body?.suggestions ?? [];
  }, []);

  /** Submit: one Nominatim request, then the confirm step. Nothing else runs. */
  const geocode = useCallback(async (query: string) => {
    setError(null);
    setStage("geocoding");
    try {
      const response = await fetch("/api/datum/geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: query }),
      });
      const body = (await readJson(response)) as
        | (ResolvedPoint & { error?: { message?: string } })
        | null;
      if (!response.ok || !body || typeof body.lat !== "number") {
        setStage("idle");
        setError(
          response.status === 404
            ? "That address did not resolve. Try a fuller address."
            : (body?.error?.message ?? "Geocoding failed. Try again in a moment."),
        );
        return;
      }
      setPoint({
        lat: body.lat,
        lng: body.lng,
        displayName: body.displayName,
        locality: body.locality,
      });
      setStage("confirm");
    } catch {
      setStage("idle");
      setError("Geocoding could not be reached.");
    }
  }, []);

  /** The confirm step can move the marker, so the point is passed back in. */
  const confirm = useCallback(
    async (confirmed: { lat: number; lng: number }) => {
      setError(null);
      setStage("analyzing");
      briefStarted.current = false;
      settled.current = {};
      setBrief(EMPTY_BRIEF);
      setLayers(
        Object.fromEntries(LAYER_NAMES.map((layer) => [layer, "loading" as LayerState])),
      );

      let created: SiteRecord;
      try {
        const response = await fetch("/api/datum/site", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: confirmed.lat, lng: confirmed.lng, isTest }),
        });
        const body = (await readJson(response)) as
          | (SiteRecord & { error?: { code?: string } })
          | null;
        if (!response.ok || !body || typeof body.siteId !== "string") {
          setStage("confirm");
          setLayers({});
          setError(
            body?.error?.code === "rate_limited"
              ? "The daily analysis limit for this address has been reached. Try again tomorrow."
              : "The site record could not be created.",
          );
          return;
        }
        created = body;
      } catch {
        setStage("confirm");
        setLayers({});
        setError("The site record could not be created.");
        return;
      }

      setSite(created);
      setPoint((previous) =>
        previous
          ? { ...previous, lat: confirmed.lat, lng: confirmed.lng }
          : {
              lat: confirmed.lat,
              lng: confirmed.lng,
              displayName: "",
              locality: created.locality,
            },
      );

      await Promise.all(
        IMMEDIATE_LAYERS.map((layer) => fetchLayer(layer, created.siteId)),
      );
      await fetchLayer("walkshed", created.siteId);

      setStage("done");
      if (!briefStarted.current) {
        briefStarted.current = true;
        void runBrief(created.siteId);
      }
    },
    [fetchLayer, isTest, runBrief],
  );

  /** Retrying osm re-fires the walk shed, because they share one fetch. */
  const retry = useCallback(
    async (layer: LayerName) => {
      if (!site) return;
      await fetchLayer(layer, site.siteId);
      if (layer === "osm") await fetchLayer("walkshed", site.siteId);
    },
    [fetchLayer, site],
  );

  const reset = useCallback(() => {
    setStage("idle");
    setPoint(null);
    setSite(null);
    setLayers({});
    setBrief(EMPTY_BRIEF);
    setError(null);
    settled.current = {};
    briefStarted.current = false;
  }, []);

  return {
    stage,
    point,
    setPoint,
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
  };
}
