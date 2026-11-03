"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import corpus from "./corpus.json";
import { DEFAULT_CONFIG, SaeTrainer, decodeVectors, encode, type SaeStats } from "./sae";
import {
  activeThreshold,
  matchedCue,
  pickFeatures,
  scoreLabel,
  type FeatureCard,
  type FeatureLabel,
  type Score,
} from "./labels";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #111113; --ct-card-bg: #18181b; --ct-card-border: #2a2a30;
  --ct-text: #ececef; --ct-muted: #a1a1aa; --ct-dim: #6b6b75;
  --ct-accent: #f0884a; --ct-accent-bg: #2a1d15;
  --ct-header-bg: #111113; --ct-header-border: #2a2a30; --ct-header-text: #ececef;
}
`;

const HIT = "#7fb069";
const MISS = "#e0a43f";
const FALSE_ALARM = "#e05d4f";

const SENTENCES = corpus.sentences;
const TRAIN_IDX = SENTENCES.flatMap((s, i) => (s.split === "train" ? [i] : []));
const HELD_IDX = SENTENCES.flatMap((s, i) => (s.split === "heldout" ? [i] : []));

interface Vectors {
  dims: number;
  data: Float64Array;
}

interface Run {
  seed: number;
  acts: Float64Array[]; // per sentence, all 288
  cards: FeatureCard[];
  trainMax: number[];
}

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 28;
  if (values.length < 2) return <svg width={w} height={h} aria-hidden />;
  const top = Math.max(...values) || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / top) * (h - 4)).toFixed(1)}`);
  return (
    <svg width={w} height={h} aria-hidden className="flex-shrink-0">
      <polyline points={pts.join(" ")} fill="none" stroke="var(--ct-accent)" strokeWidth={1.5} />
    </svg>
  );
}

function ScoreLine({ s }: { s: Score }) {
  return (
    <p className="text-[11px] font-mono flex flex-wrap gap-x-3" style={{ color: CSS_VAR_COLORS.muted }}>
      <span style={{ color: HIT }}>{s.hits} hit</span>
      <span style={{ color: MISS }}>{s.misses} missed</span>
      <span style={{ color: FALSE_ALARM }}>{s.falseAlarms} false alarm</span>
      <span>
        precision {pct(s.precision)}, recall {pct(s.recall)}
      </span>
    </p>
  );
}

function pct(v: number | null): string {
  return v === null ? "n/a" : `${Math.round(v * 100)}%`;
}

