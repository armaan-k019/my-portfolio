"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import ThemeToggle, { MY_STYLE, type PageColors } from "@/components/ThemeToggle";

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASE_COLORS = {
  "pre-appointment": { border: "#00B5A3", badge: "bg-teal-50 text-teal-700 border border-teal-200", dot: "#00B5A3" },
  "day-of":          { border: "#f59e0b", badge: "bg-amber-50 text-amber-700 border border-amber-200", dot: "#f59e0b" },
  "no-show-recovery":{ border: "#ef4444", badge: "bg-red-50 text-red-700 border border-red-200", dot: "#ef4444" },
};

const PHASE_LABELS = {
  "pre-appointment":  "Phase 1: Pre-Appointment",
  "day-of":           "Phase 2: Day Of",
  "no-show-recovery": "Phase 3: No-Show Recovery",
};

const TONE_BADGE: Record<string, string> = {
  Friendly:     "bg-green-50 text-green-700 border border-green-200",
  Professional: "bg-blue-50 text-blue-700 border border-blue-200",
  Urgent:       "bg-orange-50 text-orange-700 border border-orange-200",
  Empathetic:   "bg-purple-50 text-purple-700 border border-purple-200",
};

const SPECIALTIES = ["Dental","Optometry","Primary Care","Dermatology","Physical Therapy","Chiropractic","Mental Health","Pediatrics","OB-GYN","Orthopedics"];
const PRACTICE_SIZES = ["Solo (1 provider)","Small (2–5 providers)","Mid-size (6–15 providers)","Large (15+ providers)"];
const APT_VALUES = ["Under $100","$100–$300","$300–$600","$600–$1,500","$1,500+"];
const NO_SHOW_RATES = ["Under 5%","5–10%","10–20%","20%+"];
const CHANNELS = ["SMS","Email","Both"];
const PATIENT_PROFILES = ["New Patient","Established Patient (good history)","Established Patient (previous no-show)","High-Risk Patient","Pediatric Patient"];
const LEAD_TIMES = ["Same day","1–2 days","3–7 days","1–2 weeks","2–4 weeks","1+ month"];

const LOADING_STEPS = [
  "Analyzing practice profile...",
  "Calculating optimal touchpoint timing...",
  "Drafting pre-appointment sequence...",
  "Drafting day-of messages...",
  "Drafting post no-show recovery messages...",
  "Generating performance recommendations...",
];

const SAMPLE = {
  specialty: "Dental",
  practiceSize: "Small (2–5 providers)",
  appointmentValue: "$100–$300",
  noShowRate: "10–20%",
  channel: "Both",
  appointmentType: "routine cleaning",
  patientProfile: "Established Patient (previous no-show)",
  leadTime: "1–2 weeks",
  specialConsiderations: "patient previously cancelled twice with no notice",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SequenceMessage {
  phase: "pre-appointment" | "day-of" | "no-show-recovery";
  timing: string;
  channel: "SMS" | "Email" | "Both";
  tone: "Friendly" | "Professional" | "Urgent" | "Empathetic";
  sms_copy: string | null;
  email_subject: string | null;
  email_body: string | null;
  char_count: number | null;
}

interface RiskFactor {
  factor: string;
  mitigation: string;
}

interface WeaveResult {
  total_touchpoints: number;
  estimated_noshow_reduction: number;
  estimated_revenue_recovered: number;
  strategy_summary: string;
  sequence: SequenceMessage[];
  personalization_notes: string[];
  risk_factors: RiskFactor[];
  benchmarks: {
    industry_average: number;
    weave_average: number;
    projected: number;
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text, c }: { text: string; c: PageColors }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all"
      style={{
        borderColor: copied ? "#16a34a" : c.accent,
        color: copied ? "#16a34a" : c.accent,
        backgroundColor: copied ? "#f0fdf4" : "transparent",
      }}
    >
      {copied ? "✓ Copied" : "Copy Message"}
    </button>
  );
}

