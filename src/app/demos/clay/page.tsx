import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import CommonsDemo from "./CommonsDemo";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #2d5a27; --ct-accent-bg: #eef2ec;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
`;

const C = CSS_VAR_COLORS;
const HEADING = C.text;
const SUBTEXT = C.muted;
const LABEL = C.dim;
const H2 = "text-xs font-semibold uppercase tracking-widest mb-3";

export default function ClayDemoPage() {
  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  The Commons
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: "#2d5a2750", color: C.accent, backgroundColor: "#2d5a2712" }}
                >
                  Built for Clay
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                What happens to cold email when making it look personal costs almost nothing.
              </p>
            </div>
            <div className="flex-shrink-0">
              <span className="text-xs" style={{ color: C.dim }}>
                Demo by{" "}
                <Link href="/" className="underline hover:opacity-70 transition-opacity" style={{ color: C.muted }}>
                  Armaan Kazi
                </Link>
              </span>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 py-10">

          {/* ── Back link ─────────────────────────────────────────────────── */}
          <Link href="/demos" className="text-xs transition-colors mb-8 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          {/* ── What Clay does today ──────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className={H2} style={{ color: LABEL }}>What Clay does today</h2>
            <p className="leading-relaxed text-sm mb-4" style={{ color: SUBTEXT }}>
              Clay is data and automation for go-to-market teams. A Clay table holds companies or people as rows, and each column fills itself from somewhere: data bought from more than 200 providers, a waterfall that tries several providers in turn until one answers, signals such as job changes and promotions, and Claygents, AI agents that research each row. The results feed AI-formatted messages and Clay&apos;s own sequencer.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title: "Relevance", body: "Knowing whom to contact and when: enrichment, signals, account research. This is what tells you a prospect needs what you sell." },
                { title: "Personalization", body: "Making each message read as written for one person, at the cost of a formula instead of an afternoon of research." },
              ].map((c) => (
                <div key={c.title} className="rounded-xl border p-4" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: LABEL }}>{c.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: SUBTEXT }}>{c.body}</p>
                </div>
              ))}
            </div>
            <p className="leading-relaxed text-sm mt-4" style={{ color: SUBTEXT }}>
              Both get cheaper with Clay. This page asks what happens to a market when one of them gets cheap faster than the other.
            </p>
          </section>

          {/* ── What this demo adds ───────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className={H2} style={{ color: LABEL }}>What this demo adds</h2>
            <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
              It is an agent-based simulation of one market: 1,200 prospects with limited attention and 48 sellers with fixed budgets, run for 180 days. You set two prices, the cost to make an email look personal and the cost of the signal data that says whom to send it to, and watch what the prospects learn and what the sellers copy.
            </p>
          </section>

          {/* ── Why it's better ───────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className={`${H2} mb-4`} style={{ color: LABEL }}>Why it&apos;s better</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {[
                {
                  title: "It answers a question a dashboard cannot",
                  body: "Reply rates tell one sender how their last campaign went. They cannot show what every sender doing the same thing does to the inbox they share. A simulation can.",
                },
                {
                  title: "Every outcome traces to a cause",
                  body: "Click any prospect and see the emails they got that day, which ones they opened, which were relevant, and why personal-looking ones went first or last.",
                },
                {
                  title: "No model calls, no hidden numbers",
                  body: "Plain TypeScript with a fixed seed, running in your browser. Every assumption is listed below, and the grid at the end runs all 25 cost pairs so one lucky run cannot carry the claim.",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border p-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.accent }} />
                    <p className="text-xs font-semibold" style={{ color: HEADING }}>{card.title}</p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: LABEL }}>{card.body}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>What the model found</p>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                The channel fails when looking personal gets far cheaper than knowing whom to write to. Prospects learn that personal-looking email is usually irrelevant, stop treating it as a signal, and replies fall for every seller. When signal data is cheap as well, the same cheap personalization raises total replies instead. In this model the thing worth making cheap is relevance.
              </p>
            </div>
          </section>

          {/* ── Try it ────────────────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>Try it</h2>
            <p className="text-sm mb-4" style={{ color: LABEL }}>
              Start with a preset. Moving a slider resets the run with the new price.
            </p>
            <CommonsDemo />
          </section>

          {/* ── How this works ────────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className={`${H2} mb-4`} style={{ color: LABEL }}>How this works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {[
                { title: "Needs come and go", body: "Each day some prospects start needing one of eight product categories and others stop. About half of them need something at any moment, and a need lasts about 30 days." },
                { title: "Sellers spend a budget", body: "Each seller has $60 a day. Cheaper emails mean more emails. Targeted sellers pay for signal data and reach a prospect who really needs their category 80% of the time; everyone else picks at random." },
                { title: "Prospects read what looks relevant", body: "A prospect opens 3 to 8 emails a day. Personal-looking email goes first while they believe it is more likely relevant than a template. Each personal email they open teaches them a little about whether that belief holds." },
                { title: "Sellers copy what pays", body: "Each day a seller may compare its replies per dollar over two weeks with a random peer, and switch to the peer's strategy with a chance that grows with the gap." },
              ].map((s) => (
                <div key={s.title} className="rounded-xl border p-5" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.accent }} />
                    <p className="text-xs font-semibold" style={{ color: HEADING }}>{s.title}</p>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: LABEL }}>{s.body}</p>
                </div>
              ))}
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: SUBTEXT }}>
              The idea underneath is signaling, from Michael Spence&apos;s 1973 paper &ldquo;Job Market Signaling.&rdquo; A signal carries information only while it is costly enough that senders who do not mean it will not pay for it. A personal email used to be that kind of signal.
            </p>
            <details className="rounded-xl border p-4 text-xs" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <summary className="cursor-pointer font-semibold" style={{ color: HEADING }}>Every assumption in the model</summary>
              <p className="mt-3 mb-2 leading-relaxed" style={{ color: SUBTEXT }}>
                None of these are measured. They are chosen to be plausible and are all in one file, <code>src/app/demos/clay/model.ts</code>. Change them and the boundary moves; whether it exists is what the grid tests.
              </p>
              <table className="w-full">
                <tbody>
                  {[
                    ["Prospects / sellers / categories", "1,200 / 48 / 8"],
                    ["Seller budget", "$60 per day"],
                    ["Cost to send any email", "$0.05"],
                    ["Signal precision", "80% of targeted emails reach someone with the need"],
                    ["Attention", "3 to 8 emails read per prospect per day"],
                    ["Need", "6% of prospects per category, lasting about 30 days"],
                    ["Reply chance on a relevant email", "25% times (0.5 + perceived relevance)"],
                    ["Starting trust in personal-looking email", "70%, weighted as 10 emails of experience"],
                    ["Memory", "Evidence fades 3% a day back toward the starting belief"],
                    ["Imitation", "15% daily chance to compare with a peer; 0.5% chance to try a random strategy"],
                    ["Strategies at day 0", "12 sellers on each of the four"],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t" style={{ borderColor: "#f0ece5" }}>
                      <td className="py-1.5 pr-4 align-top" style={{ color: LABEL }}>{k}</td>
                      <td className="py-1.5" style={{ color: HEADING }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <footer className="pt-6 border-t text-xs leading-relaxed" style={{ borderColor: C.cardBorder, color: LABEL }}>
            <p>
              Built by{" "}
              <Link href="/" className="underline hover:opacity-70" style={{ color: SUBTEXT }}>Armaan Kazi</Link>
              . Not affiliated with Clay.
            </p>
            <p className="mt-1">
              This is a model, not data. No number on this page comes from Clay or from a real inbox; every parameter is an assumption listed above.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
