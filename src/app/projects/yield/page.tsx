"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { TickerData, Grades, Holding, Suggestion } from "../../api/yield/route";

// ─── helpers ─────────────────────────────────────────────────────────────────

function gradeTextColor(grade: string) {
  const l = grade[0];
  if (l === "A") return "text-sage";
  if (l === "B") return "text-darkblue";
  if (l === "C") return "text-tan";
  return "text-terracotta";
}

function gradeBadgeClass(grade: string) {
  const l = grade[0];
  if (l === "A") return "bg-sage/10 border-sage/40 text-sage";
  if (l === "B") return "bg-darkblue/10 border-darkblue/30 text-darkblue";
  if (l === "C") return "bg-tan/10 border-tan/40 text-tan";
  return "bg-terracotta/10 border-terracotta/30 text-terracotta";
}


function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

function parseCSV(text: string): Holding[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const tickerIdx = headers.findIndex((h) => ["ticker", "symbol", "sym", "stock"].includes(h));
  const sharesIdx = headers.findIndex((h) => ["shares", "quantity", "qty", "amount", "units"].includes(h));

  if (tickerIdx === -1 || sharesIdx === -1) return [];

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
      const ticker = cols[tickerIdx]?.toUpperCase();
      const shares = parseFloat(cols[sharesIdx]);
      if (!ticker || isNaN(shares) || shares <= 0) return null;
      return { ticker, shares };
    })
    .filter((h): h is Holding => h !== null);
}

const CATEGORY_LABELS: Record<keyof Omit<Grades, "overall">, string> = {
  diversification: "Diversification",
  volatility: "Volatility Profile",
  capSizeMix: "Cap Size Mix",
  sectorAllocation: "Sector Allocation",
  dayPerformance: "Day Performance",
  shortTermOutlook: "Short-Term Outlook",
  longTermOutlook: "Long-Term Outlook",
};

type InputTab = "manual" | "csv" | "screenshot";

// ─── component ───────────────────────────────────────────────────────────────