function SelectField({ label, value, onChange, options, c }: { label: string; value: string; onChange: (v: string) => void; options: string[]; c: PageColors }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: c.muted }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none"
        style={{
          borderColor: c.cardBorder,
          color: c.text,
          backgroundColor: c.cardBg,
        }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SMSMockup({ copy, charCount }: { copy: string; charCount: number | null }) {
  const count = charCount ?? copy.length;
  const countColor = count > 160 ? "text-red-500" : count >= 140 ? "text-amber-500" : "text-gray-400";
  const countSuffix = count > 160 ? ": over 160, will split." : count >= 140 ? ": near limit" : "";
  return (
    <div className="mt-3">
      <div className="inline-block w-full max-w-xs mx-auto">
        <div className="rounded-2xl border-2 border-gray-300 bg-gray-50 px-4 py-3 relative">
          {/* notch */}
          <div className="absolute -top-px left-1/2 -translate-x-1/2 w-16 h-1.5 bg-gray-300 rounded-b-full" />
          <p className="text-xs text-gray-700 leading-relaxed mt-2 whitespace-pre-wrap">{copy}</p>
          <p className={`text-[10px] mt-2 font-semibold ${countColor}`}>
            {count} chars{countSuffix}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailFrame({ subject, body }: { subject: string; body: string }) {
  return (
    <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
        <p className="text-xs text-gray-500"><span className="font-semibold">Subject:</span> {subject}</p>
      </div>
      <div className="px-4 py-3 bg-white">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  );
}

function MessageCard({ msg, index, c }: { msg: SequenceMessage; index: number; c: PageColors }) {
  const phase = PHASE_COLORS[msg.phase];
  const copyText = msg.sms_copy
    ? `SMS:\n${msg.sms_copy}`
    : msg.email_subject
    ? `Subject: ${msg.email_subject}\n\n${msg.email_body}`
    : "";

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div
        className="absolute left-0 top-5 w-4 h-4 rounded-full border-2 border-white shadow-sm z-10"
        style={{ backgroundColor: phase.dot }}
      />

      <div
        className="rounded-xl border bg-white shadow-sm overflow-hidden"
        style={{ borderLeftWidth: "4px", borderLeftColor: phase.border, borderColor: "#e5e7eb" }}
      >
        <div className="px-5 py-4">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs font-bold text-gray-500 tabular-nums">#{index + 1}</span>
            <span className="text-xs font-semibold text-gray-700">{msg.timing}</span>
            <span className="ml-auto flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE_BADGE[msg.tone]}`}>{msg.tone}</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ color: c.accent, borderColor: c.accent + "50", backgroundColor: c.accent + "12" }}
              >
                {msg.channel}
              </span>
            </span>
          </div>

          {/* SMS */}
          {(msg.channel === "SMS" || msg.channel === "Both") && msg.sms_copy && (
            <div className="mb-3">
              {msg.channel === "Both" && (
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">SMS</p>
              )}
              <SMSMockup copy={msg.sms_copy} charCount={msg.char_count} />
            </div>
          )}

          {/* Email */}
          {(msg.channel === "Email" || msg.channel === "Both") && msg.email_subject && msg.email_body && (
            <div className="mb-3">
              {msg.channel === "Both" && (
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 mt-3">Email</p>
              )}
              <EmailFrame subject={msg.email_subject} body={msg.email_body} />
            </div>
          )}

          <div className="pt-3 border-t border-gray-100">
            <CopyButton text={copyText} c={c} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WeavePage() {
  const [form, setForm] = useState({
    specialty: SPECIALTIES[0],
    practiceSize: PRACTICE_SIZES[1],
    appointmentValue: APT_VALUES[1],
    noShowRate: NO_SHOW_RATES[1],
    channel: CHANNELS[2],
    appointmentType: "",
    patientProfile: PATIENT_PROFILES[0],
    leadTime: LEAD_TIMES[3],
    specialConsiderations: "",
  });

  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [result, setResult] = useState<WeaveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<"my" | "company">("my");

  const COMPANY_STYLE: PageColors = {
    bg: "#f0fafa",
    cardBg: "#ffffff",
    cardBorder: "#b2e8e4",
    text: "#1a1a1a",
    muted: "#4b6b6b",
    dim: "#6b8b8b",
    accent: "#00b5a3",
    accentBg: "#e6f7f6",
    headerBg: "#00b5a3",
    headerBorder: "#00a090",
    headerText: "#ffffff",
  };

  const C = theme === "my" ? MY_STYLE : COMPANY_STYLE;
  const TEAL = C.accent;
  const TEAL_DARK = C.accent;
  const TEAL_LIGHT = C.accentBg;

  function loadSample() {
    setForm(SAMPLE);
    setResult(null);
    setError(null);
  }

  function reset() {
    setResult(null);
    setError(null);
    setStepIndex(-1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setStepIndex(0);

    for (let i = 0; i < LOADING_STEPS.length; i++) {
      setStepIndex(i);
      await new Promise(r => setTimeout(r, 450));
    }

    try {
      const res = await fetch("/api/demos/weave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const raw = await res.text();
      const json = JSON.parse(raw) as { result?: WeaveResult; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      const data = json.result!;
      // Enforce 160-char SMS limit, trim any over-length messages
      data.sequence = data.sequence.map(msg => {
        if (msg.sms_copy && msg.sms_copy.length > 160) {
          msg.sms_copy = msg.sms_copy.slice(0, 157) + "...";
        }
        if (msg.sms_copy) {
          msg.char_count = msg.sms_copy.length;
        }
        return msg;
      });
      setResult(data);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      console.error("[weave] error:", err);
      setError(String(err));
    } finally {
      setLoading(false);
      setStepIndex(-1);
    }
  }

  const canSubmit = form.appointmentType.trim().length > 0;

  // Group sequence by phase
  const grouped: Record<string, SequenceMessage[]> = {};
  if (result) {
    for (const msg of result.sequence) {
      if (!grouped[msg.phase]) grouped[msg.phase] = [];
      grouped[msg.phase].push(msg);
    }
  }
  const phaseOrder = ["pre-appointment", "day-of", "no-show-recovery"] as const;

  let globalIndex = 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.bg }}>
      {/* Header */}
      <header
        className="border-b px-6 py-4"
        style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}
      >
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <span className="font-bold text-xl tracking-tight" style={{ color: C.headerText }}>Weave</span>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{
                  color: C.headerText,
                  borderColor: C.headerText + "50",
                  backgroundColor: C.headerText + "18",
                }}
              >
                No-Show Recovery Sequencer
              </span>
            </div>
            <p className="text-xs leading-relaxed max-w-2xl" style={{ color: C.headerText + "cc" }}>
              No-shows cost the average healthcare practice $150,000+ per year. Weave's communication platform reduces no-show rates by up to 40% through automated multi-touch outreach. This tool generates the exact message sequences your practice should be sending, tailored to your specialty, patient profile, and appointment type.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="text-xs" style={{ color: C.headerText + "99" }}>
              Demo by{" "}
              <Link href="/" className="hover:underline transition-colors" style={{ color: C.headerText }}>
                Armaan Kazi
              </Link>
            </span>
            <ThemeToggle
              theme={theme}
              onChange={setTheme}
              companyAccent={COMPANY_STYLE.accent}
              darkContext={false}
            />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Back link */}
        <Link
          href="/demos"
          className="text-xs transition-colors mb-8 inline-block"
          style={{ color: C.muted }}
        >
          ← Back to Demos
        </Link>

        {/* Section A: What Weave does today */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            What Weave does today
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              className="rounded-xl border p-4"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
                Today: automated reminders
              </p>
              <div className="space-y-2">
                {["Appointment reminders sent on a fixed schedule", "Same message template for all patients", "SMS and email triggered X days before", "No variation by appointment type or risk level"].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5" style={{ color: C.dim }}>&#x2022;</span>
                    <span className="text-xs" style={{ color: C.muted }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: TEAL + "50", backgroundColor: TEAL_LIGHT }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: TEAL }}>
                With Recovery Sequencer
              </p>
              <div className="space-y-2">
                {["Multi-touch sequence tailored to patient profile", "Tone and timing adjusted per appointment type", "Day-of and post-no-show recovery messages included", "Revenue impact estimated per sequence"].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5" style={{ color: TEAL }}>✓</span>
                    <span className="text-xs text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section B: What this demo adds */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.dim }}>
            What this demo adds
          </p>
          <p className="text-sm leading-relaxed" style={{ color: C.text }}>
            Weave already automates outreach, but sending the same reminder to a new patient and a patient who&apos;s no-showed twice is a missed opportunity. This tool generates a complete multi-touch sequence tailored to your specialty, patient risk profile, and appointment type, with actual copy for every touchpoint across all three phases.
          </p>
        </section>

        {/* Section C: Why it's better */}
        <section className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            Why it&apos;s better
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              {
                title: "Right message for the right patient",
                body: "A high-risk patient with two prior no-shows needs a different sequence than a new patient booking their first visit. One-size reminders treat them the same.",
              },
              {
                title: "Full sequence, not just reminders",
                body: "Pre-appointment, day-of, and post-no-show recovery messages across all three phases, with actual SMS and email copy ready to use.",
              },
              {
                title: "Quantified revenue impact",
                body: "Every sequence includes an estimated reduction in no-show rate and projected annual revenue recovered, so the ROI is visible, not just implied.",
              },
            ].map(card => (
              <div
                key={card.title}
                className="rounded-xl border p-5"
                style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: TEAL }} />
                  <p className="text-xs font-semibold" style={{ color: C.text }}>{card.title}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{card.body}</p>
              </div>
            ))}
          </div>
          <div
            className="rounded-xl border px-5 py-4"
            style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: C.dim }}>Why This Is Different</p>
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              Generic reminders reduce no-shows by maybe 10-15%. Sequences tailored to patient history and appointment risk can reach 30-40% reduction. The difference is not automation, it is personalization that Weave&apos;s platform is already positioned to deliver.
            </p>
          </div>
        </section>

        {/* Section D: Try it */}
        <p className="text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: C.dim }}>
          Try it
        </p>

        {/* Input Form */}
        {!result && (
          <div
            className="rounded-2xl border shadow-sm p-6 mb-8"
            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-lg" style={{ color: C.text }}>Build Your Recovery Sequence</h2>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>Tell us about your practice and patient and we'll generate the full message sequence.</p>
              </div>
              <button
                type="button"
                onClick={loadSample}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: C.cardBorder, color: C.muted }}
              >
                Load Sample
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                {/* Left: Practice Profile */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: C.dim }}>Practice Profile</h3>
                  <SelectField label="Practice Specialty" value={form.specialty} onChange={v => setForm({...form, specialty: v})} options={SPECIALTIES} c={C} />
                  <SelectField label="Practice Size" value={form.practiceSize} onChange={v => setForm({...form, practiceSize: v})} options={PRACTICE_SIZES} c={C} />
                  <SelectField label="Typical Appointment Value" value={form.appointmentValue} onChange={v => setForm({...form, appointmentValue: v})} options={APT_VALUES} c={C} />
                  <SelectField label="Current No-Show Rate" value={form.noShowRate} onChange={v => setForm({...form, noShowRate: v})} options={NO_SHOW_RATES} c={C} />
                  <SelectField label="Primary Communication Channel" value={form.channel} onChange={v => setForm({...form, channel: v})} options={CHANNELS} c={C} />
                </div>

                {/* Right: Patient & Appointment */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: C.dim }}>Patient & Appointment Context</h3>
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>Appointment Type *</label>
                    <input
                      type="text"
                      value={form.appointmentType}
                      onChange={e => setForm({...form, appointmentType: e.target.value})}
                      placeholder="e.g. routine cleaning, follow-up consultation, new patient exam"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                      style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                      onFocus={e => (e.currentTarget.style.borderColor = TEAL)}
                      onBlur={e => (e.currentTarget.style.borderColor = C.cardBorder)}
                    />
                  </div>
                  <SelectField label="Patient Profile" value={form.patientProfile} onChange={v => setForm({...form, patientProfile: v})} options={PATIENT_PROFILES} c={C} />
                  <SelectField label="Lead Time Until Appointment" value={form.leadTime} onChange={v => setForm({...form, leadTime: v})} options={LEAD_TIMES} c={C} />
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: C.muted }}>
                      Special Considerations <span className="font-normal" style={{ color: C.dim }}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={form.specialConsiderations}
                      onChange={e => setForm({...form, specialConsiderations: e.target.value})}
                      placeholder="e.g. patient has anxiety about procedures, requires interpreter"
                      className="w-full px-3 py-2.5 text-sm rounded-lg border focus:outline-none placeholder:text-gray-300"
                      style={{ borderColor: C.cardBorder, color: C.text, backgroundColor: C.cardBg }}
                      onFocus={e => (e.currentTarget.style.borderColor = TEAL)}
                      onBlur={e => (e.currentTarget.style.borderColor = C.cardBorder)}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full py-3.5 rounded-xl text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90"
                style={{ backgroundColor: TEAL }}
              >
                Generate Recovery Sequence →
              </button>
            </form>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className="rounded-2xl border shadow-sm p-8 mb-8"
            style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
          >
            <div className="space-y-3">
              {LOADING_STEPS.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i < stepIndex ? (
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 text-white font-bold" style={{ backgroundColor: TEAL }}>✓</span>
                  ) : i === stepIndex ? (
                    <span className="w-5 h-5 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: TEAL, borderTopColor: "transparent" }} />
                  ) : (
                    <span className="w-5 h-5 rounded-full border border-gray-200 flex-shrink-0" />
                  )}
                  <span className="text-sm" style={{ color: i <= stepIndex ? C.text : C.dim }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* RESULTS */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-8">

            {/* 1. Overview Banner */}
            <div
              className="rounded-2xl border shadow-sm p-6"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <div className="flex items-center gap-2 flex-wrap mb-5">
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: TEAL + "15", color: TEAL }}
                >
                  {form.specialty}
                </span>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-600">
                  {form.appointmentType}
                </span>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-600">
                  {form.patientProfile}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                {[
                  { label: "Total Touchpoints", value: `${result.total_touchpoints} messages`, color: TEAL },
                  { label: "Est. No-Show Reduction", value: `${result.estimated_noshow_reduction}%`, color: "#f59e0b" },
                  { label: "Est. Annual Revenue Recovered", value: `$${result.estimated_revenue_recovered.toLocaleString()}`, color: "#22c55e" },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl border p-4 text-center" style={{ borderColor: C.cardBorder, backgroundColor: TEAL_LIGHT }}>
                    <p className="text-2xl font-black mb-1" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-xs font-medium" style={{ color: C.muted }}>{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl p-4" style={{ backgroundColor: TEAL_LIGHT }}>
                <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                  <span className="font-semibold" style={{ color: TEAL }}>Strategy: </span>
                  {result.strategy_summary}
                </p>
              </div>
            </div>

            {/* 2. The Full Sequence */}
            <div>
              <h2 className="font-bold text-xl mb-6" style={{ color: C.text }}>The Full Recovery Sequence</h2>

              <div className="space-y-10">
                {phaseOrder.map(phase => {
                  const msgs = grouped[phase];
                  if (!msgs || msgs.length === 0) return null;
                  const phaseColors = PHASE_COLORS[phase];
                  return (
                    <div key={phase}>
                      {/* Phase header */}
                      <div className="flex items-center gap-3 mb-5">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: phaseColors.dot }} />
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${phaseColors.badge}`}>
                          {PHASE_LABELS[phase]}
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>

                      {/* Timeline */}
                      <div className="relative">
                        {/* Vertical line */}
                        <div
                          className="absolute left-1.5 top-6 bottom-6 w-px"
                          style={{ backgroundColor: phaseColors.dot + "40" }}
                        />
                        <div className="space-y-5">
                          {msgs.map((msg) => {
                            const idx = globalIndex++;
                            return <MessageCard key={idx} msg={msg} index={idx} c={C} />;
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Personalization Notes */}
            <div
              className="rounded-2xl border shadow-sm p-6"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <h2 className="font-bold text-lg mb-4" style={{ color: C.text }}>Why This Sequence Was Tailored For You</h2>
              <div className="space-y-3">
                {result.personalization_notes.map((note, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0 mt-0.5" style={{ backgroundColor: TEAL }}>
                      {i + 1}
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: C.text }}>{note}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Risk Factors */}
            <div>
              <h2 className="font-bold text-xl mb-4" style={{ color: C.text }}>No-Show Risk Factors Addressed</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {result.risk_factors.map((rf, i) => (
                  <div
                    key={i}
                    className="rounded-xl border shadow-sm p-5"
                    style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black mb-3 flex-shrink-0"
                      style={{ backgroundColor: ["#ef4444", "#f59e0b", TEAL][i] ?? TEAL }}
                    >
                      !
                    </div>
                    <p className="text-sm font-semibold mb-2 leading-snug" style={{ color: C.text }}>{rf.factor}</p>
                    <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{rf.mitigation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Benchmarks */}
            <div
              className="rounded-2xl border shadow-sm overflow-hidden"
              style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}
            >
              <div className="px-6 py-4 border-b" style={{ borderColor: C.cardBorder }}>
                <h2 className="font-bold text-lg" style={{ color: C.text }}>Performance Benchmarks</h2>
                <p className="text-xs mt-0.5" style={{ color: C.muted }}>No-show rates for {form.specialty} practices</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
                      <th className="text-left px-6 py-3 text-xs font-semibold" style={{ color: C.muted }}>Scenario</th>
                      <th className="text-center px-6 py-3 text-xs font-semibold" style={{ color: C.muted }}>No-Show Rate</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold" style={{ color: C.muted }}>vs. Industry</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b" style={{ borderColor: C.cardBorder }}>
                      <td className="px-6 py-4" style={{ color: C.text }}>Industry average (no automation)</td>
                      <td className="px-6 py-4 text-center font-bold text-red-500">{result.benchmarks.industry_average}%</td>
                      <td className="px-6 py-4 text-right text-xs" style={{ color: C.dim }}>n/a</td>
                    </tr>
                    <tr className="border-b" style={{ borderColor: C.cardBorder }}>
                      <td className="px-6 py-4" style={{ color: C.text }}>Average Weave customer</td>
                      <td className="px-6 py-4 text-center font-bold text-amber-500">{result.benchmarks.weave_average}%</td>
                      <td className="px-6 py-4 text-right text-xs" style={{ color: C.muted }}>
                        {Math.round(((result.benchmarks.industry_average - result.benchmarks.weave_average) / result.benchmarks.industry_average) * 100)}% better
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: TEAL + "08" }}>
                      <td className="px-6 py-4 font-semibold" style={{ color: TEAL }}>
                        With this sequence
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: TEAL + "20", color: TEAL }}>
                          Projected
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-black" style={{ color: TEAL }}>{result.benchmarks.projected}%</td>
                      <td className="px-6 py-4 text-right text-xs font-semibold" style={{ color: TEAL }}>
                        {Math.round(((result.benchmarks.industry_average - result.benchmarks.projected) / result.benchmarks.industry_average) * 100)}% better
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 6. Weave CTA */}
            <div
              className="rounded-2xl p-8 text-center"
              style={{ backgroundColor: TEAL, color: "white" }}
            >
              <h2 className="font-bold text-xl mb-2">Send sequences like this automatically with Weave</h2>
              <p className="text-sm leading-relaxed max-w-xl mx-auto mb-4 opacity-90">
                Weave's communication platform automates every touchpoint in this sequence, triggered by your practice management system, personalized per patient, and tracked so you know what's working.
              </p>
              <div className="flex items-center justify-center gap-6 flex-wrap mb-6 text-xs font-semibold opacity-80">
                <span>40% average no-show reduction</span>
                <span className="opacity-40">·</span>
                <span>Integrates with 50+ PMS systems</span>
                <span className="opacity-40">·</span>
                <span>Used by 39,000+ practice locations</span>
              </div>
              <a
                href="https://getweave.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-8 py-3.5 rounded-xl text-sm font-bold bg-white transition-all hover:bg-gray-100"
                style={{ color: TEAL_DARK }}
              >
                See Weave in Action →
              </a>
            </div>

            {/* Reset */}
            <div className="text-center pb-6">
              <button
                onClick={reset}
                className="text-sm transition-colors"
                style={{ color: C.dim }}
              >
                ← Generate a different sequence
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer
        className="border-t px-6 py-6 mt-10"
        style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}
      >
        <div className="max-w-5xl mx-auto text-center space-y-1">
          <p className="text-xs leading-relaxed max-w-2xl mx-auto" style={{ color: C.dim }}>
            Revenue recovery estimates are illustrative and based on industry averages. Actual results vary by practice. Message copy is AI-generated and should be reviewed before use.{" "}
            <a href="https://getweave.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Visit getweave.com</a>{" "}
            for Weave's actual automated communication platform.
          </p>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="hover:text-gray-500 transition-colors">Armaan Kazi</Link>
            {" "}· Not affiliated with Weave Communications.
          </p>
        </div>
      </footer>
    </div>
  );
}
