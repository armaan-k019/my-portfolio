"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import { firstTerms, parseSequence, type Outcome } from "./math";
import { MAX_CASES, MAX_SOURCE_CHARS, SAMPLES, type Conjecture } from "./samples";
import type { SearchMessage, SearchRequest } from "./search.worker";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #0f1115; --ct-card-bg: #161a20; --ct-card-border: #262c35;
  --ct-text: #e6e9ee; --ct-muted: #9aa3ae; --ct-dim: #646d78;
  --ct-accent: #8fb4ff; --ct-accent-bg: #1a2333;
  --ct-header-bg: #0f1115; --ct-header-border: #262c35; --ct-header-text: #e6e9ee;
}
`;

const RED = "#e05d4f";
const GREEN = "#7fb069";
const AMBER = "#e0a43f";

type Row = Conjecture & { by: "sample" | "claude" | "you" };
type Origin = "sample" | "claude";

const fromSample = (i: number): Row[] => SAMPLES[i].conjectures.map((c) => ({ ...c, by: "sample" }));

function OutcomeLine({ o }: { o: Outcome | undefined }) {
  const C = CSS_VAR_COLORS;
  if (!o) return <span style={{ color: C.dim }}>searching</span>;
  if (o.status === "broken")
    return (
      <span style={{ color: RED }}>
        fails at n = {o.n}
        {o.term && (
          <span style={{ color: C.muted }}>
            : a({o.n}) = {o.term}
            {o.factor && ` = ${o.factor}`}
          </span>
        )}
      </span>
    );
  if (o.status === "held")
    return (
      <span style={{ color: GREEN }} title={`Stopped at ${o.stop}. Not a proof.`}>
        {o.to < o.from ? `untested (${o.stop})` : `holds for n = ${o.from} to ${o.to}`}
      </span>
    );
  return (
    <span style={{ color: AMBER }}>
      {o.n === null ? o.message : `n = ${o.n}: ${o.message}`}
    </span>
  );
}

export default function HarmonicPage() {
  const C = CSS_VAR_COLORS;

  const [sample, setSample] = useState(0);
  const [source, setSource] = useState(SAMPLES[0].source);
  const [rows, setRows] = useState<Row[]>(() => fromSample(0));
  const [origin, setOrigin] = useState<Origin>("sample");
  const [outcomes, setOutcomes] = useState<(Outcome | undefined)[]>([]);
  const [own, setOwn] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    try {
      const def = parseSequence(source);
      const { terms, error } = firstTerms(def, 10);
      return { start: def.start, terms, error };
    } catch (e) {
      return { start: 0, terms: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);

  // Re-run the search whenever the sequence or the conjectures change.
  useEffect(() => {
    setOutcomes([]);
    if (preview.error && preview.terms.length === 0) return;
    let worker: Worker | null = null;
    const timer = setTimeout(() => {
      worker = new Worker(new URL("./search.worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<SearchMessage>) => {
        const m = e.data;
        if ("error" in m) return;
        setOutcomes((prev) => {
          const next = [...prev];
          next[m.i] = m.outcome;
          return next;
        });
      };
      const req: SearchRequest = { source, checks: rows.map((r) => r.check) };
      worker.postMessage(req);
    }, 250);
    return () => {
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [source, rows, preview.error, preview.terms.length]);

  function pickSample(i: number) {
    setSample(i);
    setSource(SAMPLES[i].source);
    setRows(fromSample(i));
    setOrigin("sample");
    setError(null);
  }

  async function askClaude() {
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/demos/harmonic/conjecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const json = (await res.json()) as { conjectures?: Conjecture[]; error?: string };
      if (!res.ok || !json.conjectures) throw new Error(json.error ?? "No conjectures returned.");
      setRows([...json.conjectures.map((c) => ({ ...c, by: "claude" as const })), ...rows.filter((r) => r.by === "you")]);
      setOrigin("claude");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }

  function addOwn() {
    const check = own.trim();
    if (!check) return;
    setRows((rs) => [...rs, { claim: "", check, by: "you" }]);
    setOwn("");
  }

  const isSample = source === SAMPLES[sample].source;

  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Conjecture vs Counterexample
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Harmonic
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Conjectures about an integer sequence, attacked with small cases.
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

        <div className="max-w-5xl mx-auto px-6 py-8">
          <Link href="/demos" className="text-xs mb-6 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            Claude proposes conjectures about a sequence. A Web Worker in your browser tries each one on up to{" "}
            {MAX_CASES.toLocaleString()} values of n and stops at the first counterexample. Surviving is evidence, not
            proof. Nothing here runs Lean.
          </p>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <section className="rounded-lg border p-4 space-y-3 lg:self-start" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLES.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => pickSample(i)}
                    className="font-mono text-xs px-2.5 py-1 rounded border transition-opacity hover:opacity-80"
                    style={{
                      borderColor: i === sample && isSample ? C.accent : C.cardBorder,
                      color: i === sample && isSample ? C.accent : C.muted,
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <textarea
                value={source}
                onChange={(e) => setSource(e.target.value.slice(0, MAX_SOURCE_CHARS))}
                spellCheck={false}
                rows={3}
                aria-label="Sequence definition, like a(n) = n^2 + 1, a recurrence, or a list of terms"
                className="w-full font-mono text-[13px] leading-[1.55] p-2.5 rounded border bg-transparent resize-y outline-none"
                style={{ color: C.text, borderColor: C.cardBorder }}
              />
              <p className="font-mono text-[11px] break-words" style={{ color: preview.error ? AMBER : C.dim }}>
                {preview.error ?? `a(${preview.start}..) ${preview.terms.join(", ")}`}
              </p>
              <button
                onClick={askClaude}
                disabled={asking || !!preview.error}
                className="w-full text-sm font-semibold px-3 py-2 rounded transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: C.accent, color: "#0f1115" }}
              >
                {asking ? "Asking Claude" : "Ask Claude"}
              </button>
              {error && <p className="text-xs" style={{ color: RED }}>{error}</p>}
            </section>

            <section className="rounded-lg border" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <p className="text-xs px-4 pt-3 pb-2" style={{ color: C.dim }}>
                {origin === "claude" ? "From Claude" : "Prewritten sample conjectures"}
              </p>
              <ul>
                {rows.map((r, i) => (
                  <li key={`${r.check}-${i}`} className="px-4 py-3 border-t" style={{ borderColor: C.cardBorder }}>
                    {r.claim && (
                      <p className="text-sm mb-1" style={{ color: C.text }}>
                        {r.claim}
                      </p>
                    )}
                    <p className="font-mono text-[12px] mb-1 break-all" style={{ color: r.by === "you" ? C.text : C.accent }}>
                      {r.check}
                    </p>
                    <p className="font-mono text-[11px] break-all">
                      <OutcomeLine o={outcomes[i]} />
                    </p>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addOwn();
                }}
                className="flex gap-2 px-4 py-3 border-t"
                style={{ borderColor: C.cardBorder }}
              >
                <input
                  value={own}
                  onChange={(e) => setOwn(e.target.value.slice(0, 160))}
                  placeholder="your own check, like a(n) % 2 == 1"
                  aria-label="Your own check"
                  spellCheck={false}
                  className="flex-1 min-w-0 font-mono text-[12px] px-2 py-1.5 rounded border bg-transparent outline-none"
                  style={{ color: C.text, borderColor: C.cardBorder }}
                />
                <button
                  type="submit"
                  disabled={!own.trim()}
                  className="text-xs font-semibold px-3 rounded border disabled:opacity-40"
                  style={{ borderColor: C.accent, color: C.accent }}
                >
                  Test
                </button>
              </form>
              <details className="px-4 pb-3 text-[11px] font-mono" style={{ color: C.dim }}>
                <summary className="cursor-pointer" style={{ color: C.muted }}>
                  syntax
                </summary>
                <p className="mt-2 leading-relaxed">
                  n, a(expr), + - * / % ^, == != &lt; &lt;= &gt; &gt;=, &amp;&amp; || ! and -&gt; (implies). isPrime,
                  isSquare, gcd, divides(d, x), abs, digitSum, min, max. Integers are exact up to 2^256.
                </p>
              </details>
            </section>
          </div>
        </div>

        <footer className="border-t px-6 py-6 text-center mt-8" style={{ borderColor: C.cardBorder }}>
          <p className="text-xs" style={{ color: C.dim }}>
            Built by{" "}
            <Link href="/" className="underline hover:opacity-70 transition-opacity">
              Armaan Kazi
            </Link>
            . Not affiliated with Harmonic.
          </p>
        </footer>
      </div>
    </>
  );
}
