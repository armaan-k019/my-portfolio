"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CalibrationMap, CALIB_LETTERS,
  SeparationVector,
  samplesNeeded, confusionPartners,
  normalizeLandmarks, weightedAverageVectors, averageVectors, euclidean,
  saveCalibration, loadSeparationVectors, saveSeparationVectors,
} from "./calibration";

const ACCENT = "#6C47FF";
const CAPTURE_INTERVAL_MS  = 600;
const CONTRAST_INTERVAL_MS = 400; // faster during contrast
const STABILITY_THRESHOLD  = 60;

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

function HandSkeletonSVG({ normalized }: { normalized: number[] }) {
  const pts: [number, number][] = [];
  for (let i = 0; i < 21; i++) pts.push([normalized[i * 2], normalized[i * 2 + 1]]);

  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 14, W = 130, H = 140;

  function toSVG(x: number, y: number): [number, number] {
    return [
      pad + ((x - minX) / rangeX) * (W - 2 * pad),
      pad + ((y - minY) / rangeY) * (H - 2 * pad),
    ];
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {HAND_CONNECTIONS.map(([a, b], idx) => {
        const [ax, ay] = toSVG(pts[a][0], pts[a][1]);
        const [bx, by] = toSVG(pts[b][0], pts[b][1]);
        return <line key={idx} x1={ax} y1={ay} x2={bx} y2={by} stroke={ACCENT} strokeWidth="1.5" strokeOpacity="0.4" />;
      })}
      {pts.map(([px, py], idx) => {
        const [svgX, svgY] = toSVG(px, py);
        return (
          <circle
            key={idx} cx={svgX} cy={svgY}
            r={idx === 0 ? 4.5 : 3}
            fill="#a78bfa"
            fillOpacity={idx === 0 ? 1 : 0.75}
          />
        );
      })}
    </svg>
  );
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelRef: React.MutableRefObject<any>;
  initialCalibration: CalibrationMap;
  /** If set, calibrate only this one letter (recalibration mode). */
  targetLetter?: string | null;
  onComplete: (map: CalibrationMap) => void;
  onCancel: () => void;
}

type Phase = "capturing" | "review" | "saved" | "contrast" | "summary";

const CONTRAST_NEEDED = 3;

