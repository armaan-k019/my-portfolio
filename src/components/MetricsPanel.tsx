'use client';

import { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { AcousticMetrics, OctaveBandRT60, SurfaceGroup } from '@/types';
import { OCTAVE_BANDS } from '@/lib/acoustics';

interface MetricsPanelProps {
  metrics: AcousticMetrics;
  shapeDescription: string;
  surfaceGroups: SurfaceGroup[];
  materialVersion: number;
}

// ─── Octave band bar chart ─────────────────────────────────────────────────────

const BAND_COLORS = ['#818cf8', '#60a5fa', '#34d399', '#facc15', '#fb923c', '#f87171'];
const BAND_SHORT  = ['125', '250', '500', '1k', '2k', '4k'];

function OctaveBandChart({ octaveBandRT60 }: { octaveBandRT60: OctaveBandRT60 }) {
  const values = [
    octaveBandRT60.hz125, octaveBandRT60.hz250, octaveBandRT60.hz500,
    octaveBandRT60.hz1000, octaveBandRT60.hz2000, octaveBandRT60.hz4000,
  ];
  const maxVal = Math.max(...values, 0.1);

  return (
    <div className="space-y-1.5">
      {values.map((val, i) => (
        <div key={OCTAVE_BANDS[i]} className="flex items-center gap-2">
          <span className="text-xs text-[#4A6B4A] w-6 shrink-0 text-right">{BAND_SHORT[i]}</span>
          <div className="flex-1 bg-[#FFFFFF] rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(val / maxVal) * 100}%`, backgroundColor: BAND_COLORS[i] }}
            />
          </div>
          <span className="text-xs text-[#1A2A1A] w-10 text-right shrink-0 tabular-nums">
            {val.toFixed(2)}s
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── RT60 badge ────────────────────────────────────────────────────────────────

function RT60Badge({ rt60 }: { rt60: number }) {
  if (rt60 < 0.3)
    return <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Dry / Anechoic</span>;
  if (rt60 < 0.8)
    return <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Speech Optimized</span>;
  if (rt60 < 2.0)
    return <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Musical / Reverberant</span>;
  return <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Highly Reverberant</span>;
}

// ─── RT60 waveform ─────────────────────────────────────────────────────────────

function RT60Waveform({ rt60, reflections }: { rt60: number; reflections: number }) {
  const [playing, setPlaying] = useState(false);
  const rafRef   = useRef<number>(0);
  const phaseRef = useRef(0);
  const pathRef  = useRef<SVGPathElement>(null);
  const W = 232, H = 52;

  useEffect(() => {
    if (!playing) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const amplitude  = Math.max(6, Math.min(20, 3 + reflections * 0.25));
    const cycles     = Math.max(1.5, 3.5 / Math.max(rt60, 0.1));
    const speed      = 0.015 / Math.max(rt60, 0.1);

    function buildD(phase: number) {
      const parts: string[] = [];
      for (let x = 0; x <= W; x += 2) {
        const t = (x / W) * cycles * 2 * Math.PI + phase;
        const y = H / 2 - Math.sin(t) * amplitude;
        parts.push(`${x === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return parts.join(' ');
    }

    function tick() {
      phaseRef.current += speed;
      if (pathRef.current) {
        pathRef.current.setAttribute('d', buildD(phaseRef.current));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, rt60, reflections]);

  return (
    <div className="space-y-2 pt-1 border-t border-[#D8E6D8]">
      <button
        onClick={() => setPlaying(p => !p)}
        className="w-full py-1.5 px-4 rounded-lg border border-[#D8E6D8] bg-white text-xs font-medium text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors"
      >
        {playing ? 'Stop Waveform' : 'Play Waveform'}
      </button>
      {playing && (
        <div className="rounded-lg bg-[#1a1a2e] p-2 overflow-hidden">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <path
              ref={pathRef}
              d={`M0,${H / 2} L${W},${H / 2}`}
              stroke="#2D5A27"
              strokeWidth={1.5}
              fill="none"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-[9px] text-white/30 text-right mt-0.5 pr-1">
            RT60 {rt60.toFixed(2)}s · {reflections} reflections
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function MetricsPanel({ metrics, shapeDescription, surfaceGroups, materialVersion }: MetricsPanelProps) {
  const [summary, setSummary]     = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [recalcShow, setRecalcShow] = useState(false);
  const prevMatVer = useRef(0);

  useEffect(() => {
    if (materialVersion === prevMatVer.current) return;
    prevMatVer.current = materialVersion;
    setRecalcShow(true);
    const t = setTimeout(() => setRecalcShow(false), 700);
    return () => clearTimeout(t);
  }, [materialVersion]);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/acoustic-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, shapeDescription, surfaceGroups }),
      });
      const data = await res.json() as { summary?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? 'Request failed');
      } else {
        setSummary(data.summary ?? null);
        setTimestamp(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('acoustic-summary fetch error:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const now = new Date().toLocaleString();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Acoustic Form: Analysis Report', 14, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 96, 84);
    doc.text(`Generated: ${now}`, 14, 28);
    const descLines = doc.splitTextToSize(shapeDescription, 182) as string[];
    doc.text(descLines, 14, 34);

    const yAfterDesc = 34 + descLines.length * 5;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Room Metrics', 14, yAfterDesc + 8);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Volume:           ${metrics.volume.toFixed(1)} m³`, 14, yAfterDesc + 16);
    doc.text(`Surface Area:     ${metrics.surfaceArea.toFixed(1)} m²`, 14, yAfterDesc + 23);
    doc.text(`RT60 (500 Hz):    ${metrics.rt60.toFixed(2)} s`, 14, yAfterDesc + 30);
    doc.text(`Early Reflections: ${metrics.earlyReflections}`, 14, yAfterDesc + 37);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Octave Band RT60', 14, yAfterDesc + 48);

    const bandLabels = ['125 Hz', '250 Hz', '500 Hz', '1 kHz', '2 kHz', '4 kHz'];
    const bandValues = [
      metrics.octaveBandRT60.hz125, metrics.octaveBandRT60.hz250, metrics.octaveBandRT60.hz500,
      metrics.octaveBandRT60.hz1000, metrics.octaveBandRT60.hz2000, metrics.octaveBandRT60.hz4000,
    ];

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    bandLabels.forEach((label, i) => {
      doc.text(`${label}: ${bandValues[i].toFixed(2)} s`, 14, yAfterDesc + 56 + i * 7);
    });

    const yAfterBands = yAfterDesc + 56 + bandLabels.length * 7;

    if (summary) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Claude Analysis', 14, yAfterBands + 8);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const plainText = summary.replace(/<[^>]+>/g, '').replace(/#{1,6}\s/g, '').trim();
      const analysisLines = doc.splitTextToSize(plainText, 182) as string[];
      doc.text(analysisLines, 14, yAfterBands + 16);
    }

    doc.save('acoustic-report.pdf');
  }

  const summaryHtml = summary ? String(marked.parse(summary)) : null;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ─── Room Metrics ─────────────────────────────────────────────────────── */}
      <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-[#1A2A1A]">Room Metrics</h3>
          {recalcShow && (
            <span className="text-[10px] text-[#2D5A27] animate-pulse">Recalculating…</span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#4A6B4A]">Volume</span>
            <span className="text-sm font-medium text-[#1A2A1A] tabular-nums">
              {metrics.volume.toFixed(1)} m³
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#4A6B4A]">Surface Area</span>
            <span className="text-sm font-medium text-[#1A2A1A] tabular-nums">
              {metrics.surfaceArea.toFixed(1)} m²
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#4A6B4A]">RT60 <span className="text-[#7A9B7A]">(500 Hz)</span></span>
              <span className="text-sm font-medium text-[#1A2A1A] tabular-nums">
                {metrics.rt60.toFixed(2)} s
              </span>
            </div>
            <div className="flex justify-end">
              <RT60Badge rt60={metrics.rt60} />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#4A6B4A]">Early Reflections</span>
            <span className="text-sm font-medium text-[#1A2A1A] tabular-nums">
              {metrics.earlyReflections}
            </span>
          </div>
        </div>

        {/* Octave band chart */}
        <div className="pt-1 border-t border-[#D8E6D8]">
          <p className="text-xs text-[#4A6B4A] mb-2">
            Octave Band RT60 <span className="text-[#7A9B7A]">(Hz)</span>
          </p>
          <OctaveBandChart octaveBandRT60={metrics.octaveBandRT60} />
        </div>

        {/* Waveform */}
        <RT60Waveform rt60={metrics.rt60} reflections={metrics.earlyReflections} />
      </div>

      {/* ─── Claude Analysis ─────────────────────────────────────────────────── */}
      <div className="bg-white/80 rounded-xl border border-[#D8E6D8] shadow-sm p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-sm text-[#1A2A1A]">Claude Analysis</h3>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg bg-[#2D5A27] text-white text-sm font-medium hover:bg-[#e55e2b] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Analyzing with Claude…' : 'Analyze Acoustics'}
        </button>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {summaryHtml && (
          <div className="flex flex-col gap-2">
            <div
              className="text-xs text-[#1A2A1A] leading-relaxed
                [&_h1]:font-bold [&_h1]:text-sm [&_h1]:mb-1
                [&_h2]:font-semibold [&_h2]:text-xs [&_h2]:mt-2 [&_h2]:mb-1
                [&_h3]:font-semibold [&_h3]:text-xs [&_h3]:mt-1.5 [&_h3]:mb-0.5
                [&_p]:mb-1.5 [&_ul]:pl-4 [&_ul]:mb-1.5 [&_li]:mb-0.5 [&_li]:list-disc
                [&_strong]:font-semibold"
              dangerouslySetInnerHTML={{ __html: summaryHtml }}
            />
            {timestamp && (
              <p className="text-xs text-[#4A6B4A]">Last analyzed at {timestamp}</p>
            )}
          </div>
        )}

        {!summary && !loading && !error && (
          <p className="text-xs text-[#4A6B4A] italic">
            Click above to get an expert acoustic analysis from Claude.
          </p>
        )}

        {/* Export */}
        <button
          onClick={handleExport}
          className="mt-auto w-full py-1.5 px-4 rounded-lg border border-[#D8E6D8] bg-white text-xs font-medium text-[#4A6B4A] hover:border-[#2D5A27] hover:text-[#2D5A27] transition-colors"
        >
          Export Report (PDF)
        </button>
      </div>
    </div>
  );
}