export default function GoodfirePage() {
  const C = CSS_VAR_COLORS;

  const [vectors, setVectors] = useState<Vectors | null>(null);
  const [seed, setSeed] = useState(DEFAULT_CONFIG.seed);
  const [stats, setStats] = useState<SaeStats | null>(null);
  const [curve, setCurve] = useState<number[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [labels, setLabels] = useState<FeatureLabel[] | null>(null);
  const [labeling, setLabeling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const token = useRef(0);

  useEffect(() => {
    fetch("/demos/goodfire/vectors.json")
      .then((r) => r.json())
      .then((v: { dims: number; scale: number; int8: string }) => setVectors({ dims: v.dims, data: decodeVectors(v.int8, v.scale, b64) }))
      .catch(() => setError("Could not load the embeddings."));
  }, []);

  const requestLabels = useCallback(async (cards: FeatureCard[], mine: number) => {
    setLabeling(true);
    setError(null);
    try {
      const res = await fetch("/api/demos/goodfire/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: cards }),
      });
      const json = (await res.json()) as { labels?: FeatureLabel[]; error?: string };
      if (!res.ok || !json.labels) throw new Error(json.error ?? "No labels returned.");
      if (token.current === mine) setLabels(json.labels);
    } catch (e) {
      if (token.current === mine) setError(`${e instanceof Error ? e.message : String(e)} Features are still shown unlabeled.`);
    } finally {
      if (token.current === mine) setLabeling(false);
    }
  }, []);

  const train = useCallback(
    (v: Vectors, s: number) => {
      const mine = ++token.current;
      const d = v.dims;
      const X = new Float64Array(TRAIN_IDX.length * d);
      TRAIN_IDX.forEach((i, r) => X.set(v.data.subarray(i * d, i * d + d), r * d));
      const trainer = new SaeTrainer(X, TRAIN_IDX.length, d, { ...DEFAULT_CONFIG, seed: s });
      setRun(null);
      setLabels(null);
      setError(null);
      setFocus(null);
      setSelected(null);
      setCurve([]);
      const tick = () => {
        if (token.current !== mine) return;
        const st = trainer.run(20);
        setStats(st);
        setCurve((c) => [...c, st.l0]);
        if (!trainer.done) {
          setTimeout(tick, 0);
          return;
        }
        const acts = SENTENCES.map((_, i) => encode(trainer.sae, v.data, i * d));
        const trainActs = TRAIN_IDX.map((i) => acts[i]);
        const cards = pickFeatures(TRAIN_IDX.map((i) => SENTENCES[i].text), trainActs, DEFAULT_CONFIG.features);
        const trainMax = Array.from({ length: DEFAULT_CONFIG.features }, (_, j) => Math.max(...trainActs.map((a) => a[j])));
        setRun({ seed: s, acts, cards, trainMax });
        requestLabels(cards, mine);
      };
      setTimeout(tick, 0);
    },
    [requestLabels],
  );

  useEffect(() => {
    if (vectors) train(vectors, seed);
  }, [vectors, seed, train]);

  const scores = useMemo(() => {
    const out = new Map<number, Score>();
    if (!run || !labels) return out;
    for (const l of labels) {
      out.set(
        l.id,
        scoreLabel(
          l.cues,
          HELD_IDX.map((i) => SENTENCES[i].text),
          HELD_IDX.map((i) => run.acts[i][l.id]),
          activeThreshold(run.trainMax[l.id]),
        ),
      );
    }
    return out;
  }, [run, labels]);

  const rows = useMemo(() => {
    if (!run) return [];
    const list = run.cards.map((c) => ({ card: c, label: labels?.find((l) => l.id === c.id), score: scores.get(c.id) }));
    return labels ? list.sort((a, b) => (b.score?.f1 ?? -1) - (a.score?.f1 ?? -1)) : list;
  }, [run, labels, scores]);

  const row = rows.find((r) => r.card.id === selected) ?? rows[0];
  const held = useMemo(() => {
    if (!run || !row) return [];
    const j = row.card.id;
    const t = activeThreshold(run.trainMax[j]);
    return HELD_IDX.map((i) => {
      const act = run.acts[i][j];
      const cue = row.label ? matchedCue(SENTENCES[i].text, row.label.cues) : null;
      const active = act > t;
      const kind = !row.label ? (active ? "active" : "quiet") : active && cue ? "hit" : active ? "miss" : cue ? "false alarm" : "quiet";
      return { i, act, cue, kind };
    }).sort((a, b) => b.act - a.act || a.i - b.i);
  }, [run, row]);
  const focused = held.find((h) => h.i === focus);
  const KIND_COLOR: Record<string, string> = { hit: HIT, miss: MISS, "false alarm": FALSE_ALARM, active: "var(--ct-accent)", quiet: "var(--ct-card-border)" };

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Feature Finder
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Goodfire
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Train a sparse autoencoder on sentence embeddings, then test Claude&apos;s label for each feature.
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
            {SENTENCES.length} made-up sentences, embedded with MiniLM. The autoencoder trains in your browser. Claude
            labels features from {TRAIN_IDX.length} training sentences, and plain code tests each label on{" "}
            {HELD_IDX.length} it never saw.
          </p>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <section className="rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex items-center gap-3 mb-3">
                <Sparkline values={curve} />
                <p className="text-[11px] font-mono flex-1" style={{ color: C.dim }}>
                  {stats
                    ? `step ${stats.step}, ${Math.round(stats.explained * 100)}% variance kept, ${stats.l0.toFixed(1)} features per sentence`
                    : "loading"}
                </p>
                <button
                  onClick={() => setSeed((s) => s + 1)}
                  disabled={!run || labeling}
                  className="text-xs font-semibold px-3 py-1 rounded transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: "#111113" }}
                  title={`Seed ${seed}. Retrain with the next seed.`}
                >
                  Retrain
                </button>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-mono" style={{ color: C.dim }}>
                    <th className="text-left font-normal pb-2 w-10" />
                    <th className="text-left font-normal pb-2">{labeling ? "Claude is labeling" : "label"}</th>
                    <th className="text-right font-normal pb-2 pl-2">F1</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ card, label, score }) => (
                    <tr
                      key={card.id}
                      onClick={() => {
                        setSelected(card.id);
                        setFocus(null);
                      }}
                      className="cursor-pointer border-t"
                      style={{ borderColor: C.cardBorder, backgroundColor: card.id === row?.card.id ? C.accentBg : undefined }}
                    >
                      <td className="font-mono text-[11px] py-1.5 pl-1" style={{ color: C.dim }}>
                        {card.id}
                      </td>
                      <td className="py-1.5 text-[13px]" style={{ color: card.id === row?.card.id ? C.accent : C.text }}>
                        {label?.label ?? ""}
                      </td>
                      <td className="py-1.5 pl-2 pr-1">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden hidden sm:block" style={{ backgroundColor: C.cardBorder }} aria-hidden>
                            <div className="h-full" style={{ width: `${(score?.f1 ?? 0) * 100}%`, backgroundColor: C.accent }} />
                          </div>
                          <span
                            className="font-mono text-[11px] tabular-nums w-8 text-right"
                            style={{ color: C.muted }}
                            title={score && score.f1 === null ? "Silent on every held-out sentence" : undefined}
                          >
                            {score ? (score.f1 === null ? "n/a" : score.f1.toFixed(2)) : ""}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {error && (
                <p className="text-xs mt-3" style={{ color: FALSE_ALARM }}>
                  {error}
                </p>
              )}
            </section>

            {row && run && (
              <section className="rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-sm font-semibold mb-1" style={{ color: C.text }}>
                  <span className="font-mono text-[11px] mr-2" style={{ color: C.dim }}>
                    {row.card.id}
                  </span>
                  {row.label?.label ?? "unlabeled"}
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4 min-h-[20px]">
                  {row.label?.cues.map((c) => (
                    <span key={c} className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: C.accentBg, color: C.accent }}>
                      {c}
                    </span>
                  ))}
                </div>

                <p className="text-[11px] font-mono mb-1.5" style={{ color: C.dim }}>
                  top training sentences
                </p>
                <ul className="space-y-1 mb-4">
                  {row.card.top.slice(0, 2).map((t) => (
                    <li key={t} className="text-[13px]" style={{ color: C.muted }}>
                      {t}
                    </li>
                  ))}
                </ul>

                <p className="text-[11px] font-mono mb-1.5" style={{ color: C.dim }}>
                  held out, strongest first
                </p>
                <div className="flex flex-wrap gap-[3px] mb-2">
                  {held.map((h) => (
                    <button
                      key={h.i}
                      onClick={() => setFocus(h.i)}
                      title={SENTENCES[h.i].text}
                      aria-label={`${h.kind}: ${SENTENCES[h.i].text}`}
                      className="w-3.5 h-3.5 rounded-[2px]"
                      style={{
                        backgroundColor: KIND_COLOR[h.kind],
                        outline: h.i === focus ? `1.5px solid ${C.text}` : undefined,
                        outlineOffset: 1,
                      }}
                    />
                  ))}
                </div>
                {row.score && <ScoreLine s={row.score} />}
                <p className="text-[13px] mt-3 min-h-[40px]" style={{ color: C.text }}>
                  {focused
                    ? `${SENTENCES[focused.i].text} (${focused.kind}${focused.cue ? `, "${focused.cue}"` : ""})`
                    : ""}
                </p>
              </section>
            )}
          </div>

          <details className="mt-6 text-xs max-w-2xl" style={{ color: C.dim }}>
            <summary className="cursor-pointer font-mono" style={{ color: C.muted }}>
              method
            </summary>
            <p className="mt-2 leading-relaxed">
              Embeddings: all-MiniLM-L6-v2, mean pooled, computed offline. Autoencoder: {DEFAULT_CONFIG.features} ReLU
              features, unit-norm decoder, L1 penalty {DEFAULT_CONFIG.l1}, {DEFAULT_CONFIG.steps} full-batch Adam steps,
              seeded. Claude sees the 12 most frequent features: up to 6 top sentences and 3 where each is silent, and
              returns a label plus cue words. A held-out sentence counts as active above a quarter of the feature&apos;s
              top training activation, and as predicted when it contains a cue. F1 compares the two.
            </p>
          </details>
        </div>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Goodfire.
          </p>
        </footer>
      </div>
    </>
  );
}
