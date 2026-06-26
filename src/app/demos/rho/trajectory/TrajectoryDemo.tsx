"use client";

// Candidate Trajectory Visualization, Part Two of the Rho demo.
//
// Two modes, selected at the top:
//   Showcase       Pre-filled and working with zero clicks. A curated pool and a
//                  fixed fintech role, with Role Fit pre-computed, so candidates
//                  already spread across all four quadrants on load (including a
//                  stranded Strong but Off-target case).
//   Try it yourself Starts empty. Paste a job description and drop resume PDFs
//                  (optional LinkedIn PDFs) to build a pool and watch it place
//                  live through the real engine.
//
// Position is set ONLY by Work Quality (X) and Role Fit (Y). Pedigree is an
// overlay or a filter, never a coordinate.

import { useMemo, useRef, useState, type ReactNode } from "react";
import TrajectoryChart, { type OverlayToggles } from "./TrajectoryChart";
import Distribution, { type DistMetric } from "./Distribution";
import DetailPanel from "./DetailPanel";
import {
  HERO_POOL,
  ROLE_BAR,
  SHOWCASE_BAR,
  SHOWCASE_SUMMARY,
  SHOWCASE_FIT,
  experienceYears,
  type Candidate,
  type RoleBarConfig,
  type SourceMode,
} from "./data";
import { BACKGROUND_POOL, BACKGROUND_FIT } from "./background";
import { scoreCandidate, type ParsedCandidate, type ScoreStage } from "./engine";
import { extractPdfText, isPdf } from "./pdf";
import { deriveRoleBar } from "./jd";
import { computeFit, type FitDetail } from "./fit";

type Mode = "showcase" | "try";
type ViewKey = "chart" | "dist";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "chart", label: "Chart" },
  { key: "dist", label: "Distribution" },
];
const DIST_METRICS: { key: DistMetric; label: string }[] = [
  { key: "quality", label: "Work Quality" },
  { key: "fit", label: "Role Fit" },
];
type OverlayKey = "school" | "gpa" | "extracurriculars";
const OVERLAY_DEFS: { key: OverlayKey; label: string }[] = [
  { key: "school", label: "School prestige" },
  { key: "gpa", label: "GPA" },
  { key: "extracurriculars", label: "Extracurriculars" },
];
const MAX_OVERLAYS = 2; // keep dots legible: at most two credential overlays at once

const PRESTIGE_TIERS = [
  { label: "Any school", value: 0 },
  { label: "60 and up", value: 60 },
  { label: "80 and up", value: 80 },
  { label: "90 and up", value: 90 },
];

interface FileState {
  name: string;
  status: "idle" | "extracting" | "ready" | "error";
  text: string;
  error?: string;
}
const EMPTY_FILE: FileState = { name: "", status: "idle", text: "" };

function PdfDrop({ label, helper, state, onFile }: { label: string; helper: string; state: FileState; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const statusLine =
    state.status === "extracting" ? "Extracting text..."
    : state.status === "ready" ? `Ready: ${state.name}`
    : state.status === "error" ? (state.error ?? "Could not read that file.")
    : "";
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: "var(--ct-dim)" }}>{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        className="rounded-lg border border-dashed px-3 py-4 text-center cursor-pointer transition-colors"
        style={{ borderColor: over ? "var(--ct-accent)" : "var(--ct-card-border)", backgroundColor: over ? "var(--ct-accent-bg)" : "var(--ct-card-bg)" }}
      >
        <p className="text-xs font-medium" style={{ color: "var(--ct-text)" }}>Drop a PDF or click to upload</p>
        <p className="text-[10px] mt-1" style={{ color: "var(--ct-dim)" }}>{helper}</p>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </div>
      {statusLine && <p className="text-[10px] mt-1" style={{ color: state.status === "error" ? "#C0392B" : "var(--ct-muted)" }}>{statusLine}</p>}
    </div>
  );
}

// Small labeled group wrapper for the control bar.
function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--ct-card-border)", backgroundColor: "var(--ct-bg)" }}>
      <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "var(--ct-dim)" }}>{label}</span>
      {children}
    </div>
  );
}

