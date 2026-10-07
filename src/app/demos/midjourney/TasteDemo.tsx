"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import { CORPUS } from "./corpus";
import { FEATURES, extractFeatures, standardize } from "./features";
import {
  fit,
  kendallTau,
  nextPair,
  pairKey,
  predict,
  prior,
  roundsTo,
  scores,
  simulate,
  type Choice,
  type Posterior,
  type SimCurve,
} from "./model";

const C = CSS_VAR_COLORS;
const SAMPLE = 64; // features are computed on a 64px wide copy of each image
const ACCENT = "#7c3aed";
const BASE = "#9a8a7a";

async function loadFeatures(onProgress: (done: number) => void): Promise<number[][]> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  const raw: number[][] = [];
  for (let i = 0; i < CORPUS.length; i++) {
    const img = new Image();
    img.src = CORPUS[i].file;
    await img.decode();
    const w = SAMPLE;
    const h = Math.max(8, Math.round((img.naturalHeight / img.naturalWidth) * SAMPLE));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    raw.push(extractFeatures(ctx.getImageData(0, 0, w, h).data, w, h));
    onProgress(i + 1);
  }
  return standardize(raw);
}

// ─── Small parts ──────────────────────────────────────────────────────────────

function Painting({ i, onPick }: { i: number; onPick: () => void }) {
  const a = CORPUS[i];
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.file} alt={`${a.title}, ${a.artist}`} className="w-full h-40 sm:h-64 object-contain" />
      <p className="mt-2 text-[11px] leading-snug truncate" style={{ color: C.muted }}>
        {a.title}, {a.artist}
      </p>
    </>
  );
  return (
    <button
      onClick={onPick}
      className="text-left rounded-lg border p-2 transition hover:shadow-md focus:outline-none focus:ring-2"
      style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}
    >
      {body}
    </button>
  );
}

function Thumb({ i, unseen }: { i: number; unseen: boolean }) {
  const a = CORPUS[i];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={a.file}
      alt={`${a.title}, ${a.artist}`}
      title={`${a.title}, ${a.artist}, ${a.date}`}
      className="w-full aspect-square object-cover rounded"
      style={{ outline: unseen ? `2px solid ${ACCENT}` : "none", outlineOffset: 1 }}
    />
  );
}

function Weights({ post }: { post: Posterior }) {
  const max = 2.5;
  return (
    <div className="space-y-1.5">
      {FEATURES.map((f, k) => {
        const m = post.mean[k];
        const sd = Math.sqrt(post.cov[k][k]);
        const pos = (v: number) => `${50 + (Math.max(-max, Math.min(max, v)) / max) * 50}%`;
        const sure = Math.abs(m) > sd;
        return (
          <div key={f.key} className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-2 text-[11px]">
            <span className="text-right" style={{ color: m < 0 && sure ? C.text : C.dim }}>{f.low}</span>
            <div className="relative h-3">
              <div className="absolute inset-y-1/2 left-0 right-0 h-px" style={{ backgroundColor: C.cardBorder }} />
              <div className="absolute top-0 bottom-0 w-px left-1/2" style={{ backgroundColor: C.cardBorder }} />
              <div
                className="absolute top-1 h-1 rounded"
                style={{ left: pos(m - sd), width: `calc(${pos(m + sd)} - ${pos(m - sd)})`, backgroundColor: `${ACCENT}33` }}
              />
              <div className="absolute top-0 h-3 w-1.5 rounded -ml-[3px]" style={{ left: pos(m), backgroundColor: sure ? ACCENT : BASE }} />
            </div>
            <span style={{ color: m > 0 && sure ? C.text : C.dim }}>{f.high}</span>
          </div>
        );
      })}
    </div>
  );
}

function Curve({ values, color, rounds }: { values: number[]; color: string; rounds: number }) {
  const W = 560;
  const H = 140;
  const pts = values
    .map((v, r) => `${(30 + (r / rounds) * (W - 38)).toFixed(1)},${(H - 18 - Math.max(0, v) * (H - 26)).toFixed(1)}`)
    .join(" ");
  return <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />;
}

function SimChart({ sim, rounds }: { sim: SimCurve; rounds: number }) {
  const W = 560;
  const H = 140;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Rank agreement with the hidden taste">
      <line x1={30} y1={H - 18} x2={W - 8} y2={H - 18} stroke="#e5e0d8" />
      <line x1={30} y1={8} x2={30} y2={H - 18} stroke="#e5e0d8" />
      <text x={26} y={14} textAnchor="end" fontSize="9" fill={BASE}>1</text>
      <text x={26} y={H - 18} textAnchor="end" fontSize="9" fill={BASE}>0</text>
      <text x={30} y={H - 4} fontSize="9" fill={BASE}>0 picks</text>
      <text x={W - 8} y={H - 4} textAnchor="end" fontSize="9" fill={BASE}>{rounds}</text>
      <Curve values={sim.random} color={BASE} rounds={rounds} />
      <Curve values={sim.active} color={ACCENT} rounds={rounds} />
    </svg>
  );
}

// ─── Demo ─────────────────────────────────────────────────────────────────────

const TOP = 5;
const SIM_ROUNDS = 40;
const SIM_TASTERS = 12;
const TARGET_TAU = 0.8;

