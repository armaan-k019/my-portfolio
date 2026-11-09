import Link from "next/link";
import { CSS_VAR_COLORS } from "@/components/ThemeToggle";
import CompanyThemeStyle from "@/components/CompanyThemeStyle";
import RetargetDemo from "./RetargetDemo";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #0d0f11; --ct-card-bg: #15181b; --ct-card-border: #262a2f;
  --ct-text: #e7eaee; --ct-muted: #9aa3ad; --ct-dim: #66707a;
  --ct-accent: #f2a65a; --ct-accent-bg: #2a1f14;
  --ct-header-bg: #0d0f11; --ct-header-border: #262a2f; --ct-header-text: #e7eaee;
}
`;

const C = CSS_VAR_COLORS;

export default function DreamLabsPage() {
  return (
    <>
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />
      <div className="min-h-screen company-theme" style={{ backgroundColor: C.bg }}>
        <header className="px-6 py-5 border-b" style={{ backgroundColor: C.headerBg, borderColor: C.headerBorder }}>
          <div className="max-w-6xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                  One Motion, Five Robots
                </h1>
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ borderColor: C.cardBorder, color: C.accent, backgroundColor: C.accentBg }}
                >
                  Built for Dream Labs
                </span>
              </div>
              <p className="text-sm" style={{ color: C.muted }}>
                What &quot;any robot with grippers&quot; has to absorb.
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

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <Link href="/demos" className="text-xs mb-6 inline-block hover:opacity-70" style={{ color: C.muted }}>
            &#8592; Back to Demos
          </Link>

          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            Draw a pick-and-place path in the side view. Inverse kinematics retargets it onto five arms, and each one
            shows where it runs out of reach, joints, wrist, or gripper. The KUKA solution exports as KRL, the language
            KUKA|prc compiles toolpaths into.
          </p>

          <RetargetDemo />

          <footer className="mt-10 pt-6 border-t text-xs leading-relaxed" style={{ borderColor: C.cardBorder, color: C.dim }}>
            <p>
              Built by{" "}
              <Link href="/" className="underline hover:opacity-70" style={{ color: C.muted }}>Armaan Kazi</Link>
              . Not affiliated with Dream Labs or KUKA. Planar model: KUKA reach and axis limits from its datasheet,
              other arms generic. No AI calls.
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