export default function YieldPage() {
  const [tab, setTab] = useState<InputTab>("manual");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [grades, setGrades] = useState<Grades | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [tickerData, setTickerData] = useState<TickerData[]>([]);
  const [totalValue, setTotalValue] = useState(0);

  const [searchResults, setSearchResults] = useState<{ ticker: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  // tracks whether the current ticker value was explicitly resolved via search
  const tickerConfirmedRef = useRef(false);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputSectionRef = useRef<HTMLDivElement>(null);

  // ── ticker search ──
  // Pure ticker pattern: 1-5 uppercase letters (optionally with . for BRK.B etc.)
  const looksLikeTicker = (val: string) => /^[A-Z]{1,5}(\.[A-Z])?$/.test(val.trim());

  const handleTickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTicker(val);
    tickerConfirmedRef.current = false; // reset confirmation on any edit

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    // If it already looks like a ticker symbol, no need to search
    if (!val.trim() || looksLikeTicker(val.trim().toUpperCase())) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      if (val.trim().length < 2) { setSearchResults([]); return; }
      setSearching(true);
      try {
        const res = await fetch(`/api/search-ticker?q=${encodeURIComponent(val.trim())}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const selectSearchResult = (result: { ticker: string; name: string }) => {
    setTicker(result.ticker);
    tickerConfirmedRef.current = true;
    setSearchResults([]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = () => setSearchResults([]);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ── manual add ──
  const addManual = () => {
    const raw = ticker.trim();
    const qty = parseFloat(shares);
    if (!raw || isNaN(qty) || qty <= 0) return;

    // Resolve company name → ticker symbol
    let sym = raw.toUpperCase();
    if (!looksLikeTicker(sym) && !tickerConfirmedRef.current) {
      if (searching) {
        setError("Still searching for that company. Try again in a moment.");
        return;
      } else if (searchResults.length > 0) {
        // Auto-select top result if user hasn't picked one
        sym = searchResults[0].ticker;
      } else {
        setError(`"${raw}" could not be found as a public stock.`);
        return;
      }
    }

    if (holdings.some((h) => h.ticker === sym)) {
      setError(`${sym} is already in your holdings.`);
      return;
    }
    setHoldings((prev) => [...prev, { ticker: sym, shares: qty }]);
    setTicker("");
    setShares("");
    setSearchResults([]);
    tickerConfirmedRef.current = false;
    setError("");
  };

  const handleManualKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") addManual();
    if (e.key === "Escape") setSearchResults([]);
  };

  // ── CSV upload ──
  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setError("Could not parse CSV. Expected columns: ticker/symbol, shares/quantity.");
        return;
      }
      const deduped = parsed.filter((h) => !holdings.some((existing) => existing.ticker === h.ticker));
      setHoldings((prev) => [...prev, ...deduped]);
      setError("");
    } catch {
      setError("Failed to read CSV file.");
    }
    e.target.value = "";
  };

  // ── screenshot upload ──
  const handleScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    setError("");
    try {
      const base64 = await readFileAsBase64(file);
      const mediaType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      const res = await fetch("/api/yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed.");
      const extracted: Holding[] = data.holdings || [];
      if (extracted.length === 0) {
        setError("No holdings could be extracted from the screenshot.");
      } else {
        const deduped = extracted.filter((h) => !holdings.some((existing) => existing.ticker === h.ticker));
        setHoldings((prev) => [...prev, ...deduped]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screenshot extraction failed.");
    } finally {
      setExtracting(false);
      e.target.value = "";
    }
  };

  const removeHolding = (ticker: string) => {
    setHoldings((prev) => prev.filter((h) => h.ticker !== ticker));
  };

  // ── generate report card ──
  const handleGenerate = async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    setError("");
    setGrades(null);
    setSuggestions([]);
    setTickerData([]);

    try {
      const res = await fetch("/api/yield", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");
      setGrades(data.grades);
      setSuggestions(data.suggestions || []);
      setTickerData(data.tickerData || []);
      setTotalValue(data.totalValue || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const chartData = tickerData
    .filter((t) => !t.error)
    .map((t) => ({
      ticker: t.ticker,
      change: parseFloat(t.dayChangePercent.toFixed(2)),
    }));

  const failedTickers = tickerData.filter((t) => t.error);

  const scrollToInput = () => {
    inputSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tabClass = (t: InputTab) =>
    `px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
      tab === t
        ? "bg-darkblue text-white"
        : "text-brown-light hover:text-brown hover:bg-tan/10"
    }`;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <Link
        href="/#projects"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-8 inline-block"
      >
        &larr; Back to projects
      </Link>

      <header className="mb-10">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl font-semibold text-darkblue">Yield</h1>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-terracotta/10 text-terracotta border-terracotta/30">
            CS
          </span>
        </div>
        <p className="text-brown-light leading-relaxed">
          Add your stock holdings and get a live report card on your portfolio, graded across
          diversification, volatility, sector mix, and more, powered by real market data and AI.
        </p>
        <p className="text-xs text-brown-light/60 mt-3 italic">
          Yield is just for fun. Not financial advice.
        </p>
      </header>

      {/* ── Input section ── */}
      <div ref={inputSectionRef} className="rounded-xl border border-tan/30 bg-white/40 p-5 mb-4">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-tan/20 pb-3">
          <button className={tabClass("manual")} onClick={() => setTab("manual")}>Manual</button>
          <button className={tabClass("csv")} onClick={() => setTab("csv")}>Upload CSV</button>
          <button className={tabClass("screenshot")} onClick={() => setTab("screenshot")}>Screenshot</button>
        </div>

        {/* Manual tab */}
        {tab === "manual" && (
          <div className="flex flex-wrap gap-2">
            {/* Ticker input with search dropdown */}
            <div className="flex-1 min-w-[160px] relative" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={ticker}
                onChange={handleTickerChange}
                onKeyDown={handleManualKeyDown}
                placeholder="Ticker or company name"
                className="w-full rounded-lg border border-tan/40 bg-cream-dark/20 px-3 py-2 text-sm text-brown placeholder:text-brown-light/50 focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50 transition-colors"
              />
              {/* Search spinner */}
              {searching && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-tan/40 border-t-terracotta rounded-full animate-spin" />
              )}
              {/* Suggestions dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-tan/30 rounded-lg shadow-lg z-20 overflow-hidden">
                  {searchResults.map((r) => (
                    <button
                      key={r.ticker}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSearchResult(r)}
                      className="w-full text-left px-3 py-2 hover:bg-tan/10 transition-colors flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-brown truncate">{r.name}</span>
                      <span className="text-xs font-semibold text-darkblue shrink-0">{r.ticker}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              onKeyDown={handleManualKeyDown}
              placeholder="Shares"
              min="0.001"
              step="any"
              className="w-28 rounded-lg border border-tan/40 bg-cream-dark/20 px-3 py-2 text-sm text-brown placeholder:text-brown-light/50 focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50 transition-colors"
            />
            <button
              onClick={addManual}
              disabled={!ticker.trim() || !shares}
              className="px-4 py-2 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        )}

        {/* CSV tab */}
        {tab === "csv" && (
          <div>
            <p className="text-xs text-brown-light mb-3">
              Upload a CSV with columns <span className="font-medium text-brown">ticker</span> (or symbol) and{" "}
              <span className="font-medium text-brown">shares</span> (or quantity).
            </p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCSV}
              className="hidden"
            />
            <button
              onClick={() => csvInputRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-tan/50 hover:border-terracotta/50 bg-cream-dark/20 py-6 text-sm text-brown-light hover:text-brown transition-colors text-center"
            >
              Click to upload CSV
            </button>
          </div>
        )}

        {/* Screenshot tab */}
        {tab === "screenshot" && (
          <div>
            <p className="text-xs text-brown-light mb-3">
              Upload a screenshot of your brokerage account. Claude will extract your tickers and share counts.
            </p>
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleScreenshot}
              className="hidden"
            />
            <button
              onClick={() => screenshotInputRef.current?.click()}
              disabled={extracting}
              className="w-full rounded-lg border-2 border-dashed border-tan/50 hover:border-terracotta/50 bg-cream-dark/20 py-6 text-sm text-brown-light hover:text-brown transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {extracting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin inline-block" />
                  Extracting holdings...
                </span>
              ) : (
                "Click to upload screenshot"
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Holdings list ── */}
      {holdings.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brown-light">
              Holdings: {holdings.length} position{holdings.length !== 1 && "s"}
            </p>
            <button
              onClick={() => setHoldings([])}
              className="text-xs text-brown-light/60 hover:text-terracotta transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {holdings.map((h) => (
              <span
                key={h.ticker}
                className="inline-flex items-center gap-1.5 text-sm bg-darkblue/8 border border-darkblue/15 text-darkblue rounded-lg px-3 py-1"
              >
                <span className="font-semibold">{h.ticker}</span>
                <span className="text-brown-light text-xs">× {h.shares}</span>
                <button
                  onClick={() => removeHolding(h.ticker)}
                  className="text-brown-light/60 hover:text-terracotta transition-colors ml-0.5 text-xs leading-none"
                  aria-label={`Remove ${h.ticker}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-terracotta/10 border border-terracotta/20 text-sm text-terracotta">
          {error}
        </div>
      )}

      {/* ── Generate button + wait disclaimer ── */}
      <button
        onClick={handleGenerate}
        disabled={holdings.length === 0 || loading}
        className="w-full px-5 py-2.5 text-sm font-medium bg-terracotta text-white rounded-lg hover:bg-terracotta-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? "Generating report card…" : "Generate Report Card"}
      </button>
      {/* ── Loading ── */}
      {loading && (
        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-terracotta/30 border-t-terracotta rounded-full animate-spin" />
          <p className="text-sm text-brown-light">Analyzing your portfolio…</p>
        </div>
      )}

      {/* ── Report card ── */}
      <AnimatePresence>
        {grades && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-12"
          >
            {/* Report card header */}
            <div className="rounded-xl border border-tan/40 bg-cream-dark/30 overflow-hidden">
              <div className="bg-darkblue px-6 py-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">Portfolio Report Card</p>
                  <p className="text-white/70 text-sm">
                    {tickerData.filter((t) => !t.error).length} positions ·{" "}
                    ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total value
                  </p>
                </div>
                {/* Overall grade */}
                <div className="text-center">
                  <div className={`text-6xl font-bold leading-none ${gradeTextColor(grades.overall.grade)} drop-shadow-sm`}>
                    {grades.overall.grade}
                  </div>
                  <p className="text-[10px] text-white/40 uppercase tracking-wide mt-1.5">Overall</p>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-tan/20 bg-white/20">
                <p className="text-sm text-brown-light leading-relaxed">{grades.overall.explanation}</p>
              </div>

              {/* Category rows */}
              <div className="divide-y divide-tan/15">
                {(Object.entries(CATEGORY_LABELS) as [keyof typeof CATEGORY_LABELS, string][]).map(([key, label], i) => {
                  const entry = grades[key];
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                      className="flex items-center gap-5 px-6 py-4 bg-white/10 hover:bg-white/25 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brown mb-1">{label}</p>
                        <p className="text-sm text-brown-light leading-relaxed">{entry.explanation}</p>
                      </div>
                      <span className={`shrink-0 text-xl font-bold w-16 text-center py-2 rounded-xl border-2 ${gradeBadgeClass(entry.grade)}`}>
                        {entry.grade}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Holdings table */}
            {tickerData.filter((t) => !t.error).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                className="mt-6"
              >
                <h2 className="text-sm font-semibold text-brown mb-3 uppercase tracking-wide">Holdings Summary</h2>
                <div className="rounded-xl border border-tan/30 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-darkblue/8 border-b border-tan/20">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brown-light">Ticker</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brown-light">Shares</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brown-light">Price</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brown-light">Value</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brown-light">%</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-brown-light">Day</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-tan/15">
                      {/* Valid holdings sorted by value */}
                      {tickerData
                        .filter((t) => !t.error)
                        .sort((a, b) => b.positionValue - a.positionValue)
                        .map((t) => (
                          <tr key={t.ticker} className="bg-white/20 hover:bg-white/40 transition-colors">
                            <td className="px-4 py-2.5">
                              <span className="font-semibold text-darkblue">{t.ticker}</span>
                              <span className="block text-xs text-brown-light/70 truncate max-w-[120px]">{t.name}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-brown">{t.shares.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right text-brown">
                              {t.currentPrice > 0 ? `$${t.currentPrice.toFixed(2)}` : "-"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-brown">
                              {t.positionValue > 0 ? `$${t.positionValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-brown-light">
                              {totalValue > 0 ? `${((t.positionValue / totalValue) * 100).toFixed(1)}%` : "-"}
                            </td>
                            <td className={`px-4 py-2.5 text-right font-medium ${t.dayChangePercent >= 0 ? "text-sage" : "text-terracotta"}`}>
                              {t.dayChangePercent >= 0 ? "+" : ""}{t.dayChangePercent.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      {/* Inline error rows (≤2 failures) */}
                      {failedTickers.length <= 2 && failedTickers.map((t) => (
                        <tr key={t.ticker} className="bg-tan/5">
                          <td className="px-4 py-2.5">
                            <span className="font-semibold text-brown-light/60">{t.ticker}</span>
                          </td>
                          <td colSpan={5} className="px-4 py-2.5 text-xs text-brown-light/50 italic">
                            ⚠ {t.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Day performance chart */}
                {chartData.length > 1 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brown-light mb-3">Day Performance by Ticker</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#D4A96A22" />
                        <XAxis dataKey="ticker" tick={{ fontSize: 11, fill: "#6B5244" }} axisLine={false} tickLine={false} />
                        <YAxis
                          width={48}
                          tick={{ fontSize: 10, fill: "#6B5244" }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
                        />
                        <Tooltip
                          formatter={(v) => [`${(v as number) >= 0 ? "+" : ""}${v}%`, "Day change"]}
                          contentStyle={{ background: "#F5F0E8", border: "1px solid #D4A96A44", borderRadius: 8, fontSize: 12 }}
                          cursor={{ fill: "#D4A96A11" }}
                        />
                        <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.change >= 0 ? "#6B8F6E" : "#C1513A"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </motion.div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                className="mt-6"
              >
                <h2 className="text-sm font-semibold text-brown mb-3 uppercase tracking-wide">Suggestions</h2>
                <div className="flex flex-col gap-3">
                  {suggestions.map((s, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.45 + i * 0.06 }}
                      className="rounded-xl border border-tan/30 bg-white/40 px-5 py-4 flex gap-4 items-start"
                    >
                      <span className="shrink-0 w-6 h-6 rounded-full bg-darkblue/10 text-darkblue text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-darkblue mb-1">{s.title}</p>
                        <p className="text-sm text-brown-light leading-relaxed">{s.explanation}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Edit Holdings + Disclaimer */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                onClick={scrollToInput}
                className="px-5 py-2 text-sm font-medium border border-darkblue/30 text-darkblue rounded-lg hover:bg-darkblue/5 transition-colors"
              >
                ← Edit Holdings
              </button>
              <p className="text-xs text-brown-light/50 italic text-center">
                Yield is just for fun. Not financial advice.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