export default function TasteDemo() {
  const [x, setX] = useState<number[][] | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [post, setPost] = useState<Posterior>(prior);
  const [pair, setPair] = useState<[number, number] | null>(null);
  const [stability, setStability] = useState<number[]>([]);
  const [sim, setSim] = useState<SimCurve | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    if (CORPUS.length < 2) return;
    loadFeatures(setLoaded)
      .then((feats) => {
        setX(feats);
        setPair(nextPair(prior(), feats, new Set()));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not read the images"));
  }, []);

  const pick = useCallback(
    (winner: number, loser: number) => {
      if (!x) return;
      const nextChoices = [...choices, { winner, loser }];
      const nextPost = fit(x, nextChoices, post.mean);
      const before = scores(post.mean, x);
      const after = scores(nextPost.mean, x);
      setStability((s) => (choices.length === 0 ? s : [...s, kendallTau(before, after)]));
      setChoices(nextChoices);
      setPost(nextPost);
      setPair(nextPair(nextPost, x, new Set(nextChoices.map((c) => pairKey(c.winner, c.loser)))));
    },
    [x, choices, post],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!pair) return;
      if (e.key === "ArrowLeft") pick(pair[0], pair[1]);
      if (e.key === "ArrowRight") pick(pair[1], pair[0]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pair, pick]);

  const ranked = useMemo(() => {
    if (!x) return [];
    const s = scores(post.mean, x);
    return s.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  }, [x, post]);

  function reset() {
    if (!x) return;
    setChoices([]);
    setPost(prior());
    setStability([]);
    setPair(nextPair(prior(), x, new Set()));
  }

  function runSim() {
    if (!x) return;
    setSimRunning(true);
    // Yield a frame so the button state paints before the blocking run.
    setTimeout(() => {
      setSim(simulate(x, SIM_ROUNDS, SIM_TASTERS, 2026));
      setSimRunning(false);
    }, 30);
  }

  if (CORPUS.length < 2) {
    return (
      <p className="text-sm rounded-xl border p-4" style={{ borderColor: C.cardBorder, color: C.muted }}>
        The painting set is not loaded yet.
      </p>
    );
  }
  if (error) return <p className="text-sm" style={{ color: "#b91c1c" }}>{error}</p>;
  if (!x || !pair) {
    return (
      <p className="text-sm" style={{ color: C.muted }}>
        Measuring {loaded} of {CORPUS.length} paintings in your browser...
      </p>
    );
  }

  const n = choices.length;
  const seen = new Set(choices.flatMap((c) => [c.winner, c.loser]));
  const p = predict(post, x, pair[0], pair[1]);
  const lastStab = stability.at(-1);
  const activeAt = sim ? roundsTo(sim.active, TARGET_TAU) : null;
  const randomAt = sim ? roundsTo(sim.random, TARGET_TAU) : null;

  return (
    <div className="space-y-8">
      {/* Pair */}
      <div>
        <div className="flex items-baseline justify-between mb-2 text-xs" style={{ color: C.dim }}>
          <span>Which do you prefer? ({n} picked)</span>
          <span>
            model predicts {Math.round(Math.max(p, 1 - p) * 100)}% {p >= 0.5 ? "left" : "right"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Painting i={pair[0]} onPick={() => pick(pair[0], pair[1])} />
          <Painting i={pair[1]} onPick={() => pick(pair[1], pair[0])} />
        </div>
      </div>

      {/* Weights */}
      <div className="rounded-xl border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }}>Your taste</p>
          <p className="text-[11px]" style={{ color: C.dim }}>
            {lastStab === undefined ? "ranking forming" : `ranking moved ${Math.round((1 - lastStab) * 50)}% last pick`}
          </p>
        </div>
        <Weights post={post} />
      </div>

      {/* Ranking */}
      {n >= 3 && (
        <div className="grid grid-cols-2 gap-6">
          {[
            { title: "Predicted favorites", list: ranked.slice(0, TOP) },
            { title: "Predicted least", list: ranked.slice(-TOP).reverse() },
          ].map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: C.dim }}>{col.title}</p>
              <div className="grid grid-cols-5 gap-1.5">
                {col.list.map(({ i }) => (
                  <Thumb key={i} i={i} unseen={!seen.has(i)} />
                ))}
              </div>
            </div>
          ))}
          <p className="col-span-2 text-xs" style={{ color: C.muted }}>
            Ringed: never shown to you. {ranked.slice(0, TOP).filter(({ i }) => !seen.has(i)).length} of your top {TOP}.
          </p>
        </div>
      )}

      {/* Simulation */}
      <div className="rounded-xl border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: C.dim }}>Why these pairs</p>
          <button
            onClick={runSim}
            disabled={simRunning}
            className="text-xs px-3 py-1.5 rounded-full border disabled:opacity-50"
            style={{ borderColor: C.cardBorder, color: C.text }}
          >
            {simRunning ? "Running..." : sim ? "Run again" : `Run ${SIM_TASTERS} simulated tasters`}
          </button>
        </div>
        {sim ? (
          <>
            <SimChart sim={sim} rounds={SIM_ROUNDS} />
            <p className="text-xs mt-2" style={{ color: C.muted }}>
              <span style={{ color: ACCENT }}>Chosen pairs</span> reach rank agreement {TARGET_TAU} in{" "}
              {activeAt ?? `over ${SIM_ROUNDS}`} picks; <span style={{ color: BASE }}>random pairs</span> in{" "}
              {randomAt ?? `over ${SIM_ROUNDS}`}.
            </p>
          </>
        ) : (
          <p className="text-xs" style={{ color: C.muted }}>
            Each pair is the one the model expects to learn most from.
          </p>
        )}
      </div>

      <button onClick={reset} className="text-xs underline hover:opacity-70" style={{ color: C.muted }}>
        Start over
      </button>
    </div>
  );
}
