"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";

const WISPR_PURPLE = "#6C47FF";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #0f0f23; --ct-card-bg: #1a1a3e; --ct-card-border: #2a2a4e;
  --ct-text: #f1f1f1; --ct-muted: #a0a0c0; --ct-dim: #7070a0;
  --ct-accent: ${WISPR_PURPLE}; --ct-accent-bg: rgba(108,71,255,0.15);
  --ct-header-bg: #0f0f23; --ct-header-border: #2a2a4e; --ct-header-text: #f1f1f1;
}
`;

const WisprDemo = dynamic(
  () => import("./components/WisprDemo"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl bg-[#0F0F0F] flex items-center justify-center py-20">
        <p className="text-sm text-white/30">Initializing…</p>
      </div>
    ),
  }
);

// ─── Data ───────────────────────────────────────────────────────────────────

const PIPELINE_ROWS = [
  { label: "Input",    today: "Microphone audio",      proposed: "Webcam video feed" },
  { label: "Model",   today: "ASR (Whisper / etc.)",   proposed: "CV hand-pose + sign classifier" },
  { label: "Output",  today: "Text transcription",     proposed: "Text transcription" },
  { label: "Hardware",today: "Microphone required",    proposed: "Standard laptop webcam" },
  { label: "Access",  today: "Hearing users only",     proposed: "Deaf & hard-of-hearing users" },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function WisprFlowPage() {
  const C = CSS_VAR_COLORS;

  return (
    <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      {/* Mobile overlay */}
      <div className="sm:hidden fixed inset-0 z-50 bg-[#F5F0E8] flex items-center justify-center p-8">
        <div className="text-center max-w-xs">
          <div className="text-3xl mb-4">🖥️</div>
          <h2 className="text-lg font-semibold text-[#2C1810] mb-2">Desktop recommended</h2>
          <p className="text-sm text-[#9A8070] leading-relaxed">
            ASL Flow uses your webcam and a computer vision model that works best on a desktop or laptop with a larger screen.
          </p>
          <Link href="/demos" className="mt-6 inline-block text-xs text-[#6C47FF] hover:underline">
            ← Back to demos
          </Link>
        </div>
      </div>

      {/* Header */}
      <header
        className="px-6 py-5 border-b"
        style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}
      >
        <div className="max-w-3xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                ASL Flow
              </h1>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{
                  borderColor: C.accent + "50",
                  color: C.accent,
                  backgroundColor: C.accent + "12",
                }}
              >
                Built for Wispr Flow
              </span>
            </div>
            <p className="text-sm" style={{ color: C.muted }}>
              Making voice dictation accessible through sign language, using only a webcam.
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="text-xs" style={{ color: C.dim }}>
              Demo by{" "}
              <Link
                href="/"
                className="underline hover:opacity-70 transition-opacity"
                style={{ color: C.muted }}
              >
                Armaan Kazi
              </Link>
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Back link */}
        <Link
          href="/demos"
          className="text-xs transition-colors mb-8 inline-block hover:opacity-70"
          style={{ color: C.muted }}
        >
          ← Back to Demos
        </Link>

        {/* ── Section A: What Wispr does today ─────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            What Wispr does today
          </h2>
          <p className="leading-relaxed text-sm mb-6" style={{ color: C.muted }}>
            Wispr Flow&apos;s pipeline begins at the microphone. It has no input layer for users who communicate through sign, which means one of the most powerful productivity tools built in years is inaccessible to an entire population by default.
          </p>

          {/* Two-column comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl border p-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>Today</p>
              <div className="flex items-center gap-2 flex-wrap text-sm font-mono mb-3" style={{ color: C.text }}>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: C.accentBg }}>Mic input</span>
                <span style={{ color: C.dim }}>→</span>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: C.accentBg }}>Wispr AI</span>
                <span style={{ color: C.dim }}>→</span>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: C.accentBg }}>Text</span>
              </div>
              <p className="text-xs" style={{ color: C.dim }}>Requires spoken audio</p>
            </div>

            <div className="rounded-xl border p-5" style={{ borderColor: `${C.accent}4d`, backgroundColor: `${C.accent}0d` }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.accent }}>With ASL Flow</p>
              <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono mb-3" style={{ color: C.text }}>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: `${C.accent}1a`, color: C.accent }}>Webcam</span>
                <span style={{ color: C.dim }}>→</span>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: `${C.accent}1a`, color: C.accent }}>CV Pipeline</span>
                <span style={{ color: C.dim }}>→</span>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: `${C.accent}1a`, color: C.accent }}>Audio</span>
                <span style={{ color: C.dim }}>→</span>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: C.accentBg }}>Wispr AI</span>
                <span style={{ color: C.dim }}>→</span>
                <span className="px-2 py-1 rounded" style={{ backgroundColor: C.accentBg }}>Text</span>
              </div>
              <p className="text-xs" style={{ color: `${C.accent}b3` }}>Works with sign language</p>
            </div>
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.cardBorder }}>
            <div style={{ minWidth: 420 }}>
              <div className="grid grid-cols-3 text-[10px] font-semibold uppercase tracking-widest" style={{ backgroundColor: C.cardBg, color: C.dim }}>
                <div className="px-4 py-2.5">Stage</div>
                <div className="px-4 py-2.5 border-l" style={{ borderColor: C.cardBorder }}>Today</div>
                <div className="px-4 py-2.5 border-l" style={{ borderColor: C.cardBorder, color: C.accent }}>ASL Flow</div>
              </div>
              {PIPELINE_ROWS.map((row, i) => (
                <div key={row.label} className="grid grid-cols-3 text-sm" style={{ backgroundColor: i % 2 === 0 ? C.cardBg : `${C.cardBg}cc` }}>
                  <div className="px-4 py-3 font-medium text-xs" style={{ color: C.dim }}>{row.label}</div>
                  <div className="px-4 py-3 border-l text-xs" style={{ borderColor: C.cardBorder, color: C.muted }}>{row.today}</div>
                  <div className="px-4 py-3 border-l text-xs font-medium" style={{ borderColor: C.cardBorder, color: C.text }}>{row.proposed}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section B: What this demo adds ───────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            What this demo adds
          </h2>
          <p className="leading-relaxed text-sm mb-5" style={{ color: C.muted }}>
            Wispr Flow turns speech into polished text across every app, but it requires a voice. For the 30+ million deaf and hard-of-hearing Americans, that&apos;s a wall. ASL Flow is a concept integration that removes it: a computer vision pipeline reads American Sign Language from a standard webcam, converts it to synthesized audio, and passes it into Wispr Flow, making every text field on your computer accessible through sign language, with no specialized hardware.
          </p>
          <div
            className="rounded-lg border px-4 py-3.5"
            style={{ backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }}
          >
            <p className="text-xs leading-relaxed" style={{ color: "#92400E" }}>
              <strong>This is a concept demo, not a finished product.</strong> The hand recognition model works with ASL fingerspelling (individual letters A–Z) only, not full ASL vocabulary or phrases. Real ASL is a complete language; this prototype demonstrates the technical pipeline at a letter level. Accuracy varies with lighting and hand position. Hold each sign steady for ~1 second for best results.
            </p>
          </div>
        </section>

        {/* ── Section C: Why it's better ───────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            Why it&apos;s better
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              {
                title: "Personal Calibration",
                body: "Unlike fixed gesture libraries, ASL Flow learns your hands. Sign each letter once during setup and the model stores your personal landmark vectors on-device. Your calibration improves the more you use it, and it never leaves your machine.",
              },
              {
                title: "Audio Bridge",
                body: "The key architectural insight: Wispr Flow doesn't need to know sign language. ASL Flow converts sign to synthesized speech upstream, so Wispr receives a clean audio stream, identical to a human voice. Zero changes to Wispr's existing architecture required.",
              },
              {
                title: "Intelligent Input Layer",
                body: "Word prediction, custom shortcuts, and sentence-level reading make ASL Flow more than a translator: it's a full input system. Power users can define shorthand signs for frequently used phrases, reducing signing burden for repetitive communication by an estimated 40-60%.",
              },
            ].map(({ title, body }) => (
              <div
                key={title}
                className="rounded-xl border p-5"
                style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.accent }} />
                  <p className="text-xs font-semibold" style={{ color: C.text }}>{title}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border px-5 py-4" style={{ backgroundColor: C.accentBg, borderColor: C.cardBorder }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
              Why This Is Different
            </p>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              Most ASL tools stop at recognition. ASL Flow is a full input stack: every layer is designed to make sign language a first-class input method for any app on your computer.
            </p>
          </div>
        </section>

        {/* ── Section D: Try it ────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
            Try it
          </h2>
          <p className="text-sm mb-2 leading-relaxed" style={{ color: C.muted }}>
            Hold ASL letter signs in front of your camera. The model reads each letter, speaks it aloud, and builds text in the output field.
          </p>
          <p className="text-xs mb-5 leading-relaxed border-l-2 pl-3" style={{ color: C.dim, borderColor: C.cardBorder }}>
            Tip: Hold each sign steady for ~1 second. Works best with good lighting and a plain background. Supports letters A-Z (excluding J and Z which require motion).
          </p>

          <WisprDemo />

          <p className="mt-4 text-xs leading-relaxed" style={{ color: C.dim }}>
            In production, the CV model runs entirely on-device via TensorFlow.js, so no video data leaves your machine. Wispr Flow would receive only the synthesized audio stream, identical to standard microphone input.
          </p>
        </section>

      </div>
    </div>
  );
}
