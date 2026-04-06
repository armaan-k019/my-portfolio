"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  PhraseEntry, PHRASE_THRESHOLD, SAMPLES_DEFAULT,
  normalizeLandmarks, weightedAverageVectors, euclidean,
  savePhraseLibrary,
} from "./calibration";

const ACCENT = "#6C47FF";
const CAPTURE_INTERVAL_MS = 600;
const STABILITY_THRESHOLD = 60;

const CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

function HandSkeleton({ vec, w, h }: { vec: number[]; w: number; h: number }) {
  const pts = Array.from({ length: 21 }, (_, i) => [vec[i * 2], vec[i * 2 + 1]] as [number, number]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rx = maxX - minX || 1, ry = maxY - minY || 1;
  const pad = 5;
  const toS = (x: number, y: number): [number, number] => [
    pad + ((x - minX) / rx) * (w - 2 * pad),
    pad + ((y - minY) / ry) * (h - 2 * pad),
  ];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      {CONNECTIONS.map(([a, b], i) => {
        const [ax, ay] = toS(pts[a][0], pts[a][1]);
        const [bx, by] = toS(pts[b][0], pts[b][1]);
        return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} stroke={ACCENT} strokeWidth="1.2" strokeOpacity="0.4" />;
      })}
      {pts.map(([px, py], i) => {
        const [sx, sy] = toS(px, py);
        return <circle key={i} cx={sx} cy={sy} r={i === 0 ? 3 : 2} fill="#a78bfa" fillOpacity={i === 0 ? 1 : 0.75} />;
      })}
    </svg>
  );
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelRef: React.MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  captureCallbackRef: React.MutableRefObject<((hands: any[]) => void) | null>;
  phraseLibrary: PhraseEntry[];
  onUpdate: (library: PhraseEntry[]) => void;
}

type TrainStep = "name" | "output" | "handcount" | "capture" | "review" | "confirm";

