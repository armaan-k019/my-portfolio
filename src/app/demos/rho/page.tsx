"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Transaction {
  date: string;
  vendor: string;
  category: string;
  amount: number;
  method: "card" | "ACH" | "invoice";
}

interface DriftSignal {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  category: string;
  summary: string;
  monthlyDelta: number;
  affectedVendors: string[];
}

// ─── Synthetic transaction data ─────────────────────────────────────────────────
// Month indexes: 0=Oct, 1=Nov, 2=Dec, 3=Jan, 4=Feb, 5=Mar

const TRANSACTIONS: Transaction[] = [
  // ── Payroll (stable ~$48k/month) ──────────────────────────────────────────
  { date: "2024-10-01", vendor: "Gusto Payroll",   category: "Payroll",        amount: 48200, method: "ACH"     },
  { date: "2024-11-01", vendor: "Gusto Payroll",   category: "Payroll",        amount: 47900, method: "ACH"     },
  { date: "2024-12-01", vendor: "Gusto Payroll",   category: "Payroll",        amount: 48100, method: "ACH"     },
  { date: "2025-01-01", vendor: "Gusto Payroll",   category: "Payroll",        amount: 48000, method: "ACH"     },
  { date: "2025-02-01", vendor: "Gusto Payroll",   category: "Payroll",        amount: 48300, method: "ACH"     },
  { date: "2025-03-01", vendor: "Gusto Payroll",   category: "Payroll",        amount: 48100, method: "ACH"     },

  // ── SaaS tools (drifting up ~11% MoM collectively) ───────────────────────
  { date: "2024-10-05", vendor: "Notion",          category: "SaaS",           amount:  320,  method: "card"    },
  { date: "2024-11-05", vendor: "Notion",          category: "SaaS",           amount:  360,  method: "card"    },
  { date: "2024-12-05", vendor: "Notion",          category: "SaaS",           amount:  400,  method: "card"    },
  { date: "2025-01-05", vendor: "Notion",          category: "SaaS",           amount:  440,  method: "card"    },
  { date: "2025-02-05", vendor: "Notion",          category: "SaaS",           amount:  490,  method: "card"    },
  { date: "2025-03-05", vendor: "Notion",          category: "SaaS",           amount:  540,  method: "card"    },
  { date: "2024-10-07", vendor: "Figma",           category: "SaaS",           amount:  450,  method: "card"    },
  { date: "2024-11-07", vendor: "Figma",           category: "SaaS",           amount:  500,  method: "card"    },
  { date: "2024-12-07", vendor: "Figma",           category: "SaaS",           amount:  555,  method: "card"    },
  { date: "2025-01-07", vendor: "Figma",           category: "SaaS",           amount:  615,  method: "card"    },
  { date: "2025-02-07", vendor: "Figma",           category: "SaaS",           amount:  685,  method: "card"    },
  { date: "2025-03-07", vendor: "Figma",           category: "SaaS",           amount:  760,  method: "card"    },
  { date: "2024-10-10", vendor: "Linear",          category: "SaaS",           amount:  180,  method: "card"    },
  { date: "2024-11-10", vendor: "Linear",          category: "SaaS",           amount:  200,  method: "card"    },
  { date: "2024-12-10", vendor: "Linear",          category: "SaaS",           amount:  222,  method: "card"    },
  { date: "2025-01-10", vendor: "Linear",          category: "SaaS",           amount:  246,  method: "card"    },
  { date: "2025-02-10", vendor: "Linear",          category: "SaaS",           amount:  274,  method: "card"    },
  { date: "2025-03-10", vendor: "Linear",          category: "SaaS",           amount:  305,  method: "card"    },
  { date: "2024-10-12", vendor: "Slack",           category: "SaaS",           amount:  260,  method: "card"    },
  { date: "2024-11-12", vendor: "Slack",           category: "SaaS",           amount:  290,  method: "card"    },
  { date: "2024-12-12", vendor: "Slack",           category: "SaaS",           amount:  322,  method: "card"    },
  { date: "2025-01-12", vendor: "Slack",           category: "SaaS",           amount:  357,  method: "card"    },
  { date: "2025-02-12", vendor: "Slack",           category: "SaaS",           amount:  397,  method: "card"    },
  { date: "2025-03-12", vendor: "Slack",           category: "SaaS",           amount:  441,  method: "card"    },

  // ── CloudOps Inc - inconsistent billing ──────────────────────────────────
  { date: "2024-10-15", vendor: "CloudOps Inc",    category: "Infrastructure", amount: 4200,  method: "invoice" },
  { date: "2024-11-15", vendor: "CloudOps Inc",    category: "Infrastructure", amount: 4800,  method: "invoice" },
  { date: "2024-12-15", vendor: "CloudOps Inc",    category: "Infrastructure", amount: 4200,  method: "invoice" },
  { date: "2025-01-15", vendor: "CloudOps Inc",    category: "Infrastructure", amount: 5100,  method: "invoice" },
  { date: "2025-02-15", vendor: "CloudOps Inc",    category: "Infrastructure", amount: 4800,  method: "invoice" },
  { date: "2025-03-15", vendor: "CloudOps Inc",    category: "Infrastructure", amount: 5100,  method: "invoice" },

  // ── Zapier - forgotten $47/month subscription ─────────────────────────────
  { date: "2024-10-18", vendor: "Zapier",          category: "SaaS",           amount:   47,  method: "card"    },
  { date: "2024-11-18", vendor: "Zapier",          category: "SaaS",           amount:   47,  method: "card"    },
  { date: "2024-12-18", vendor: "Zapier",          category: "SaaS",           amount:   47,  method: "card"    },
  { date: "2025-01-18", vendor: "Zapier",          category: "SaaS",           amount:   47,  method: "card"    },
  { date: "2025-02-18", vendor: "Zapier",          category: "SaaS",           amount:   47,  method: "card"    },
  { date: "2025-03-18", vendor: "Zapier",          category: "SaaS",           amount:   47,  method: "card"    },

  // ── AWS - moderate growth ─────────────────────────────────────────────────
  { date: "2024-10-20", vendor: "Amazon Web Services", category: "Infrastructure", amount: 2100, method: "card" },
  { date: "2024-11-20", vendor: "Amazon Web Services", category: "Infrastructure", amount: 2200, method: "card" },
  { date: "2024-12-20", vendor: "Amazon Web Services", category: "Infrastructure", amount: 2350, method: "card" },
  { date: "2025-01-20", vendor: "Amazon Web Services", category: "Infrastructure", amount: 2400, method: "card" },
  { date: "2025-02-20", vendor: "Amazon Web Services", category: "Infrastructure", amount: 2550, method: "card" },
  { date: "2025-03-20", vendor: "Amazon Web Services", category: "Infrastructure", amount: 2650, method: "card" },

  // ── Datadog - flat ────────────────────────────────────────────────────────
  { date: "2024-10-22", vendor: "Datadog",         category: "Infrastructure", amount:  890,  method: "card"    },
  { date: "2024-11-22", vendor: "Datadog",         category: "Infrastructure", amount:  890,  method: "card"    },
  { date: "2024-12-22", vendor: "Datadog",         category: "Infrastructure", amount:  890,  method: "card"    },
  { date: "2025-01-22", vendor: "Datadog",         category: "Infrastructure", amount:  890,  method: "card"    },
  { date: "2025-02-22", vendor: "Datadog",         category: "Infrastructure", amount:  890,  method: "card"    },
  { date: "2025-03-22", vendor: "Datadog",         category: "Infrastructure", amount:  890,  method: "card"    },

  // ── Office supplies / misc ────────────────────────────────────────────────
  { date: "2024-10-08", vendor: "Staples",         category: "Misc",           amount:  145,  method: "card"    },
  { date: "2024-10-25", vendor: "WeWork",          category: "Misc",           amount: 2800,  method: "ACH"     },
  { date: "2024-11-08", vendor: "Staples",         category: "Misc",           amount:  132,  method: "card"    },
  { date: "2024-11-25", vendor: "WeWork",          category: "Misc",           amount: 2800,  method: "ACH"     },
  { date: "2024-12-08", vendor: "Staples",         category: "Misc",           amount:  189,  method: "card"    },
  { date: "2024-12-25", vendor: "WeWork",          category: "Misc",           amount: 2800,  method: "ACH"     },
  { date: "2025-01-08", vendor: "Staples",         category: "Misc",           amount:  156,  method: "card"    },
  { date: "2025-01-25", vendor: "WeWork",          category: "Misc",           amount: 2800,  method: "ACH"     },
  { date: "2025-02-08", vendor: "Staples",         category: "Misc",           amount:  168,  method: "card"    },
  { date: "2025-02-25", vendor: "WeWork",          category: "Misc",           amount: 2800,  method: "ACH"     },
  { date: "2025-03-08", vendor: "Staples",         category: "Misc",           amount:  175,  method: "card"    },
  { date: "2025-03-25", vendor: "WeWork",          category: "Misc",           amount: 2800,  method: "ACH"     },

  // ── Additional charges ────────────────────────────────────────────────────
  { date: "2024-10-14", vendor: "Google Workspace", category: "SaaS",          amount:  420,  method: "card"    },
  { date: "2024-11-14", vendor: "Google Workspace", category: "SaaS",          amount:  420,  method: "card"    },
  { date: "2024-12-14", vendor: "Google Workspace", category: "SaaS",          amount:  462,  method: "card"    },
  { date: "2025-01-14", vendor: "Google Workspace", category: "SaaS",          amount:  462,  method: "card"    },
  { date: "2025-02-14", vendor: "Google Workspace", category: "SaaS",          amount:  508,  method: "card"    },
  { date: "2025-03-14", vendor: "Google Workspace", category: "SaaS",          amount:  508,  method: "card"    },
  { date: "2024-10-28", vendor: "FedEx",           category: "Misc",           amount:   87,  method: "card"    },
  { date: "2024-11-28", vendor: "FedEx",           category: "Misc",           amount:   62,  method: "card"    },
  { date: "2024-12-28", vendor: "FedEx",           category: "Misc",           amount:  114,  method: "card"    },
  { date: "2025-01-28", vendor: "FedEx",           category: "Misc",           amount:   73,  method: "card"    },
  { date: "2025-02-28", vendor: "FedEx",           category: "Misc",           amount:   91,  method: "card"    },
  { date: "2025-03-28", vendor: "FedEx",           category: "Misc",           amount:   55,  method: "card"    },
  { date: "2024-10-30", vendor: "Cloudflare",      category: "Infrastructure", amount:  220,  method: "card"    },
  { date: "2024-11-30", vendor: "Cloudflare",      category: "Infrastructure", amount:  220,  method: "card"    },
  { date: "2024-12-30", vendor: "Cloudflare",      category: "Infrastructure", amount:  240,  method: "card"    },
  { date: "2025-01-30", vendor: "Cloudflare",      category: "Infrastructure", amount:  240,  method: "card"    },
  { date: "2025-02-28", vendor: "Cloudflare",      category: "Infrastructure", amount:  260,  method: "card"    },
  { date: "2025-03-30", vendor: "Cloudflare",      category: "Infrastructure", amount:  260,  method: "card"    },
  { date: "2024-10-17", vendor: "GitHub",          category: "SaaS",           amount:  126,  method: "card"    },
  { date: "2024-11-17", vendor: "GitHub",          category: "SaaS",           amount:  126,  method: "card"    },
  { date: "2024-12-17", vendor: "GitHub",          category: "SaaS",           amount:  168,  method: "card"    },
  { date: "2025-01-17", vendor: "GitHub",          category: "SaaS",           amount:  168,  method: "card"    },
  { date: "2025-02-17", vendor: "GitHub",          category: "SaaS",           amount:  210,  method: "card"    },
  { date: "2025-03-17", vendor: "GitHub",          category: "SaaS",           amount:  210,  method: "card"    },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Category colors ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  SaaS:           "#B3A369",
  Infrastructure: "#4A7AB5",
  Misc:           "#9A8070",
};

