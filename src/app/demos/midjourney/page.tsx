import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import TasteDemo from "./TasteDemo";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #7c3aed; --ct-accent-bg: #f3effb;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
`;

const C = CSS_VAR_COLORS;
const H2 = "text-xs font-semibold uppercase tracking-widest mb-3";

export default function MidjourneyDemoPage() {
  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  Taste Model
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: "#7c3aed50", color: C.accent, backgroundColor: "#7c3aed12" }}
                >
                  Built for Midjourney
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                Personalization in miniature: pick between paintings, and a model learns what you like.
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
          <Link href="/demos" className="text-xs transition-colors mb-8 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <section className="mb-10">
            <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
              Eight measurable traits per painting, computed in your browser. A Bayesian Bradley-Terry model weighs
              them from your picks, and each new pair is the one it expects to learn the most from. Arrow keys work.
            </p>
          </section>

          <section className="mb-10">
            <h2 className={H2} style={{ color: C.dim }}>Try it</h2>
            <TasteDemo />
          </section>

          <footer className="pt-6 border-t text-xs leading-relaxed" style={{ borderColor: C.cardBorder, color: C.dim }}>
            <p>
              Built by{" "}
              <Link href="/" className="underline hover:opacity-70" style={{ color: C.muted }}>Armaan Kazi</Link>
              . Not affiliated with Midjourney. Paintings: Art Institute of Chicago, public domain. No AI calls.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