export default function CalibrationModal({
  videoRef, modelRef, initialCalibration, targetLetter, onComplete, onCancel,
}: Props) {
  const letters = targetLetter ? [targetLetter] : [...CALIB_LETTERS];

  const [letterIdx,       setLetterIdx]       = useState(0);
  const [snapshots,       setSnapshots]       = useState<number[][]>([]);
  const [phase,           setPhase]           = useState<Phase>("capturing");
  const [workingMap,      setWorkingMap]      = useState<CalibrationMap>({ ...initialCalibration });
  const [handSeen,        setHandSeen]        = useState(false);
  const [stability,       setStability]       = useState(100);
  const [reviewVec,       setReviewVec]       = useState<number[] | null>(null);
  const [contrastPartner, setContrastPartner] = useState<string | null>(null);
  const [contrastSnaps,   setContrastSnaps]   = useState<number[][]>([]);

  const snapshotsRef      = useRef<number[][]>([]);
  const workingMapRef     = useRef<CalibrationMap>({ ...initialCalibration });
  const reviewVecRef      = useRef<number[] | null>(null);
  const contrastSnapsRef  = useRef<number[][]>([]);
  const lastCaptureRef    = useRef(0);
  const rafRef            = useRef(0);
  const stoppedRef        = useRef(false);
  const prevVecRef        = useRef<number[] | null>(null);

  const currentLetter = letters[letterIdx];
  const needed        = samplesNeeded(currentLetter);
  const progress      = snapshots.length / needed;
  const isConfused    = confusionPartners(currentLetter).length > 0;

  useEffect(() => { snapshotsRef.current     = snapshots;   }, [snapshots]);
  useEffect(() => { workingMapRef.current    = workingMap;  }, [workingMap]);
  useEffect(() => { reviewVecRef.current     = reviewVec;   }, [reviewVec]);
  useEffect(() => { contrastSnapsRef.current = contrastSnaps; }, [contrastSnaps]);

  // ── Advance to next letter ──────────────────────────────────────────────────
  const advance = useCallback(() => {
    const next = letterIdx + 1;
    if (next >= letters.length) {
      setPhase("summary");
    } else {
      setLetterIdx(next);
      snapshotsRef.current = [];
      setSnapshots([]);
      lastCaptureRef.current = 0;
      prevVecRef.current = null;
      setHandSeen(false);
      setStability(100);
      setReviewVec(null);
      setContrastPartner(null);
      contrastSnapsRef.current = [];
      setContrastSnaps([]);
      setPhase("capturing");
    }
  }, [letterIdx, letters.length]);

  // Auto-advance 800 ms after "saved"
  useEffect(() => {
    if (phase !== "saved") return;
    const t = setTimeout(advance, 800);
    return () => clearTimeout(t);
  }, [phase, advance]);

  // ── Main capture loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "capturing") return;
    stoppedRef.current = false;

    async function loop() {
      if (stoppedRef.current) return;

      const now   = Date.now();
      const video = videoRef.current;
      const model = modelRef.current;

      if (video && model && video.readyState >= 2) {
        try {
          const hands = await model.estimateHands(video);
          if (!stoppedRef.current) {
            setHandSeen(hands.length > 0);

            if (hands.length > 0) {
              const lm  = hands[0].landmarks as [number, number, number][];
              const vec = normalizeLandmarks(lm);

              let stab = 100;
              if (prevVecRef.current) {
                const movement = euclidean(vec, prevVecRef.current);
                stab = Math.max(0, (1 - movement / 0.3)) * 100;
              }
              prevVecRef.current = vec;
              setStability(Math.round(stab));

              if (stab >= STABILITY_THRESHOLD && now - lastCaptureRef.current >= CAPTURE_INTERVAL_MS) {
                const cur = [...snapshotsRef.current, vec];
                snapshotsRef.current = cur;
                setSnapshots(cur);
                lastCaptureRef.current = now;

                if (cur.length >= needed) {
                  stoppedRef.current = true;
                  const avg = weightedAverageVectors(cur);
                  setReviewVec(avg);
                  setPhase("review");
                  return;
                }
              }
            } else {
              prevVecRef.current = null;
              setStability(100);
            }
          }
        } catch { /* ignore per-frame errors */ }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, letterIdx]);

  // ── Contrast capture loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "contrast") return;
    stoppedRef.current = false;
    contrastSnapsRef.current = [];
    setContrastSnaps([]);
    lastCaptureRef.current = 0;
    prevVecRef.current = null;

    async function loop() {
      if (stoppedRef.current) return;

      const now   = Date.now();
      const video = videoRef.current;
      const model = modelRef.current;

      if (video && model && video.readyState >= 2) {
        try {
          const hands = await model.estimateHands(video);
          if (!stoppedRef.current && hands.length > 0) {
            const lm  = hands[0].landmarks as [number, number, number][];
            const vec = normalizeLandmarks(lm);

            if (now - lastCaptureRef.current >= CONTRAST_INTERVAL_MS) {
              const cur = [...contrastSnapsRef.current, vec];
              contrastSnapsRef.current = cur;
              setContrastSnaps(cur);
              lastCaptureRef.current = now;

              if (cur.length >= CONTRAST_NEEDED) {
                stoppedRef.current = true;
                // Compute separation vector: contrastCentroid - partnerCentroid
                const partner = contrastPartner;
                if (partner) {
                  const contrastCentroid = averageVectors(cur);
                  const partnerEntry = workingMapRef.current[partner];
                  if (partnerEntry) {
                    const partnerCentroid = partnerEntry.normalized;
                    const letter = letters[letterIdx];
                    const vector = contrastCentroid.map((v, i) => v - partnerCentroid[i]);

                    // Determine canonical ordering (alphabetical)
                    const [lA, lB] = letter < partner ? [letter, partner] : [partner, letter];
                    const canonicalVec = letter < partner ? vector : vector.map(v => -v);

                    const existing = loadSeparationVectors().filter(
                      sv => !(sv.letterA === lA && sv.letterB === lB),
                    );
                    const updated: SeparationVector[] = [
                      ...existing,
                      { letterA: lA, letterB: lB, vector: canonicalVec },
                    ];
                    saveSeparationVectors(updated);
                  }
                }
                setPhase("saved");
                return;
              }
            }
          }
        } catch { /* ignore per-frame errors */ }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Skip ────────────────────────────────────────────────────────────────────
  function skip() {
    stoppedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    snapshotsRef.current = [];
    setSnapshots([]);
    prevVecRef.current = null;
    advance();
  }

  // ── Save captured average ────────────────────────────────────────────────────
  function saveCurrent() {
    if (!reviewVec) return;
    const letter = letters[letterIdx];
    const newMap = {
      ...workingMapRef.current,
      [letter]: { letter, normalized: reviewVec, timestamp: Date.now() },
    };
    workingMapRef.current = newMap;
    setWorkingMap(newMap);
    saveCalibration(newMap);

    // Check if any confusion partner is already calibrated → trigger contrast
    const partners = confusionPartners(letter);
    const calibratedPartner = partners.find(p => newMap[p]);
    if (calibratedPartner) {
      setContrastPartner(calibratedPartner);
      setPhase("contrast");
    } else {
      setPhase("saved");
    }
  }

  // ── Try again ────────────────────────────────────────────────────────────────
  function tryAgain() {
    snapshotsRef.current = [];
    setSnapshots([]);
    lastCaptureRef.current = 0;
    prevVecRef.current = null;
    setReviewVec(null);
    setStability(100);
    setHandSeen(false);
    setPhase("capturing");
  }

  const stabColor = stability >= 80 ? "#22c55e" : stability >= 50 ? "#f59e0b" : "#ef4444";
  const isPaused  = stability < STABILITY_THRESHOLD && handSeen;

  // ── Summary ──────────────────────────────────────────────────────────────────
  if (phase === "summary") {
    const calibCount = Object.keys(workingMap).length;
    return (
      <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#111] rounded-2xl border border-white/10 p-6">
          <h2 className="text-lg font-bold text-white mb-1">Calibration complete</h2>
          <p className="text-sm text-white/40 mb-5">
            {calibCount} of {CALIB_LETTERS.length} letters saved to your personal profile.
            {calibCount < CALIB_LETTERS.length && ` ${CALIB_LETTERS.length - calibCount} using fingerpose defaults.`}
          </p>

          <div className="grid grid-cols-8 gap-1.5 mb-6">
            {CALIB_LETTERS.map(l => (
              <div
                key={l}
                className="h-8 rounded flex items-center justify-center text-xs font-bold font-mono"
                style={{
                  backgroundColor: workingMap[l] ? `${ACCENT}25` : "#ffffff06",
                  color:           workingMap[l] ? "#a78bfa"     : "#ffffff20",
                  border: `1px solid ${workingMap[l] ? `${ACCENT}50` : "#ffffff08"}`,
                }}
              >
                {l}
              </div>
            ))}
          </div>

          <button
            onClick={() => onComplete(workingMap)}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: ACCENT }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Review ───────────────────────────────────────────────────────────────────
  if (phase === "review" && reviewVec) {
    return (
      <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#111] rounded-2xl border border-white/10 overflow-hidden">

          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
              Review capture
            </p>
            <button onClick={onCancel} className="text-white/25 hover:text-white/50 transition-colors text-sm px-2">✕</button>
          </div>

          <div className="px-5 py-8 flex flex-col items-center gap-5">
            <div className="text-9xl font-bold font-mono leading-none select-none text-white">
              {currentLetter}
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <HandSkeletonSVG normalized={reviewVec} />
            </div>

            <p className="text-sm text-white/60 text-center">
              Is this a clean <span className="font-bold text-white">&ldquo;{currentLetter}&rdquo;</span>?
            </p>
          </div>

          <div className="px-5 pb-5 flex gap-3">
            <button
              onClick={tryAgain}
              className="flex-1 py-2.5 rounded-lg text-sm text-white/50 border border-white/15 hover:text-white/70 hover:border-white/25 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={saveCurrent}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Looks good
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Contrast check ───────────────────────────────────────────────────────────
  if (phase === "contrast" && contrastPartner) {
    const contrastProgress = contrastSnaps.length / CONTRAST_NEEDED;
    const r    = 34;
    const circ = 2 * Math.PI * r;

    return (
      <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#111] rounded-2xl border border-white/10 overflow-hidden">

          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#f59e0b" }}>
                Contrast check
              </p>
              <p className="text-xs text-white/30 mt-0.5">
                Separating &ldquo;{currentLetter}&rdquo; from &ldquo;{contrastPartner}&rdquo;
              </p>
            </div>
            <button onClick={onCancel} className="text-white/25 hover:text-white/50 transition-colors text-sm px-2">✕</button>
          </div>

          <div className="px-5 py-8 flex flex-col items-center gap-5">
            <div className="flex items-center gap-3">
              <span className="text-7xl font-bold font-mono text-white leading-none">{currentLetter}</span>
              <span className="text-2xl text-white/20">vs</span>
              <span className="text-7xl font-bold font-mono text-white/30 leading-none">{contrastPartner}</span>
            </div>

            <div className="relative">
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r={r} fill="none" stroke="#ffffff10" strokeWidth="4" />
                <circle
                  cx="44" cy="44" r={r}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="4"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - Math.min(contrastProgress, 1))}
                  strokeLinecap="round"
                  transform="rotate(-90 44 44)"
                  style={{ transition: "stroke-dashoffset 0.2s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold font-mono text-white">
                  {contrastSnaps.length}/{CONTRAST_NEEDED}
                </span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-white/60">
                Hold <span className="font-bold text-white">&ldquo;{currentLetter}&rdquo;</span> steady
              </p>
              <p className="text-xs text-white/30 mt-1">
                Computing separation vector…
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Capture screen ────────────────────────────────────────────────────────────
  const r    = 34;
  const circ = 2 * Math.PI * r;

  return (
    <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[#111] rounded-2xl border border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
              {targetLetter ? `Recalibrating ${targetLetter}` : "Calibrate My Signs"}
            </p>
            {!targetLetter && (
              <p className="text-xs text-white/25 mt-0.5">
                {letterIdx + 1} of {letters.length} letters
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="text-white/25 hover:text-white/50 transition-colors text-sm px-2"
          >
            ✕
          </button>
        </div>

        {/* Overall progress bar */}
        {!targetLetter && (
          <div className="h-0.5 bg-white/5">
            <div
              className="h-0.5 transition-all duration-300"
              style={{ width: `${(letterIdx / letters.length) * 100}%`, backgroundColor: ACCENT }}
            />
          </div>
        )}

        {/* Confused-letter note */}
        {isConfused && phase === "capturing" && (
          <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-[10px] text-amber-400/80 leading-relaxed">
              This letter is easy to confuse - we&apos;ll take a few extra samples.
            </p>
          </div>
        )}

        {/* Main content */}
        <div className="px-5 py-8 flex flex-col items-center gap-5">

          {/* Big letter */}
          <div
            className="text-9xl font-bold font-mono leading-none select-none transition-colors"
            style={{ color: phase === "saved" ? "#22c55e" : "white" }}
          >
            {currentLetter}
          </div>

          {/* Capture ring */}
          <div className="relative">
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r={r} fill="none" stroke="#ffffff10" strokeWidth="4" />
              <circle
                cx="44" cy="44" r={r}
                fill="none"
                stroke={phase === "saved" ? "#22c55e" : isPaused ? "#ffffff20" : ACCENT}
                strokeWidth="4"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - Math.min(progress, 1))}
                strokeLinecap="round"
                transform="rotate(-90 44 44)"
                style={{ transition: isPaused ? "none" : "stroke-dashoffset 0.25s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold font-mono" style={{ color: phase === "saved" ? "#22c55e" : "white" }}>
                {phase === "saved" ? "✓" : `${snapshots.length}/${needed}`}
              </span>
            </div>
          </div>

          {/* Stability bar */}
          {handSeen && phase !== "saved" && (
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-white/30">Stability</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: stabColor }}>{stability}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{ width: `${stability}%`, backgroundColor: stabColor }}
                />
              </div>
            </div>
          )}

          {/* Status text */}
          <div className="text-center">
            {phase === "saved" ? (
              <p className="text-sm text-green-400">Saved! Moving to next…</p>
            ) : (
              <>
                <p className="text-sm text-white/60">
                  Sign <span className="font-bold text-white">&ldquo;{currentLetter}&rdquo;</span> and hold steady
                </p>
                <p className="text-xs text-white/30 mt-1">
                  {!handSeen
                    ? "Show your hand in the camera"
                    : isPaused
                    ? "Hold still…"
                    : `Capturing… ${snapshots.length}/${needed} snapshots`
                  }
                </p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {phase === "capturing" && (
          <div className="px-5 pb-5">
            <button
              onClick={skip}
              className="w-full py-2.5 rounded-lg text-sm text-white/35 border border-white/10 hover:text-white/55 hover:border-white/20 transition-colors"
            >
              Skip - use default for {currentLetter}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
