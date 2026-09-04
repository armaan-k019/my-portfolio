"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { PRELOADED_TEXTS, type PreloadedText } from "./preloaded-texts";
import { getPreloadedWorld } from "./preloaded-worlds";
import type { Reading, WorldRecord, OperationStatus } from "./types";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #2d5a27; --ct-accent-bg: #eef2ec;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
`;

// Client side cache of generated worlds keyed by a hash of the text, plus any
// generation still in flight so a reload (or a saved link) can resume polling.
const CACHE_KEY = "ekphrasis:worlds:v1";
const PENDING_KEY = "ekphrasis:pending:v1";
const POLL_MS = 8000;
const POLL_LIMIT_MS = 16 * 60 * 1000;

const READ_MESSAGES = ["Reading the passage.", "Extracting spatial DNA.", "Finding the evidence for each choice."];
const WORLD_MESSAGES = [
  "Sending the reading to Marble.",
  "Marble is laying out the space.",
  "Marble is compositing surfaces and light.",
  "Still building. Draft worlds take five to ten minutes.",
  "Almost there.",
];

function hashText(s: string): string {
  // FNV-1a 32 bit, enough to key a cache.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function saveJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

type WorldCache = Record<string, WorldRecord>;
interface PendingOp {
  op: string;
  hash: string;
  started: number;
}

type WorldState = "idle" | "starting" | "generating" | "done" | "error" | "unavailable";

export default function WorldLabsPage() {
  const C = CSS_VAR_COLORS;
  const HEADING = C.text;
  const SUBTEXT = C.muted;
  const LABEL = C.dim;

  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [reading, setReading] = useState<Reading | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [readMsg, setReadMsg] = useState(0);

  const [world, setWorld] = useState<WorldRecord | null>(null);
  const [worldState, setWorldState] = useState<WorldState>("idle");
  const [worldError, setWorldError] = useState<string | null>(null);
  const [worldMsg, setWorldMsg] = useState(0);
  const [opId, setOpId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollTimer = useRef<number | null>(null);

  const preloaded: PreloadedText | undefined = selected ? PRELOADED_TEXTS.find((t) => t.id === selected) : undefined;
  const activeText = preloaded ? preloaded.excerpt : custom.trim();
  const textHash = useMemo(() => (activeText ? hashText(activeText) : ""), [activeText]);

  useEffect(() => {
    if (!readLoading) return;
    const t = window.setInterval(() => setReadMsg((i) => (i + 1) % READ_MESSAGES.length), 2500);
    return () => window.clearInterval(t);
  }, [readLoading]);

  useEffect(() => {
    if (worldState !== "generating" && worldState !== "starting") return;
    const t = window.setInterval(() => setWorldMsg((i) => Math.min(i + 1, WORLD_MESSAGES.length - 1)), 45000);
    const e = window.setInterval(() => {
      if (startedAt) setElapsed(Date.now() - startedAt);
    }, 1000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(e);
    };
  }, [worldState, startedAt]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollOperation = useCallback(
    (op: string, hash: string, started: number) => {
      stopPolling();
      const tick = async () => {
        if (Date.now() - started > POLL_LIMIT_MS) {
          setWorldState("error");
          setWorldError("Marble is taking longer than expected. Keep this link and check back; the world may still finish.");
          return;
        }
        try {
          const res = await fetch(`/api/demos/world-labs/world-status?op=${encodeURIComponent(op)}`, { cache: "no-store" });
          const json = (await res.json()) as OperationStatus & { error?: string };
          if (!res.ok) throw new Error(json.error ?? `Status ${res.status}`);
          if (json.done && json.world) {
            const cache = loadJSON<WorldCache>(CACHE_KEY) ?? {};
            if (hash) cache[hash] = json.world;
            saveJSON(CACHE_KEY, cache);
            localStorage.removeItem(PENDING_KEY);
            setWorld(json.world);
            setWorldState("done");
            return;
          }
          if (json.done && json.error) {
            localStorage.removeItem(PENDING_KEY);
            setWorldState("error");
            setWorldError(json.error);
            return;
          }
          setWorldState("generating");
          pollTimer.current = window.setTimeout(() => void tick(), POLL_MS);
        } catch (e) {
          setWorldState("error");
          setWorldError(e instanceof Error ? e.message : String(e));
        }
      };
      void tick();
    },
    [stopPolling]
  );

  // Resume a generation after reload or from a saved link (?op=...).
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("op");
    const pending = loadJSON<PendingOp>(PENDING_KEY);
    const resume: PendingOp | null = fromUrl
      ? { op: fromUrl, hash: pending?.op === fromUrl ? pending.hash : "", started: pending?.op === fromUrl ? pending.started : Date.now() }
      : pending;
    if (resume?.op) {
      setOpId(resume.op);
      setStartedAt(resume.started);
      setWorldState("generating");
      pollOperation(resume.op, resume.hash, resume.started);
    }
    return stopPolling;
  }, [pollOperation, stopPolling]);

  // When the active text changes, look for a cached world.
  useEffect(() => {
    if (!textHash) {
      setWorld(null);
      setWorldState((s) => (s === "generating" || s === "starting" ? s : "idle"));
      return;
    }
    if (preloaded) {
      const w = getPreloadedWorld(preloaded.id);
      if (w) {
        setWorld(w);
        setWorldState("done");
        return;
      }
    }
    const hit = loadJSON<WorldCache>(CACHE_KEY)?.[textHash];
    if (hit) {
      setWorld(hit);
      setWorldState("done");
    } else {
      setWorld(null);
      setWorldState((s) => (s === "generating" || s === "starting" ? s : "idle"));
    }
  }, [textHash, preloaded]);

  async function read(text: string, preloadedId?: string) {
    setReadLoading(true);
    setReadMsg(0);
    setReadError(null);
    setReading(null);
    setWorldError(null);
    if (preloadedId) {
      const w = getPreloadedWorld(preloadedId);
      if (w?.reading) {
        setReading(w.reading);
        setReadLoading(false);
        return;
      }
    }
    try {
      const res = await fetch("/api/demos/world-labs/extract-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json()) as { result?: Reading; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "No reading returned.");
      setReading(json.result);
    } catch (e) {
      setReadError(e instanceof Error ? e.message : String(e));
    } finally {
      setReadLoading(false);
    }
  }

  function pick(id: string) {
    if (worldState !== "generating") stopPolling();
    setSelected(id);
    setCustom("");
    const t = PRELOADED_TEXTS.find((x) => x.id === id);
    if (t) void read(t.excerpt, id);
  }

  async function generateWorld() {
    if (!reading?.marble_prompt) return;
    setWorldError(null);
    setWorldState("starting");
    setWorldMsg(0);
    try {
      const res = await fetch("/api/demos/world-labs/generate-world", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: reading.marble_prompt,
          display_name: preloaded ? `Ekphrasis: ${preloaded.title}` : "Ekphrasis",
        }),
      });
      const json = (await res.json()) as { operation_id?: string; error?: string };
      if (res.status === 502 || res.status === 503) {
        setWorldState("unavailable");
        setWorldError(json.error ?? "Marble is unavailable right now.");
        return;
      }
      if (!res.ok || !json.operation_id) throw new Error(json.error ?? "Marble did not start.");
      const started = Date.now();
      saveJSON(PENDING_KEY, { op: json.operation_id, hash: textHash, started } satisfies PendingOp);
      setOpId(json.operation_id);
      setStartedAt(started);
      setElapsed(0);
      setWorldState("generating");
      const url = new URL(window.location.href);
      url.searchParams.set("op", json.operation_id);
      window.history.replaceState(null, "", url.toString());
      pollOperation(json.operation_id, textHash, started);
    } catch (e) {
      setWorldState("error");
      setWorldError(e instanceof Error ? e.message : String(e));
    }
  }

  const mm = Math.floor(elapsed / 60000);
  const ss = Math.floor((elapsed % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const busy = worldState === "generating" || worldState === "starting";

  const label = (text: string, accent = false) => (
    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: accent ? C.accent : LABEL }}>
      {text}
    </p>
  );

  const worldPlaceholder = () => {
    if (worldState === "unavailable") return "Marble world generation is temporarily unavailable. The interpretation is still visible to the left.";
    if (worldState === "error") return worldError ?? "Generation failed.";
    if (preloaded) return "No cached world for this passage yet. See preloaded-worlds.ts, or generate one below.";
    if (reading) return "Ready to build from the reading.";
    return "The world renders here.";
  };

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Ekphrasis
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.accent + "50", color: C.accent, backgroundColor: C.accent + "12" }}
                >
                  Built for World Labs
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Words become walkable space. Claude interprets, Marble constructs.
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

        <div className="max-w-5xl mx-auto px-6 py-10">
          <Link href="/demos" className="text-xs mb-8 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <section className="mb-14">
            <p className="text-sm mb-5 max-w-2xl" style={{ color: SUBTEXT }}>
              Pick a passage or paste your own. Claude reads it for spatial DNA in a few seconds. Marble then builds a world from that reading: instant for the preloaded passages, five to ten minutes for pasted text.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.15fr)] gap-4 items-start">
              {/* Panel 1 */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                {label("1. The text")}
                <div className="space-y-1.5 mb-3 mt-2">
                  {PRELOADED_TEXTS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pick(t.id)}
                      className="w-full text-left rounded-lg border px-3 py-2 transition-colors"
                      style={{
                        borderColor: selected === t.id ? C.accent : C.cardBorder,
                        backgroundColor: selected === t.id ? C.accentBg : C.bg,
                      }}
                    >
                      <p className="text-xs font-semibold leading-snug" style={{ color: HEADING }}>
                        {t.title}
                      </p>
                      <p className="text-[10px]" style={{ color: LABEL }}>
                        {t.author}, {t.year}
                      </p>
                    </button>
                  ))}
                </div>
                <textarea
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    setSelected(null);
                  }}
                  placeholder="Or paste your own passage, roughly 100 to 400 words"
                  rows={4}
                  className="w-full text-xs rounded-lg border px-3 py-2 mb-2 focus:outline-none"
                  style={{ borderColor: C.cardBorder, backgroundColor: C.bg, color: HEADING }}
                />
                <button
                  onClick={() => void read(custom.trim())}
                  disabled={custom.trim().length < 40 || readLoading}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: "#fff" }}
                >
                  {readLoading && !preloaded ? READ_MESSAGES[readMsg] : "Read this passage"}
                </button>

                {activeText && (
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: C.cardBorder }}>
                    {preloaded && (
                      <p className="text-[10px] font-mono mb-2" style={{ color: LABEL }}>
                        {preloaded.source}
                      </p>
                    )}
                    <p className="text-[12px] leading-relaxed" style={{ color: HEADING, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                      {activeText}
                    </p>
                    {preloaded && (
                      <p className="text-[10px] mt-3 leading-relaxed" style={{ color: LABEL }}>
                        {preloaded.attribution_notes}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Panel 2 */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                {label("2. Spatial DNA")}
                {readError && (
                  <p className="text-xs mt-2 leading-relaxed" style={{ color: "#b3261e" }}>
                    {readError}
                  </p>
                )}
                {!reading && !readLoading && !readError && (
                  <p className="text-xs mt-2 leading-relaxed" style={{ color: LABEL }}>
                    Select a passage. The reading lists what a world would need: materials, scale, light, mood, composition, temperature, sound, and the one inference Claude had to make.
                  </p>
                )}
                {readLoading && (
                  <div className="mt-2">
                    <p className="text-xs mb-3" style={{ color: C.accent }}>
                      {READ_MESSAGES[readMsg]}
                    </p>
                    <div className="space-y-2 animate-pulse">
                      {[1, 0.8, 0.9, 0.7, 1, 0.6, 0.85].map((w, i) => (
                        <div key={i} className="h-3 rounded" style={{ width: `${w * 100}%`, backgroundColor: C.cardBorder }} />
                      ))}
                    </div>
                  </div>
                )}
                {reading && (
                  <div className="space-y-3 mt-2">
                    <div>
                      {label("Materiality", true)}
                      <div className="flex flex-wrap gap-1 mb-1">
                        {reading.dna.materiality.primary_materials.map((m) => (
                          <span key={m} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: C.cardBorder, color: HEADING, backgroundColor: C.bg }}>
                            {m}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        {reading.dna.materiality.surface_qualities}
                      </p>
                    </div>
                    <div>
                      {label("Scale", true)}
                      <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        <span className="font-semibold" style={{ color: HEADING }}>
                          {reading.dna.scale.dominant_scale}.
                        </span>{" "}
                        {reading.dna.scale.ceiling_or_sky} {reading.dna.scale.notes}
                      </p>
                    </div>
                    <div>
                      {label("Light", true)}
                      <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        <span className="font-semibold" style={{ color: HEADING }}>
                          {reading.dna.light.intensity}, {reading.dna.light.color_temperature}.
                        </span>{" "}
                        {reading.dna.light.source}. {reading.dna.light.notes}
                      </p>
                    </div>
                    <div>
                      {label("Mood", true)}
                      <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        <span className="font-semibold" style={{ color: HEADING }}>
                          {reading.dna.mood.primary_emotion}.
                        </span>{" "}
                        {reading.dna.mood.atmosphere}
                      </p>
                    </div>
                    <div>
                      {label("Composition", true)}
                      <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        <span className="font-semibold" style={{ color: HEADING }}>
                          {reading.dna.composition.orientation}, {reading.dna.composition.density}.
                        </span>{" "}
                        {reading.dna.composition.notes}
                      </p>
                    </div>
                    <div>
                      {label("Temperature", true)}
                      <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        <span className="font-semibold" style={{ color: HEADING }}>
                          {reading.dna.temperature.thermal}.
                        </span>{" "}
                        {reading.dna.temperature.humidity_impression}
                      </p>
                    </div>
                    <div>
                      {label("Sound implied", true)}
                      <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        {reading.dna.sound_implied}
                      </p>
                    </div>
                    <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: C.accentBg }}>
                      {label("The interpretive choice", true)}
                      <p className="text-xs leading-relaxed" style={{ color: HEADING }}>
                        {reading.dna.key_interpretive_choice}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Panel 3 */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                {label("3. The world")}

                <div className="rounded-lg overflow-hidden mb-3 mt-2 relative" style={{ aspectRatio: "4 / 3", backgroundColor: "#141a14" }}>
                  {worldState === "done" && world ? (
                    <>
                      <iframe
                        src={world.marble_url}
                        title="Marble world"
                        className="w-full h-full block"
                        allow="fullscreen; xr-spatial-tracking"
                        loading="lazy"
                      />
                      <a
                        href={world.marble_url}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute bottom-2 right-2 text-[10px] font-semibold px-2 py-1 rounded"
                        style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                      >
                        Open in Marble
                      </a>
                    </>
                  ) : busy ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center px-5" style={{ background: "linear-gradient(160deg, #1a2a1a 0%, #2d5a27 55%, #0f1a0f 100%)" }}>
                      <div className="w-6 h-6 rounded-full border-2 animate-spin mb-3" style={{ borderColor: "#c9d6c4", borderTopColor: "transparent" }} />
                      <p className="text-xs font-medium" style={{ color: "#e6ede3" }}>
                        {WORLD_MESSAGES[worldMsg]}
                      </p>
                      <p className="text-[10px] font-mono mt-2 leading-relaxed" style={{ color: "#8aa585" }}>
                        {mm}:{ss} elapsed. You can close this tab; the link in the address bar resumes it.
                      </p>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-center px-5" style={{ background: "linear-gradient(160deg, #1a2a1a 0%, #2d5a27 55%, #0f1a0f 100%)" }}>
                      <p className="text-[11px] font-mono leading-relaxed" style={{ color: "#c9d6c4" }}>
                        {worldPlaceholder()}
                      </p>
                    </div>
                  )}
                </div>

                {reading && !busy && worldState !== "done" && (
                  <div className="mb-3">
                    <button
                      onClick={() => void generateWorld()}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90"
                      style={{ backgroundColor: C.accent, color: "#fff" }}
                    >
                      {worldState === "error" || worldState === "unavailable" ? "Try generating again" : "Generate world"}
                    </button>
                    <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: LABEL }}>
                      This takes 5 to 10 minutes. You can close this tab and come back to it if you save the link.
                    </p>
                  </div>
                )}
                {busy && opId && (
                  <p className="text-[10px] mb-3 font-mono break-all" style={{ color: LABEL }}>
                    operation {opId}
                  </p>
                )}
                {worldState === "error" && worldError && (
                  <p className="text-[11px] mb-3 leading-relaxed" style={{ color: "#b3261e" }}>
                    {worldError}
                  </p>
                )}

                {label("Why the world looks this way")}
                {reading ? (
                  <ul className="space-y-2.5 mt-1">
                    {reading.annotations.map((a, i) => (
                      <li key={i} className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                        <span className="font-semibold" style={{ color: HEADING }}>
                          {a.choice}.
                        </span>{" "}
                        {a.reasoning}{" "}
                        <span className="italic" style={{ color: C.accent }}>
                          &ldquo;{a.text_evidence}&rdquo;
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs mt-1" style={{ color: LABEL }}>
                    Three to five spatial decisions, each tied to the phrase that caused it.
                  </p>
                )}
                {reading && (
                  <details className="mt-3">
                    <summary className="text-[10px] cursor-pointer" style={{ color: LABEL }}>
                      The prompt Marble receives
                    </summary>
                    <p className="text-[11px] leading-relaxed mt-1.5 font-mono" style={{ color: SUBTEXT }}>
                      {reading.marble_prompt}
                    </p>
                  </details>
                )}
              </div>
            </div>
          </section>

          <section className="mb-10 max-w-3xl">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              Why interpretation matters
            </h2>
            <p className="leading-relaxed text-sm" style={{ color: SUBTEXT }}>
              A world model renders what the prompt makes explicit. Literature almost never does. Poe never says how tall the seventh room is; Borges never says what the shelves are made of. A reader supplies those facts without noticing, and two readers supply different ones. Ekphrasis puts that step in the open. Claude reads the passage for the qualities a space needs, states which words drove each decision, and flags the one place it had to invent. The world Marble builds inherits a reading you can see and argue with, rather than a sentence that carries its ambiguity straight into the render.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              How this works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: "Pick or paste", body: "Six verified passages, or your own. Around 100 to 400 words gives Marble enough to work with." },
                { title: "Claude reads", body: "Sonnet extracts the spatial DNA: materials, scale, light, mood, composition, temperature, sound. Every field cites the text or admits it is an inference." },
                { title: "Marble builds", body: "The reading is compiled into one scene description and sent to the World API. Draft worlds take five to ten minutes; preloaded ones are cached." },
                { title: "Claude annotates", body: "Three to five choices in the world are tied back to the exact phrase that motivated them, so the interpretation is inspectable." },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border p-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.accent }} />
                    <p className="text-xs font-semibold" style={{ color: HEADING }}>
                      {card.title}
                    </p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: LABEL }}>
                    {card.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-10 max-w-3xl">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              Built for World Labs
            </h2>
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                World Labs framed Marble as the move from words to worlds. This demo takes the phrase literally and adds the step in between. Marble does the constructing. Claude does the reading, and shows its work. Together they do something neither does alone: a world that can say which line of the text it came from. That legibility is what turns text to world from a novelty into a tool for people who care about the text.
              </p>
            </div>
          </section>
        </div>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs leading-relaxed" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with World Labs. Quoted passages are credited on the card; two texts are original and labelled as such.
          </p>
        </footer>
      </div>
    </>
  );
}
