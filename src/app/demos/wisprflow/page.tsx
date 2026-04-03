"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

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

const DIFF_ROWS: { feature: string; generic: string; aslFlow: string; why: string }[] = [
  {
    feature: "Recognition layer",
    generic: "Detects signs",
    aslFlow: "Detects signs + personal calibration trained to your specific hands",
    why: "Your signing style is unique. Generic models miss signs yours doesn't.",
  },
  {
    feature: "Output method",
    generic: "Shows text on screen in its own app",
    aslFlow: "Synthesizes audio - works as a drop-in microphone for any existing app",
    why: "No app needs to be rebuilt. Works everywhere Wispr works - today.",
  },
  {
    feature: "Personalization",
    generic: "Fixed, generic gesture definitions",
    aslFlow: "Trainable per-user calibration stored on-device - gets more accurate over time",
    why: "The model adapts to you, not the other way around.",
  },
  {
    feature: "Shorthand / shortcuts",
    generic: "None",
    aslFlow: "Custom sign sequences that expand to full phrases - user-defined vocabulary",
    why: "Power users can sign at speeds approaching full keyboard throughput.",
  },
  {
    feature: "Word intelligence",
    generic: "Outputs what it sees, letter by letter",
    aslFlow: "AI-powered word prediction with gesture-based selection - no keyboard needed",
    why: "Reduces signing burden for common words and phrases significantly.",
  },
  {
    feature: "Privacy",
    generic: "Often cloud-based - video sent to servers",
    aslFlow: "Fully on-device - CV model, calibration, and shortcuts never leave the browser",
    why: "Medical, legal, and personal conversations stay private.",
  },
  {
    feature: "Platform dependency",
    generic: "Standalone app - only works inside it",
    aslFlow: "Platform-agnostic input layer - Slack, Gmail, Notion, any text field anywhere",
    why: "One tool. Every app. No exceptions.",
  },
];

const PIPELINE_ROWS = [
  { label: "Input",    today: "Microphone audio",      proposed: "Webcam video feed" },
  { label: "Model",   today: "ASR (Whisper / etc.)",   proposed: "CV hand-pose + sign classifier" },
  { label: "Output",  today: "Text transcription",     proposed: "Text transcription" },
  { label: "Hardware",today: "Microphone required",    proposed: "Standard laptop webcam" },
  { label: "Access",  today: "Hearing users only",     proposed: "Deaf & hard-of-hearing users" },
];

