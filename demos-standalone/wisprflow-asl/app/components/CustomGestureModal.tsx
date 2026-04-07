"use client";

import { useState, useEffect, useRef } from "react";
import {
  CustomGesture,
  SAMPLES_DEFAULT,
  normalizeLandmarks,
  weightedAverageVectors,
  euclidean,
} from "./calibration";

const ACCENT = "#6C47FF";
const CAPTURE_INTERVAL_MS = 500;
const STABILITY_THRESHOLD = 55;

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelRef: React.MutableRefObject<any>;
  onSave: (gesture: CustomGesture) => void;
  onCancel: () => void;
}

type Phase = "input" | "capturing" | "review" | "done";

export default function CustomGestureModal({ videoRef, modelRef, onSave, onCancel }: Props) {
  const [output,    setOutput]    = useState("");
  const [phase,     setPhase]     = useState<Phase>("input");
  const [snapshots, setSnapshots] = useState<number[][]>([]);
  const [handSeen,  setHandSeen]  = useState(false);
  const [stability, setStability] = useState(100);
  const [reviewVec, setReviewVec] = useState<number[] | null>(null);

  const snapshotsRef   = useRef<number[][]>([]);
  const lastCaptureRef = useRef(0);
  const rafRef         = useRef(0);
  const stoppedRef     = useRef(false);
  const prevVecRef     = useRef<number[] | null>(null);

  useEffect(() => { snapshotsRef.current = snapshots; }, [snapshots]);

  // ── Capture loop ──────────────────────────────────────────────────────────
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

                if (cur.length >= SAMPLES_DEFAULT) {
                  stoppedRef.current = true;
                  setReviewVec(weightedAverageVectors(cur));
                  setPhase("review");
                  return;
                }
              }
            } else {
              prevVecRef.current = null;
              setStability(100);
            }
          }
        } catch { /* ignore */ }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, videoRef, modelRef]);

  const trimmed = output.trim();
  const stabColor = stability >= 80 ? "#22c55e" : stability >= 50 ? "#f59e0b" : "#ef4444";
  const isPaused  = stability < STABILITY_THRESHOLD && handSeen;
  const progress  = snapshots.length / SAMPLES_DEFAULT;
  const r         = 30;
  const circ      = 2 * Math.PI * r;

  // ── Input screen ──────────────────────────────────────────────────────────
  if (phase === "input") {
    return (
      <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#111] rounded-2xl border border-white/10 overflow-hidden">

          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
              New Custom Gesture
            </p>
            <button onClick={onCancel} className="text-white/25 hover:text-white/50 text-sm px-2">✕</button>
          </div>

          <div className="px-5 py-6 space-y-4">
            <p className="text-xs text-white/40 leading-relaxed">
              Map any hand pose to any output - a letter, word, emoji, or phrase.
            </p>

            <div>
              <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                Output text
              </label>
              <input
                type="text"
                value={output}
                onChange={e => setOutput(e.target.value)}
                placeholder="e.g. Hello, or  , or thanks"
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg text-sm bg-white/5 border border-white/15 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
              <p className="mt-1.5 text-[10px] text-white/25">
                This text will be typed when the gesture is detected.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-lg text-sm text-white/40 border border-white/15 hover:text-white/60 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setPhase("capturing"); snapshotsRef.current = []; setSnapshots([]); }}
                disabled={trimmed.length === 0}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-30 transition-all"
                style={{ backgroundColor: ACCENT }}
              >
                Record gesture
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Review screen ─────────────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-[#111] rounded-2xl border border-white/10 overflow-hidden">

          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
              Confirm gesture
            </p>
            <button onClick={onCancel} className="text-white/25 hover:text-white/50 text-sm px-2">✕</button>
          </div>

          <div className="px-5 py-6 space-y-4 text-center">
            <p className="text-sm text-white/60">
              This pose will output: <span className="font-bold text-white">&ldquo;{trimmed}&rdquo;</span>
            </p>
            <p className="text-xs text-white/30">Does this look right?</p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { snapshotsRef.current = []; setSnapshots([]); setReviewVec(null); setPhase("capturing"); }}
                className="flex-1 py-2.5 rounded-lg text-sm text-white/50 border border-white/15 hover:text-white/70 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => {
                  if (!reviewVec) return;
                  onSave({
                    id: `custom_${Date.now()}`,
                    name: trimmed,
                    output: trimmed,
                    normalized: reviewVec,
                    timestamp: Date.now(),
                  });
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: ACCENT }}
              >
                Save gesture
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Capture screen ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[#111] rounded-2xl border border-white/10 overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest">
              Recording gesture
            </p>
            <p className="text-xs text-white/25 mt-0.5">
              Output: &ldquo;{trimmed}&rdquo;
            </p>
          </div>
          <button onClick={onCancel} className="text-white/25 hover:text-white/50 text-sm px-2">✕</button>
        </div>

        <div className="px-5 py-8 flex flex-col items-center gap-5">
          {/* Progress ring */}
          <div className="relative">
            <svg width="76" height="76" viewBox="0 0 76 76">
              <circle cx="38" cy="38" r={r} fill="none" stroke="#ffffff10" strokeWidth="4" />
              <circle
                cx="38" cy="38" r={r}
                fill="none"
                stroke={isPaused ? "#ffffff20" : ACCENT}
                strokeWidth="4"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - Math.min(progress, 1))}
                strokeLinecap="round"
                transform="rotate(-90 38 38)"
                style={{ transition: isPaused ? "none" : "stroke-dashoffset 0.25s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold font-mono text-white">
                {snapshots.length}/{SAMPLES_DEFAULT}
              </span>
            </div>
          </div>

          {/* Stability bar */}
          {handSeen && (
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

          <div className="text-center">
            <p className="text-sm text-white/60">Hold your gesture steady</p>
            <p className="text-xs text-white/30 mt-1">
              {!handSeen
                ? "Show your hand in the camera"
                : isPaused
                ? "Hold still…"
                : `Capturing… ${snapshots.length}/${SAMPLES_DEFAULT}`
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
