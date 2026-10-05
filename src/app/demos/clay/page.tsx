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
                Cold email when looking personal costs almost nothing: 1,200 prospects, 48 sellers, 180 days.
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

          <section className="mb-10">
            <div className="rounded-xl border px-5 py-4" style={{ borderColor: C.cardBorder, backgroundColor: C.accentBg }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: LABEL }}>Finding</p>
              <p className="text-sm leading-relaxed" style={{ color: SUBTEXT }}>
                Replies collapse when looking personal gets far cheaper than targeting. Cheap targeting reverses it.
              </p>
            </div>
          </section>

          {/* ── Try it ────────────────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className={H2} style={{ color: LABEL }}>Try it</h2>
            <CommonsDemo />
          </section>

          {/* ── Assumptions ────────────────────────────────────────────── */}
          <section className="mb-10">
            <details className="rounded-xl border p-4 text-xs" style={{ borderColor: C.cardBorder, backgroundColor: C.cardBg }}>
              <summary className="cursor-pointer font-semibold" style={{ color: HEADING }}>Assumptions</summary>
              <p className="mt-3 mb-2 leading-relaxed" style={{ color: SUBTEXT }}>
                None are measured. All live in <code>src/app/demos/clay/model.ts</code>.
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
              . Not affiliated with Clay. A model, not data, built on Spence&apos;s 1973 signaling idea.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
