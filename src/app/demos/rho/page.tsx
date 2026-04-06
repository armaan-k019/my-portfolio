"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ThemeToggle, { MY_STYLE, type PageColors } from "@/components/ThemeToggle";

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

      {/* Payroll reference: dashed line at top of chart area */}
      <line
        x1={padL} y1={padT + 2}
        x2={width - padR} y2={padT + 2}
        stroke="#10b981"
        strokeWidth={1}
        strokeDasharray="4,3"
        opacity={0.4}
      />
      <text x={padL + 6} y={padT + 11} fontSize={8} fill="#10b981" fontStyle="italic">
        Payroll: stable ~$48k
      </text>

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

      {/* SaaS drift annotation: right-aligned at last (Mar) point */}
      <text
        x={xPos(5) - 3}
        y={yPos(monthlyTotals["SaaS"]?.[5] ?? 0) - 7}
        fontSize={9}
        textAnchor="end"
        fill={CATEGORY_COLORS["SaaS"]}
        fontWeight="600"
      >↑ +69% over 6 months</text>

      {/* Infrastructure "growing" label at midpoint (Dec) */}
      <text
        x={xPos(2) + 4}
        y={yPos(monthlyTotals["Infrastructure"]?.[2] ?? 0) - 7}
        fontSize={8}
        fill={CATEGORY_COLORS["Infrastructure"]}
        fontStyle="italic"
        opacity={0.75}
      >growing</text>
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

// ─── Projection Chart data ───────────────────────────────────────────────────────

const PROJ_MONTHS = ["Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep"];
const ACTUAL_COUNT = 6;

const ACTUAL_SAAS  = [1803, 1943, 2176, 2335, 2611, 2811];
const ACTUAL_INFRA = [7410, 8110, 7680, 8630, 8500, 8900];
const ACTUAL_MISC  = [3032, 2994, 3103, 3029, 3059, 3030];
const PROJ_SAAS    = [3120, 3463, 3844, 4267, 4736, 5257];
const PROJ_INFRA   = [9327, 9775, 10244, 10736, 11251, 11791];
const PROJ_MISC    = [3030, 3030, 3030, 3030, 3030, 3030];

// ─── Projection Chart ────────────────────────────────────────────────────────────

