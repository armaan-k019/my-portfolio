"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { DEFAULT_SEED, groupBySymptom, runAll, SYMPTOM_LABEL, type Grouping } from "./sim";

const ArmViewer = dynamic(() => import("./ArmViewer"), { ssr: false });

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #0d0f11; --ct-card-bg: #15181b; --ct-card-border: #262a2f;
  --ct-text: #e7eaee; --ct-muted: #9aa3ad; --ct-dim: #66707a;
  --ct-accent: #6fc2ff; --ct-accent-bg: #142433;
  --ct-header-bg: #0d0f11; --ct-header-border: #262a2f; --ct-header-text: #e7eaee;
}
`;

const OK = "#7fb069";
const FAIL = "#e05d4f";

type Source = "loading" | "claude" | "offline";

export default function PhysicalIntelligencePage() {
  const C = CSS_VAR_COLORS;

  const [seed, setSeed] = useState(DEFAULT_SEED);
  const episodes = useMemo(() => runAll(seed), [seed]);
  const fallback = useMemo(() => groupBySymptom(episodes), [episodes]);
  const [claude, setClaude] = useState<{ seed: number; grouping: Grouping } | null>(null);
  const [offlineSeed, setOfflineSeed] = useState<number | null>(null);
  const [modeIdx, setModeIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/demos/physical-intelligence/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed }),
    })
      .then(async (res) => {
        const json = (await res.json()) as { grouping?: Grouping };
        if (!res.ok || !json.grouping) throw new Error("no grouping");
        if (!live) return;
        setClaude({ seed, grouping: json.grouping });
        setModeIdx(0);
      })
      .catch(() => live && setOfflineSeed(seed));
    return () => {
      live = false;
    };
  }, [seed]);

  const source: Source = claude?.seed === seed ? "claude" : offlineSeed === seed ? "offline" : "loading";

  const grouping = useMemo<Grouping>(() => {
    if (!claude || claude.seed !== seed) return fallback;
    // Anything Claude left out is kept visible rather than dropped.
    const placed = new Set(claude.grouping.modes.flatMap((m) => m.episodes));
    const rest = episodes.filter((e) => !e.ok && !placed.has(e.scene.id)).map((e) => e.scene.id);
    const modes = rest.length ? [...claude.grouping.modes, { name: "Ungrouped", cause: "", fix: "", episodes: rest }] : claude.grouping.modes;
    return { summary: claude.grouping.summary, modes };
  }, [claude, seed, fallback, episodes]);

  const mode = grouping.modes[Math.min(modeIdx, grouping.modes.length - 1)];
  const inMode = new Set(mode?.episodes ?? []);
  const current = episodes.find((e) => e.scene.id === selected) ?? episodes.find((e) => e.scene.id === mode?.episodes[0]) ?? episodes[0];
  const placed = episodes.filter((e) => e.ok).length;
  const s = current.scene;

  const pickMode = (i: number) => {
    setModeIdx(i);
    setSelected(grouping.modes[i]?.episodes[0] ?? null);
  };

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-6xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Policy Failure Replayer
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Physical Intelligence
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Group a robot policy&apos;s failed episodes by cause, then replay them.
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

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <Link href="/demos" className="text-xs mb-6 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            {`A scripted grasp policy runs ${episodes.length} randomized scenes in your browser. `}
            Code logs each failure&apos;s symptom, and Claude groups them by root cause. The scenes are simulated, not
            robot data.
          </p>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <section className="rounded-lg border overflow-hidden" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="relative aspect-[4/3] sm:aspect-[16/10]">
                <ArmViewer episode={current} />
                <div className="absolute left-3 top-3 font-mono text-[11px] leading-relaxed pointer-events-none" style={{ color: C.text }}>
                  <span style={{ color: current.ok ? OK : FAIL }}>
                    {s.id} {current.symptom ? SYMPTOM_LABEL[current.symptom] : "placed"}
                  </span>
                  <br />
                  <span style={{ color: C.muted }}>
                    {(Math.hypot(s.x, s.z) * 100).toFixed(0)}cm, {(s.mass * 1000).toFixed(0)}g, &mu;{s.friction.toFixed(2)}, light{" "}
                    {(s.light * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="border-t px-3 py-3" style={{ borderColor: C.cardBorder }}>
                <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
                  {episodes.map((e) => {
                    const active = e.scene.id === current.scene.id;
                    const dim = !e.ok && !inMode.has(e.scene.id);
                    return (
                      <button
                        key={e.scene.id}
                        onClick={() => setSelected(e.scene.id)}
                        aria-label={`Replay ${e.scene.id}`}
                        title={`${e.scene.id}: ${e.symptom ? SYMPTOM_LABEL[e.symptom] : "placed"}`}
                        className="h-5 rounded-[2px] transition-opacity"
                        style={{
                          backgroundColor: e.ok ? OK : FAIL,
                          opacity: e.ok ? 0.25 : dim ? 0.3 : 1,
                          outline: active ? `2px solid ${C.text}` : undefined,
                          outlineOffset: 1,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-lg border p-4 flex flex-col gap-3" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs" style={{ color: C.muted }}>
                  {placed}/{episodes.length} placed
                </span>
                <button
                  onClick={() => {
                    setSeed((x) => (x % 9999) + 1);
                    setSelected(null);
                    setModeIdx(0);
                  }}
                  className="text-xs font-semibold px-3 py-1 rounded transition-opacity hover:opacity-90"
                  style={{ backgroundColor: C.accent, color: "#0d0f11" }}
                >
                  New scenes
                </button>
              </div>

              <p className="text-[11px] font-mono" style={{ color: C.dim }}>
                {source === "claude" ? "grouped by Claude" : source === "loading" ? "by symptom, Claude is reading" : "by symptom, Claude offline"}
              </p>
              {source === "claude" && grouping.summary && (
                <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                  {grouping.summary}
                </p>
              )}

              <ul className="flex flex-col">
                {grouping.modes.map((m, i) => {
                  const on = m === mode;
                  return (
                    <li key={m.name + i} className="border-t first:border-t-0" style={{ borderColor: C.cardBorder }}>
                      <button onClick={() => pickMode(i)} className="w-full flex items-baseline justify-between gap-3 py-2 text-left">
                        <span className="text-sm font-medium" style={{ color: on ? C.accent : C.text }}>
                          {m.name}
                        </span>
                        <span className="font-mono text-xs tabular-nums" style={{ color: C.dim }}>
                          {m.episodes.length}
                        </span>
                      </button>
                      {on && (m.cause || m.fix) && (
                        <div className="pb-3 space-y-1">
                          {m.cause && (
                            <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
                              {m.cause}
                            </p>
                          )}
                          {m.fix && (
                            <p className="text-xs flex gap-2" style={{ color: C.muted }}>
                              <span style={{ color: C.accent }}>+</span>
                              {m.fix}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Physical Intelligence.
          </p>
        </footer>
      </div>
    </>
  );
}