export default function TrajectoryDemo() {
  const [mode, setMode] = useState<Mode>("showcase");
  const [view, setView] = useState<ViewKey>("chart");
  const [distMetric, setDistMetric] = useState<DistMetric>("quality");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Overlays. LinkedIn flips claimed vs corroborated Work Quality; the credential
  // overlays annotate and are capped so dots stay legible.
  const [linkedinOn, setLinkedinOn] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState<OverlayKey[]>([]);
  const mode_src: SourceMode = linkedinOn ? "both" : "resume";
  const overlays: OverlayToggles = {
    school: activeOverlays.includes("school"),
    gpa: activeOverlays.includes("gpa"),
    extracurriculars: activeOverlays.includes("extracurriculars"),
  };
  function toggleOverlay(key: OverlayKey) {
    setActiveOverlays((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      const next = [...prev, key];
      return next.length > MAX_OVERLAYS ? next.slice(next.length - MAX_OVERLAYS) : next;
    });
  }

  // Try-it-yourself state.
  const [pool, setPool] = useState<Candidate[]>([]);
  const [resumeFile, setResumeFile] = useState<FileState>(EMPTY_FILE);
  const [linkedinFile, setLinkedinFile] = useState<FileState>(EMPTY_FILE);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [parseMode, setParseMode] = useState<"ai" | "basic" | null>(null);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const counter = useRef(0);

  const [jdText, setJdText] = useState("");
  const [appliedJd, setAppliedJd] = useState("");
  const [tryBar, setTryBar] = useState<RoleBarConfig>({ ...ROLE_BAR });
  const [jdSummary, setJdSummary] = useState<string | null>(null);
  const [fitById, setFitById] = useState<Map<string, number>>(new Map());
  const [fitDetailById, setFitDetailById] = useState<Map<string, FitDetail>>(new Map());
  const [fitLoading, setFitLoading] = useState(false);
  const fitCache = useRef<Map<string, number[][]>>(new Map());
  const tryFitAvailable = appliedJd.trim().length > 0 && fitById.size > 0;

  // Filters (subset only, never rescore).
  const [minYears, setMinYears] = useState(0);
  const [excludedMajors, setExcludedMajors] = useState<Set<string>>(new Set());
  const [minGpa, setMinGpa] = useState(0);
  const [minPrestige, setMinPrestige] = useState(0);

  // Showcase pool: named heroes plus an anonymous background population. Role Fit
  // is authored (heroes) and pre-generated (background), so it is instant.
  const showcasePool = useMemo(() => [...HERO_POOL, ...BACKGROUND_POOL], []);
  const showcaseFit = useMemo(() => new Map(Object.entries({ ...SHOWCASE_FIT, ...BACKGROUND_FIT })), []);

  // Effective state by mode.
  const isShowcase = mode === "showcase";
  const effectivePool = isShowcase ? showcasePool : pool;
  const effectiveBar = isShowcase ? SHOWCASE_BAR : tryBar;
  const effectiveFitById = isShowcase ? showcaseFit : fitById;
  const effectiveFitAvailable = isShowcase ? true : tryFitAvailable;

  const allMajors = useMemo(() => {
    const s = new Set<string>();
    for (const c of effectivePool) if (c.factors?.major) s.add(c.factors.major);
    return Array.from(s).sort();
  }, [effectivePool]);

  function passesFilters(c: Candidate): boolean {
    if (experienceYears(c.roles) < minYears) return false;
    if (c.factors?.major && excludedMajors.has(c.factors.major)) return false;
    if (minGpa > 0 && (c.factors?.gpa ?? -1) < minGpa) return false;
    if (minPrestige > 0 && (c.factors?.schoolPrestige ?? -1) < minPrestige) return false;
    return true;
  }
  const hiddenIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of effectivePool) if (!passesFilters(c)) s.add(c.id);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePool, minYears, excludedMajors, minGpa, minPrestige]);
  const visibleCandidates = useMemo(() => effectivePool.filter((c) => !hiddenIds.has(c.id)), [effectivePool, hiddenIds]);

  const selected = useMemo(() => effectivePool.find((c) => c.id === selectedId) ?? null, [effectivePool, selectedId]);

  function switchMode(m: Mode) {
    setMode(m);
    setSelectedId(null);
  }

  // ─── Try-it-yourself actions ────────────────────────────────────────────────
  async function runFit(jd: string, targetPool: Candidate[]) {
    if (!jd.trim()) return;
    setFitLoading(true);
    setStatus(`Computing role fit for ${targetPool.length} candidates...`);
    try {
      const map = await computeFit(targetPool, jd, fitCache.current, (s: ScoreStage) =>
        setStatus(s === "loading-model" ? "Loading the embedding model (first time only)..." : `Computing role fit for ${targetPool.length} candidates...`));
      setFitDetailById(map);
      const f = new Map<string, number>();
      map.forEach((v, k) => f.set(k, v.fit));
      setFitById(f);
    } catch {
      setBuildError("Could not compute role fit.");
    } finally {
      setFitLoading(false);
      setStatus(null);
    }
  }

  function clearPool() {
    setPool([]);
    setSelectedId(null);
  }

  async function applyJd() {
    const { summary } = deriveRoleBar(jdText);
    const { bar: nextBar } = deriveRoleBar(jdText);
    setTryBar(nextBar);
    setJdSummary(jdText.trim() ? summary : null);
    setAppliedJd(jdText);
    await runFit(jdText, pool);
  }
  function resetJd() {
    setTryBar({ ...ROLE_BAR });
    setJdSummary(null);
    setJdText("");
    setAppliedJd("");
    setFitById(new Map());
    setFitDetailById(new Map());
  }

  function toggleMajor(m: string) {
    setExcludedMajors((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  }

  async function handleFile(file: File, which: "resume" | "linkedin") {
    const setFile = which === "resume" ? setResumeFile : setLinkedinFile;
    if (!isPdf(file)) {
      setFile({ name: file.name, status: "error", text: "", error: "That is not a PDF. Please drop a PDF file." });
      return;
    }
    setFile({ name: file.name, status: "extracting", text: "" });
    try {
      const text = await extractPdfText(file);
      setFile({ name: file.name, status: "ready", text });
    } catch (e) {
      setFile({ name: file.name, status: "error", text: "", error: e instanceof Error ? e.message : "Could not read that PDF." });
    }
  }

  async function addCandidate() {
    if (resumeFile.status !== "ready" || adding) return;
    setAdding(true);
    setBuildError(null);
    setStatus("Parsing the resume...");
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: resumeFile.text, linkedin: linkedinFile.status === "ready" ? linkedinFile.text : "" }),
      });
      const data = (await res.json()) as { parsed?: ParsedCandidate; mode?: "ai" | "basic"; note?: string; error?: string };
      if (!res.ok || data.error || !data.parsed) {
        setBuildError(data.error ?? "Could not parse that input.");
        return;
      }
      setParseMode(data.mode ?? null);
      setParseNote(data.note ?? null);

      const id = `paste-${counter.current++}`;
      const candidate = await scoreCandidate(data.parsed, id, {
        onStage: (s: ScoreStage) => setStatus(s === "loading-model" ? "Loading the embedding model (first time only)..." : "Scoring the work..."),
      });

      const next = [...pool, candidate];
      setPool(next);
      setSelectedId(id);
      setResumeFile(EMPTY_FILE);
      setLinkedinFile(EMPTY_FILE);
      if (appliedJd.trim()) await runFit(appliedJd, next);
    } catch {
      setBuildError("Something went wrong adding that candidate.");
    } finally {
      setAdding(false);
      setStatus(null);
    }
  }

  const tryBarActive = tryBar.x !== ROLE_BAR.x || tryBar.y !== ROLE_BAR.y;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text)" }}>Candidate Trajectory</h3>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--ct-muted)" }}>
          A resume is now an adversarial, AI-polished document, so this tool does
          not extract claims, it audits them. Position is set only by Work Quality
          (demonstrated substance, X) and Role Fit (alignment with the role, Y).
          Pedigree is a lens, never a coordinate.
        </p>
      </div>

      {/* Mode switch */}
      <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--ct-card-border)" }}>
        {([{ key: "showcase", label: "Showcase" }, { key: "try", label: "Try it yourself" }] as const).map((m) => (
          <button
            key={m.key}
            onClick={() => switchMode(m.key)}
            className="text-xs font-semibold px-4 py-2 transition-colors"
            style={{ backgroundColor: mode === m.key ? "var(--ct-accent)" : "var(--ct-card-bg)", color: mode === m.key ? "white" : "var(--ct-muted)" }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Showcase role banner */}
      {isShowcase && (
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--ct-card-border)", backgroundColor: "var(--ct-bg)" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>Scoring against a sample role</span>
            <span className="text-[10px]" style={{ color: "var(--ct-dim)" }}>{SHOWCASE_SUMMARY}</span>
          </div>
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--ct-muted)" }}>
            A curated pool is already placed by Work Quality and Role Fit against a fixed fintech product operations role.
            Watch the off-field experts (a mechanical engineer, a civil engineer, a nurse) land in Strong but Off-target.
            Switch to Try it yourself to paste your own role and resumes.
          </p>
        </div>
      )}

      {/* Try-it-yourself: pool builder + JD */}
      {!isShowcase && (
        <>
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--ct-card-border)", backgroundColor: "var(--ct-bg)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>Build your pool</span>
              <span className="text-[10px]" style={{ color: "var(--ct-dim)" }}>{pool.length === 0 ? "Pool is empty" : `${pool.length} in pool`}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PdfDrop label="Resume (PDF)" helper="A resume PDF. Text is extracted in your browser." state={resumeFile} onFile={(f) => handleFile(f, "resume")} />
              <PdfDrop label="LinkedIn (PDF, optional)" helper="Use LinkedIn's Save to PDF profile export. URL fetching is not supported." state={linkedinFile} onFile={(f) => handleFile(f, "linkedin")} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={addCandidate} disabled={adding || resumeFile.status !== "ready"} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: "var(--ct-accent)", color: "white" }}>{adding ? "Working..." : "Add candidate"}</button>
              <button onClick={clearPool} disabled={pool.length === 0} className="text-xs font-medium px-3 py-2 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--ct-card-border)", color: "var(--ct-muted)", backgroundColor: "var(--ct-card-bg)" }}>Clear pool</button>
            </div>
            {status && <p className="text-[11px]" style={{ color: "var(--ct-muted)" }}>{status}</p>}
            {buildError && <p className="text-[11px]" style={{ color: "#C0392B" }}>{buildError}</p>}
            {parseNote && <p className="text-[10px]" style={{ color: "var(--ct-dim)" }}>{parseMode === "basic" ? "Basic parser. " : ""}{parseNote}</p>}
          </div>

          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--ct-card-border)", backgroundColor: "var(--ct-bg)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>Paste a job description</span>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the role. It sets the bar and computes each candidate's Role Fit against the requirements. It does not keyword-match resumes."
              rows={3}
              className="w-full text-xs rounded-lg border px-2.5 py-2 resize-y"
              style={{ borderColor: "var(--ct-card-border)", backgroundColor: "var(--ct-card-bg)", color: "var(--ct-text)" }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={applyJd} disabled={!jdText.trim() || fitLoading} className="text-xs font-semibold px-3.5 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: "var(--ct-accent)", color: "white" }}>{fitLoading ? "Computing..." : "Apply role"}</button>
              <button onClick={resetJd} disabled={!tryBarActive && !jdText.trim()} className="text-xs font-medium px-3 py-2 rounded-lg border disabled:opacity-40" style={{ borderColor: "var(--ct-card-border)", color: "var(--ct-muted)", backgroundColor: "var(--ct-card-bg)" }}>Reset</button>
              <span className="text-[11px] ml-auto font-mono" style={{ color: tryBarActive ? "var(--ct-accent)" : "var(--ct-dim)" }}>bar {tryBar.x} / {tryBar.y}</span>
            </div>
            {jdSummary && <p className="text-[11px]" style={{ color: "var(--ct-muted)" }}>{jdSummary}</p>}
          </div>
        </>
      )}

      {/* Filters */}
      <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--ct-card-border)", backgroundColor: "var(--ct-bg)" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>Filters</span>
          <span className="text-[10px]" style={{ color: "var(--ct-dim)" }}>showing {visibleCandidates.length} of {effectivePool.length} candidates, {hiddenIds.size} hidden by filters</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ct-dim)" }}>
            min years
            <input type="range" min={0} max={10} step={0.5} value={minYears} onChange={(e) => setMinYears(Number(e.target.value))} className="w-28" />
            <span className="font-mono w-8 text-right" style={{ color: "var(--ct-text)" }}>{minYears}</span>
          </label>
          <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ct-dim)" }}>
            min GPA (pedigree)
            <input type="range" min={0} max={4} step={0.1} value={minGpa} onChange={(e) => setMinGpa(Number(e.target.value))} className="w-28" />
            <span className="font-mono w-8 text-right" style={{ color: "var(--ct-text)" }}>{minGpa.toFixed(1)}</span>
          </label>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--ct-dim)" }}>
            min school tier (pedigree)
            <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--ct-card-border)" }}>
              {PRESTIGE_TIERS.map((t) => (
                <button key={t.value} onClick={() => setMinPrestige(t.value)} className="text-[10px] px-2 py-1 transition-colors"
                  style={{ backgroundColor: minPrestige === t.value ? "var(--ct-accent)" : "var(--ct-card-bg)", color: minPrestige === t.value ? "white" : "var(--ct-muted)" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {allMajors.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--ct-dim)" }}>Majors (click to exclude)</p>
            <div className="flex flex-wrap gap-1.5">
              {allMajors.map((m) => {
                const excluded = excludedMajors.has(m);
                return (
                  <button key={m} onClick={() => toggleMajor(m)} className="text-[10px] px-2 py-1 rounded-full border transition-colors"
                    style={{ borderColor: excluded ? "var(--ct-card-border)" : "var(--ct-accent)", backgroundColor: excluded ? "var(--ct-card-bg)" : "var(--ct-accent-bg)", color: excluded ? "var(--ct-dim)" : "var(--ct-accent)", textDecoration: excluded ? "line-through" : "none" }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Control bar: View group and Overlays group */}
      <div className="flex flex-wrap items-center gap-3">
        <ControlGroup label="View">
          <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: "var(--ct-card-border)" }}>
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)} className="text-xs font-semibold px-3 py-1.5 transition-colors"
                style={{ backgroundColor: view === v.key ? "var(--ct-accent)" : "var(--ct-card-bg)", color: view === v.key ? "white" : "var(--ct-muted)" }}>
                {v.label}
              </button>
            ))}
          </div>
          {view === "dist" && (
            <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: "var(--ct-card-border)" }}>
              {DIST_METRICS.map((m) => (
                <button key={m.key} onClick={() => setDistMetric(m.key)} className="text-[11px] font-medium px-2.5 py-1.5 transition-colors"
                  style={{ backgroundColor: distMetric === m.key ? "var(--ct-accent-bg)" : "var(--ct-card-bg)", color: distMetric === m.key ? "var(--ct-accent)" : "var(--ct-muted)" }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </ControlGroup>

        <ControlGroup label={`Overlays (max ${MAX_OVERLAYS})`}>
          <button onClick={() => setLinkedinOn((v) => !v)} className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-colors"
            style={{ borderColor: linkedinOn ? "var(--ct-accent)" : "var(--ct-card-border)", backgroundColor: linkedinOn ? "var(--ct-accent-bg)" : "var(--ct-card-bg)", color: linkedinOn ? "var(--ct-accent)" : "var(--ct-muted)" }}>
            LinkedIn
          </button>
          <span className="w-px h-4" style={{ backgroundColor: "var(--ct-card-border)" }} />
          {OVERLAY_DEFS.map((o) => {
            const on = activeOverlays.includes(o.key);
            return (
              <button key={o.key} onClick={() => toggleOverlay(o.key)} className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border transition-colors"
                style={{ borderColor: on ? "var(--ct-accent)" : "var(--ct-card-border)", backgroundColor: on ? "var(--ct-accent-bg)" : "var(--ct-card-bg)", color: on ? "var(--ct-accent)" : "var(--ct-muted)" }}>
                {o.label}
              </button>
            );
          })}
        </ControlGroup>
      </div>

      {/* Empty-state prompt, outside the chart interior */}
      {view === "chart" && !isShowcase && !effectiveFitAvailable && (
        <p className="text-[11px] text-center" style={{ color: "var(--ct-muted)" }}>
          {effectivePool.length === 0
            ? "Drop a resume PDF to add a candidate, then paste a job description to spread them by Role Fit."
            : "Paste a job description to spread candidates by Role Fit. For now dots are parked at their real Work Quality (X) with a neutral Y."}
        </p>
      )}

      {/* Chart */}
      <div className="relative isolate rounded-xl border p-4 shadow-sm" style={{ borderColor: "var(--ct-card-border)", backgroundColor: "var(--ct-card-bg)", zIndex: 1 }}>
        {view === "dist" ? (
          <Distribution candidates={visibleCandidates} bar={effectiveBar} metric={distMetric} fitById={effectiveFitById} fitAvailable={effectiveFitAvailable} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
          <TrajectoryChart candidates={effectivePool} mode={mode_src} bar={effectiveBar} overlays={overlays} fitById={effectiveFitById} fitAvailable={effectiveFitAvailable} selectedId={selectedId} hiddenIds={hiddenIds} onSelect={setSelectedId} />
        )}
      </div>

      {/* Self-aware caption */}
      <p className="text-[11px] italic leading-relaxed" style={{ color: "var(--ct-dim)" }}>
        {view === "chart" &&
          "X is demonstrated Work Quality, Y is Role Fit against the role. Toggle LinkedIn to cross-check claimed work. Credentials are overlays and filters only, so you can see strong work without the pedigree, or an elite school on thin work. Pedigree never moves the dot."}
        {view === "dist" && distMetric === "quality" &&
          "This distributes corroborated Work Quality across the pool. The dashed curve is the fitted normal; the real shape tends to be bimodal because cross-checking splits the pool into substantive and inflated work. Click any dot to see who."}
        {view === "dist" && distMetric === "fit" &&
          "This distributes Role Fit across the pool for this role. The red tail is candidates whose work aligns least with the role. Click any dot to see who."}
        {" "}This is a lens for a recruiter to think with, not an auto-decider.
      </p>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          candidate={selected}
          fit={isShowcase ? showcaseFit.get(selected.id) : (tryFitAvailable ? fitById.get(selected.id) : undefined)}
          fitDetail={isShowcase ? null : (fitDetailById.get(selected.id) ?? null)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
