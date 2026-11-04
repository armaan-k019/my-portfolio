"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { CACHED_PICKS } from "./cached";
import { DOMAINS, type DomainId } from "./corpus";
import {
  CHECK_SAMPLES,
  DRAFT_COST,
  K_VALUES,
  TEMPERATURES,
  distributionCheck,
  generate,
  measure,
  models,
  type Check,
  type ClaudePick,
  type Generation,
  type Measurement,
  type TokenKind,
} from "./spec";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #121214; --ct-card-bg: #1a1a1e; --ct-card-border: #2c2c33;
  --ct-text: #e9e8ec; --ct-muted: #a4a3ab; --ct-dim: #6d6c75;
  --ct-accent: #b7a2ff; --ct-accent-bg: #231f33;
  --ct-header-bg: #121214; --ct-header-border: #2c2c33; --ct-header-text: #e9e8ec;
}
`;

const KIND_COLOR: Record<TokenKind, string> = {
  accepted: "#7fc99a",
  resampled: "#e0a43f",
  bonus: "#b7a2ff",
};

const KIND_LABEL: Record<TokenKind, string> = {
  accepted: "draft kept",
  resampled: "draft rejected, target resampled",
  bonus: "free token from the target pass",
};

function Output({ gen, domain, temperature }: { gen: Generation; domain: DomainId; temperature: number }) {
  const m = models(domain, temperature);
  return (
    <pre className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words font-mono min-h-[12rem]">
      <span style={{ color: CSS_VAR_COLORS.dim }}>{gen.prompt}</span>
      {gen.rounds.map((r, i) => (
        <span key={i} className="border-b" style={{ borderColor: i % 2 ? "#3a3a44" : "#55555f" }}>
          {r.out.map((t, j) =>
            t.id === m.eos ? (
              <span key={j} style={{ color: KIND_COLOR[t.kind] }}>
                {" \u21b5\n"}
              </span>
            ) : (
              <span key={j} style={{ color: KIND_COLOR[t.kind] }}>
                {m.vocab[t.id]}
              </span>
            ),
          )}
        </span>
      ))}
    </pre>
  );
}

function Chart({
  m,
  k,
  pick,
  onPick,
}: {
  m: Measurement;
  k: number;
  pick: number | null;
  onPick: (k: number) => void;
}) {
  const C = CSS_VAR_COLORS;
  const max = Math.max(...m.stats.map((s) => Math.max(s.speedup, s.theory)), 2);
  const H = 120;
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: H + 22 }} role="group" aria-label="Draft length">
        {m.stats.map((s) => {
          const on = s.k === k;
          return (
            <button
              key={s.k}
              onClick={() => onPick(s.k)}
              className="relative flex-1 min-w-0 h-full"
              aria-label={`k = ${s.k}, ${s.speedup.toFixed(2)}x`}
            >
              <span
                className="absolute inset-x-0 bottom-0 rounded-t-[2px]"
                style={{
                  height: (s.speedup / max) * H,
                  backgroundColor: s.k === m.best ? "#7fc99a" : "#4a4a55",
                  outline: on ? `1px solid ${C.text}` : "none",
                  outlineOffset: 2,
                }}
              />
              <span
                className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border"
                style={{ bottom: (s.theory / max) * H - 4, borderColor: C.text, backgroundColor: C.cardBg }}
                title="theory from alpha"
              />
              <span
                className="absolute inset-x-0 text-[10px] font-mono text-center tabular-nums"
                style={{ bottom: (Math.max(s.speedup, s.theory) / max) * H + 6, color: s.k === m.best ? C.text : C.dim }}
              >
                {s.speedup.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1">
        {K_VALUES.map((v) => (
          <span key={v} className="flex-1 text-center text-[11px] font-mono" style={{ color: v === k ? C.text : C.dim }}>
            {v}
            {v === pick ? <span className="block text-[10px]" style={{ color: C.accent }}>Claude</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FireworksPage() {
  const C = CSS_VAR_COLORS;

  const [domain, setDomain] = useState<DomainId>("json");
  const [temperature, setTemperature] = useState(0.7);
  const [k, setK] = useState(4);
  const [seed, setSeed] = useState(1);

  const [m, setM] = useState<Measurement | null>(null);
  const [gen, setGen] = useState<Generation | null>(null);
  const [check, setCheck] = useState<Check | null>(null);

  const [picks, setPicks] = useState<Partial<Record<string, ClaudePick>>>(CACHED_PICKS);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = `${domain}@${temperature}`;
  const pick = picks[key] ?? null;

  // The sampler runs after paint so the controls never block.
  useEffect(() => {
    setM(null);
    const t = setTimeout(() => setM(measure(domain, temperature)), 0);
    return () => clearTimeout(t);
  }, [domain, temperature]);

  useEffect(() => {
    setGen(generate(domain, temperature, k, seed));
    setCheck(null);
    const t = setTimeout(() => setCheck(distributionCheck(domain, temperature, k)), 30);
    return () => clearTimeout(t);
  }, [domain, temperature, k, seed]);

  const ask = useCallback(async (d: DomainId, T: number) => {
    const id = `${d}@${T}`;
    setError(null);
    setLoading(id);
    try {
      const res = await fetch("/api/demos/fireworks/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d, temperature: T }),
      });
      const json = (await res.json()) as { pick?: ClaudePick; error?: string };
      if (!res.ok || !json.pick) throw new Error(json.error ?? "No answer returned.");
      setPicks((p) => ({ ...p, [id]: json.pick }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading((l) => (l === id ? null : l));
    }
  }, []);

  useEffect(() => {
    if (!picks[key]) ask(domain, temperature);
    // Only ask when the setting changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const best = m ? m.stats.find((s) => s.k === m.best)! : null;
  const claudeStat = m && pick ? m.stats.find((s) => s.k === pick.k)! : null;
  const genSpeed = gen ? gen.tokens / (gen.targetCalls + gen.draftCalls * DRAFT_COST) : 0;
  const counts = { accepted: 0, resampled: 0, bonus: 0 };
  gen?.rounds.forEach((r) => r.out.forEach((t) => counts[t.kind]++));

  const btn = (on: boolean) => ({
    borderColor: on ? C.accent : C.cardBorder,
    color: on ? C.accent : C.muted,
    backgroundColor: on ? C.accentBg : "transparent",
  });

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Draft Length Tuner
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Fireworks AI
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Speculative decoding in your browser: faster output, same distribution.
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
            A bigram draft proposes k tokens and a trigram target checks them in one pass, keeping each with probability
            min(1, p/q). Both train here on a made-up corpus. Cost is modeled: a draft pass costs {DRAFT_COST} of a
            target pass.
          </p>

          <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
            {DOMAINS.map((d) => (
              <button key={d.id} onClick={() => setDomain(d.id)} className="px-3 py-1.5 rounded border" style={btn(d.id === domain)}>
                {d.label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1.5 font-mono" style={{ color: C.dim }}>
              T
              {TEMPERATURES.map((t) => (
                <button key={t} onClick={() => setTemperature(t)} className="px-2 py-1.5 rounded border" style={btn(t === temperature)}>
                  {t.toFixed(1)}
                </button>
              ))}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section className="rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex items-center justify-between mb-3 text-xs font-mono" style={{ color: C.dim }}>
                <span>Output at k = {k}</span>
                <button onClick={() => setSeed((s) => s + 1)} className="underline hover:opacity-70" style={{ color: C.muted }}>
                  Resample
                </button>
              </div>
              {gen ? <Output gen={gen} domain={domain} temperature={temperature} /> : <div className="min-h-[12rem]" />}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[11px] font-mono">
                {(Object.keys(KIND_COLOR) as TokenKind[]).map((kind) => (
                  <span key={kind} style={{ color: KIND_COLOR[kind] }}>
                    {counts[kind]} {KIND_LABEL[kind]}
                  </span>
                ))}
              </div>
              {gen ? (
                <p className="text-[11px] font-mono mt-2" style={{ color: C.dim }}>
                  {gen.tokens} tokens, {gen.targetCalls} target passes, {gen.draftCalls} draft passes, {genSpeed.toFixed(2)}x
                </p>
              ) : null}
            </section>

            <section className="rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="text-xs font-mono mb-3" style={{ color: C.dim }}>
                Measured speedup by k{m ? `, alpha ${m.alpha.toFixed(2)}` : ""} (dots: theory)
              </div>
              {m ? (
                <Chart m={m} k={k} pick={pick?.k ?? null} onPick={setK} />
              ) : (
                <p className="text-xs font-mono" style={{ height: 160, color: C.dim }}>
                  Measuring.
                </p>
              )}

              <div className="border-t mt-4 pt-3" style={{ borderColor: C.cardBorder }}>
                {pick ? (
                  <div className="space-y-2 text-sm leading-relaxed">
                    {m && best && claudeStat ? (
                      <p className="text-xs font-mono" style={{ color: pick.k === m.best ? "#7fc99a" : "#e0a43f" }}>
                        Claude picked k = {pick.k} ({claudeStat.speedup.toFixed(2)}x). Measured best k = {m.best} (
                        {best.speedup.toFixed(2)}x).
                      </p>
                    ) : null}
                    <p style={{ color: C.text }}>{pick.summary}</p>
                    <p style={{ color: C.muted }}>{pick.failures}</p>
                    <p style={{ color: C.muted }}>{pick.fix}</p>
                  </div>
                ) : loading === key ? (
                  <p className="text-xs font-mono" style={{ color: C.dim }}>
                    Claude is reading the acceptance stats.
                  </p>
                ) : error ? (
                  <p className="text-xs" style={{ color: C.muted }}>
                    {error}{" "}
                    <button onClick={() => ask(domain, temperature)} className="underline" style={{ color: C.text }}>
                      Retry
                    </button>
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <p className="text-xs font-mono mt-5" style={{ color: C.dim }}>
            {check ? (
              <>
                Same output check, first two tokens, {CHECK_SAMPLES.toLocaleString()} samples each: speculative vs plain{" "}
                <span style={{ color: C.text }}>{check.specVsPlain.toFixed(3)}</span> total variation, plain vs plain{" "}
                <span style={{ color: C.text }}>{check.plainVsPlain.toFixed(3)}</span> (sampling noise).
              </>
            ) : (
              "Running the same output check."
            )}
          </p>
        </div>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Fireworks AI. Toy n-gram models, modeled cost.
          </p>
        </footer>
      </div>
    </>
  );
}
