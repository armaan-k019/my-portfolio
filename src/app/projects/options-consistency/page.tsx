import type { Metadata } from "next";
import Link from "next/link";
import ImpliedProbabilityChart from "./ImpliedProbabilityChart";

export const metadata: Metadata = {
  title: "Options vs. Polymarket | Armaan Kazi",
  description:
    "Do Polymarket BTC and ETH threshold contracts agree with the probabilities implied by Deribit options? A pre-registered study, in progress.",
};

const STAGES: { name: string; what: string; status: string }[] = [
  {
    name: "Data gate",
    what: "Probed both venues on public endpoints only. Every claim about listings, history, units, rate limits and fees cites a docs URL or a saved sample response.",
    status: "Verdict partial: Deribit keeps trade prints but no historical quotes, so a live logger became the primary dataset.",
  },
  {
    name: "Live logger",
    what: "Snapshots Polymarket order books and Deribit option summaries every 60 seconds into date-partitioned parquet, with gap logging, reconnect with backoff, a coverage check and a daily audit.",
    status: "Running since 2026-09-29.",
  },
  {
    name: "Pricing math",
    what: "Black-76 with an IV solver, coin-to-USD conversion on the expiry forward, a stale and crossed quote filter, a raw SVI fit with butterfly and calendar checks, and total-variance interpolation to the contract's exact resolution time.",
    status: "Frozen. Built on synthetic chains only, and a mutation check confirms the tests fail when any key step is removed.",
  },
  {
    name: "Literature",
    what: "Favorite-longshot bias, prediction market calibration, Breeden-Litzenberger, SVI and crypto options.",
    status: "70 references, each identifier resolved by a script.",
  },
  {
    name: "Pre-registration",
    what: "Five cards (power, calibration, tail gap, lead-lag, cost-aware gap), each stating the test and the result that would disprove it.",
    status: "Committed before any code touched real outcomes.",
  },
  {
    name: "Panel, analysis, figures",
    what: "Matches each market to the option-implied probability at fixed snapshots, then runs the registered tests with errors clustered by event. Two runs give the same output apart from the commit hash.",
    status: "Built. Output so far is labelled pipeline verification, not a result.",
  },
];

export default function OptionsConsistencyPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-28 sm:px-10">
      <Link
        href="/home#projects"
        className="text-sm text-terracotta hover:text-terracotta-dark transition-colors mb-8 inline-block"
      >
        &larr; Back to projects
      </Link>
      <header className="max-w-3xl">
        <p className="eyebrow">Quantitative research, GT Trading Club</p>
        <h1 className="font-display display-lg mt-4 text-[var(--color-ink)]">Options vs. Polymarket</h1>
        <div className="rule mt-6 w-full" />
        <p className="mt-6 text-base leading-relaxed text-[var(--color-brown)]">
          Polymarket lists contracts like &ldquo;Will BTC be above $X at noon ET
          tomorrow?&rdquo; Deribit lists options on the same coin. Both carry a
          probability for the same event. This project asks whether the two
          agree, which one is better calibrated against what actually happened,
          where any gap concentrates (tails, horizon, liquidity), and whether a
          gap survives spread, fees and hedging cost.
        </p>
        <p className="mt-4 text-base leading-relaxed text-[var(--color-brown)]">
          A gap alone is not called mispricing. The option number is risk
          neutral, so part of any difference can be a risk premium. Out of scope:
          &ldquo;hits $X&rdquo; barrier contracts and any trading strategy.
        </p>
      </header>

      <section className="mt-14">
        <h2 className="font-display display-md text-[var(--color-ink)]">From an option smile to a probability</h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--color-brown)]">
          The probability that the price ends above a strike K is the negative
          slope of the call price in K. With Black-76 that is N(d2) minus vega
          times the smile slope dsigma/dK. Dropping the second term treats the
          smile as flat. On a tilted smile that shift is about a percentage point
          at a one-week horizon and grows with time to expiry, while at one day
          it is a fraction of a point. The chart below runs that formula, ported from
          the project&rsquo;s Python, on a synthetic SVI smile you can bend.
        </p>
        <div className="mt-8">
          <ImpliedProbabilityChart />
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display display-md text-[var(--color-ink)]">Pipeline</h2>
        <ol className="mt-6" style={{ borderTop: "var(--rule)" }}>
          {STAGES.map((s, i) => (
            <li
              key={s.name}
              style={{ borderBottom: "var(--rule)" }}
              className="grid grid-cols-1 gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,13rem)_1fr]"
            >
              <p className="font-display text-lg font-semibold text-ink">
                <span className="meta mr-2">{String(i + 1).padStart(2, "0")}</span>
                {s.name}
              </p>
              <div>
                <p className="text-sm leading-relaxed text-brown-light">{s.what}</p>
                <p className="meta mt-1">{s.status}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 max-w-3xl">
        <h2 className="font-display display-md text-[var(--color-ink)]">Status</h2>
        <p className="mt-4 text-base leading-relaxed text-[var(--color-brown)]">
          No results yet, and nothing on this page is a finding. The primary
          runs are registered for 2026-11-01 and 2026-12-01, on the live data
          logged up to each date, with the same code and the same cards.
        </p>
      </section>
    </main>
  );
}