const CATEGORIES = ["All", "SaaS", "Infrastructure", "Payroll", "Misc"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

const MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MONTH_PREFIXES = ["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"];

// ─── SVG Line Chart - Payroll excluded (shown as stable callout instead) ────────

function LineChart() {
  const width = 600;
  const height = 200;
  const padL  = 52;
  const padR  = 16;
  const padT  = 16;
  const padB  = 32;
  const plotW = width  - padL - padR;
  const plotH = height - padT - padB;

  const chartCategories = ["SaaS", "Infrastructure", "Misc"] as const;

  const monthlyTotals = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const cat of chartCategories) {
      result[cat] = MONTH_PREFIXES.map((prefix) =>
        TRANSACTIONS
          .filter((t) => t.category === cat && t.date.startsWith(prefix))
          .reduce((s, t) => s + t.amount, 0)
      );
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allValues = Object.values(monthlyTotals).flat();
  const maxVal = Math.max(...allValues) * 1.12;

  function xPos(i: number) { return padL + (i / (MONTHS.length - 1)) * plotW; }
  function yPos(v: number) { return padT + plotH - (v / maxVal) * plotH; }

  const yTicks = [0, 2000, 4000, 6000, 8000, 10000].filter((v) => v <= maxVal * 1.05);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: 200 }}
      aria-label="Monthly spend by category"
    >
      {/* Grid lines */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={padL} y1={yPos(v)} x2={width - padR} y2={yPos(v)}
            stroke="rgba(44,24,16,0.08)" strokeWidth={1}
          />
          <text
            x={padL - 6} y={yPos(v) + 4}
            textAnchor="end" fontSize={9} fill="rgba(108,82,68,0.65)"
          >
            {v >= 1000 ? `${v / 1000}k` : v}
          </text>
        </g>
      ))}

      {/* Month labels */}
      {MONTHS.map((m, i) => (
        <text
          key={m}
          x={xPos(i)} y={height - 6}
          textAnchor="middle" fontSize={9} fill="rgba(108,82,68,0.65)"
        >
          {m}
        </text>
      ))}

      {/* Lines + dots per category */}
      {chartCategories.map((cat) => {
        const vals = monthlyTotals[cat];
        const color = CATEGORY_COLORS[cat];
        const points = vals.map((v, i) => `${xPos(i)},${yPos(v)}`).join(" ");
        return (
          <g key={cat}>
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.9}
            />
            {vals.map((v, i) => (
              <circle key={i} cx={xPos(i)} cy={yPos(v)} r={3} fill={color} opacity={0.95} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-4 mt-2">
      {(["SaaS", "Infrastructure", "Misc"] as const).map((cat) => (
        <div key={cat} className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
          <span className="text-xs text-[#6B5244]">{cat}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Severity badge ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: DriftSignal["severity"] }) {
  const styles = {
    high:   "text-red-700 bg-red-50 border-red-200",
    medium: "text-amber-700 bg-amber-50 border-amber-200",
    low:    "text-[#6B5244] bg-[#2C1810]/[0.04] border-[#2C1810]/10",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${styles[severity]}`}>
      {severity}
    </span>
  );
}

// ─── Signal card ────────────────────────────────────────────────────────────────

function SignalCard({ signal, index }: { signal: DriftSignal; index: number }) {
  return (
    <div
      className="rounded-xl border border-[#2C1810]/[0.08] bg-white p-5 space-y-3 shadow-sm"
      style={{
        animation: "fadeSlideIn 0.4s ease forwards",
        animationDelay: `${index * 100}ms`,
        opacity: 0,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold text-[#2C1810] text-sm leading-snug">{signal.title}</h4>
        <SeverityBadge severity={signal.severity} />
      </div>
      <p className="text-[#6B5244] text-sm leading-relaxed">{signal.summary}</p>
      <div className="flex items-center justify-between pt-1">
        <div className="flex flex-wrap gap-1.5">
          {signal.affectedVendors.map((v) => (
            <span
              key={v}
              className="text-[10px] px-2 py-0.5 rounded-full border border-[#2C1810]/10 text-[#6B5244]"
            >
              {v}
            </span>
          ))}
        </div>
        <span className="text-xs text-amber-700 font-mono whitespace-nowrap ml-3">
          +{signal.monthlyDelta}% / mo
        </span>
      </div>
    </div>
  );
}

// ─── Skeleton card ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[#2C1810]/[0.08] bg-white p-5 space-y-3 animate-pulse shadow-sm">
      <div className="flex items-center justify-between">
        <div className="h-4 bg-[#2C1810]/[0.06] rounded w-40" />
        <div className="h-4 bg-[#2C1810]/[0.06] rounded-full w-14" />
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-[#2C1810]/[0.04] rounded w-full" />
        <div className="h-3 bg-[#2C1810]/[0.04] rounded w-3/4" />
      </div>
      <div className="flex gap-2">
        <div className="h-3 bg-[#2C1810]/[0.04] rounded-full w-16" />
        <div className="h-3 bg-[#2C1810]/[0.04] rounded-full w-20" />
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function DriftDetectionPage() {
  const router = useRouter();
  const [authed, setAuthed]       = useState(false);
  const [ready, setReady]         = useState(false);
  const [filter, setFilter]       = useState<CategoryFilter>("All");
  const [signals, setSignals]     = useState<DriftSignal[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed]   = useState(false);

  useEffect(() => {
    let redirected = false;
    try {
      const val = sessionStorage.getItem("demo_access");
      if (val !== "rho" && !redirected) {
        redirected = true;
        router.push("/demos");
      } else {
        setAuthed(true);
      }
    } catch {
      if (!redirected) {
        redirected = true;
        router.push("/demos");
      }
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () => filter === "All" ? TRANSACTIONS : TRANSACTIONS.filter((t) => t.category === filter),
    [filter]
  );

  async function handleDetect() {
    setAnalyzing(true);
    setError(null);
    setSignals([]);
    setAnalyzed(false);
    try {
      const res = await fetch("/api/drift-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: TRANSACTIONS }),
      });
      const data = await res.json() as { signals?: DriftSignal[]; error?: string };
      if (data.error && (!data.signals || data.signals.length === 0)) {
        setError(data.error);
      } else {
        setSignals(data.signals ?? []);
        setAnalyzed(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (!ready || !authed) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-[#2C1810]/20 border-t-[#2C1810]/60 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>

      <div className="min-h-screen bg-[#F5F0E8]">
        <div className="max-w-3xl mx-auto px-6 py-12">

          {/* ── Back link ─────────────────────────────────────────────────── */}
          <Link
            href="/demos"
            className="inline-flex items-center gap-1 text-sm text-[#6B5244] hover:text-terracotta transition-colors mb-8"
          >
            ← Back
          </Link>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <h1 className="text-2xl font-semibold text-[#2C1810]">Drift Detection</h1>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#2C1810]/10 text-[#9A8070] ml-2">
                Rho
              </span>
            </div>
          </div>

          {/* ── Section 1: What this is ──────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
              What this is
            </h2>
            <p className="text-[#6B5244] leading-relaxed text-sm">
              Rho processes every corporate card transaction, AP invoice, and bank transfer for a company in one place. Most anomaly detection tools flag large one-off transactions. Drift Detection surfaces something harder to catch: slow-moving patterns that compound over months - a SaaS category creeping up 12% month-over-month, a vendor billing inconsistently, recurring spend that nobody remembers approving.
            </p>
          </section>

          {/* ── Section 2: What Rho currently shows ─────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
              What Rho currently shows
            </h2>
            <p className="text-[#6B5244] leading-relaxed text-sm mb-5">
              Rho&apos;s dashboard shows account balances and transaction history. It does not surface multi-month trends, flag gradual spend drift, or distinguish intentional growth from unnoticed cost creep.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left: today */}
              <div className="rounded-xl border border-[#2C1810]/[0.08] bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
                  Today - transaction list
                </p>
                <div className="space-y-0">
                  {[
                    { date: "Mar 5",  vendor: "Figma",        amount: "$760.00"   },
                    { date: "Mar 12", vendor: "Slack",         amount: "$441.00"   },
                    { date: "Mar 15", vendor: "CloudOps Inc",  amount: "$5,100.00" },
                  ].map((row) => (
                    <div
                      key={row.vendor}
                      className="flex items-center justify-between py-1.5 border-b border-[#2C1810]/[0.06] last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#9A8070] w-12">{row.date}</span>
                        <span className="text-xs text-[#2C1810]">{row.vendor}</span>
                      </div>
                      <span className="text-xs text-[#6B5244] font-mono">{row.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: with drift detection */}
              <div className="rounded-xl border border-[#2C1810]/[0.08] bg-white p-4 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
                  With Drift Detection
                </p>
                <div className="space-y-0">
                  {[
                    { date: "Mar 5",  vendor: "Figma",        amount: "$760.00",   drift: true  },
                    { date: "Mar 12", vendor: "Slack",         amount: "$441.00",   drift: false },
                    { date: "Mar 15", vendor: "CloudOps Inc",  amount: "$5,100.00", drift: false },
                  ].map((row) => (
                    <div
                      key={row.vendor}
                      className="flex items-center justify-between py-1.5 border-b border-[#2C1810]/[0.06] last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#9A8070] w-12">{row.date}</span>
                        <span className="text-xs text-[#2C1810]">{row.vendor}</span>
                        {row.drift && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                            ↑ drift detected
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[#6B5244] font-mono">{row.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 3: Try it ─────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-1">
              Try it
            </h2>
            <p className="text-[#9A8070] text-sm mb-6">
              Six months of synthetic company transaction data. Real drift patterns baked in.
            </p>

            {/* Chart + Payroll callout */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1 rounded-xl border border-[#2C1810]/[0.08] bg-white p-5 shadow-sm">
                <p className="text-xs text-[#9A8070] mb-3">Monthly spend - SaaS, Infrastructure &amp; Misc</p>
                <LineChart />
                <ChartLegend />
              </div>

              {/* Payroll stable callout */}
              <div className="sm:w-44 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col justify-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 text-base">✓</span>
                  <span className="text-xs font-semibold text-emerald-700">Stable</span>
                </div>
                <p className="text-xs font-semibold text-[#2C1810]">Payroll</p>
                <p className="text-xs text-[#6B5244]">$48k / mo avg</p>
                <p className="text-[10px] text-emerald-600 font-medium">No drift detected</p>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-2 mb-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    filter === cat
                      ? "border-[#2C1810]/20 text-[#2C1810] bg-[#2C1810]/[0.06] font-medium"
                      : "border-[#2C1810]/10 text-[#9A8070] hover:text-[#6B5244] hover:border-[#2C1810]/20"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Transaction table */}
            <div className="rounded-xl border border-[#2C1810]/[0.08] bg-white overflow-hidden shadow-sm">
              <div className="grid grid-cols-4 px-4 py-2.5 border-b border-[#2C1810]/[0.08]">
                {["Date", "Vendor", "Category", "Amount"].map((h) => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-widest text-[#9A8070]">
                    {h}
                  </span>
                ))}
              </div>
              <div className="divide-y divide-[#2C1810]/[0.05] max-h-72 overflow-y-auto">
                {filtered.map((t, i) => (
                  <div key={i} className="grid grid-cols-4 px-4 py-2.5 hover:bg-[#2C1810]/[0.02] transition-colors">
                    <span className="text-xs text-[#9A8070]">{formatDate(t.date)}</span>
                    <span className="text-xs text-[#2C1810] truncate pr-2">{t.vendor}</span>
                    <span className="text-xs font-medium" style={{ color: CATEGORY_COLORS[t.category] ?? "#9A8070" }}>
                      {t.category}
                    </span>
                    <span className="text-xs text-[#6B5244] font-mono">
                      ${t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detect button */}
            <button
              onClick={handleDetect}
              disabled={analyzing}
              className="mt-4 w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: "#C1513A", color: "white" }}
            >
              {analyzing ? "Analyzing…" : analyzed ? "Run again" : "Detect drift"}
            </button>

            {/* Loading skeletons */}
            {analyzing && (
              <div className="mt-6 space-y-3">
                <p className="text-xs text-[#9A8070] text-center mb-4">
                  Analyzing 6 months of transactions…
                </p>
                {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
              </div>
            )}

            {/* Error */}
            {analysisError && !analyzing && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{analysisError}</p>
              </div>
            )}

            {/* Signal cards */}
            {!analyzing && signals.length > 0 && (
              <div className="mt-6 space-y-3">
                <p className="text-xs text-[#9A8070] mb-2">
                  {signals.length} drift signal{signals.length !== 1 ? "s" : ""} detected
                </p>
                {signals.map((signal, i) => (
                  <SignalCard key={signal.id ?? i} signal={signal} index={i} />
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </>
  );
}