function ProjectionChart() {
  const width  = 700;
  const height = 220;
  const padL   = 52;
  const padR   = 20;
  const padT   = 20;
  const padB   = 36;
  const plotW  = width  - padL - padR;
  const plotH  = height - padT - padB;
  const n      = 12;

  const allVals = [...ACTUAL_SAAS, ...ACTUAL_INFRA, ...ACTUAL_MISC,
                   ...PROJ_SAAS,   ...PROJ_INFRA,   ...PROJ_MISC];
  const maxVal  = Math.max(...allVals) * 1.1;

  const xp = (i: number) => padL + (i / (n - 1)) * plotW;
  const yp = (v: number) => padT + plotH - (v / maxVal) * plotH;
  const todayX = (xp(ACTUAL_COUNT - 1) + xp(ACTUAL_COUNT)) / 2;

  const yTicks = [0, 3000, 6000, 9000, 12000].filter((v) => v <= maxVal * 1.05);

  const linePts = (vals: number[], offset = 0) =>
    vals.map((v, i) => `${xp(i + offset)},${yp(v)}`).join(" ");

  const cats = ["SaaS", "Infrastructure", "Misc"] as const;
  const actualData: Record<string, number[]> = { SaaS: ACTUAL_SAAS, Infrastructure: ACTUAL_INFRA, Misc: ACTUAL_MISC };
  const projData:   Record<string, number[]> = { SaaS: PROJ_SAAS,   Infrastructure: PROJ_INFRA,   Misc: PROJ_MISC   };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 220 }}
      aria-label="Projected monthly spend by category">
      {/* Y grid */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={padL} y1={yp(v)} x2={width - padR} y2={yp(v)}
            stroke="rgba(44,24,16,0.06)" strokeWidth={1} />
          <text x={padL - 6} y={yp(v) + 4} textAnchor="end" fontSize={9} fill="rgba(108,82,68,0.55)">
            {v >= 1000 ? `${v / 1000}k` : v}
          </text>
        </g>
      ))}

      {/* Projected area shading */}
      <rect x={todayX} y={padT} width={width - padR - todayX} height={plotH}
        fill="rgba(44,24,16,0.025)" />

      {/* Today divider */}
      <line x1={todayX} y1={padT} x2={todayX} y2={padT + plotH}
        stroke="rgba(44,24,16,0.25)" strokeWidth={1} strokeDasharray="3,2" />
      <text x={todayX + 4} y={padT + 11} fontSize={8} fill="rgba(44,24,16,0.5)" fontStyle="italic">
        Today →
      </text>

      {/* Actual lines (solid) */}
      {cats.map((cat) => (
        <polyline key={`act-${cat}`} points={linePts(actualData[cat])}
          fill="none" stroke={CATEGORY_COLORS[cat]} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      ))}

      {/* Projected lines (dashed), starting from last actual point for continuity */}
      {cats.map((cat) => {
        const pts = [actualData[cat][ACTUAL_COUNT - 1], ...projData[cat]]
          .map((v, i) => `${xp(ACTUAL_COUNT - 1 + i)},${yp(v)}`).join(" ");
        return (
          <polyline key={`proj-${cat}`} points={pts}
            fill="none" stroke={CATEGORY_COLORS[cat]} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray="5,3" opacity={0.65} />
        );
      })}

      {/* Actual dots (solid) */}
      {cats.map((cat) =>
        actualData[cat].map((v, i) => (
          <circle key={`act-dot-${cat}-${i}`} cx={xp(i)} cy={yp(v)} r={3}
            fill={CATEGORY_COLORS[cat]} opacity={0.95} />
        ))
      )}

      {/* Projected dots (hollow) */}
      {cats.map((cat) =>
        projData[cat].map((v, i) => (
          <circle key={`proj-dot-${cat}-${i}`} cx={xp(ACTUAL_COUNT + i)} cy={yp(v)} r={2.5}
            fill="white" stroke={CATEGORY_COLORS[cat]} strokeWidth={1.5} opacity={0.8} />
        ))
      )}

      {/* Month labels */}
      {PROJ_MONTHS.map((m, i) => (
        <text key={m} x={xp(i)} y={height - 6} textAnchor="middle" fontSize={8}
          fill={i >= ACTUAL_COUNT ? "rgba(108,82,68,0.4)" : "rgba(108,82,68,0.65)"}>
          {m}
        </text>
      ))}

      {/* Sep SaaS endpoint annotation */}
      <text x={xp(11) - 3} y={yp(PROJ_SAAS[5]) - 7}
        fontSize={9} textAnchor="end" fill={CATEGORY_COLORS["SaaS"]} fontWeight="600">
        $5,257 / mo
      </text>
    </svg>
  );
}

// ─── Health Scorecard ─────────────────────────────────────────────────────────────

function HealthScorecard() {
  const score = 67;
  const grade = score >= 80 ? "B" : score >= 60 ? "C" : "D";
  const accentColor = score >= 80 ? "#10b981" : score >= 60 ? "#B8952A" : "#ef4444";
  const borderBg = score >= 80
    ? "border-emerald-200 bg-emerald-50"
    : score >= 60
    ? "border-amber-200 bg-amber-50"
    : "border-red-200 bg-red-50";

  const bars = [
    { label: "SaaS Efficiency",      fill: 0.18, status: "HIGH RISK",    color: "#ef4444" },
    { label: "Vendor Reliability",   fill: 0.45, status: "MEDIUM RISK",  color: "#B8952A" },
    { label: "Subscription Hygiene", fill: 0.40, status: "MEDIUM RISK",  color: "#B8952A" },
    { label: "Payroll Stability",    fill: 1.00, status: "HEALTHY",      color: "#10b981" },
  ];

  return (
    <div className={`rounded-xl border p-5 shadow-sm mb-4 ${borderBg}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-1">
            Spend Health Score
          </h3>
          <p className="text-[10px] text-[#9A8070]">Calculated from 6 months of transaction data</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold leading-none" style={{ color: accentColor }}>
            {score}
          </span>
          <span
            className="text-base font-bold px-2.5 py-1 rounded-lg text-white leading-none"
            style={{ backgroundColor: accentColor }}
          >
            {grade}
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-3">
            <span className="text-[11px] text-[#6B5244] w-40 shrink-0">{bar.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-[#2C1810]/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${bar.fill * 100}%`, backgroundColor: bar.color }}
              />
            </div>
            <span
              className="text-[9px] font-semibold uppercase tracking-wide w-24 text-right shrink-0"
              style={{ color: bar.color }}
            >
              {bar.status}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[#9A8070] mt-3 italic">
        Score updates automatically when new transactions are analyzed.
      </p>
    </div>
  );
}

