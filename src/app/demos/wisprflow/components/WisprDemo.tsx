"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ASL_GESTURES } from "./aslGestures";
import { classifyLandmarks } from "./landmarkClassifier";
import CalibrationModal from "./CalibrationModal";
import CustomGestureModal from "./CustomGestureModal";
import PhraseLibrary from "./PhraseLibrary";
import {
  type CalibrationMap, type SeparationVector, type CustomGesture, type PhraseEntry,
  CALIB_LETTERS, CALIB_THRESHOLD, PHRASE_THRESHOLD,
  normalizeLandmarks, matchPersonalWithDisambiguation, matchCustom, matchPhrase,
  matchTwoHandedPhrase,
  loadCalibration, saveCalibration, clearCalibration, clearSeparationVectors,
  loadSeparationVectors,
  loadCustomGestures, saveCustomGestures, clearCustomGestures,
  loadPhraseLibrary, savePhraseLibrary,
} from "./calibration";

// ─── Constants ───────────────────────────────────────────────────────────────

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

const CONFIDENCE_THRESHOLD = 8.0;
const HOLD_MS = 800;
const FIST_HOLD_MS = 2000;
const ACCENT = "#6C47FF";
const SHORTCUTS_KEY = "asl_flow_shortcuts";
const SHORTCUTS_ENABLED_KEY = "asl_flow_shortcuts_enabled";
const PRED_ENABLED_KEY = "asl_flow_pred_enabled";
const MAX_PREDICTIONS = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelState = "loading" | "ready" | "error";
type CameraState = "prompt" | "granted" | "denied" | "unavailable";
interface Shortcut { sequence: string; phrase: string; }

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { sequence: "GM",  phrase: "Good morning, " },
  { sequence: "TY",  phrase: "Thank you" },
  { sequence: "NP",  phrase: "No problem" },
  { sequence: "BRB", phrase: "Be right back" },
];

// ─── Finger count helper ──────────────────────────────────────────────────────
// Returns number of extended fingers (0–5) using handpose landmarks.
// Index/middle/ring/pinky: extended if tip Y < pip Y (higher on screen).
// Thumb: extended if tip Y < IP joint Y (rough approximation).

function countExtendedFingers(landmarks: [number, number, number][]): number {
  let count = 0;
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (landmarks[tips[i]][1] < landmarks[pips[i]][1]) count++;
  }
  if (landmarks[4][1] < landmarks[3][1]) count++; // thumb
  return count;
}

// ─── Progress ring ────────────────────────────────────────────────────────────

function ProgressRing({
  progress,
  letter,
  label = "hold to confirm",
}: {
  progress: number;
  letter: string | null;
  label?: string;
}) {
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(progress, 1));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} fill="none" stroke="#ffffff15" strokeWidth="3" />
        <circle
          cx="35" cy="35" r={r}
          fill="none" stroke={ACCENT} strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 35 35)"
          style={{ transition: progress === 0 ? "none" : "stroke-dashoffset 0.05s linear" }}
        />
        <text
          x="35" y="35" textAnchor="middle" dominantBaseline="central"
          fill={letter ? "white" : "#ffffff30"}
          fontSize={letter ? "22" : "13"} fontWeight="700" fontFamily="monospace"
        >
          {letter ?? "-"}
        </text>
      </svg>
      <span className="text-[10px] text-white/30">{label}</span>
    </div>
  );
}

// ─── Waveform bars ────────────────────────────────────────────────────────────

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[3, 5, 8, 5, 3, 7, 4, 6, 3, 5].map((h, i) => (
        <div
          key={i} className="w-1 rounded-full"
          style={{
            height: active ? `${h * 2}px` : "4px",
            backgroundColor: active ? "#60a5fa" : "#ffffff20",
            transition: active ? `height ${0.2 + i * 0.05}s ease-in-out` : "height 0.15s",
            animation: active ? `pulse-bar ${0.4 + (i % 3) * 0.15}s ease-in-out infinite alternate` : "none",
          }}
        />
      ))}
      <style>{`@keyframes pulse-bar{from{transform:scaleY(.5)}to{transform:scaleY(1.2)}}`}</style>
    </div>
  );
}

// ─── Blinking cursor ──────────────────────────────────────────────────────────