const STATS = [
  { value: "70M+",    label: "deaf and hard-of-hearing people worldwide use sign language as their primary language" },
  { value: "0",       label: "major voice dictation tools natively support sign language input today" },
  { value: "1 webcam", label: "is all the hardware this integration requires" },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function WisprFlowPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Back */}
        <Link
          href="/demos"
          className="text-xs text-[#9A8070] hover:text-[#2C1810] transition-colors mb-10 inline-block"
        >
          ← Back
        </Link>

        {/* Header */}
        <div className="flex items-start gap-3 mb-2">
          <h1 className="text-2xl font-semibold text-[#2C1810] leading-tight">ASL Flow</h1>
          <span className="mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#6C47FF]/40 text-[#6C47FF] bg-[#6C47FF]/10 shrink-0">
            Wispr Flow
          </span>
        </div>
        <p className="text-sm text-[#6B6054] mb-12 leading-relaxed">
          A concept integration showing how a computer vision ASL pipeline could connect to Wispr Flow - making voice dictation accessible through sign language, using only a webcam.
        </p>

        {/* ── Section 1: What This Is ──────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
            What this is
          </h2>
          <p className="text-[#2C1810] leading-relaxed mb-4">
            Wispr Flow turns speech into polished text across every app - but it requires a voice. For the 30+ million deaf and hard-of-hearing Americans, that&apos;s a wall. ASL Flow is a concept integration that removes it: a computer vision pipeline reads American Sign Language from a standard webcam, converts it to synthesized audio, and passes it into Wispr Flow - making every text field on your computer accessible through sign language, with no specialized hardware.
          </p>

          {/* Disclaimer callout */}
          <div
            className="rounded-lg border px-4 py-3.5"
            style={{ backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }}
          >
            <p className="text-xs leading-relaxed" style={{ color: "#92400E" }}>
              <strong>This is a concept demo, not a finished product.</strong> The hand recognition model works with ASL fingerspelling (individual letters A–Z) only - not full ASL vocabulary or phrases. Real ASL is a complete language; this prototype demonstrates the technical pipeline at a letter level. Accuracy varies with lighting and hand position. Hold each sign steady for ~1 second for best results.
            </p>
          </div>
        </section>

        {/* ── Section 2: The Gap ───────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
            What Wispr currently requires
          </h2>
          <p className="text-[#2C1810] leading-relaxed mb-5">
            Wispr Flow&apos;s pipeline begins at the microphone. It has no input layer for users who communicate through sign - which means one of the most powerful productivity tools built in years is inaccessible to an entire population by default.
          </p>

          {/* Two-column comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {/* Today */}
            <div className="rounded-xl border border-[#E8E0D4] bg-white/70 p-5">
              <p className="text-xs font-semibold text-[#9A8070] uppercase tracking-widest mb-3">Today</p>
              <div className="flex items-center gap-2 flex-wrap text-sm text-[#2C1810] font-mono mb-3">
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">Mic input</span>
                <span className="text-[#9A8070]">→</span>
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">Wispr AI</span>
                <span className="text-[#9A8070]">→</span>
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">Text</span>
              </div>
              <p className="text-xs text-[#9A8070]">Requires spoken audio</p>
            </div>

            {/* With ASL Flow */}
            <div className="rounded-xl border border-[#6C47FF]/30 bg-[#6C47FF]/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#6C47FF" }}>With ASL Flow</p>
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#2C1810] font-mono mb-3">
                <span className="px-2 py-1 rounded bg-[#6C47FF]/10 text-[#6C47FF]">Webcam</span>
                <span className="text-[#9A8070]">→</span>
                <span className="px-2 py-1 rounded bg-[#6C47FF]/10 text-[#6C47FF]">CV Pipeline</span>
                <span className="text-[#9A8070]">→</span>
                <span className="px-2 py-1 rounded bg-[#6C47FF]/10 text-[#6C47FF]">Audio</span>
                <span className="text-[#9A8070]">→</span>
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">Wispr AI</span>
                <span className="text-[#9A8070]">→</span>
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">Text</span>
              </div>
              <p className="text-xs text-[#6C47FF]/70">Works with sign language</p>
            </div>
          </div>

          {/* Comparison table */}
          <div className="rounded-xl border border-[#E8E0D4] overflow-hidden">
            <div className="grid grid-cols-3 bg-[#EDE8DF] text-[10px] font-semibold uppercase tracking-widest text-[#9A8070]">
              <div className="px-4 py-2.5">Stage</div>
              <div className="px-4 py-2.5 border-l border-[#E8E0D4]">Today</div>
              <div className="px-4 py-2.5 border-l border-[#E8E0D4] text-[#6C47FF]">ASL Flow</div>
            </div>
            {PIPELINE_ROWS.map((row, i) => (
              <div key={row.label} className={`grid grid-cols-3 text-sm ${i % 2 === 0 ? "bg-white" : "bg-[#F9F6F2]"}`}>
                <div className="px-4 py-3 text-[#9A8070] font-medium text-xs">{row.label}</div>
                <div className="px-4 py-3 text-[#6B6054] border-l border-[#E8E0D4] text-xs">{row.today}</div>
                <div className="px-4 py-3 text-[#2C1810] border-l border-[#E8E0D4] text-xs font-medium">{row.proposed}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 2b: How it plugs in ──────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
            How it plugs in
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            {/* Today */}
            <div className="rounded-xl border border-[#E8E0D4] bg-white/70 p-5">
              <p className="text-[10px] font-semibold text-[#9A8070] uppercase tracking-widest mb-4">Today - Wispr Flow</p>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-[#2C1810] mb-3">
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">🎤 Mic</span>
                <span className="text-[#C8BFB0]">──→</span>
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">Wispr AI</span>
                <span className="text-[#C8BFB0]">──→</span>
                <span className="text-emerald-600 font-bold">✓</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                <span className="px-2 py-1 rounded bg-[#F0EBE3] text-[#2C1810] opacity-50">🤟 Sign</span>
                <span className="text-[#C8BFB0]">──→</span>
                <span className="text-red-400 font-bold">✗</span>
                <span className="text-[10px] text-[#9A8070] italic">no path</span>
              </div>
            </div>

            {/* With ASL Flow */}
            <div className="rounded-xl border border-[#6C47FF]/30 bg-[#6C47FF]/5 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color: "#6C47FF" }}>With ASL Flow Layer</p>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-[#2C1810] mb-3">
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">🎤 Mic</span>
                <span className="text-[#C8BFB0]">────→</span>
                <span className="px-2 py-1 rounded bg-[#F0EBE3]">Wispr</span>
                <span className="text-emerald-600 font-bold">✓</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                <span className="px-2 py-1 rounded text-[#6C47FF] bg-[#6C47FF]/10">🤟 Sign</span>
                <span className="text-[#C8BFB0]">→</span>
                <span className="px-2 py-1 rounded text-[#6C47FF] bg-[#6C47FF]/10">CV Layer</span>
                <span className="text-[#C8BFB0]">→</span>
                <span className="px-2 py-1 rounded text-[#6C47FF] bg-[#6C47FF]/10">Audio</span>
                <span className="text-[#C8BFB0]">──→</span>
                <span className="text-emerald-600 font-bold">✓</span>
              </div>
            </div>
          </div>

          <p className="text-[#2C1810] leading-relaxed">
            ASL Flow is not a replacement for Wispr - it&apos;s an input adapter. Wispr&apos;s core product doesn&apos;t change. The CV pipeline sits upstream, converting sign to audio before it ever reaches Wispr&apos;s existing speech recognition stack. This could ship as a Wispr accessibility mode, a browser extension, or a background system process - zero changes to Wispr&apos;s architecture.
          </p>
        </section>

        {/* ── Section 2c: Why This Is Different ────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
            Why this is different
          </h2>
          <h3 className="text-xl font-semibold text-[#2C1810] mb-2 leading-snug">
            This isn&apos;t another ASL translator
          </h3>
          <p className="text-sm text-[#6B6054] leading-relaxed mb-7 max-w-2xl">
            Most ASL tools stop at recognition. ASL Flow is a full input stack - every layer is designed to make sign language a first-class input method for any app on your computer.
          </p>

          {/* Comparison table - desktop */}
          <div className="hidden md:block rounded-xl border border-[#E8E0D4] overflow-hidden mb-6">
            {/* Header */}
            <div className="grid grid-cols-[1fr_1.15fr_1.15fr_1fr] bg-[#EDE8DF] text-[10px] font-semibold uppercase tracking-widest text-[#9A8070]">
              <div className="px-4 py-3">Feature</div>
              <div className="px-4 py-3 border-l border-[#E8E0D4]">Generic ASL Tool</div>
              <div className="px-4 py-3 border-l border-[#E8E0D4] text-[#6C47FF]">ASL Flow</div>
              <div className="px-4 py-3 border-l border-[#E8E0D4]">Why It Matters</div>
            </div>

            {DIFF_ROWS.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-[1fr_1.15fr_1.15fr_1fr] text-xs ${i % 2 === 0 ? "bg-white" : "bg-[#F9F6F2]"}`}
              >
                {/* Feature label */}
                <div className="px-4 py-3.5 text-[#6B6054] font-medium flex items-start">
                  {row.feature}
                </div>

                {/* Generic ASL Tool - red-tinted */}
                <div className="px-4 py-3.5 border-l border-[#E8E0D4] bg-red-50/40 text-[#9A8070] flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-red-300">✗</span>
                  <span>{row.generic}</span>
                </div>

                {/* ASL Flow - green-tinted */}
                <div className="px-4 py-3.5 border-l border-[#E8E0D4] bg-emerald-50/40 text-[#2C1810] flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                  <span>{row.aslFlow}</span>
                </div>

                {/* Why It Matters */}
                <div className="px-4 py-3.5 border-l border-[#E8E0D4] text-[#9A8070] italic flex items-start">
                  {row.why}
                </div>
              </div>
            ))}
          </div>

          {/* Comparison cards - mobile */}
          <div className="md:hidden flex flex-col gap-3 mb-6">
            {DIFF_ROWS.map(row => (
              <div key={row.feature} className="rounded-xl border border-[#E8E0D4] overflow-hidden bg-white">
                {/* Feature heading */}
                <div className="px-4 py-2.5 bg-[#EDE8DF]">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9A8070]">{row.feature}</p>
                </div>
                <div className="grid grid-cols-2 text-xs">
                  {/* Generic */}
                  <div className="px-4 py-3 bg-red-50/50 border-r border-[#E8E0D4]">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-red-400 mb-1.5">Generic ASL</p>
                    <div className="flex items-start gap-1.5 text-[#9A8070]">
                      <span className="shrink-0 text-red-300">✗</span>
                      <span>{row.generic}</span>
                    </div>
                  </div>
                  {/* ASL Flow */}
                  <div className="px-4 py-3 bg-emerald-50/50">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-600 mb-1.5">ASL Flow</p>
                    <div className="flex items-start gap-1.5 text-[#2C1810]">
                      <span className="shrink-0 text-emerald-500">✓</span>
                      <span>{row.aslFlow}</span>
                    </div>
                  </div>
                </div>
                {/* Why */}
                <div className="px-4 py-2.5 border-t border-[#E8E0D4] bg-[#F9F6F2]">
                  <p className="text-[10px] text-[#9A8070] italic">{row.why}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Three callout cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* Card 1: Personal Calibration */}
            <div className="rounded-xl border border-[#E8E0D4] bg-white p-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: "#6C47FF15" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C47FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 11c1.66 0 3-1.34 3-3S13.66 5 12 5s-3 1.34-3 3 1.34 3 3 3z"/>
                  <path d="M12 13c-4.97 0-9 2.24-9 5v1h18v-1c0-2.76-4.03-5-9-5z"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#2C1810] mb-2">Personal Calibration</p>
              <p className="text-xs text-[#6B6054] leading-relaxed">
                Unlike fixed gesture libraries, ASL Flow learns your hands. Sign each letter once during setup and the model stores your personal landmark vectors on-device. Your calibration improves the more you use it - and it never leaves your machine.
              </p>
            </div>

            {/* Card 2: Audio Bridge */}
            <div className="rounded-xl border border-[#E8E0D4] bg-white p-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: "#6C47FF15" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C47FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10v4"/>
                  <path d="M6 6v12"/>
                  <path d="M10 3v18"/>
                  <path d="M14 8v8"/>
                  <path d="M18 5v14"/>
                  <path d="M22 10v4"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#2C1810] mb-2">Audio Bridge</p>
              <p className="text-xs text-[#6B6054] leading-relaxed">
                The key architectural insight: Wispr Flow doesn&apos;t need to know sign language. ASL Flow converts sign to synthesized speech upstream - so Wispr receives a clean audio stream, identical to a human voice. Zero changes to Wispr&apos;s existing architecture required.
              </p>
            </div>

            {/* Card 3: Intelligent Input Layer */}
            <div className="rounded-xl border border-[#E8E0D4] bg-white p-5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: "#6C47FF15" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C47FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="2"/>
                  <path d="M7 8h10"/>
                  <path d="M7 12h10"/>
                  <path d="M7 16h6"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#2C1810] mb-2">Intelligent Input Layer</p>
              <p className="text-xs text-[#6B6054] leading-relaxed">
                Word prediction, custom shortcuts, and sentence-level reading make ASL Flow more than a translator - it&apos;s a full input system. Power users can define shorthand signs for frequently used phrases, reducing signing burden for repetitive communication by an estimated 40–60%.
              </p>
            </div>
          </div>
        </section>

        {/* ── Section 3: Interactive Demo ───────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-1">
            Try it
          </h2>
          <p className="text-sm text-[#6B6054] mb-2 leading-relaxed">
            Hold ASL letter signs in front of your camera. The model reads each letter, speaks it aloud, and builds text in the output field.
          </p>
          <p className="text-xs text-[#9A8070] mb-5 leading-relaxed border-l-2 border-[#E8E0D4] pl-3">
            Tip: Hold each sign steady for ~1 second. Works best with good lighting and a plain background. Supports letters A–Z (excluding J and Z which require motion).
          </p>

          <WisprDemo />

          <p className="mt-4 text-xs text-[#9A8070] leading-relaxed">
            In production, the CV model runs entirely on-device via TensorFlow.js - no video data leaves your machine. Wispr Flow would receive only the synthesized audio stream, identical to standard microphone input.
          </p>
        </section>

        {/* ── Section 3b: What this changes ────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
            What this changes
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Without */}
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-4">Without ASL Flow</p>
              <ol className="space-y-3">
                {[
                  "Cannot use Wispr Flow - requires speaking",
                  "Must type manually - slower than dictation",
                  "Specialized AAC devices cost $3,000–$8,000",
                  "No solution works across every app",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-[#6B6054]">
                    <span className="w-4 h-4 rounded-full bg-red-200 text-red-500 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="text-[10px] text-red-400/70 mt-5 font-medium">Current reality for 70M+ people</p>
            </div>

            {/* With */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 mb-4">With ASL Flow</p>
              <ol className="space-y-3">
                {[
                  "Sign into any webcam - no voice needed",
                  "Dictation speed via fingerspelling",
                  "Works on any laptop with a webcam",
                  "Works in every app Wispr supports",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-[#6B6054]">
                    <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-600 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="text-[10px] text-emerald-600/70 mt-5 font-medium">One webcam. One integration.</p>
            </div>
          </div>
        </section>

        {/* ── Section 4: Why It Matters ─────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
            Why it matters
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {STATS.map(stat => (
              <div key={stat.value} className="rounded-xl border border-[#E8E0D4] bg-white/60 px-5 py-4 text-center">
                <div className="text-2xl font-bold mb-1" style={{ color: "#6C47FF" }}>{stat.value}</div>
                <div className="text-xs text-[#9A8070] leading-snug">{stat.label}</div>
              </div>
            ))}
          </div>

          <p className="text-[#2C1810] leading-relaxed">
            The pipeline is built. The integration point exists. This is what accessibility looks like when it&apos;s treated as a feature, not an afterthought.
          </p>
        </section>


      </div>
    </div>
  );
}