// ─── Benchmark Table ──────────────────────────────────────────────────────────────

function BenchmarkTable() {
  const rows = [
    { metric: "SaaS % of burn",      company: "18%", seriesA: "12%", seriesB: "15%", cmp: "worse"   },
    { metric: "MoM SaaS growth",     company: "11%", seriesA: "4%",  seriesB: "6%",  cmp: "worse"   },
    { metric: "Infra % of burn",     company: "9%",  seriesA: "8%",  seriesB: "10%", cmp: "between" },
    { metric: "Payroll % of burn",   company: "60%", seriesA: "65%", seriesB: "58%", cmp: "between" },
  ];

  function cellStyle(cmp: string): React.CSSProperties {
    if (cmp === "worse")  return { backgroundColor: "#FEF2F2", color: "#991B1B" };
    if (cmp === "better") return { backgroundColor: "#ECFDF5", color: "#065F46" };
    return { backgroundColor: "#FFFBEB", color: "#92400E" };
  }

  const saasMultiple = (11 / 4).toFixed(2);

  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#9A8070] mb-3">
        How does this compare?
      </h3>
      <div className="overflow-x-auto rounded-xl border border-[#2C1810]/[0.08] shadow-sm">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="bg-[#2C1810]/[0.03] border-b border-[#2C1810]/[0.08]">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#9A8070] w-[32%]">
                Metric
              </th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#9A8070]">
                This Company
              </th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#9A8070]">
                Series A Avg
              </th>
              <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#9A8070]">
                Series B Avg
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2C1810]/[0.05]">
            {rows.map((row) => (
              <tr key={row.metric} className="bg-white">
                <td className="px-4 py-2.5 text-xs text-[#2C1810] font-medium">{row.metric}</td>
                <td className="px-3 py-2.5 text-center text-xs font-semibold" style={cellStyle(row.cmp)}>
                  {row.company}
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-[#6B5244]">{row.seriesA}</td>
                <td className="px-3 py-2.5 text-center text-xs text-[#6B5244]">{row.seriesB}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[#9A8070] mt-3 leading-relaxed">
        Benchmarks based on Rho platform aggregates across 500+ startups.
        This company&apos;s SaaS growth rate is {saasMultiple}x the Series A average.
      </p>
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
  const [theme, setTheme]         = useState<"my" | "company">("my");

  const COMPANY_STYLE: PageColors = {
    bg: "#fafaf9",
    cardBg: "#ffffff",
    cardBorder: "rgba(44,24,16,0.10)",
    text: "#2C1810",
    muted: "#6B5244",
    dim: "#9A8070",
    accent: "#e85d2f",
    accentBg: "rgba(232,93,47,0.08)",
    headerBg: "#ffffff",
    headerBorder: "rgba(44,24,16,0.10)",
    headerText: "#2C1810",
  };

  const C = theme === "my" ? MY_STYLE : COMPANY_STYLE;

  const PAGE_BG  = C.bg;
  const HEADING  = C.text;
  const SUBTEXT  = C.muted;
  const LABEL    = C.dim;

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

  const trendingSet = useMemo(() => {
    const vendorMonths = new Map<string, Array<{ monthIdx: number; tx: Transaction }>>();
    TRANSACTIONS.forEach((t) => {
      if (t.category !== "SaaS") return;
      const mIdx = MONTH_PREFIXES.findIndex((p) => t.date.startsWith(p));
      if (mIdx < 0) return;
      if (!vendorMonths.has(t.vendor)) vendorMonths.set(t.vendor, []);
      vendorMonths.get(t.vendor)!.push({ monthIdx: mIdx, tx: t });
    });
    const trending = new Set<Transaction>();
    for (const entries of vendorMonths.values()) {
      entries.sort((a, b) => a.monthIdx - b.monthIdx);
      for (let i = 1; i < entries.length; i++) {
        const curr = entries[i];
        const prev = entries[i - 1];
        if (curr.monthIdx >= 3 && curr.tx.amount > prev.tx.amount) {
          trending.add(curr.tx);
        }
      }
    }
    return trending;
  }, []);

  const allSignalVendors = useMemo(
    () => new Set(signals.flatMap((s) => s.affectedVendors)),
    [signals],
  );

  const [execSummary,    setExecSummary]    = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError,   setSummaryError]   = useState<string | null>(null);

  // Fetch executive summary automatically when signals are detected
  useEffect(() => {
    if (signals.length === 0) return;
    setSummaryLoading(true);
    setExecSummary(null);
    setSummaryError(null);
    fetch("/api/drift-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signals }),
    })
      .then((r) => r.json() as Promise<{ summary?: string; error?: string }>)
      .then((data) => {
        if (data.summary) setExecSummary(data.summary);
        else setSummaryError(data.error ?? "Summary unavailable.");
      })
      .catch(() => setSummaryError("Network error."))
      .finally(() => setSummaryLoading(false));
  }, [signals]);

  async function handleDetect() {
    setAnalyzing(true);
    setError(null);
    setSignals([]);
    setAnalyzed(false);
    setExecSummary(null);
    setSummaryError(null);
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
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

      <div className="min-h-screen" style={{ backgroundColor: PAGE_BG }}>
        <div className="max-w-3xl mx-auto px-6 py-12">

          {/* ── Back link + ThemeToggle ────────────────────────────────────── */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-8">
            <Link
              href="/demos"
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors inline-block"
            >
              ← Back to Demos
            </Link>
            <ThemeToggle theme={theme} onChange={setTheme} companyAccent={COMPANY_STYLE.accent} darkContext={false} />
          </div>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <h1 className="text-2xl font-semibold" style={{ color: HEADING }}>Drift Detection</h1>
              <span className="text-xs px-2 py-0.5 rounded-full border border-[#2C1810]/10 ml-2" style={{ color: LABEL }}>
                Rho
              </span>
            </div>
          </div>

          {/* ── Section 1: What this is ──────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What this is
            </h2>
            <p className="leading-relaxed text-sm" style={{ color: SUBTEXT }}>
              Rho processes every corporate card transaction, AP invoice, and bank transfer for a company in one place. Most anomaly detection tools flag large one-off transactions. Drift Detection surfaces something harder to catch: slow-moving patterns that compound over months - a SaaS category creeping up 12% month-over-month, a vendor billing inconsistently, recurring spend that nobody remembers approving.
            </p>
          </section>

          {/* ── Section 2: What Rho currently shows ─────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What Rho currently shows
            </h2>
            <p className="leading-relaxed text-sm mb-5" style={{ color: SUBTEXT }}>
              Rho&apos;s dashboard shows account balances and transaction history. It does not surface multi-month trends, flag gradual spend drift, or distinguish intentional growth from unnoticed cost creep.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left: today */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
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
                      className="flex items-center justify-between py-1.5 last:border-0"
                      style={{ borderBottom: `1px solid ${C.cardBorder}` }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs w-12" style={{ color: LABEL }}>{row.date}</span>
                        <span className="text-xs" style={{ color: HEADING }}>{row.vendor}</span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: SUBTEXT }}>{row.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: with drift detection */}
              <div className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
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
                      className="flex items-center justify-between py-1.5 last:border-0"
                      style={{ borderBottom: `1px solid ${C.cardBorder}` }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs w-12" style={{ color: LABEL }}>{row.date}</span>
                        <span className="text-xs" style={{ color: HEADING }}>{row.vendor}</span>
                        {row.drift && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                            ↑ drift detected
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono" style={{ color: SUBTEXT }}>{row.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2.5: What changes ────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: LABEL }}>
              What changes
            </h2>

            {/* Desktop table */}
            <div className="hidden sm:block rounded-xl border overflow-hidden shadow-sm text-sm" style={{ borderColor: C.cardBorder }}>
              <table className="w-full">
                <thead>
                  <tr className="border-b" style={{ backgroundColor: `${C.cardBorder}40`, borderColor: C.cardBorder }}>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest w-[28%]" style={{ color: LABEL }}>Feature</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest w-[36%]" style={{ color: LABEL }}>Without Drift Detection</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest w-[36%]" style={{ color: LABEL }}>With Drift Detection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2C1810]/[0.06]">
                  {[
                    {
                      feature: "Spend visibility",
                      without: "Transaction list - amounts and dates only",
                      with: "Trend analysis across 6 months per vendor",
                    },
                    {
                      feature: "SaaS creep",
                      without: "Invisible - looks normal month to month",
                      with: "Flagged when category grows >8% MoM",
                    },
                    {
                      feature: "Vendor anomalies",
                      without: "No way to spot inconsistent billing",
                      with: "Variance detected and surfaced automatically",
                    },
                    {
                      feature: "Forgotten subscriptions",
                      without: "Recurring charges go unnoticed indefinitely",
                      with: "Flat recurring charges with no usage correlation flagged at low severity",
                    },
                    {
                      feature: "CFO time",
                      without: "Manual review of every line item",
                      with: "AI surfaces only what needs attention",
                    },
                    {
                      feature: "Data required",
                      without: "Works with any bank",
                      with: "Uniquely possible with Rho's unified cards + AP + banking data in one place",
                    },
                  ].map((row) => (
                    <tr key={row.feature} style={{ backgroundColor: C.cardBg }}>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: HEADING }}>{row.feature}</td>
                      <td className="px-4 py-3 text-xs bg-red-50/50" style={{ color: LABEL }}>{row.without}</td>
                      <td className="px-4 py-3 text-xs bg-emerald-50/50" style={{ color: HEADING }}>
                        <span className="text-emerald-600 mr-1.5">&#10003;</span>{row.with}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="sm:hidden flex flex-col gap-3">
              {[
                {
                  feature: "Spend visibility",
                  without: "Transaction list - amounts and dates only",
                  with: "Trend analysis across 6 months per vendor",
                },
                {
                  feature: "SaaS creep",
                  without: "Invisible - looks normal month to month",
                  with: "Flagged when category grows >8% MoM",
                },
                {
                  feature: "Vendor anomalies",
                  without: "No way to spot inconsistent billing",
                  with: "Variance detected and surfaced automatically",
                },
                {
                  feature: "Forgotten subscriptions",
                  without: "Recurring charges go unnoticed indefinitely",
                  with: "Flat recurring charges with no usage correlation flagged at low severity",
                },
                {
                  feature: "CFO time",
                  without: "Manual review of every line item",
                  with: "AI surfaces only what needs attention",
                },
                {
                  feature: "Data required",
                  without: "Works with any bank",
                  with: "Uniquely possible with Rho's unified cards + AP + banking data in one place",
                },
              ].map((row) => (
                <div key={row.feature} className="rounded-xl border overflow-hidden shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <div className="px-4 py-2.5 border-b" style={{ borderColor: C.cardBorder }}>
                    <span className="text-xs font-semibold" style={{ color: HEADING }}>{row.feature}</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x" style={{ borderColor: C.cardBorder }}>
                    <div className="px-3 py-2.5 bg-red-50/50">
                      <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>Without</p>
                      <p className="text-xs" style={{ color: LABEL }}>{row.without}</p>
                    </div>
                    <div className="px-3 py-2.5 bg-emerald-50/50">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-600 mb-1">With</p>
                      <p className="text-xs" style={{ color: HEADING }}><span className="text-emerald-600 mr-1">&#10003;</span>{row.with}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Section C: Why it's better ──────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: LABEL }}>
              Why it&apos;s better
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                {
                  title: "Catches what one-off detection misses",
                  body: "Slow-moving patterns like SaaS creep at 12% MoM or inconsistent billing cycles are invisible to standard anomaly detection. Drift Detection finds them.",
                },
                {
                  title: "Only possible with Rho's unified data",
                  body: "Cards, AP, and bank transfers in one ledger means patterns can be correlated across sources. No other platform has this data advantage.",
                },
                {
                  title: "Surfaces signal, not noise",
                  body: "Instead of alerting on every large transaction, it ranks by severity and surfaces only what actually needs a CFO's attention.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border p-4 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: HEADING }}>{card.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: LABEL }}>{card.body}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-xs font-semibold mb-1" style={{ color: HEADING }}>Why This Is Different</p>
              <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>
                Most spend tools show you what happened. Drift Detection shows you what&apos;s <em>happening</em>: the gradual shifts that compound quietly until someone looks at the annual budget and wonders where $40k went.
              </p>
            </div>
          </section>

          {/* ── Section D: Try it ────────────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>
              Try it
            </h2>
            <p className="text-sm mb-6" style={{ color: LABEL }}>
              Six months of synthetic company transaction data. Real drift patterns baked in.
            </p>

            {/* Chart intro annotation */}
            <p style={{ fontSize: 11, fontStyle: "italic", color: LABEL, marginBottom: 10 }}>
              The chart below excludes payroll. Watch the SaaS line.
            </p>

            {/* Chart + Payroll callout */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1 rounded-xl border p-5 shadow-sm" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                <p className="text-xs mb-3" style={{ color: LABEL }}>Monthly spend - SaaS, Infrastructure &amp; Misc</p>
                <LineChart />
                <ChartLegend />
              </div>

              {/* Payroll stable callout */}
              <div className="sm:w-44 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col justify-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 text-base">✓</span>
                  <span className="text-xs font-semibold text-emerald-700">Stable</span>
                </div>
                <p className="text-xs font-semibold" style={{ color: HEADING }}>Payroll</p>
                <p className="text-xs" style={{ color: SUBTEXT }}>$48k / mo avg</p>
                <p className="text-[10px] text-emerald-600 font-medium">No drift detected</p>
              </div>
            </div>

            {/* Spend Projection Chart */}
            <div className="rounded-xl border p-5 shadow-sm mb-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <p className="text-xs font-medium mb-1" style={{ color: HEADING }}>
                At current drift rates, here is where spend is heading
              </p>
              <p style={{ fontSize: 11, fontStyle: "italic", color: LABEL, marginBottom: 10 }}>
                Solid lines = actual · Dashed lines = projected
              </p>
              <ProjectionChart />
              <ChartLegend />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t" style={{ borderColor: C.cardBorder }}>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: LABEL }}>
                    Projected SaaS spend by Sep 2025
                  </p>
                  <p className="text-2xl font-bold" style={{ color: "#B8952A" }}>
                    $5,257<span className="text-sm font-normal"> / mo</span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: LABEL }}>
                    vs. today
                  </p>
                  <p className="text-2xl font-bold" style={{ color: HEADING }}>
                    +$2,446<span className="text-sm font-normal"> / month</span>
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: LABEL }}>
                    Annualized overspend if unaddressed
                  </p>
                  <p className="text-2xl font-bold text-red-600">
                    $13,869<span className="text-sm font-normal"> cumulative</span>
                  </p>
                </div>
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
            <div className="overflow-x-auto rounded-xl border shadow-sm" style={{ borderColor: C.cardBorder }}>
            <div className="min-w-[480px] rounded-xl overflow-hidden" style={{ backgroundColor: C.cardBg }}>
              <div className="grid grid-cols-4 px-4 py-2.5 border-b" style={{ borderColor: C.cardBorder }}>
                {["Date", "Vendor", "Category", "Amount"].map((h) => (
                  <span key={h} className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: LABEL }}>
                    {h}
                  </span>
                ))}
              </div>
              <div className="divide-y divide-[#2C1810]/[0.05] max-h-72 overflow-y-auto">
                {filtered.map((t, i) => {
                  const isSignalVendor = analyzed && allSignalVendors.has(t.vendor);
                  const isTrending = trendingSet.has(t);
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-4 px-4 py-2.5 hover:bg-[#2C1810]/[0.02] transition-colors"
                      style={{
                        backgroundColor: isSignalVendor ? "#FFFBEB" : i % 2 === 1 ? "#FAFAF8" : "white",
                        borderLeft: isSignalVendor ? "2px solid #B8952A" : undefined,
                      }}
                    >
                      <span className="text-xs text-[#9A8070]">{formatDate(t.date)}</span>
                      <span className="text-xs text-[#2C1810] truncate pr-2">{t.vendor}</span>
                      <span className="text-xs font-medium flex items-center gap-1" style={{ color: CATEGORY_COLORS[t.category] ?? "#9A8070" }}>
                        {t.category}
                        {isTrending && (
                          <span style={{ fontSize: 8, backgroundColor: "#FEF3C7", color: "#B8952A", border: "1px solid #FDE68A", borderRadius: 9999, padding: "0 4px", lineHeight: "14px", whiteSpace: "nowrap" }}>
                            ↑ trending
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[#6B5244] font-mono">
                        ${t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>

            <HealthScorecard />

            {/* Detect button */}
            <button
              onClick={handleDetect}
              disabled={analyzing}
              className="mt-4 w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: C.accent, color: "white" }}
            >
              {analyzing ? "Analyzing…" : analyzed ? "Run again" : "Detect drift"}
            </button>

            {/* Loading skeletons */}
            {analyzing && (
              <div className="mt-6 space-y-3">
                <p className="text-xs text-center mb-4" style={{ color: LABEL }}>
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
                <p style={{ fontSize: 11, fontStyle: "italic", color: LABEL, marginBottom: 4 }}>
                  {signals.length} patterns a CFO would miss scanning line by line
                </p>
                {signals.map((signal, i) => (
                  <SignalCard key={signal.id ?? i} signal={signal} index={i} />
                ))}
              </div>
            )}

            {/* Executive Summary */}
            {!analyzing && signals.length > 0 && (
              <div className="mt-4 rounded-xl border p-5 shadow-sm"
                style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg, animation: "fadeSlideIn 0.4s ease forwards 400ms", opacity: 0 }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: HEADING }}>Executive Summary</h3>
                    <p className="text-[10px] mt-0.5" style={{ color: LABEL }}>
                      Generated from 6 months of transaction data
                    </p>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#6C47FF]/10 text-[#6C47FF] border border-[#6C47FF]/20 font-semibold uppercase tracking-wide whitespace-nowrap ml-3">
                    AI generated
                  </span>
                </div>
                {summaryLoading ? (
                  <div className="space-y-2 animate-pulse">
                    {[1, 0.9, 1, 0.8, 1, 0.7].map((w, i) => (
                      <div key={i} className={`h-3 bg-[#2C1810]/[0.05] rounded ${i === 2 || i === 4 ? "mt-3" : ""}`}
                        style={{ width: `${w * 100}%` }} />
                    ))}
                  </div>
                ) : execSummary ? (
                  <div className="space-y-3">
                    {execSummary.split("\n\n").filter((p) => p.trim()).map((para, i) => (
                      <p key={i} className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>{para.trim()}</p>
                    ))}
                  </div>
                ) : summaryError ? (
                  <p className="text-sm italic" style={{ color: LABEL }}>Summary unavailable.</p>
                ) : null}
              </div>
            )}

            {/* Benchmark comparison */}
            {!analyzing && signals.length > 0 && <BenchmarkTable />}
          </section>

        </div>
      </div>
    </>
  );
}
