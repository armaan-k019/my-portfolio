'use client';

import { useState } from 'react';
import type { AcousticMetrics } from '@/types';

interface MetricsPanelProps {
  metrics: AcousticMetrics;
  shapeDescription: string;
}

function RT60Badge({ rt60 }: { rt60: number }) {
  if (rt60 < 0.3)
    return (
      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        Dry / Anechoic
      </span>
    );
  if (rt60 < 0.8)
    return (
      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
        Speech Optimized
      </span>
    );
  if (rt60 < 2.0)
    return (
      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
        Musical / Reverberant
      </span>
    );
  return (
    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
      Highly Reverberant
    </span>
  );
}

export default function MetricsPanel({ metrics, shapeDescription }: MetricsPanelProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/acoustic-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, shapeDescription }),
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

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Display metrics */}
      <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-sm text-[#2C1810]">Room Metrics</h3>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#6B6054]">Volume</span>
            <span className="text-sm font-medium text-[#2C1810]">
              {metrics.volume.toFixed(1)} m³
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#6B6054]">Surface Area</span>
            <span className="text-sm font-medium text-[#2C1810]">
              {metrics.surfaceArea.toFixed(1)} m²
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#6B6054]">RT60</span>
              <span className="text-sm font-medium text-[#2C1810]">
                {metrics.rt60.toFixed(2)} s
              </span>
            </div>
            <div className="flex justify-end">
              <RT60Badge rt60={metrics.rt60} />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-[#6B6054]">Early Reflections</span>
            <span className="text-sm font-medium text-[#2C1810]">
              {metrics.earlyReflections}
            </span>
          </div>
        </div>
      </div>

      {/* Claude Analysis */}
      <div className="bg-white/80 rounded-xl border border-[#E8E0D4] shadow-sm p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-sm text-[#2C1810]">Claude Analysis</h3>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-2 px-4 rounded-lg bg-[#FF6B35] text-white text-sm font-medium hover:bg-[#e55e2b] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Analyzing with Claude...' : 'Analyze Acoustics'}
        </button>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {summary && (
          <div className="flex flex-col gap-1.5">
            <blockquote className="border-l-2 border-[#FF6B35] pl-3 text-xs text-[#2C1810] leading-relaxed italic">
              {summary}
            </blockquote>
            {timestamp && (
              <p className="text-xs text-[#6B6054]">Last analyzed at {timestamp}</p>
            )}
          </div>
        )}

        {!summary && !loading && !error && (
          <p className="text-xs text-[#6B6054] italic">
            Click above to get an expert acoustic analysis from Claude.
          </p>
        )}
      </div>
    </div>
  );
}
