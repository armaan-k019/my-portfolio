"use client";

// The Site Memory panel. SPEC.md section 14, PHASE-3 step 3.5.
//
// Sits under the sheet. Once every layer has settled the panel asks the server
// to compute this site's metrics from what it stored, and shows where the site
// falls among the analyzed population. Nothing is computed here: the numbers
// come from the route, so the panel and the database can never disagree.

import { useEffect, useRef, useState } from "react";
import { METRIC_LABELS, type MetricName } from "@/lib/datum/metrics";

export interface PercentileEntry {
  metric: string;
  label: string;
  percentile: number;
}

export interface SimilarSite {
  locality: string | null;
  publicLat: number;
  publicLng: number;
  match: number;
  closest: string[];
}

export interface MemoryContext {
  memoryStatus: "online" | "offline";
  n: number | null;
  percentiles: PercentileEntry[] | null;
  similar: SimilarSite[] | null;
  reasonIfNull: string | null;
}

/** The offline line from SPEC section 13, item 3 of the paused database rules. */
const OFFLINE_LINE = "Site Memory is offline; this analysis will not be saved.";

function labelFor(metric: string): string {
  return METRIC_LABELS[metric as MetricName] ?? metric;
}

/** "sun, wind speed, and relief", the way a sentence would say it. */
function joinComponents(components: string[]): string {
  const names = components.map(labelFor);
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

interface Props {
  siteId: string | null;
  /** True once every layer has settled, which is when the metrics can be computed. */
  ready: boolean;
}

export default function MemoryPanel({ siteId, ready }: Props) {
  // One piece of state, written only from the asynchronous body below. The
  // effect itself sets nothing, so asking the server cannot cascade a render.
  const [answer, setAnswer] = useState<
    { site: string; context: MemoryContext | null } | null
  >(null);
  // The site the panel has already asked about, so a re-render does not ask
  // again and a stale answer cannot write into a newer site's panel.
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!siteId || !ready) return;
    if (asked.current === siteId) return;
    asked.current = siteId;

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/datum/memory/context", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ siteId }),
        });
        const body = (await response.json()) as MemoryContext & {
          error?: unknown;
        };
        if (cancelled) return;
        const usable =
          response.ok && typeof body.memoryStatus === "string" ? body : null;
        setAnswer({ site: siteId, context: usable });
      } catch {
        if (!cancelled) setAnswer({ site: siteId, context: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, siteId]);

  if (!siteId || !ready) return null;

  // An answer for another site is no answer for this one.
  const current = answer && answer.site === siteId ? answer : null;
  const context = current ? current.context : null;
  const status = current === null ? "loading" : context === null ? "error" : "done";
  const offline = context !== null && context.memoryStatus === "offline";

  return (
    <section className="card" data-datum-memory>
      <p className="eyebrow">Site Memory</p>

      {status === "loading" ? (
        <p className="meta mt-3">Placing this site among the ones already analyzed</p>
      ) : null}

      {status === "error" ? (
        <p className="meta mt-3">{OFFLINE_LINE}</p>
      ) : null}

      {offline ? <p className="meta mt-3">{OFFLINE_LINE}</p> : null}

      {context && !offline ? (
        <>
          <p className="meta mt-3" data-memory-count>
            {context.n === null
              ? "Site Memory could not report how many sites it holds."
              : `Site Memory holds ${context.n} analyzed ${
                  context.n === 1 ? "site" : "sites"
                }.`}
          </p>

          {context.percentiles && context.percentiles.length > 0 ? (
            <ul className="mt-4 space-y-1" data-memory-percentiles>
              {context.percentiles.map((entry) => (
                <li
                  key={entry.metric}
                  className="text-sm text-[var(--color-brown)]"
                  data-memory-percentile={entry.metric}
                  data-memory-percentile-value={entry.percentile}
                >
                  {entry.label} {entry.percentile}% of analyzed sites
                </li>
              ))}
            </ul>
          ) : null}

          {context.similar && context.similar.length > 0 ? (
            <div className="mt-6" data-memory-similar>
              <p className="eyebrow">Sites like this</p>
              <ul className="mt-2 space-y-2">
                {context.similar.map((site) => (
                  <li
                    key={`${site.publicLat},${site.publicLng},${site.match}`}
                    className="text-sm text-[var(--color-brown)]"
                  >
                    <span>{site.locality ?? "Locality not recorded"}</span>
                    <span className="meta ml-2" data-memory-match={site.match}>
                      {site.match}% match
                    </span>
                    {site.closest.length > 0 ? (
                      <span className="meta ml-2">
                        closest on {joinComponents(site.closest)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {context.reasonIfNull ? (
            <p className="meta mt-4" data-memory-reason>
              {context.reasonIfNull}
            </p>
          ) : null}
        </>
      ) : null}

      <div className="rule mt-6" />
      <p className="meta mt-3">
        Percentiles and matches are computed from the analyses Site Memory has
        stored. A site is placed only on the layers that answered for it.
      </p>
    </section>
  );
}