function BlinkingCursor() {
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setVis(v => !v), 530);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-0.5 h-4 ml-0.5 align-text-bottom" style={{ backgroundColor: ACCENT, opacity: vis ? 1 : 0 }} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WisprDemo() {
  // ── Refs ─────────────────────────────────────────────────────────────────
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const streamRef   = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelRef    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estimatorRef = useRef<any>(null);
  const holdRef             = useRef<{ letter: string; start: number } | null>(null);
  const fingerHoldRef       = useRef<{ count: number; start: number } | null>(null);
  const fistHoldRef         = useRef<{ start: number } | null>(null);
  const isSentenceReadingRef = useRef(false);
  const outputTextRef       = useRef("");
  const predictionsRef      = useRef<string[]>([]);
  const shortcutsRef        = useRef<Shortcut[]>(DEFAULT_SHORTCUTS);
  const shortcutsEnabledRef = useRef(true);
  const predEnabledRef      = useRef(false);
  const predAbortRef        = useRef<AbortController | null>(null);
  const calibrationRef      = useRef<CalibrationMap>({});
  const separationVecsRef   = useRef<SeparationVector[]>([]);
  const customGesturesRef   = useRef<CustomGesture[]>([]);
  const phraseLibraryRef    = useRef<PhraseEntry[]>([]);
  const phraseHoldRef       = useRef<{ id: string; start: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const captureCallbackRef  = useRef<((hands: any[]) => void) | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [modelState,       setModelState]       = useState<ModelState>("loading");
  const [cameraState,      setCameraState]      = useState<CameraState>("prompt");
  const [webglWarning,     setWebglWarning]     = useState(false);
  const [detectedLetter,   setDetectedLetter]   = useState<string | null>(null);
  const [confidence,       setConfidence]       = useState(0);
  const [holdProgress,     setHoldProgress]     = useState(0);
  const [handDetected,     setHandDetected]     = useState(false);
  const [outputText,       setOutputText]       = useState("");
  const [isSpeaking,       setIsSpeaking]       = useState(false);
  const [isReceiving,      setIsReceiving]      = useState(false);
  const [confirmedLetters, setConfirmedLetters] = useState<string[]>([]);
  const [readingWord,      setReadingWord]      = useState<string | null>(null);
  const [expandedPhrase,   setExpandedPhrase]   = useState<string | null>(null);
  const [predictions,      setPredictions]      = useState<string[]>([]);
  const [predLoading,      setPredLoading]      = useState(false);
  const [shortcuts,         setShortcuts]         = useState<Shortcut[]>(DEFAULT_SHORTCUTS);
  const [shortcutsOpen,     setShortcutsOpen]     = useState(false);
  const [shortcutsEnabled,  setShortcutsEnabled]  = useState(true);
  const [predEnabled,       setPredEnabled]       = useState(false);
  const [shortcutFlash,     setShortcutFlash]     = useState<string | null>(null);
  const [newSeq,            setNewSeq]            = useState("");
  const [newPhrase,         setNewPhrase]         = useState("");
  const [isSentenceReading, setIsSentenceReading] = useState(false);
  const [fistHoldProgress,  setFistHoldProgress]  = useState(0);
  const [readingSentence,   setReadingSentence]   = useState<string | null>(null);
  const [activeFingerCount, setActiveFingerCount] = useState<number | null>(null);
  const [calibration,          setCalibration]          = useState<CalibrationMap>({});
  const [isPersonalSign,       setIsPersonalSign]       = useState(false);
  const [isDisambiguated,      setIsDisambiguated]      = useState(false);
  const [disambigCandidates,   setDisambigCandidates]   = useState<[string, string] | null>(null);
  const [showCalibration,      setShowCalibration]      = useState(false);
  const [recalibLetter,        setRecalibLetter]        = useState<string | null>(null);
  const [customGestures,       setCustomGestures]       = useState<CustomGesture[]>([]);
  const [showCustomGesture,    setShowCustomGesture]    = useState(false);
  const [calibTab,             setCalibTab]             = useState<"personal" | "custom">("personal");
  const [phraseLibrary,        setPhraseLibrary]        = useState<PhraseEntry[]>([]);
  const [phraseFlash,          setPhraseFlash]          = useState<{ name: string } | null>(null);
  const [isPhraseDetection,    setIsPhraseDetection]    = useState(false);
  const [twoHandsDetected,     setTwoHandsDetected]     = useState(false);

  // Keep shortcutsRef current
  useEffect(() => { shortcutsRef.current = shortcuts; }, [shortcuts]);

  // Keep shortcutsEnabledRef current
  useEffect(() => { shortcutsEnabledRef.current = shortcutsEnabled; }, [shortcutsEnabled]);

  // Keep predEnabledRef current
  useEffect(() => { predEnabledRef.current = predEnabled; }, [predEnabled]);

  // ── Load model ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadModel() {
      try {
        const tf = await import("@tensorflow/tfjs");
        try { await tf.setBackend("webgl"); await tf.ready(); }
        catch { setWebglWarning(true); await tf.setBackend("cpu"); await tf.ready(); }

        const handpose = await import("@tensorflow-models/handpose");
        modelRef.current = await handpose.load();

        const { GestureEstimator } = await import("fingerpose");
        estimatorRef.current = new GestureEstimator(ASL_GESTURES);

        setModelState("ready");
      } catch (err) {
        console.error("Model load failed:", err);
        setModelState("error");
      }
    }
    loadModel();
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      window.speechSynthesis?.cancel();
    };
  }, []);

  // ── Load persisted settings from localStorage ─────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SHORTCUTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Shortcut[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setShortcuts(parsed);
          shortcutsRef.current = parsed;
        }
      }
      // shortcuts enabled - default ON (always reset to true so it's never stuck off)
      const enabledStored = localStorage.getItem(SHORTCUTS_ENABLED_KEY);
      const shortcutsOn = enabledStored === null || enabledStored === "true";
      setShortcutsEnabled(shortcutsOn);
      shortcutsEnabledRef.current = shortcutsOn;

      // AI predictions - default OFF (opt-in)
      const predStored = localStorage.getItem(PRED_ENABLED_KEY);
      const predOn = predStored === "true";
      setPredEnabled(predOn);
      predEnabledRef.current = predOn;

      // Personal calibration
      const calib = loadCalibration();
      setCalibration(calib);
      calibrationRef.current = calib;

      // Separation vectors
      const sepVecs = loadSeparationVectors();
      separationVecsRef.current = sepVecs;

      // Custom gestures
      const customs = loadCustomGestures();
      setCustomGestures(customs);
      customGesturesRef.current = customs;

      // Phrase library
      const phrases = loadPhraseLibrary();
      setPhraseLibrary(phrases);
      phraseLibraryRef.current = phrases;
    } catch { /* ignore */ }
  }, []);

  const triggerPhrase = useCallback((entry: PhraseEntry) => {
    // Append phrase + space to output
    const newText = outputTextRef.current + entry.phrase + " ";
    outputTextRef.current = newText;
    setOutputText(newText);

    // Speak
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(entry.phrase));
    }

    // Flash indicator
    setPhraseFlash({ name: entry.name });
    setTimeout(() => setPhraseFlash(null), 1500);

    // Increment usage count
    const updated = phraseLibraryRef.current.map(p =>
      p.id === entry.id ? { ...p, timesTriggered: p.timesTriggered + 1 } : p,
    );
    phraseLibraryRef.current = updated;
    savePhraseLibrary(updated);
    setPhraseLibrary(updated);

    // Reset hold state
    phraseHoldRef.current = null;
    setHoldProgress(0);
    setDetectedLetter(null);
    setConfidence(0);
  }, []);

  const saveShortcuts = useCallback((list: Shortcut[]) => {
    setShortcuts(list);
    shortcutsRef.current = list;
    try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }, []);

  // ── Read full sentence aloud ──────────────────────────────────────────────
  const readSentence = useCallback(() => {
    const text = outputTextRef.current.trim();
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate  = 0.9;
    utt.pitch = 0.95;
    utt.onstart = () => {
      setIsSpeaking(true);
      setIsSentenceReading(true);
      isSentenceReadingRef.current = true;
      setReadingSentence(text);
    };
    utt.onend = () => {
      setIsSpeaking(false);
      setIsSentenceReading(false);
      isSentenceReadingRef.current = false;
      setReadingSentence(null);
    };
    window.speechSynthesis.speak(utt);
  }, []);

  // ── Speak a word ──────────────────────────────────────────────────────────
  const speakWord = useCallback((word: string) => {
    if (!window.speechSynthesis || !word) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(word);
    utt.rate = 0.9;
    utt.onstart = () => { setIsSpeaking(true); setReadingWord(word); };
    utt.onend   = () => { setIsSpeaking(false); setReadingWord(null); };
    window.speechSynthesis.speak(utt);
  }, []);

  // ── Fetch AI predictions helper ───────────────────────────────────────────
  const fetchPredictions = useCallback((text: string) => {
    if (!predEnabledRef.current) return;
    setPredictions([]);
    predictionsRef.current = [];
    predAbortRef.current?.abort();
    const ac = new AbortController();
    predAbortRef.current = ac;
    setTimeout(() => ac.abort(), 5000);
    setPredLoading(true);
    fetch("/api/asl-predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ac.signal,
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.predictions) && data.predictions.length > 0) {
          const sliced = data.predictions.slice(0, MAX_PREDICTIONS).map(String);
          setPredictions(sliced);
          predictionsRef.current = sliced;
        }
      })
      .catch(() => {})
      .finally(() => setPredLoading(false));
  }, []);

  // ── Select a prediction ───────────────────────────────────────────────────
  const selectPrediction = useCallback((idx: number) => {
    const word = predictionsRef.current[idx];
    if (!word) return;
    const next = outputTextRef.current + word + " ";
    outputTextRef.current = next;
    setOutputText(next);
    setPredictions([]);
    predictionsRef.current = [];
    fingerHoldRef.current = null;
    speakWord(word);
    fetchPredictions(next);
  }, [speakWord, fetchPredictions]);

  // ── Confirm a letter (silent - words spoken on spacebar) ──────────────────
  const confirmLetter = useCallback((letter: string) => {
    // Clear predictions whenever user resumes signing
    if (predictionsRef.current.length > 0) {
      setPredictions([]);
      predictionsRef.current = [];
    }

    const next = outputTextRef.current + letter;
    outputTextRef.current = next;
    setOutputText(next);

    setConfirmedLetters(prev => [...prev, letter]);
    setIsReceiving(true);
    setHoldProgress(0);
    holdRef.current = null;
    setTimeout(() => setIsReceiving(false), 600);
  }, []);

  // ── Draw hand landmarks ───────────────────────────────────────────────────
  const drawHandOnCtx = useCallback((
    landmarks: [number, number, number][],
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    color: string,
  ) => {
    ctx.strokeStyle = color + "73"; // ~45% opacity
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      const mx1 = canvasWidth - landmarks[a][0];
      const mx2 = canvasWidth - landmarks[b][0];
      ctx.beginPath();
      ctx.moveTo(mx1, landmarks[a][1]);
      ctx.lineTo(mx2, landmarks[b][1]);
      ctx.stroke();
    }
    for (const [x, y] of landmarks) {
      ctx.beginPath();
      ctx.arc(canvasWidth - x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, []);

  const drawHand = useCallback((
    landmarks: [number, number, number][],
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width  = video.videoWidth  || canvas.offsetWidth;
    canvas.height = video.videoHeight || canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawHandOnCtx(landmarks, ctx, canvas.width, ACCENT);
  }, [drawHandOnCtx]);

  const drawTwoHands = useCallback((
    leftLandmarks: [number, number, number][],
    rightLandmarks: [number, number, number][],
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width  = video.videoWidth  || canvas.offsetWidth;
    canvas.height = video.videoHeight || canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawHandOnCtx(leftLandmarks, ctx, canvas.width, "#378ADD");
    drawHandOnCtx(rightLandmarks, ctx, canvas.width, "#6C47FF");
  }, [drawHandOnCtx]);

  // ── Detection loop ────────────────────────────────────────────────────────
  const detect = useCallback(async () => {
    const video     = videoRef.current;
    const canvas    = canvasRef.current;
    const model     = modelRef.current;
    const estimator = estimatorRef.current;

    if (!video || !canvas || !model || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }

    try {
      const hands = await model.estimateHands(video, true);
      console.log('hands detected:', hands.length, hands);

      // Feed live predictions to training capture if active
      captureCallbackRef.current?.(hands);

      if (hands.length >= 2) {
        // ── TWO-HAND MODE: only run two-handed phrase matching ──────────────
        setHandDetected(true);
        setTwoHandsDetected(true);

        // Determine left vs right by wrist x-position (lower x = left in mirrored view)
        const lm0 = hands[0].landmarks as [number, number, number][];
        const lm1 = hands[1].landmarks as [number, number, number][];
        const wrist0x = lm0[0][0];
        const wrist1x = lm1[0][0];
        const leftLandmarks  = wrist0x < wrist1x ? lm0 : lm1;
        const rightLandmarks = wrist0x < wrist1x ? lm1 : lm0;

        drawTwoHands(leftLandmarks, rightLandmarks, canvas, video);

        const leftVec  = normalizeLandmarks(leftLandmarks);
        const rightVec = normalizeLandmarks(rightLandmarks);

        // Suppress all letter detection
        holdRef.current = null;
        fingerHoldRef.current = null;
        fistHoldRef.current = null;
        setFistHoldProgress(0);
        setIsPersonalSign(false);
        setIsDisambiguated(false);
        setDisambigCandidates(null);
        setActiveFingerCount(null);

        const twoHandMatch = matchTwoHandedPhrase(leftVec, rightVec, phraseLibraryRef.current);
        console.log("Two-hand check:", twoHandMatch?.entry.name ?? "none", twoHandMatch?.distance.toFixed(3) ?? "999");

        if (twoHandMatch) {
          setIsPhraseDetection(true);
          setDetectedLetter(`\u270C ${twoHandMatch.entry.name}`);
          setConfidence(Math.round((1 - twoHandMatch.distance / 0.20) * 100));

          const now = Date.now();
          const pid = twoHandMatch.entry.id;
          if (phraseHoldRef.current?.id === pid) {
            const elapsed = now - phraseHoldRef.current.start;
            setHoldProgress(Math.min(elapsed / HOLD_MS, 1));
            if (elapsed >= HOLD_MS) triggerPhrase(twoHandMatch.entry);
          } else {
            phraseHoldRef.current = { id: pid, start: now };
            setHoldProgress(0);
          }
        } else {
          setIsPhraseDetection(false);
          phraseHoldRef.current = null;
          setDetectedLetter("\u270C Two-hand gesture");
          setConfidence(0);
          setHoldProgress(0);
        }
      } else if (hands.length === 1) {
        setTwoHandsDetected(false);
        setHandDetected(true);
        const landmarks = hands[0].landmarks as [number, number, number][];
        drawHand(landmarks, canvas, video);

        if (predictionsRef.current.length > 0) {
          // ── PREDICTION SELECTION MODE: count fingers, suppress letters ──
          setDetectedLetter(null);
          setConfidence(0);
          setHoldProgress(0);
          holdRef.current = null;

          const count = countExtendedFingers(landmarks);
          if (count >= 1 && count <= predictionsRef.current.length) {
            const now = Date.now();
            if (fingerHoldRef.current?.count === count) {
              if (now - fingerHoldRef.current.start >= HOLD_MS) {
                setActiveFingerCount(null);
                selectPrediction(count - 1);
              }
            } else {
              fingerHoldRef.current = { count, start: now };
              setActiveFingerCount(count);
            }
          } else {
            fingerHoldRef.current = null;
            setActiveFingerCount(null);
          }
        } else {
          // ── NORMAL LETTER DETECTION ─────────────────────────────────────
          fingerHoldRef.current = null;

          const normVec = normalizeLandmarks(landmarks);

          // Step 1: Phrase library (highest priority)
          const phraseMatch = matchPhrase(normVec, phraseLibraryRef.current);
          // Debug: log top phrase match distance on every frame
          if (phraseLibraryRef.current.length > 0) {
            const bestPhraseName = phraseMatch?.entry.name ?? "none";
            const bestPhraseDistance = phraseMatch?.distance ?? 999;
            console.log("Phrase check:", bestPhraseName, bestPhraseDistance.toFixed(3));
          }
          if (phraseMatch) {
            holdRef.current = null;
            setIsPersonalSign(false);
            setIsDisambiguated(false);
            setDisambigCandidates(null);
            setIsPhraseDetection(true);
            setDetectedLetter(`${phraseMatch.entry.name} \u2192`);
            setConfidence(Math.round((1 - phraseMatch.distance / PHRASE_THRESHOLD) * 100));

            const now = Date.now();
            const pid = phraseMatch.entry.id;
            if (phraseHoldRef.current?.id === pid) {
              const elapsed = now - phraseHoldRef.current.start;
              setHoldProgress(Math.min(elapsed / HOLD_MS, 1));
              if (elapsed >= HOLD_MS) triggerPhrase(phraseMatch.entry);
            } else {
              phraseHoldRef.current = { id: pid, start: now };
              setHoldProgress(0);
            }
          } else {
          setIsPhraseDetection(false);
          phraseHoldRef.current = null;

          // Detection priority: Custom gestures → Personal calibration (w/ disambiguation) → Fingerpose
          let letter: string | null = null;
          let conf = 0;
          let usingPersonal = false;
          let disambiguated = false;
          let candidates: [string, string] | null = null;

          const customMatch = matchCustom(normVec, customGesturesRef.current);
          if (customMatch) {
            letter = customMatch.gesture.output;
            conf   = Math.round((1 - customMatch.distance / CALIB_THRESHOLD) * 100);
            usingPersonal = true;
          } else {
            const personal = matchPersonalWithDisambiguation(
              normVec, calibrationRef.current, separationVecsRef.current,
            );
            if (personal) {
              letter        = personal.letter;
              conf          = Math.round((1 - personal.distance / CALIB_THRESHOLD) * 100);
              usingPersonal = true;
              disambiguated = personal.disambiguated;
              candidates    = personal.candidates ?? null;
            } else {
              // Landmark-based classifier runs before fingerpose: it uses the
              // full 21-point landmark geometry to disambiguate letters that
              // fingerpose can't tell apart (closed-fist family, U/V/R, etc.).
              const landmarkMatch = classifyLandmarks(landmarks as [number, number, number][]);
              if (landmarkMatch && landmarkMatch.confidence >= 70) {
                letter = landmarkMatch.letter;
                conf   = landmarkMatch.confidence;
              } else {
                const result = estimator.estimate(landmarks, CONFIDENCE_THRESHOLD);
                if (result.gestures.length > 0) {
                  letter = result.gestures[0].name as string;
                  conf   = Math.round((result.gestures[0].score as number / 10) * 100);
                }
              }
            }
          }

          setIsPersonalSign(usingPersonal);
          setIsDisambiguated(disambiguated);
          setDisambigCandidates(candidates);

          if (letter) {
            setDetectedLetter(letter);
            setConfidence(conf);
            const now = Date.now();
            if (holdRef.current?.letter === letter) {
              const elapsed = now - holdRef.current.start;
              setHoldProgress(elapsed / HOLD_MS);
              if (elapsed >= HOLD_MS) confirmLetter(letter);
            } else {
              holdRef.current = { letter, start: now };
              setHoldProgress(0);
            }
          } else {
            // No gesture matched - check for closed fist (sentence trigger)
            setDetectedLetter(null);
            setConfidence(0);
            setHoldProgress(0);
            holdRef.current = null;

            if (
              countExtendedFingers(landmarks) === 0 &&
              outputTextRef.current.trim() &&
              !isSentenceReadingRef.current
            ) {
              const now = Date.now();
              if (fistHoldRef.current) {
                const elapsed = now - fistHoldRef.current.start;
                setFistHoldProgress(Math.min(elapsed / FIST_HOLD_MS, 1));
                if (elapsed >= FIST_HOLD_MS) {
                  fistHoldRef.current = null;
                  setFistHoldProgress(0);
                  readSentence();
                }
              } else {
                fistHoldRef.current = { start: now };
              }
            } else {
              fistHoldRef.current = null;
              setFistHoldProgress(0);
            }
          }
          } // end phrase else
        }
      } else {
        setHandDetected(false);
        setTwoHandsDetected(false);
        setDetectedLetter(null);
        setConfidence(0);
        setHoldProgress(0);
        setIsPersonalSign(false);
        setIsPhraseDetection(false);
        holdRef.current = null;
        fingerHoldRef.current = null;
        fistHoldRef.current = null;
        phraseHoldRef.current = null;
        setFistHoldProgress(0);
        setActiveFingerCount(null);
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch { /* ignore per-frame errors */ }

    rafRef.current = requestAnimationFrame(detect);
  }, [drawHand, drawTwoHands, confirmLetter, selectPrediction, readSentence, triggerPhrase]);

  // ── Request camera ────────────────────────────────────────────────────────
  const requestCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraState("granted");
    } catch (err) {
      const e = err as DOMException;
      setCameraState(e.name === "NotAllowedError" || e.name === "PermissionDeniedError" ? "denied" : "unavailable");
    }
  }, []);

  // ── Assign stream once video element is in the DOM ────────────────────────
  useEffect(() => {
    if (cameraState !== "granted" || !streamRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = streamRef.current;
    console.log("Stream assigned to video element:", streamRef.current);
    video.play().catch(err => console.error("video.play() failed:", err));
    video.onloadedmetadata = () => {
      video.play().catch(err => console.error("video.play() on metadata failed:", err));
      rafRef.current = requestAnimationFrame(detect);
    };
  }, [cameraState, detect]);

  // ── Spacebar → space + speak word + check shortcuts + fetch predictions ───
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      e.preventDefault();

      // Clear any pending predictions
      setPredictions([]);
      predictionsRef.current = [];

      const current  = outputTextRef.current;
      const trimmed  = current.trimEnd();
      const lastWord = trimmed.split(/\s+/).pop() ?? "";
      if (!lastWord) return;

      // Check shortcut match on the last word
      if (shortcutsEnabledRef.current) {
        const matched = shortcutsRef.current.find(sc =>
          sc.sequence.toUpperCase() === lastWord.toUpperCase()
        );
        if (matched) {
          const prefix  = trimmed.slice(0, trimmed.length - lastWord.length);
          const replaced = prefix + matched.phrase + " ";
          outputTextRef.current = replaced;
          setOutputText(replaced);
          speakWord(matched.phrase.trim());
          setExpandedPhrase(matched.phrase.trim());
          setTimeout(() => setExpandedPhrase(null), 2000);
          // Flash the shortcut expansion
          setShortcutFlash(matched.phrase.trim());
          setTimeout(() => setShortcutFlash(null), 1500);
          fetchPredictions(replaced);
          return;
        }
      }

      // Normal space - append and speak last word
      const next = current + " ";
      outputTextRef.current = next;
      setOutputText(next);
      speakWord(lastWord);
      fetchPredictions(next);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [speakWord, fetchPredictions]);

  // ── Shortcuts management ──────────────────────────────────────────────────
  function addShortcut() {
    const seq    = newSeq.trim().toUpperCase();
    const phrase = newPhrase.trim();
    if (!seq || !phrase) return;
    saveShortcuts([...shortcuts.filter(s => s.sequence !== seq), { sequence: seq, phrase }]);
    setNewSeq("");
    setNewPhrase("");
  }

  // ── Audio label (priority: sentence > expanded phrase > word > default) ─────
  const audioLabel = readingSentence
    ? readingSentence                        // full sentence text shown directly
    : expandedPhrase
    ? `Expanded: ${expandedPhrase}`
    : readingWord
    ? `Reading: ${readingWord}`
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl bg-[#0F0F0F] overflow-hidden">

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor:
                modelState === "loading" ? "#f59e0b"
                : modelState === "error"   ? "#ef4444"
                : handDetected             ? ACCENT
                :                            "#22c55e",
              boxShadow: modelState === "ready" && handDetected ? `0 0 6px ${ACCENT}` : "none",
            }}
          />
          <span
            className="text-xs font-mono"
            style={{
              color: modelState === "ready" && cameraState === "granted" && twoHandsDetected
                ? "#6C47FF"
                : "rgba(255,255,255,0.5)",
            }}
          >
            {modelState === "loading"  && "loading hand recognition model..."}
            {modelState === "error"    && "model failed to load"}
            {modelState === "ready" && cameraState === "prompt"      && "model ready - enable camera to begin"}
            {modelState === "ready" && cameraState === "granted"     && (twoHandsDetected ? "✌ two hands detected" : handDetected ? "hand detected" : "no hand in frame")}
            {modelState === "ready" && cameraState === "denied"      && "camera access denied"}
            {modelState === "ready" && cameraState === "unavailable" && "no camera found"}
          </span>
        </div>
        <span className="text-[10px] text-white/25 font-mono">on-device · no video sent</span>
      </div>

      {webglWarning && (
        <div className="px-5 py-2.5 bg-amber-900/30 border-b border-amber-700/30 text-xs text-amber-300">
          WebGL unavailable - running on CPU. Detection will be slower than usual.
        </div>
      )}

      <div className="p-5">

        {/* Loading */}
        {modelState === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-white/10" style={{ borderTopColor: ACCENT, animation: "spin 0.8s linear infinite" }} />
            <p className="text-sm text-white/40">Loading hand recognition model…</p>
            <p className="text-xs text-white/20">This may take 3–5 seconds</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* Error */}
        {modelState === "error" && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="text-2xl">⚠️</span>
            <p className="text-sm text-white/50">Failed to load the hand recognition model.</p>
            <p className="text-xs text-white/30">Check the browser console for details.</p>
          </div>
        )}

        {/* Ready */}
        {modelState === "ready" && (
          <>
            <div className="flex flex-col lg:flex-row gap-5">

              {/* ── Left: camera + detection ──────────────────────────── */}
              <div className="flex-1 min-w-0">
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                  {/* Video always in DOM so ref is populated before stream assigned */}
                  <video
                    ref={videoRef}
                    autoPlay playsInline muted
                    width="100%" height="100%"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)", display: cameraState === "granted" ? "block" : "none" }}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ display: cameraState === "granted" ? "block" : "none" }}
                  />
                  {cameraState === "prompt" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <span className="text-3xl">👋</span>
                      <p className="text-sm text-white/50 text-center px-6">
                        Enable your camera to begin<br />
                        <span className="text-xs text-white/30">No video data leaves your device</span>
                      </p>
                      <button onClick={requestCamera} className="px-5 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 active:scale-95 transition-all" style={{ backgroundColor: ACCENT }}>
                        Enable Camera
                      </button>
                    </div>
                  )}
                  {cameraState === "denied" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                      <span className="text-2xl">🚫</span>
                      <p className="text-sm text-white/50 text-center">Camera access was denied.</p>
                      <p className="text-xs text-white/30 text-center">Allow camera access in your browser settings and reload.</p>
                    </div>
                  )}
                  {cameraState === "unavailable" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                      <span className="text-2xl">📷</span>
                      <p className="text-sm text-white/50 text-center">No camera detected on this device.</p>
                    </div>
                  )}
                </div>

                {/* Detection readout */}
                <div className="mt-3 flex items-center gap-4">
                  <ProgressRing
                    progress={fistHoldProgress > 0 ? fistHoldProgress : holdProgress}
                    letter={fistHoldProgress > 0 ? "✊" : detectedLetter}
                    label={fistHoldProgress > 0 ? "reading sentence..." : "hold to confirm"}
                  />
                  <div className="flex-1">
                    {fistHoldProgress > 0 ? (
                      <div>
                        <div className="text-[10px] text-white/30 mb-0.5">Fist held</div>
                        <div className="text-sm font-medium" style={{ color: ACCENT }}>
                          Reading in {((FIST_HOLD_MS * (1 - fistHoldProgress)) / 1000).toFixed(1)}s…
                        </div>
                        <div className="text-[10px] text-white/25 mt-0.5">Release to cancel</div>
                      </div>
                    ) : detectedLetter ? (
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] text-white/30">Detected sign</span>
                          {isPhraseDetection && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "#6C47FF25", color: "#6C47FF" }}>
                              phrase
                            </span>
                          )}
                          {!isPhraseDetection && isPersonalSign && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${ACCENT}25`, color: "#a78bfa" }}>
                              ★ personal
                            </span>
                          )}
                          {isDisambiguated && disambigCandidates && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "#f59e0b25", color: "#f59e0b" }}>
                              {disambigCandidates[0]} or {disambigCandidates[1]}?
                            </span>
                          )}
                        </div>
                        <div className="text-4xl font-bold font-mono" style={{ color: isPhraseDetection ? "#6C47FF" : isPersonalSign ? "#a78bfa" : ACCENT }}>{detectedLetter}</div>
                        <div className="text-[10px] text-white/30 mt-0.5">Confidence: {confidence}%</div>
                      </div>
                    ) : cameraState === "granted" ? (
                      <p className="text-xs text-white/25 italic">
                        {predictions.length > 0
                          ? "Hold 1–3 fingers to select a word"
                          : handDetected
                          ? "Hold a letter sign steady..."
                          : "Show your hand in the frame"}
                      </p>
                    ) : (
                      <p className="text-xs text-white/20 italic">Waiting for camera...</p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Right: output + controls ──────────────────────────── */}
              <div className="w-full lg:w-72 flex flex-col gap-3">

                {/* Pipeline indicator */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{
                        backgroundColor: handDetected ? ACCENT : "#ffffff20",
                        boxShadow: handDetected ? `0 0 4px ${ACCENT}` : "none",
                      }}
                    />
                    <span className="text-[10px] text-white/40 font-mono">ASL</span>
                  </div>
                  <span className="text-white/20 text-[10px]">→</span>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{
                        backgroundColor: isSpeaking ? "#60a5fa" : "#ffffff20",
                        boxShadow: isSpeaking ? "0 0 4px #60a5fa" : "none",
                      }}
                    />
                    <span className="text-[10px] text-white/40 font-mono">Audio</span>
                  </div>
                  <span className="text-white/20 text-[10px]">→</span>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{
                        backgroundColor: isReceiving ? "#22c55e" : outputText ? "#22c55e50" : "#ffffff20",
                        boxShadow: isReceiving ? "0 0 4px #22c55e" : "none",
                      }}
                    />
                    <span className="text-[10px] text-white/40 font-mono">Wispr</span>
                  </div>
                  <div className="flex-1" />
                  {isSpeaking && audioLabel && (
                    <span className="text-[9px] text-blue-400 truncate max-w-[72px]">{audioLabel}</span>
                  )}
                </div>

                {/* Output area */}
                <div
                  className="rounded-lg border p-3"
                  style={{ borderColor: isReceiving ? `${ACCENT}60` : "rgba(255,255,255,0.1)", backgroundColor: "#ffffff05" }}
                >
                  {/* Header: label + AI toggle */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest">Output</p>
                    <button
                      onClick={() => {
                        const next = !predEnabled;
                        setPredEnabled(next);
                        predEnabledRef.current = next;
                        if (!next) { setPredictions([]); predictionsRef.current = []; }
                        try { localStorage.setItem(PRED_ENABLED_KEY, String(next)); } catch { /* ignore */ }
                      }}
                      className="px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-all"
                      style={{
                        borderColor: predEnabled ? `${ACCENT}60` : "#ffffff20",
                        color: predEnabled ? "#a78bfa" : "#ffffff30",
                        backgroundColor: predEnabled ? `${ACCENT}15` : "transparent",
                      }}
                    >
                      AI {predEnabled ? "ON" : "OFF"}
                    </button>
                  </div>

                  {/* Phrase flash */}
                  {phraseFlash && (
                    <div className="mb-2 px-2 py-1 rounded text-[10px] font-mono border" style={{ color: ACCENT, borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}12`, animation: "fadeIn 0.15s ease" }}>
                      Phrase: {phraseFlash.name}
                    </div>
                  )}

                  {/* Shortcut flash */}
                  {shortcutFlash && (
                    <div className="mb-2 px-2 py-1 rounded text-[10px] font-mono text-green-300 border border-green-500/30 bg-green-500/10" style={{ animation: "fadeIn 0.15s ease" }}>
                      ✓ {shortcutFlash}
                    </div>
                  )}

                  {/* Output field */}
                  <div
                    className="rounded p-2 min-h-[80px] font-mono text-sm mb-2"
                    style={{ backgroundColor: "#000", boxShadow: isReceiving ? `0 0 0 1px ${ACCENT}60` : "none" }}
                  >
                    {outputText ? (
                      <span className="break-all">
                        {outputText.split("").map((char, i) =>
                          char === " "
                            ? <span key={i} className="text-white/20 select-none mx-px">·</span>
                            : <span key={i} className="text-white/90">{char}</span>
                        )}
                        <BlinkingCursor />
                      </span>
                    ) : (
                      <span className="text-white/20 italic text-xs">start signing…<BlinkingCursor /></span>
                    )}
                  </div>

                  {/* Always-visible hint */}
                  <p className="text-[10px] text-white/20 mb-2">Spacebar = space · Fist 2s = read</p>

                  {/* AI suggestion pills - hidden when empty */}
                  {predEnabled && predictions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {predictions.map((word, i) => (
                        <button
                          key={i}
                          onClick={() => selectPrediction(i)}
                          className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] transition-all"
                          style={{
                            backgroundColor: activeFingerCount === i + 1 ? `${ACCENT}30` : "#ffffff0a",
                            border: `1px solid ${activeFingerCount === i + 1 ? `${ACCENT}70` : "rgba(255,255,255,0.1)"}`,
                            color: activeFingerCount === i + 1 ? "#a78bfa" : "#ffffff60",
                          }}
                        >
                          <span className="font-mono text-[9px] opacity-60">{i + 1}</span>
                          {word}
                        </button>
                      ))}
                    </div>
                  )}
                  {predEnabled && predLoading && predictions.length === 0 && (
                    <p className="text-[10px] text-white/20 italic mb-2">Thinking…</p>
                  )}

                  {/* Fist countdown hint */}
                  {fistHoldProgress > 0 && (
                    <div className="mb-2 px-2 py-1.5 rounded text-[10px] text-center" style={{ backgroundColor: `${ACCENT}15`, border: `1px solid ${ACCENT}30` }}>
                      <span style={{ color: "#a78bfa" }}>
                        Reading in {((FIST_HOLD_MS * (1 - fistHoldProgress)) / 1000).toFixed(1)}s…
                      </span>
                    </div>
                  )}
                </div>

                {/* Action row */}
                <div className="flex gap-2">
                  <button
                    onClick={readSentence}
                    disabled={!outputText || isSentenceReading}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {isSentenceReading ? "Reading…" : "Read Sentence"}
                  </button>
                  <button
                    onClick={() => { const n = outputTextRef.current.slice(0, -1); outputTextRef.current = n; setOutputText(n); }}
                    disabled={!outputText}
                    className="px-3 py-2 rounded-lg text-xs border border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ⌫
                  </button>
                  <button
                    onClick={() => { outputTextRef.current = ""; setOutputText(""); setConfirmedLetters([]); setPredictions([]); predictionsRef.current = []; }}
                    disabled={!outputText}
                    className="px-3 py-2 rounded-lg text-xs border border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Clear
                  </button>
                </div>

              </div>
            </div>

            {/* ── Custom Signs panel ─────────────────────────────────── */}
            <div className="mt-4 rounded-lg border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => setShortcutsOpen(o => !o)}
                  className="flex items-center gap-2 text-left"
                >
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Custom Signs</span>
                  <span className="text-white/30 text-[10px]">{shortcutsOpen ? "▲" : "▼"}</span>
                </button>
                <button
                  onClick={() => {
                    const next = !shortcutsEnabled;
                    setShortcutsEnabled(next);
                    shortcutsEnabledRef.current = next;
                    try { localStorage.setItem(SHORTCUTS_ENABLED_KEY, String(next)); } catch { /* ignore */ }
                  }}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all"
                  style={{
                    borderColor: shortcutsEnabled ? "#22c55e60" : "#ffffff20",
                    color: shortcutsEnabled ? "#22c55e" : "#ffffff30",
                    backgroundColor: shortcutsEnabled ? "#22c55e15" : "transparent",
                  }}
                >
                  {shortcutsEnabled ? "ON" : "OFF"}
                </button>
              </div>

              {shortcutsOpen && (
                <div className="px-4 pb-4 border-t border-white/10">
                  <p className="text-[10px] text-white/30 mt-3 mb-3 leading-relaxed">
                    Map a letter sequence to a full phrase. Sign each letter, then press spacebar - if the last word matches a sequence, it expands and speaks aloud.
                  </p>

                  {/* Add form */}
                  <div className="flex gap-2 mb-3 flex-wrap sm:flex-nowrap">
                    <input
                      type="text"
                      placeholder="Sequence (e.g. GM)"
                      value={newSeq}
                      onChange={e => setNewSeq(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="w-full sm:w-28 px-2 py-1.5 rounded text-[11px] font-mono bg-white/5 border border-white/15 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/30"
                    />
                    <input
                      type="text"
                      placeholder="Expands to"
                      value={newPhrase}
                      onChange={e => setNewPhrase(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded text-[11px] bg-white/5 border border-white/15 text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/30"
                    />
                    <button
                      onClick={addShortcut}
                      disabled={!newSeq.trim() || !newPhrase.trim()}
                      className="px-3 py-1.5 rounded text-[11px] font-medium text-white shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ backgroundColor: ACCENT }}
                    >
                      Add
                    </button>
                  </div>

                  {/* Shortcut list */}
                  <div className="space-y-1.5">
                    {shortcuts.map(sc => (
                      <div key={sc.sequence} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5">
                        <span className="text-[11px] font-mono font-bold text-white/70 w-12 shrink-0">{sc.sequence}</span>
                        <span className="text-[10px] text-white/30 shrink-0">→</span>
                        <span className="text-[11px] text-white/50 flex-1 truncate">{sc.phrase}</span>
                        <button onClick={() => saveShortcuts(shortcuts.filter(s => s.sequence !== sc.sequence))} className="text-[10px] text-white/20 hover:text-red-400 transition-colors shrink-0 px-1">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Phrase Library ─────────────────────────────────────── */}
            <PhraseLibrary
              videoRef={videoRef}
              modelRef={modelRef}
              captureCallbackRef={captureCallbackRef}
              phraseLibrary={phraseLibrary}
              onUpdate={(updated) => {
                setPhraseLibrary(updated);
                phraseLibraryRef.current = updated;
              }}
            />

            {/* ── Calibration panel ──────────────────────────────────── */}
            <div className="mt-3 rounded-lg border border-white/10 overflow-hidden">
              {/* Tab header */}
              <div className="flex border-b border-white/10">
                <button
                  onClick={() => setCalibTab("personal")}
                  className="flex-1 px-4 py-3 text-[10px] font-semibold uppercase tracking-widest transition-colors"
                  style={{ color: calibTab === "personal" ? "#a78bfa" : "rgba(255,255,255,0.3)", borderBottom: calibTab === "personal" ? `2px solid ${ACCENT}` : "2px solid transparent" }}
                >
                  Personal Signs
                </button>
                <button
                  onClick={() => setCalibTab("custom")}
                  className="flex-1 px-4 py-3 text-[10px] font-semibold uppercase tracking-widest transition-colors"
                  style={{ color: calibTab === "custom" ? "#a78bfa" : "rgba(255,255,255,0.3)", borderBottom: calibTab === "custom" ? `2px solid ${ACCENT}` : "2px solid transparent" }}
                >
                  Custom Gestures
                </button>
              </div>

              {/* Personal calibration tab */}
              {calibTab === "personal" && (
                <>
                  <div className="flex items-center justify-between px-4 py-3">
                    <p className="text-[10px] text-white/25">
                      {Object.keys(calibration).length > 0
                        ? `${Object.keys(calibration).length} letters calibrated`
                        : "Not yet calibrated"}
                    </p>
                    <button
                      onClick={() => { setRecalibLetter(null); setShowCalibration(true); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90"
                      style={{ backgroundColor: ACCENT }}
                    >
                      Calibrate My Signs
                    </button>
                  </div>

                  {Object.keys(calibration).length > 0 && (
                    <div className="px-4 pb-4 border-t border-white/10">
                      <p className="text-[10px] text-white/30 mt-3 mb-2">
                        Purple = your personal sign · Gray = fingerpose default · Click to recalibrate
                      </p>
                      <div className="grid grid-cols-8 gap-1.5 mb-3">
                        {CALIB_LETTERS.map(l => (
                          <button
                            key={l}
                            onClick={() => { setRecalibLetter(l); setShowCalibration(true); }}
                            title={calibration[l] ? `Recalibrate ${l}` : `Calibrate ${l}`}
                            className="h-8 rounded text-[11px] font-bold font-mono transition-all hover:opacity-80"
                            style={{
                              backgroundColor: calibration[l] ? `${ACCENT}25` : "#ffffff06",
                              color:           calibration[l] ? "#a78bfa"     : "#ffffff20",
                              border: `1px solid ${calibration[l] ? `${ACCENT}50` : "#ffffff08"}`,
                            }}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          clearCalibration();
                          clearSeparationVectors();
                          setCalibration({});
                          calibrationRef.current = {};
                          separationVecsRef.current = [];
                        }}
                        className="text-[10px] text-white/20 hover:text-red-400 transition-colors"
                      >
                        Clear all calibration data
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Custom gestures tab */}
              {calibTab === "custom" && (
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] text-white/30 leading-relaxed max-w-[200px]">
                      Map any hand pose to any output - letter, word, emoji, or phrase.
                    </p>
                    <button
                      onClick={() => setShowCustomGesture(true)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white shrink-0 ml-3 transition-all hover:opacity-90"
                      style={{ backgroundColor: ACCENT }}
                    >
                      + Add gesture
                    </button>
                  </div>

                  {customGestures.length === 0 ? (
                    <p className="text-[10px] text-white/20 py-3 text-center">
                      No custom gestures yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {customGestures.map(g => (
                        <div key={g.id} className="flex items-center gap-2 px-2 py-2 rounded bg-white/5">
                          <span className="text-[11px] text-white/70 flex-1 truncate">&ldquo;{g.output}&rdquo;</span>
                          <button
                            onClick={() => {
                              const next = customGestures.filter(x => x.id !== g.id);
                              setCustomGestures(next);
                              customGesturesRef.current = next;
                              saveCustomGestures(next);
                            }}
                            className="text-[10px] text-white/20 hover:text-red-400 transition-colors shrink-0 px-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          clearCustomGestures();
                          setCustomGestures([]);
                          customGesturesRef.current = [];
                        }}
                        className="text-[10px] text-white/20 hover:text-red-400 transition-colors mt-1"
                      >
                        Clear all custom gestures
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Calibration modal ──────────────────────────────────────────── */}
      {showCalibration && (
        <CalibrationModal
          videoRef={videoRef}
          modelRef={modelRef}
          initialCalibration={calibration}
          targetLetter={recalibLetter}
          onComplete={(newMap) => {
            setCalibration(newMap);
            calibrationRef.current = newMap;
            saveCalibration(newMap);
            // Reload sep vecs (CalibrationModal saves them internally during contrast phase)
            const newSepVecs = loadSeparationVectors();
            separationVecsRef.current = newSepVecs;
            setShowCalibration(false);
            setRecalibLetter(null);
          }}
          onCancel={() => {
            setShowCalibration(false);
            setRecalibLetter(null);
          }}
        />
      )}

      {/* ── Custom gesture modal ────────────────────────────────────────── */}
      {showCustomGesture && (
        <CustomGestureModal
          videoRef={videoRef}
          modelRef={modelRef}
          onSave={(gesture) => {
            const next = [...customGestures, gesture];
            setCustomGestures(next);
            customGesturesRef.current = next;
            saveCustomGestures(next);
            setShowCustomGesture(false);
          }}
          onCancel={() => setShowCustomGesture(false)}
        />
      )}
    </div>
  );
}
