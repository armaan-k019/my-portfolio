"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import ThemeToggle, { MY_STYLE, CSS_VAR_COLORS, type PageColors } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { Space_Mono } from "next/font/google";

const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-brand" });

const SIDESHIFT_ORANGE = "#f97316";


const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #0f0f0f; --ct-card-bg: #1a1a1a; --ct-card-border: #2a2a2a;
  --ct-text: #f1f1f1; --ct-muted: #9ca3af; --ct-dim: #6b7280;
  --ct-accent: ${SIDESHIFT_ORANGE}; --ct-accent-bg: rgba(249,115,22,0.12);
  --ct-header-bg: #0a0a0a; --ct-header-border: #2a2a2a; --ct-header-text: #f1f1f1;
  font-family: var(--font-brand, 'Space Mono', monospace);
}
.company-theme .rounded-xl, .company-theme .rounded-lg, .company-theme .rounded-2xl { border-radius: 4px; }
.company-theme button, .company-theme input, .company-theme select, .company-theme textarea { border-radius: 4px; font-family: inherit; }
`;

const PRIORITIES = ["Lowest Fees", "Fastest Confirmation", "Best Rate Certainty"] as const;
type Priority = typeof PRIORITIES[number];

const WALLET_TYPES = [
  "Hardware Wallet (Trezor/Ledger)",
  "Software Wallet",
  "Exchange Address",
  "Mobile Wallet",
];

const LOADING_STEPS = [
  "Fetching current market rates...",
  "Simulating direct route...",
  "Identifying viable intermediate assets...",
  "Simulating multi-hop routes...",
  "Calculating total fees and confirmation times...",
  "Selecting optimal path...",
];

const SAMPLE = {
  fromAsset: "XMR",
  fromAmount: "2.5",
  toAsset: "SOL",
  priority: "Lowest Fees" as Priority,
  walletType: "Software Wallet",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface RouteOption {
  label: string;
  hops: string[];
  total_fee_pct: number;
  confirmation_minutes: number;
  rate_type: "Fixed" | "Variable";
  rate_reason: string;
  why_it_works: string;
  is_recommended: boolean;
}

interface HopRow {
  from: string;
  to: string;
  estimated_spread: string;
  network_fee: string;
  confirmation_time: string;
  rate_type: string;
}

interface RouteResult {
  recommendation: "direct" | "multihop";
  recommendation_reason: string;
  estimated_fee_savings: string;
  total_confirmation_time: string;
  recommended_rate_type: "Fixed" | "Variable";
  routes: RouteOption[];
  hop_breakdown: HopRow[];
  fixed_if: string;
  variable_if: string;
  rate_explainer: string;
}

// ── HopPath ────────────────────────────────────────────────────────────────────

function HopPath({ hops, c }: { hops: string[]; c: PageColors }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {hops.map((hop, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span
            className="text-sm font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: c.cardBorder, color: c.text }}
          >
            {hop}
          </span>
          {i < hops.length - 1 && (
            <span className="text-xs font-bold" style={{ color: c.accent }}>&#8594;</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── RouteCard ──────────────────────────────────────────────────────────────────

function RouteCard({ route, c }: { route: RouteOption; c: PageColors }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 transition-all"
      style={{
        backgroundColor: c.cardBg,
        border: route.is_recommended
          ? `2px solid ${c.accent}`
          : `1px solid ${c.cardBorder}`,
        boxShadow: route.is_recommended
          ? `0 0 20px ${c.accent}22`
          : "none",
      }}
    >
      {/* Label + recommended badge */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: c.muted }}>
          {route.label}
        </span>
        {route.is_recommended && (
          <span
            className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
            style={{ backgroundColor: c.accent + "22", color: c.accent, border: `1px solid ${c.accent}50` }}
          >
            Recommended
          </span>
        )}
      </div>

      {/* Hop path */}
      <HopPath hops={route.hops} c={c} />

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: c.dim }}>Total Fee</p>
          <p className="text-lg font-black" style={{ color: route.is_recommended ? c.accent : c.text }}>
            {route.total_fee_pct.toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: c.dim }}>Time</p>
          <p className="text-lg font-black" style={{ color: c.text }}>
            {route.confirmation_minutes < 1
              ? "&lt;1 min"
              : `${route.confirmation_minutes} min`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: c.dim }}>Rate</p>
          <p className="text-lg font-black" style={{ color: c.text }}>{route.rate_type}</p>
        </div>
      </div>

      {/* Hops count */}
      <p className="text-xs" style={{ color: c.dim }}>
        {route.hops.length - 1} hop{route.hops.length - 1 !== 1 ? "s" : ""}
      </p>

      {/* Why it works */}
      <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: "#0f0f0f" }}>
        <p className="text-xs leading-relaxed" style={{ color: c.muted }}>
          {route.why_it_works}
        </p>
      </div>

      {/* Rate reason */}
      <p className="text-xs" style={{ color: c.dim }}>
        <span className="font-semibold" style={{ color: c.muted }}>Rate note:</span>{" "}
        {route.rate_reason}
      </p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SideShiftPage() {
  const [fromAsset, setFromAsset] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [toAsset, setToAsset] = useState("");
  const [priority, setPriority] = useState<Priority>("Lowest Fees");
  const [walletType, setWalletType] = useState(WALLET_TYPES[1]);

  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

  const [theme, setTheme] = useState<"my" | "company">("my");

  const C = theme === "my" ? MY_STYLE : CSS_VAR_COLORS;

  const BG = C.bg;
  const CARD = C.cardBg;
  const BORDER = C.cardBorder;
  const ORANGE = C.accent;
  const TEXT = C.text;
  const MUTED = C.muted;
  const DIM = C.dim;

  function loadSample() {
    setFromAsset(SAMPLE.fromAsset);
    setFromAmount(SAMPLE.fromAmount);
    setToAsset(SAMPLE.toAsset);
    setPriority(SAMPLE.priority);
    setWalletType(SAMPLE.walletType);
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
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const res = await fetch("/api/demos/sideshift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAsset, fromAmount, toAsset, priority, walletType }),
      });
      const raw = await res.text();
      const json = JSON.parse(raw) as { result?: RouteResult; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result!);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      console.error("[sideshift] error:", err);
      setError(String(err));
    } finally {
      setLoading(false);
      setStepIndex(-1);
    }
  }

  const canSubmit =
    fromAsset.trim().length > 0 &&
    fromAmount.trim().length > 0 &&
    toAsset.trim().length > 0 &&
    !loading;

  // Input style helper
  const inputStyle: React.CSSProperties = {
    backgroundColor: "#0f0f0f",
    border: `1px solid ${BORDER}`,
    color: TEXT,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    width: "100%",
    outline: "none",
  };

  return (
    <div className={`min-h-screen${theme === "company" ? ` company-theme ${spaceMono.variable}` : ""}`} style={{ backgroundColor: BG, color: TEXT }}>
      <CompanyThemeStyle active={theme === "company"} css={COMPANY_THEME_CSS} />

      {/* ── Header ── */}
      <header
        className="px-6 py-5 border-b"
        style={{ borderColor: C.headerBorder, backgroundColor: C.headerBg }}
      >
        <div className="max-w-4xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                SideShift
                <span style={{ color: ORANGE }}>.ai</span>
              </span>
              <span
                className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                style={{ borderColor: ORANGE + "50", color: ORANGE, backgroundColor: ORANGE + "12" }}
              >
                Swap Route Optimizer
              </span>
            </div>
            <p className="text-sm" style={{ color: MUTED }}>
              Find the optimal route for any crypto swap across 200+ assets.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs mt-1" style={{ color: DIM }}>
              Demo by{" "}
              <Link href="/" className="underline transition-colors" style={{ color: MUTED }}>
                Armaan Kazi
              </Link>
            </span>
            <ThemeToggle theme={theme} onChange={setTheme} companyAccent={SIDESHIFT_ORANGE} darkContext={theme === "company"} />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* ── Back link ── */}
        <Link
          href="/demos"
          className="text-xs transition-colors mb-8 inline-block"
          style={{ color: DIM }}
        >
          &#8592; Back to Demos
        </Link>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION A: What SideShift does today                               */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: DIM }}>
            What SideShift does today
          </p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: MUTED }}>
            SideShift processes direct wallet-to-wallet crypto swaps across 200+ assets with no account required. Users select a coin pair, send funds to a generated deposit address, and receive the swapped asset directly in their wallet. The platform offers variable rates (live market price) and fixed rates (locked for 15 minutes) for each direct swap.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Today block */}
            <div className="rounded-xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: DIM }}>
                Today
              </p>
              <div className="flex items-center gap-2 flex-wrap mb-4">
                {["Asset A", "SideShift", "Asset B"].map((node, i, arr) => (
                  <span key={i} className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold px-3 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: i === 1 ? ORANGE + "22" : BORDER,
                        color: i === 1 ? ORANGE : TEXT,
                        border: i === 1 ? `1px solid ${ORANGE}50` : `1px solid transparent`,
                      }}
                    >
                      {node}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="text-xs font-bold" style={{ color: DIM }}>&#8594;</span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs italic" style={{ color: DIM }}>
                One pair. One rate. No optimization.
              </p>
            </div>

            {/* With optimizer block */}
            <div className="rounded-xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${ORANGE}40` }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: ORANGE }}>
                With Route Optimizer
              </p>
              <div className="flex items-center gap-2 flex-wrap mb-4">
                {["Asset A", "Intermediate?", "Asset B"].map((node, i, arr) => (
                  <span key={i} className="flex items-center gap-2">
                    <span
                      className="text-xs font-bold px-3 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: i === 1 ? ORANGE + "22" : BORDER,
                        color: i === 1 ? ORANGE : TEXT,
                        border: i === 1 ? `1px solid ${ORANGE}50` : `1px solid transparent`,
                      }}
                    >
                      {node}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="text-xs font-bold" style={{ color: ORANGE }}>&#8594;</span>
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs italic" style={{ color: MUTED }}>
                Analyzes direct vs. multi-hop paths. Recommends the best route.
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION B: What this demo adds                                      */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: DIM }}>
            What this demo adds
          </p>
          <p className="text-sm leading-relaxed mb-6" style={{ color: MUTED }}>
            SideShift already handles the swap. What it does not tell you is whether going through an intermediate asset would have saved you money or gotten there faster. This tool analyzes direct and multi-hop paths simultaneously and recommends the best route for your specific pair, amount, and priority.
          </p>

          {/* Comparison table */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="grid grid-cols-3 px-4 py-2.5" style={{ backgroundColor: "#0f0f0f", borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: DIM }}>Feature</span>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: DIM }}>Today</span>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ORANGE }}>With Route Optimizer</span>
            </div>
            {[
              ["Route options", "Direct only", "Direct + multi-hop analyzed"],
              ["Fee visibility", "Single swap fee", "Total fee across all hops"],
              ["Confirmation time", "One chain", "Aggregated across hops"],
              ["Rate type guidance", "User chooses blind", "Recommended based on amount + volatility"],
              ["Optimization", "None", "Best path selected automatically"],
            ].map(([feature, today, withDemo], i) => (
              <div
                key={feature}
                className="grid grid-cols-3 px-4 py-3"
                style={{
                  backgroundColor: i % 2 === 0 ? CARD : "#0f0f0f",
                  borderBottom: i < 4 ? `1px solid ${BORDER}` : "none",
                }}
              >
                <span className="text-xs font-semibold pr-3" style={{ color: TEXT }}>{feature}</span>
                <span className="text-xs pr-3" style={{ color: DIM }}>{today}</span>
                <span className="text-xs" style={{ color: TEXT }}>{withDemo}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION C: Why it is better                                         */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: DIM }}>
            Why it is better
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              {
                title: "Hidden savings in intermediate assets",
                body: "Some asset pairs have wide spreads when swapped directly. Routing through BTC or ETH as an intermediate often reduces total slippage, especially for exotic pairs.",
              },
              {
                title: "Confirmation time compounds across hops",
                body: "A two-hop route is only worth it if the fee savings outweigh the added wait. The optimizer weighs both so users do not trade speed for savings they do not notice.",
              },
              {
                title: "Fixed vs. variable is not obvious",
                body: "For large swaps, a fixed rate eliminates volatility risk. For small swaps, variable often wins. The optimizer recommends which rate type to use based on amount and the asset's historical volatility.",
              },
            ].map(card => (
              <div
                key={card.title}
                className="rounded-xl p-5"
                style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ORANGE }} />
                  <p className="text-xs font-semibold" style={{ color: TEXT }}>{card.title}</p>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{card.body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl px-5 py-4" style={{ border: `1px solid ${BORDER}`, backgroundColor: ORANGE + "0d" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: DIM }}>Why This Is Different</p>
            <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
              Most swap tools show you one price. This shows you whether that price is actually the best you can get.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* SECTION D: Try it + Input Form                                      */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: DIM }}>
          Try it
        </p>
        <p className="text-sm mb-1" style={{ color: MUTED }}>
          Enter a swap and see the optimal route.
        </p>
        <p className="text-xs mb-6" style={{ color: DIM }}>
          Works best with cross-chain pairs or exotic assets. Try XMR to SOL or DOGE to USDC.
        </p>

        {/* ── Input Form ── */}
        {!result && (
          <div
            className="rounded-2xl p-6 mb-8"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-base" style={{ color: TEXT }}>Swap Details</h2>
              <button
                type="button"
                onClick={loadSample}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  border: `1px solid ${BORDER}`,
                  color: MUTED,
                  backgroundColor: "transparent",
                }}
              >
                Load Sample (XMR &#8594; SOL)
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                {/* Left column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: MUTED }}>
                      From Asset
                    </label>
                    <input
                      type="text"
                      value={fromAsset}
                      onChange={e => setFromAsset(e.target.value.toUpperCase())}
                      placeholder="e.g. BTC, ETH, XMR, DOGE"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: MUTED }}>
                      From Amount
                    </label>
                    <input
                      type="number"
                      value={fromAmount}
                      onChange={e => setFromAmount(e.target.value)}
                      placeholder="e.g. 0.5"
                      min="0"
                      step="any"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: MUTED }}>
                      Priority
                    </label>
                    <div className="flex flex-col gap-2">
                      {PRIORITIES.map(p => (
                        <label key={p} className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="priority"
                            value={p}
                            checked={priority === p}
                            onChange={() => setPriority(p)}
                            className="sr-only"
                          />
                          <div
                            className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              borderColor: priority === p ? ORANGE : BORDER,
                              backgroundColor: "transparent",
                            }}
                          >
                            {priority === p && (
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ORANGE }} />
                            )}
                          </div>
                          <span className="text-sm" style={{ color: priority === p ? TEXT : MUTED }}>{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: MUTED }}>
                      To Asset
                    </label>
                    <input
                      type="text"
                      value={toAsset}
                      onChange={e => setToAsset(e.target.value.toUpperCase())}
                      placeholder="e.g. SOL, USDC, LTC, ETH"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: MUTED }}>
                      Wallet Type
                    </label>
                    <select
                      value={walletType}
                      onChange={e => setWalletType(e.target.value)}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      {WALLET_TYPES.map(w => (
                        <option key={w} value={w} style={{ backgroundColor: CARD }}>{w}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                style={{ backgroundColor: ORANGE, color: "#fff" }}
              >
                Analyze Routes
              </button>
            </form>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div
            className="rounded-2xl p-8 mb-8 flex flex-col items-center"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin mb-6"
              style={{ borderColor: `${ORANGE}30`, borderTopColor: ORANGE }}
            />
            <div className="space-y-2 w-full max-w-xs">
              {LOADING_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all"
                    style={{
                      backgroundColor: i < stepIndex ? ORANGE : i === stepIndex ? ORANGE : BORDER,
                      opacity: i <= stepIndex ? 1 : 0.3,
                    }}
                  />
                  <span
                    className="text-sm transition-all"
                    style={{ color: i === stepIndex ? TEXT : i < stepIndex ? MUTED : DIM }}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && !loading && (
          <div className="rounded-xl px-4 py-3 mb-8" style={{ backgroundColor: "#2a0f0f", border: "1px solid #ef444440" }}>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={reset}
              className="text-xs mt-2 underline"
              style={{ color: MUTED }}
            >
              Try again
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* RESULTS                                                             */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {result && !loading && (
          <div ref={resultsRef}>
            {/* ── 1. Recommendation Banner ── */}
            <div
              className="rounded-2xl p-6 mb-6"
              style={{
                backgroundColor: ORANGE + "12",
                border: `1px solid ${ORANGE}50`,
              }}
            >
              <div className="flex items-start gap-3 flex-wrap mb-4">
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest flex-shrink-0"
                  style={{ backgroundColor: ORANGE, color: "#fff" }}
                >
                  {result.recommendation === "direct" ? "Direct Route Recommended" : "Multi-Hop Route Recommended"}
                </span>
              </div>
              <p className="text-sm leading-relaxed mb-5" style={{ color: TEXT }}>
                {result.recommendation_reason}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Estimated Fee Savings", value: result.estimated_fee_savings },
                  { label: "Total Confirmation Time", value: result.total_confirmation_time },
                  { label: "Recommended Rate", value: result.recommended_rate_type },
                ].map(pill => (
                  <div
                    key={pill.label}
                    className="rounded-xl px-4 py-3"
                    style={{ backgroundColor: "#0f0f0f", border: `1px solid ${BORDER}` }}
                  >
                    <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: DIM }}>{pill.label}</p>
                    <p className="text-sm font-bold" style={{ color: ORANGE }}>{pill.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 2. Route Comparison Cards ── */}
            <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: DIM }}>
              Route Comparison
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {result.routes.map((route, i) => (
                <RouteCard key={i} route={route} c={C} />
              ))}
            </div>

            {/* ── 3. Hop Breakdown Table ── */}
            {result.hop_breakdown.length > 0 && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: DIM }}>
                  Hop Breakdown (Recommended Route)
                </h2>
                <div className="overflow-x-auto mb-8">
                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, minWidth: 480 }}>
                    {/* Header */}
                    <div
                      className="grid px-4 py-2.5"
                      style={{
                        backgroundColor: "#0f0f0f",
                        borderBottom: `1px solid ${BORDER}`,
                        gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                      }}
                    >
                      {["From", "To", "Spread", "Network Fee", "Time", "Rate"].map(col => (
                        <span key={col} className="text-[10px] font-bold uppercase tracking-widest" style={{ color: DIM }}>
                          {col}
                        </span>
                      ))}
                    </div>
                    {/* Rows */}
                    {result.hop_breakdown.map((hop, i) => (
                      <div
                        key={i}
                        className="grid px-4 py-3"
                        style={{
                          backgroundColor: i % 2 === 0 ? CARD : "#0f0f0f",
                          borderBottom: i < result.hop_breakdown.length - 1 ? `1px solid ${BORDER}` : "none",
                          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                        }}
                      >
                        <span className="text-xs font-bold" style={{ color: TEXT }}>{hop.from}</span>
                        <span className="text-xs font-bold" style={{ color: TEXT }}>{hop.to}</span>
                        <span className="text-xs" style={{ color: MUTED }}>{hop.estimated_spread}</span>
                        <span className="text-xs" style={{ color: MUTED }}>{hop.network_fee}</span>
                        <span className="text-xs" style={{ color: MUTED }}>{hop.confirmation_time}</span>
                        <span
                          className="text-xs font-semibold"
                          style={{ color: hop.rate_type === "Fixed" ? ORANGE : "#22c55e" }}
                        >
                          {hop.rate_type}
                        </span>
                      </div>
                    ))}
                    {/* Footer totals */}
                    <div
                      className="grid px-4 py-3"
                      style={{
                        backgroundColor: ORANGE + "0d",
                        borderTop: `1px solid ${ORANGE}30`,
                        gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr",
                      }}
                    >
                      <span className="text-xs font-bold col-span-2" style={{ color: ORANGE }}>Total</span>
                      <span className="text-xs font-bold" style={{ color: ORANGE }}>
                        {result.hop_breakdown.length > 0 ? `${result.routes.find(r => r.is_recommended)?.total_fee_pct.toFixed(2) ?? ""}%` : ""}
                      </span>
                      <span className="text-xs" style={{ color: DIM }}></span>
                      <span className="text-xs font-bold" style={{ color: ORANGE }}>
                        {result.total_confirmation_time}
                      </span>
                      <span className="text-xs font-bold" style={{ color: ORANGE }}>
                        {result.recommended_rate_type}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── 4. Rate Type Explainer ── */}
            <div
              className="rounded-2xl p-5 mb-8"
              style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
            >
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: DIM }}>
                Fixed vs. Variable for this swap
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: MUTED }}>
                {result.rate_explainer}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ backgroundColor: "#0f0f0f", border: `1px solid ${ORANGE}30` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: ORANGE }}>
                    Choose Fixed if...
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{result.fixed_if}</p>
                </div>
                <div className="rounded-xl p-3" style={{ backgroundColor: "#0f0f0f", border: `1px solid #22c55e30` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#22c55e" }}>
                    Choose Variable if...
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{result.variable_if}</p>
                </div>
              </div>
            </div>

            {/* ── 5. SideShift CTA ── */}
            <div
              className="rounded-2xl p-6 mb-8 text-center"
              style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
            >
              <p className="font-bold text-lg mb-2" style={{ color: TEXT }}>
                Execute this route on SideShift.ai
              </p>
              <p className="text-sm leading-relaxed max-w-md mx-auto mb-5" style={{ color: MUTED }}>
                SideShift processes each hop directly to your wallet. No account needed. No funds held on exchange.
              </p>
              <a
                href="https://sideshift.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 rounded-xl font-bold text-sm transition-all"
                style={{ backgroundColor: ORANGE, color: "#fff" }}
              >
                Start Swapping &#8599;
              </a>
              <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
                {["200+ assets supported", "No KYC required", "Direct to wallet"].map(trust => (
                  <span key={trust} className="text-xs" style={{ color: DIM }}>
                    &#10003; {trust}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Reset ── */}
            <div className="mt-4 text-center">
              <button
                onClick={reset}
                className="text-xs underline transition-colors"
                style={{ color: DIM }}
              >
                &#8592; Analyze another swap
              </button>
            </div>
          </div>
        )}

        {/* ── Footer Disclaimer ── */}
        <div className="mt-12 pt-6" style={{ borderTop: `1px solid ${BORDER}` }}>
          <p className="text-xs leading-relaxed mb-1" style={{ color: DIM }}>
            Route analysis is simulated for illustrative purposes. Actual fees, rates, and confirmation times vary with live market conditions. Always verify rates on SideShift.ai before executing a swap.
          </p>
          <p className="text-xs" style={{ color: DIM }}>
            Built by{" "}
            <Link href="/" className="underline transition-colors" style={{ color: MUTED }}>
              Armaan Kazi
            </Link>
            . Not affiliated with SideShift.ai.
          </p>
        </div>
      </div>
    </div>
  );
}
