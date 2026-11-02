"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import {
  applyRound,
  EMPTY_LEDGER,
  MAX_QUESTION_CHARS,
  SAMPLE_QUESTION,
  tally,
  type Evidence,
  type Ledger,
  type Paper,
  type RoundResult,
} from "./ledger";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #101314; --ct-card-bg: #161b1c; --ct-card-border: #263032;
  --ct-text: #e4ebea; --ct-muted: #9aa8a6; --ct-dim: #66746f;
  --ct-accent: #7cc4b4; --ct-accent-bg: #1a2a28;
  --ct-header-bg: #101314; --ct-header-border: #263032; --ct-header-text: #e4ebea;
}
`;

const STORAGE_KEY = "edison-ledger-v1";
const SUPPORT = "#7fb069";
const CONTRA = "#e05d4f";
const UNVERIFIED = "#6f695f";

function loadLedger(): Ledger | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Ledger;
    return Array.isArray(parsed.hypotheses) && parsed.rounds.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function saveLedger(ledger: Ledger) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // storage blocked; the ledger still works for this visit
  }
}

// Split an abstract around the quoted passage so it can be highlighted.
function splitOnQuote(abstract: string, quote: string): [string, string, string] | null {
  const pattern = quote
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const m = new RegExp(pattern, "i").exec(abstract);
  if (!m) return null;
  return [abstract.slice(0, m.index), m[0], abstract.slice(m.index + m[0].length)];
}

function EvidenceRow({ e, paper }: { e: Evidence; paper: Paper | undefined }) {
  const C = CSS_VAR_COLORS;
  const color = !e.verified ? UNVERIFIED : e.stance === "supports" ? SUPPORT : CONTRA;
  const parts = paper && e.verified ? splitOnQuote(paper.abstract, e.quote) : null;
  return (
    <li className="border-t pt-3" style={{ borderColor: C.cardBorder }}>
      <div className="flex items-center gap-2 text-[11px] font-mono mb-1" style={{ color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
        {e.verified ? e.stance : "quote not in abstract"}
        <span style={{ color: C.dim }}>r{e.round}</span>
      </div>
      <p className={`text-sm leading-relaxed ${e.verified ? "" : "line-through"}`} style={{ color: e.verified ? C.text : C.dim }}>
        &ldquo;{e.quote}&rdquo;
      </p>
      {paper && (
        <details className="mt-1 text-xs" style={{ color: C.muted }}>
          <summary className="cursor-pointer">
            {paper.title} ({paper.year ?? "n.d."})
          </summary>
          <p className="mt-2 leading-relaxed" style={{ color: C.dim }}>
            {parts ? (
              <>
                {parts[0]}
                <mark style={{ backgroundColor: C.accentBg, color: C.text }}>{parts[1]}</mark>
                {parts[2]}
              </>
            ) : (
              paper.abstract
            )}
          </p>
          {paper.url && (
            <a href={paper.url} target="_blank" rel="noreferrer" className="underline mt-1 inline-block" style={{ color: C.accent }}>
              source
            </a>
          )}
        </details>
      )}
    </li>
  );
}

export default function EdisonPage() {
  const C = CSS_VAR_COLORS;

  const [ledger, setLedger] = useState<Ledger>(EMPTY_LEDGER);
  const [selected, setSelected] = useState("H1");
  const [query, setQuery] = useState(SAMPLE_QUESTION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async (search: string, current: Ledger) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demos/edison/round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: current.rounds[0] ?? search,
          search,
          ledger: current.hypotheses.map((h) => ({ id: h.id, statement: h.statement, ...tally(h) })),
          seen: Object.keys(current.papers),
        }),
      });
      const json = (await res.json()) as { result?: RoundResult; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "No result returned.");
      const next = applyRound(current, search, json.result);
      setLedger(next);
      saveLedger(next);
      if (json.result.next) setQuery(json.result.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stored = loadLedger();
    if (stored) setLedger(stored);
    else run(SAMPLE_QUESTION, EMPTY_LEDGER);
  }, [run]);

  const reset = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing stored
    }
    setLedger(EMPTY_LEDGER);
    setSelected("H1");
    setQuery(SAMPLE_QUESTION);
    run(SAMPLE_QUESTION, EMPTY_LEDGER);
  };

  const hyp = ledger.hypotheses.find((h) => h.id === selected) ?? ledger.hypotheses[0];
  const all = ledger.hypotheses.flatMap((h) => h.evidence);
  const checked = all.filter((e) => e.verified).length;

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Hypothesis Ledger
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Edison Scientific
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Hypotheses that keep their evidence across searches, each quote traced to its paper.
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

        <main className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/demos" className="text-xs mb-6 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            Each round pulls new abstracts from OpenAlex. Claude proposes hypotheses and quotes its evidence, and code
            checks every quote word for word against the abstract.
          </p>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="min-w-0 rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex items-baseline justify-between text-[11px] font-mono mb-2" style={{ color: C.dim }}>
                <span>
                  {ledger.rounds.length} {ledger.rounds.length === 1 ? "round" : "rounds"}, {Object.keys(ledger.papers).length} papers
                </span>
                {all.length > 0 && (
                  <span>
                    {checked}/{all.length} quotes found
                  </span>
                )}
              </div>
              <ul>
                {ledger.hypotheses.map((h) => {
                  const t = tally(h);
                  const active = h.id === hyp?.id;
                  return (
                    <li
                      key={h.id}
                      onClick={() => setSelected(h.id)}
                      className="border-t py-2.5 px-1 cursor-pointer"
                      style={{ borderColor: C.cardBorder, backgroundColor: active ? C.accentBg : undefined }}
                    >
                      <div className="flex gap-2 text-sm" style={{ color: C.text }}>
                        <span className="font-mono text-xs pt-0.5" style={{ color: active ? C.accent : C.dim }}>
                          {h.id}
                        </span>
                        <span>{h.statement}</span>
                      </div>
                      <div className="flex gap-[2px] mt-2 ml-7" aria-label={`${t.supports} for, ${t.contradicts} against`}>
                        {h.evidence.map((e, i) => (
                          <span
                            key={i}
                            className="h-2 w-5 rounded-[2px]"
                            style={{ backgroundColor: !e.verified ? UNVERIFIED : e.stance === "supports" ? SUPPORT : CONTRA }}
                          />
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {busy && (
                <p className="text-xs font-mono mt-2" style={{ color: C.dim }}>
                  Searching papers, then Claude reads them.
                </p>
              )}
              {error && (
                <p className="text-xs mt-2" style={{ color: CONTRA }}>
                  {error}
                </p>
              )}

              <form
                className="border-t mt-3 pt-3 flex gap-2"
                style={{ borderColor: C.cardBorder }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) run(query.trim(), ledger);
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={MAX_QUESTION_CHARS}
                  aria-label="Next search"
                  className="flex-1 min-w-0 text-sm rounded border px-2 py-1.5 bg-transparent outline-none"
                  style={{ borderColor: C.cardBorder, color: C.text }}
                />
                <button
                  type="submit"
                  disabled={busy || !query.trim()}
                  className="text-xs font-semibold px-3 rounded disabled:opacity-40"
                  style={{ backgroundColor: C.accent, color: C.bg }}
                >
                  Search
                </button>
                <button type="button" onClick={reset} disabled={busy} className="text-xs px-2 disabled:opacity-40" style={{ color: C.muted }}>
                  Reset
                </button>
              </form>
            </section>

            <section className="min-w-0 rounded-lg border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              {hyp ? (
                <ul className="space-y-3">
                  {hyp.evidence.map((e, i) => (
                    <EvidenceRow key={i} e={e} paper={ledger.papers[e.paperId]} />
                  ))}
                </ul>
              ) : (
                !busy && (
                  <p className="text-xs" style={{ color: C.dim }}>
                    No hypotheses yet.
                  </p>
                )
              )}
            </section>
          </div>
        </main>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Edison Scientific.
          </p>
        </footer>
      </div>
    </>
  );
}