export default function PhraseLibrary({ videoRef, modelRef, captureCallbackRef, phraseLibrary, onUpdate }: Props) {
  const [open,            setOpen]           = useState(false);

  // Training flow
  const [training,        setTraining]       = useState(false);
  const [trainStep,       setTrainStep]      = useState<TrainStep>("name");
  const [trainName,       setTrainName]      = useState("");
  const [trainPhrase,     setTrainPhrase]    = useState("");
  const [trainTwoHanded,  setTrainTwoHanded] = useState(false);
  const [snapshots,       setSnapshots]      = useState<number[][]>([]);
  const [handSeen,        setHandSeen]       = useState(false);
  const [stability,       setStability]      = useState(100);
  const [reviewVec,       setReviewVec]      = useState<number[] | null>(null);
  // Two-handed capture state
  const [twoHandSeen,     setTwoHandSeen]    = useState(false);
  const [stabilityLeft,   setStabilityLeft]  = useState(100);
  const [stabilityRight,  setStabilityRight] = useState(100);
  const [reviewVecLeft,   setReviewVecLeft]  = useState<number[] | null>(null);
  const [reviewVecRight,  setReviewVecRight] = useState<number[] | null>(null);

  // Import / Export
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importError,      setImportError]      = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Testing
  const [testingId,  setTestingId]  = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; result: "detected" | "not_detected" } | null>(null);

  // Editing (name + phrase only, not gesture)
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editName,   setEditName]   = useState("");
  const [editPhrase, setEditPhrase] = useState("");

  // Capture refs
  const snapshotsRef   = useRef<number[][]>([]);
  const stoppedRef     = useRef(false);
  const prevVecRef     = useRef<number[] | null>(null);
  const lastCaptureRef = useRef(0);
  const captureRafRef  = useRef(0);
  // Two-handed capture refs
  const snapshotsPairsRef = useRef<[number[], number[]][]>([]); // [leftVec, rightVec] pairs
  const prevVecLeftRef    = useRef<number[] | null>(null);
  const prevVecRightRef   = useRef<number[] | null>(null);

  useEffect(() => { snapshotsRef.current = snapshots; }, [snapshots]);

  // Training capture, subscribes to the main detection loop via captureCallbackRef
  useEffect(() => {
    if (!training || trainStep !== "capture") {
      captureCallbackRef.current = null;
      return;
    }

    stoppedRef.current = false;
    snapshotsRef.current = [];
    setSnapshots([]);
    lastCaptureRef.current = 0;
    prevVecRef.current = null;
    setHandSeen(false);
    setStability(100);

    snapshotsPairsRef.current = [];
    prevVecLeftRef.current = null;
    prevVecRightRef.current = null;
    setTwoHandSeen(false);
    setStabilityLeft(100);
    setStabilityRight(100);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    captureCallbackRef.current = (hands: any[]) => {
      if (stoppedRef.current) return;
      const now = Date.now();

      if (trainTwoHanded) {
        // ── TWO-HANDED CAPTURE ──────────────────────────────────────────────
        const twoHandsPresent = hands.length >= 2;
        setTwoHandSeen(twoHandsPresent);
        console.log('capture check:', hands.length, 'hands, isCapturing: true, two-hand mode');

        if (twoHandsPresent) {
          const lm0 = hands[0].landmarks as [number, number, number][];
          const lm1 = hands[1].landmarks as [number, number, number][];
          const wrist0x = lm0[0][0];
          const wrist1x = lm1[0][0];
          const leftLm  = wrist0x < wrist1x ? lm0 : lm1;
          const rightLm = wrist0x < wrist1x ? lm1 : lm0;
          const leftVec  = normalizeLandmarks(leftLm);
          const rightVec = normalizeLandmarks(rightLm);

          let stabL = 100, stabR = 100;
          if (prevVecLeftRef.current) {
            const moveL = euclidean(leftVec, prevVecLeftRef.current);
            stabL = Math.max(0, (1 - moveL / 0.3)) * 100;
          }
          if (prevVecRightRef.current) {
            const moveR = euclidean(rightVec, prevVecRightRef.current);
            stabR = Math.max(0, (1 - moveR / 0.3)) * 100;
          }
          prevVecLeftRef.current  = leftVec;
          prevVecRightRef.current = rightVec;
          setStabilityLeft(Math.round(stabL));
          setStabilityRight(Math.round(stabR));

          const bothStable = stabL >= STABILITY_THRESHOLD && stabR >= STABILITY_THRESHOLD;
          if (bothStable && now - lastCaptureRef.current >= CAPTURE_INTERVAL_MS) {
            const cur: [number[], number[]][] = [...snapshotsPairsRef.current, [leftVec, rightVec]];
            snapshotsPairsRef.current = cur;
            setSnapshots(cur.map(p => p[0]));
            lastCaptureRef.current = now;
            if (cur.length >= SAMPLES_DEFAULT) {
              stoppedRef.current = true;
              captureCallbackRef.current = null;
              const avgLeft  = weightedAverageVectors(cur.map(p => p[0]));
              const avgRight = weightedAverageVectors(cur.map(p => p[1]));
              setReviewVecLeft(avgLeft);
              setReviewVecRight(avgRight);
              setReviewVec(avgLeft);
              setTrainStep("review");
            }
          }
        } else {
          prevVecLeftRef.current  = null;
          prevVecRightRef.current = null;
          setStabilityLeft(100);
          setStabilityRight(100);
        }
      } else {
        // ── SINGLE-HAND CAPTURE ─────────────────────────────────────────────
        const handPresent = hands.length > 0;
        setHandSeen(handPresent);
        console.log('capture check:', hands.length, 'hands, isCapturing: true, single-hand mode, stability:', prevVecRef.current ? 'tracked' : 'new');

        if (handPresent) {
          const lm  = hands[0].landmarks as [number, number, number][];
          const vec = normalizeLandmarks(lm);
          let stab = 100;
          if (prevVecRef.current) {
            const move = euclidean(vec, prevVecRef.current);
            stab = Math.max(0, (1 - move / 0.3)) * 100;
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
              captureCallbackRef.current = null;
              setReviewVec(weightedAverageVectors(cur));
              setTrainStep("review");
            }
          }
        } else {
          prevVecRef.current = null;
          setStability(100);
        }
      }
    };

    return () => {
      stoppedRef.current = true;
      captureCallbackRef.current = null;
    };
  }, [training, trainStep, trainTwoHanded, captureCallbackRef]);

  // Test loop
  useEffect(() => {
    if (!testingId) return;
    const entry = phraseLibrary.find(p => p.id === testingId);
    if (!entry) return;
    const testId      = testingId;
    const entryLandmarks = entry.landmarks;

    let stopped = false;
    let matched = false;
    let rafId   = 0;

    const timeout = setTimeout(() => {
      stopped = true;
      if (!matched) {
        setTestResult({ id: testId, result: "not_detected" });
        setTimeout(() => { setTestingId(null); setTestResult(null); }, 2000);
      }
    }, 3000);

    async function loop() {
      if (stopped) return;
      const video = videoRef.current;
      const model = modelRef.current;
      if (video && model && video.readyState >= 2) {
        try {
          const hands = await model.estimateHands(video);
          if (!stopped && hands.length > 0) {
            const lm   = hands[0].landmarks as [number, number, number][];
            const vec  = normalizeLandmarks(lm);
            const dist = euclidean(vec, entryLandmarks);
            if (dist < PHRASE_THRESHOLD) {
              matched = true;
              stopped = true;
              clearTimeout(timeout);
              setTestResult({ id: testId, result: "detected" });
              setTimeout(() => { setTestingId(null); setTestResult(null); }, 2000);
              return;
            }
          }
        } catch { /* ignore */ }
      }
      if (!stopped) rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => { stopped = true; clearTimeout(timeout); cancelAnimationFrame(rafId); };
  }, [testingId, phraseLibrary, videoRef, modelRef]);

  const cancelTraining = useCallback(() => {
    stoppedRef.current = true;
    cancelAnimationFrame(captureRafRef.current);
    setTraining(false);
    setTrainStep("name");
    setTrainName(""); setTrainPhrase("");
    setTrainTwoHanded(false);
    setSnapshots([]); snapshotsRef.current = [];
    snapshotsPairsRef.current = [];
    setReviewVec(null);
    setReviewVecLeft(null); setReviewVecRight(null);
    setHandSeen(false); setStability(100);
    setTwoHandSeen(false); setStabilityLeft(100); setStabilityRight(100);
  }, []);

  function startTraining() {
    cancelTraining();
    setTraining(true);
    setTrainStep("name");
  }

  function savePhrase() {
    if (!reviewVec) return;
    let entry: PhraseEntry;
    if (trainTwoHanded && reviewVecLeft && reviewVecRight) {
      entry = {
        id: `phrase_${Date.now()}`,
        name: trainName.trim(),
        phrase: trainPhrase.trim(),
        landmarks: reviewVecLeft, // fallback: use left hand as primary
        twoHanded: true,
        landmarksLeft: reviewVecLeft,
        landmarksRight: reviewVecRight,
        createdAt: new Date().toISOString(),
        timesTriggered: 0,
      };
    } else {
      entry = {
        id: `phrase_${Date.now()}`,
        name: trainName.trim(),
        phrase: trainPhrase.trim(),
        landmarks: reviewVec,
        createdAt: new Date().toISOString(),
        timesTriggered: 0,
      };
    }
    const updated = [...phraseLibrary, entry];
    savePhraseLibrary(updated);
    onUpdate(updated);
    setTrainStep("confirm");
  }

  function deletePhrase(id: string) {
    const updated = phraseLibrary.filter(p => p.id !== id);
    savePhraseLibrary(updated);
    onUpdate(updated);
  }

  function commitEdit() {
    if (!editingId) return;
    const updated = phraseLibrary.map(p =>
      p.id === editingId
        ? { ...p, name: editName.trim(), phrase: editPhrase.trim() }
        : p,
    );
    savePhraseLibrary(updated);
    onUpdate(updated);
    setEditingId(null);
  }

  function exportLibrary() {
    const blob = new Blob([JSON.stringify(phraseLibrary, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "asl-flow-phrases.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        if (!Array.isArray(raw)) throw new Error();
        const valid = (raw as unknown[]).filter((x): x is Record<string, unknown> => {
          if (typeof x !== "object" || x === null) return false;
          const o = x as Record<string, unknown>;
          return typeof o.name === "string" && typeof o.phrase === "string" && Array.isArray(o.landmarks);
        });
        if (valid.length === 0) throw new Error();
        const imported: PhraseEntry[] = valid.map(v => ({
          id: `phrase_import_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: String(v.name).trim(),
          phrase: String(v.phrase).trim(),
          landmarks: v.landmarks as number[],
          createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date().toISOString(),
          timesTriggered: typeof v.timesTriggered === "number" ? v.timesTriggered : 0,
        }));
        const merged = [...phraseLibrary, ...imported];
        savePhraseLibrary(merged);
        onUpdate(merged);
        setImportExportOpen(false);
      } catch {
        setImportError("File format not recognized");
      }
    };
    reader.readAsText(file);
  }

  const stabColor   = stability >= 80 ? "#22c55e" : stability >= 50 ? "#f59e0b" : "#ef4444";
  const stabColorL  = stabilityLeft  >= 80 ? "#22c55e" : stabilityLeft  >= 50 ? "#f59e0b" : "#ef4444";
  const stabColorR  = stabilityRight >= 80 ? "#22c55e" : stabilityRight >= 50 ? "#f59e0b" : "#ef4444";
  const isPaused    = trainTwoHanded
    ? twoHandSeen && (stabilityLeft < STABILITY_THRESHOLD || stabilityRight < STABILITY_THRESHOLD)
    : stability < STABILITY_THRESHOLD && handSeen;
  const captureProgress = snapshots.length / SAMPLES_DEFAULT;
  const r = 30, circ = 2 * Math.PI * r;

  return (
    <div className="mt-3 rounded-lg border border-white/10 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Phrase Library</p>
          {phraseLibrary.length > 0 && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${ACCENT}30`, color: "#a78bfa" }}
            >
              {phraseLibrary.length}
            </span>
          )}
        </div>
        <span className="text-white/30 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-white/10">

          {/* Action bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <button
              onClick={training ? cancelTraining : startTraining}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: training ? "#444" : ACCENT }}
            >
              {training ? "Cancel" : "Train new phrase"}
            </button>
            <button
              onClick={() => setImportExportOpen(o => !o)}
              className="px-3 py-1.5 rounded-lg text-[11px] text-white/40 border border-white/15 hover:text-white/60 hover:border-white/25 transition-colors"
            >
              Import / Export
            </button>
          </div>

          {/* Import / Export panel */}
          {importExportOpen && (
            <div className="px-4 py-3 border-b border-white/10 space-y-3 bg-white/3">
              <div className="space-y-2">
                <p className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">Export</p>
                <button
                  onClick={exportLibrary}
                  disabled={phraseLibrary.length === 0}
                  className="w-full py-2 rounded-lg text-[11px] text-white/60 border border-white/15 hover:text-white/80 hover:border-white/25 transition-colors disabled:opacity-30"
                >
                  Download asl-flow-phrases.json
                </button>
                <p className="text-[9px] text-white/25">
                  Share this file with another device to use your phrase library anywhere.
                </p>
              </div>
              <div className="border-t border-white/10 pt-3 space-y-2">
                <p className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">Import</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 rounded-lg text-[11px] text-white/60 border border-white/15 hover:text-white/80 hover:border-white/25 transition-colors"
                >
                  Choose .json file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleImportFile(e.target.files[0]); }}
                />
                {importError && <p className="text-[10px] text-red-400">{importError}</p>}
              </div>
            </div>
          )}

          {/* Inline training flow */}
          {training && (
            <div className="px-4 py-4 border-b border-white/10 space-y-4 bg-white/3">

              {/* Step indicators */}
              <div className="flex items-center gap-1.5">
                {(["name", "output", "handcount", "capture", "review", "confirm"] as TrainStep[]).map((s, i) => (
                  <div
                    key={s}
                    className="h-1 flex-1 rounded-full transition-all"
                    style={{
                      backgroundColor:
                        s === trainStep ? ACCENT :
                        (["name","output","handcount","capture","review","confirm"].indexOf(trainStep) > i) ? "#a78bfa60" : "#ffffff15",
                    }}
                  />
                ))}
              </div>

              {/* Step 1: Name */}
              {trainStep === "name" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                      What do you want to call this gesture?
                    </label>
                    <input
                      type="text"
                      value={trainName}
                      onChange={e => setTrainName(e.target.value)}
                      placeholder="e.g. Thumbs up, Peace sign, OK"
                      autoFocus
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-white/5 border border-white/15 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                    />
                    <p className="mt-1 text-[9px] text-white/25">This is just for your reference, not the output.</p>
                  </div>
                  <button
                    onClick={() => setTrainStep("output")}
                    disabled={trainName.trim().length === 0}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-30 transition-all"
                    style={{ backgroundColor: ACCENT }}
                  >
                    Next
                  </button>
                </div>
              )}

              {/* Step 2: Output phrase */}
              {trainStep === "output" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">
                      What should it type?
                    </label>
                    <textarea
                      value={trainPhrase}
                      onChange={e => setTrainPhrase(e.target.value)}
                      placeholder={"e.g. Thank you, On my way, Sounds good"}
                      rows={3}
                      autoFocus
                      className="w-full px-3 py-2.5 rounded-lg text-sm bg-white/5 border border-white/15 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[9px] text-white/25">Any word, phrase, or emoji.</p>
                      <p className="text-[9px] text-white/30 font-mono">{trainPhrase.length} chars</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTrainStep("name")}
                      className="flex-1 py-2.5 rounded-lg text-sm text-white/40 border border-white/15 hover:text-white/60 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setTrainStep("handcount")}
                      disabled={trainPhrase.trim().length === 0}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-30 transition-all"
                      style={{ backgroundColor: ACCENT }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2b: Hand count selection */}
              {trainStep === "handcount" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3">
                      One-handed or two-handed?
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setTrainTwoHanded(false); setTrainStep("capture"); }}
                        className="flex-1 py-3 rounded-lg text-sm font-semibold border transition-all hover:border-white/30"
                        style={{ backgroundColor: "#ffffff08", borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
                      >
                        One hand
                      </button>
                      <button
                        onClick={() => { setTrainTwoHanded(true); setTrainStep("capture"); }}
                        className="flex-1 py-3 rounded-lg text-sm font-semibold border transition-all"
                        style={{ backgroundColor: `${ACCENT}20`, borderColor: `${ACCENT}60`, color: "#a78bfa" }}
                      >
                        Two hands ✌
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setTrainStep("output")}
                    className="w-full py-2 rounded-lg text-sm text-white/40 border border-white/15 hover:text-white/60 transition-colors"
                  >
                    Back
                  </button>
                </div>
              )}

              {/* Step 3: Capture */}
              {trainStep === "capture" && (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-xs text-white/50 text-center">
                    {trainTwoHanded
                      ? "Show both hands in frame and hold them steady."
                      : "Now show the gesture and hold it steady."}
                  </p>

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
                        strokeDashoffset={circ * (1 - Math.min(captureProgress, 1))}
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

                  {/* Stability bars */}
                  {trainTwoHanded ? (
                    twoHandSeen && (
                      <div className="w-full space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-white/30">Left hand stability</span>
                            <span className="text-[10px] font-mono font-bold" style={{ color: stabColorL }}>{stabilityLeft}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-150" style={{ width: `${stabilityLeft}%`, backgroundColor: stabColorL }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-white/30">Right hand stability</span>
                            <span className="text-[10px] font-mono font-bold" style={{ color: stabColorR }}>{stabilityRight}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-150" style={{ width: `${stabilityRight}%`, backgroundColor: stabColorR }} />
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    handSeen && (
                      <div className="w-full">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-white/30">Stability</span>
                          <span className="text-[10px] font-mono font-bold" style={{ color: stabColor }}>{stability}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-150" style={{ width: `${stability}%`, backgroundColor: stabColor }} />
                        </div>
                      </div>
                    )
                  )}

                  <p className="text-xs text-white/40 text-center">
                    {trainTwoHanded
                      ? (!twoHandSeen ? "Show both hands in the camera" : isPaused ? "Hold both hands still..." : `Capturing... ${snapshots.length}/${SAMPLES_DEFAULT}`)
                      : (!handSeen ? "Show your hand in the camera" : isPaused ? "Hold still..." : `Capturing... ${snapshots.length}/${SAMPLES_DEFAULT}`)}
                  </p>
                </div>
              )}

              {/* Step 4: Review */}
              {trainStep === "review" && reviewVec && (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-xs text-white/60 text-center">
                    Does this look like <span className="font-bold text-white">&ldquo;{trainName}&rdquo;</span>?
                  </p>
                  {trainTwoHanded && reviewVecLeft && reviewVecRight ? (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-white/30 uppercase tracking-widest">Left</span>
                        <div className="rounded-xl bg-white/5 border border-[#378ADD30] p-2">
                          <HandSkeleton vec={reviewVecLeft} w={80} h={90} />
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-white/30 uppercase tracking-widest">Right</span>
                        <div className="rounded-xl bg-white/5 border border-[#6C47FF30] p-2">
                          <HandSkeleton vec={reviewVecRight} w={80} h={90} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <HandSkeleton vec={reviewVec} w={110} h={120} />
                    </div>
                  )}
                  <p className="text-xs text-white/40 text-center">
                    When triggered, it will type: <span className="font-semibold text-white/70">&ldquo;{trainPhrase}&rdquo;</span>
                  </p>
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => {
                        setReviewVec(null);
                        setReviewVecLeft(null);
                        setReviewVecRight(null);
                        setSnapshots([]);
                        snapshotsRef.current = [];
                        snapshotsPairsRef.current = [];
                        setTrainStep("capture");
                      }}
                      className="flex-1 py-2.5 rounded-lg text-sm text-white/50 border border-white/15 hover:text-white/70 transition-colors"
                    >
                      Try again
                    </button>
                    <button
                      onClick={savePhrase}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                      style={{ backgroundColor: ACCENT }}
                    >
                      Save phrase
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Confirm */}
              {trainStep === "confirm" && (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-green-400 font-semibold">Phrase saved!</p>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Every time you sign <span className="font-bold text-white">&ldquo;{trainName}&rdquo;</span>, it will output: <span className="font-bold text-white/80">&ldquo;{trainPhrase}&rdquo;</span>
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={startTraining}
                      className="flex-1 py-2.5 rounded-lg text-sm text-white/50 border border-white/15 hover:text-white/70 transition-colors"
                    >
                      Train another
                    </button>
                    <button
                      onClick={cancelTraining}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
                      style={{ backgroundColor: ACCENT }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Phrase list */}
          <div className="px-4 py-3">
            {phraseLibrary.length === 0 ? (
              <div className="py-4 space-y-4">
                <p className="text-[10px] text-white/25 text-center leading-relaxed">
                  No phrases yet. Train your first gesture to get started - any hand position can map to any word or phrase.
                </p>
                <div className="space-y-2">
                  <p className="text-[9px] text-white/25 uppercase tracking-widest text-center">Suggested two-handed presets</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {[
                      { name: "Hello", phrase: "Hello", hint: "Both hands open, palms out" },
                      { name: "I need help", phrase: "I need help", hint: "Both fists" },
                      { name: "One moment please", phrase: "One moment please", hint: "One open + one fist" },
                    ].map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setTrainName(preset.name);
                          setTrainPhrase(preset.phrase);
                          setTraining(true);
                          setTrainStep("handcount");
                        }}
                        title={preset.hint}
                        className="px-2.5 py-1.5 rounded-full text-[10px] border transition-all hover:border-white/25 hover:text-white/60"
                        style={{ backgroundColor: `${ACCENT}10`, borderColor: `${ACCENT}30`, color: "#a78bfa" }}
                      >
                        ✌ {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {phraseLibrary.map(entry => {
                  const isEditing  = editingId === entry.id;
                  const isTesting  = testingId === entry.id;
                  const thisResult = testResult?.id === entry.id ? testResult.result : null;

                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-white/10 overflow-hidden"
                      style={{ backgroundColor: "#ffffff04" }}
                    >
                      {/* Main row */}
                      <div className="flex items-center gap-3 p-3">
                        {/* Skeleton preview */}
                        <div className="rounded bg-white/5 p-1 shrink-0">
                          <HandSkeleton vec={entry.landmarks} w={54} h={60} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <div className="space-y-1.5">
                              <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                placeholder="Gesture name"
                                className="w-full px-2 py-1 text-xs rounded bg-white/5 border border-white/15 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30"
                              />
                              <input
                                type="text"
                                value={editPhrase}
                                onChange={e => setEditPhrase(e.target.value)}
                                placeholder="Output phrase"
                                className="w-full px-2 py-1 text-xs rounded bg-white/5 border border-white/15 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30"
                              />
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-semibold text-white/80 truncate">{entry.name}</p>
                                {entry.twoHanded && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                                    style={{ backgroundColor: "#6C47FF25", color: "#6C47FF" }}
                                  >
                                    ✌ 2-hand
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-white/40 truncate mt-0.5">
                                &ldquo;{entry.phrase}&rdquo;
                              </p>
                              {entry.timesTriggered > 0 && (
                                <p className="text-[9px] text-white/20 mt-0.5">Used {entry.timesTriggered} {entry.timesTriggered === 1 ? "time" : "times"}</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action row */}
                      <div className="flex items-center gap-1 px-3 pb-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={commitEdit}
                              disabled={!editName.trim() || !editPhrase.trim()}
                              className="px-2.5 py-1 rounded text-[10px] font-semibold text-white disabled:opacity-30 transition-all"
                              style={{ backgroundColor: ACCENT }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 rounded text-[10px] text-white/35 border border-white/15 hover:text-white/55 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                if (isTesting) { setTestingId(null); setTestResult(null); return; }
                                setTestingId(entry.id);
                                setTestResult(null);
                              }}
                              className="px-2.5 py-1 rounded text-[10px] border transition-colors"
                              style={{
                                color: thisResult === "detected" ? "#22c55e" : thisResult === "not_detected" ? "#ef4444" : isTesting ? "#f59e0b" : "rgba(255,255,255,0.35)",
                                borderColor: thisResult === "detected" ? "#22c55e50" : thisResult === "not_detected" ? "#ef444450" : isTesting ? "#f59e0b50" : "rgba(255,255,255,0.12)",
                              }}
                            >
                              {thisResult === "detected" ? "Detected" : thisResult === "not_detected" ? "Not detected" : isTesting ? "Testing..." : "Test"}
                            </button>
                            <button
                              onClick={() => { setEditingId(entry.id); setEditName(entry.name); setEditPhrase(entry.phrase); }}
                              className="px-2.5 py-1 rounded text-[10px] text-white/35 border border-white/12 hover:text-white/55 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deletePhrase(entry.id)}
                              className="px-2.5 py-1 rounded text-[10px] text-white/25 border border-white/10 hover:text-red-400 hover:border-red-400/30 transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
