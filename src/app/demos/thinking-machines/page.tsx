"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { CACHED_EXPLANATIONS } from "./cached";
import { MAX_BATCH, REQUESTS, SAMPLES, sweep, type Explanation, type SplitResult } from "./probe";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #121314; --ct-card-bg: #1a1b1d; --ct-card-border: #2b2d30;
  --ct-text: #e8e8e6; --ct-muted: #a3a4a2; --ct-dim: #6c6e70;
  --ct-accent: #9fb7d4; --ct-accent-bg: #1f2630;
  --ct-header-bg: #121314; --ct-header-border: #2b2d30; --ct-header-text: #e8e8e6;
}
`;

const TOKEN_COLOR = ["#9fb7d4", "#e0a43f"] as const;

// Prints a float32 logit and marks where it first differs from `other`.
function Logit({ value, other, color }: { value: number; other: number; color: string }) {
  const a = value.toFixed(9);
  const b = other.toFixed(9);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return (
    <span className="font-mono tabular-nums">
      <span style={{ color: CSS_VAR_COLORS.dim }}>{a.slice(0, i)}</span>
      <span style={{ color }}>{a.slice(i)}</span>
    </span>
  );
}

export default function ThinkingMachinesPage() {
  const C = CSS_VAR_COLORS;

  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [invariant, setInvariant] = useState(false);
  const [rangeIdx, setRangeIdx] = useState(1);
  const [explanations, setExplanations] = useState<Partial<Record<string, Explanation>>>(CACHED_EXPLANATIONS);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sample = SAMPLES.find((s) => s.id === sampleId) ?? SAMPLES[0];
  const result = useMemo(() => sweep(sample), [sample]);
  const explanation = explanations[sample.id];

  const explain = useCallback(async (id: string) => {
    setError(null);
    setLoading(id);
    try {
      const res = await fetch("/api/demos/thinking-machines/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: id }),
      });
      const json = (await res.json()) as { explanation?: Explanation; error?: string };
      if (!res.ok || !json.explanation) throw new Error(json.error ?? "No explanation returned.");
      setExplanations((e) => ({ ...e, [id]: json.explanation }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    if (!explanations[sample.id] && loading !== sample.id) explain(sample.id);
    // Only refetch when the sample changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample.id]);

  const picked: SplitResult = invariant ? result.invariant : result.configs[rangeIdx];
  const tally = invariant ? result.invariantTally : result.tally;
  const [t0, t1] = sample.tokens;
  const gapUlps = (result.exact[0] - result.exact[1]) / result.ulp;

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Nondeterminism Probe
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Thinking Machines
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Watch server load flip a temperature 0 token through float32 reduction order.
              </p>
            </div>
            <span className="text-xs flex-shrink-0" style={{ color: C.dim }}>
              Demo by{" "}
              <Link href="/" className="underline hover:opacity-70 transition-opacity" style={{ color: C.muted }}>
                Armaan Kazi
              </Link>
            </span>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/demos" className="text-xs mb-6 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            One decoding step in your browser: a split-K matmul whose split count follows batch size, as in the{" "}
            <a
              href="https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/"
              className="underline hover:opacity-70"
              style={{ color: C.text }}
            >
              batch invariance post
            </a>
            . Weights are made up to nearly tie.
          </p>

          <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSampleId(s.id)}
                className="px-3 py-1.5 rounded border font-mono"
                style={{
                  borderColor: s.id === sample.id ? C.accent : C.cardBorder,
                  color: s.id === sample.id ? C.accent : C.muted,
                  backgroundColor: s.id === sample.id ? C.accentBg : "transparent",
                }}
              >
                {s.label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 cursor-pointer select-none" style={{ color: C.muted }}>
              <input
                type="checkbox"
                checked={invariant}
                onChange={(e) => setInvariant(e.target.checked)}
                style={{ accentColor: TOKEN_COLOR[0] }}
              />
              Batch-invariant kernel
            </label>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <section className="rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex gap-[3px] mb-5" role="group" aria-label="Batch size ranges">
                {result.ranges.map((r, i) => {
                  const w = invariant ? result.invariant.winner : result.configs[i].winner;
                  const on = i === rangeIdx;
                  return (
                    <button
                      key={r.from}
                      onClick={() => setRangeIdx(i)}
                      className="flex-1 min-w-0 rounded-[3px] px-1.5 py-2 text-left font-mono transition-opacity"
                      style={{
                        backgroundColor: TOKEN_COLOR[w],
                        color: "#121314",
                        opacity: on ? 1 : 0.5,
                        outline: on ? `1px solid ${C.text}` : "none",
                        outlineOffset: 2,
                      }}
                    >
                      <span className="block text-[11px] font-semibold">{r.from}-{r.to}</span>
                      <span className="block text-[10px]">{invariant ? "1 split" : `${r.splits} splits`}</span>
                    </button>
                  );
                })}
              </div>

              <table className="w-full text-sm mb-5">
                <tbody>
                  {[0, 1].map((t) => (
                    <tr key={t} className="border-t" style={{ borderColor: C.cardBorder }}>
                      <td className="py-2 font-mono text-xs" style={{ color: TOKEN_COLOR[t] }}>
                        {JSON.stringify(sample.tokens[t])}
                      </td>
                      <td className="py-2 text-right text-xs">
                        <Logit value={picked.logits[t]} other={picked.logits[1 - t]} color={C.text} />
                      </td>
                      <td className="py-2 pl-3 text-right text-[11px] font-mono w-12" style={{ color: TOKEN_COLOR[t] }}>
                        {picked.winner === t ? "argmax" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] font-mono mb-5" style={{ color: C.dim }}>
                float64 gap: {gapUlps.toFixed(2)} ulp
              </p>

              <div className="text-xs font-mono mb-1.5" style={{ color: C.dim }}>
                {REQUESTS.toLocaleString()} requests, random load (batch 1-{MAX_BATCH})
              </div>
              <div className="flex h-6 rounded-[3px] overflow-hidden mb-1.5">
                {[0, 1].map((t) =>
                  tally[t] > 0 ? (
                    <div key={t} style={{ flex: tally[t], backgroundColor: TOKEN_COLOR[t] }} />
                  ) : null,
                )}
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span style={{ color: TOKEN_COLOR[0] }}>
                  {tally[0].toLocaleString()} {JSON.stringify(t0)}
                </span>
                <span style={{ color: TOKEN_COLOR[1] }}>
                  {tally[1].toLocaleString()} {JSON.stringify(t1)}
                </span>
              </div>
            </section>

            <section className="rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="text-xs font-mono mb-3" style={{ color: C.dim }}>
                Claude
              </div>
              {explanation ? (
                <div className="space-y-3 text-sm leading-relaxed">
                  <p style={{ color: C.text }}>{explanation.summary}</p>
                  <p style={{ color: C.muted }}>{explanation.why}</p>
                  <p style={{ color: C.muted }}>{explanation.fix}</p>
                </div>
              ) : loading === sample.id ? (
                <p className="text-xs font-mono" style={{ color: C.dim }}>
                  Reading the sweep.
                </p>
              ) : error ? (
                <p className="text-xs" style={{ color: C.muted }}>
                  {error}{" "}
                  <button onClick={() => explain(sample.id)} className="underline" style={{ color: C.text }}>
                    Retry
                  </button>
                </p>
              ) : null}
            </section>
          </div>
        </div>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Thinking Machines. A toy, not a real model.
          </p>
        </footer>
      </div>
    </>
  );
}
