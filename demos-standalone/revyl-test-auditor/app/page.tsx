"use client";

import { useState, useRef, useEffect } from "react";
import { JetBrains_Mono } from "next/font/google";

interface PageColors {
  bg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  accentBg: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
}

const CSS_VAR_COLORS: PageColors = {
  bg: "var(--ct-bg)",
  cardBg: "var(--ct-card-bg)",
  cardBorder: "var(--ct-card-border)",
  text: "var(--ct-text)",
  muted: "var(--ct-muted)",
  dim: "var(--ct-dim)",
  accent: "var(--ct-accent)",
  accentBg: "var(--ct-accent-bg)",
  headerBg: "var(--ct-header-bg)",
  headerBorder: "var(--ct-header-border)",
  headerText: "var(--ct-header-text)",
};

function CompanyThemeStyle({ active, css }: { active?: boolean; css?: string }) {
  if (!active || !css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-brand" });

const REVYL_ACCENT = "#2d5a27";
const REVYL_BG = "#f5f3ef";

const COMPANY_THEME_CSS = `
.company-theme {
  --ct-bg: #f5f3ef; --ct-card-bg: #ffffff; --ct-card-border: #e5e0d8;
  --ct-text: #1a1a1a; --ct-muted: #6b6b6b; --ct-dim: #9a8a7a;
  --ct-accent: #2d5a27; --ct-accent-bg: #eef2ec;
  --ct-header-bg: #ffffff; --ct-header-border: #e5e0d8; --ct-header-text: #1a1a1a;
}
`;

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = "low" | "medium" | "high";

interface Weakness {
  category: string;
  severity: Severity;
  description: string;
  bug_example: string;
}

interface AuditResult {
  confidence_score: number;
  confidence_rationale: string;
  weaknesses: Weakness[];
  rewrite: string;
  rewrite_notes: string;
}

// ── Example tests ─────────────────────────────────────────────────────────────

const EXAMPLES = [
  {
    label: "Cypress : login",
    code: `// Cypress : login flow
describe('Login', () => {
  it('logs in with valid credentials', () => {
    cy.visit('/login')
    cy.get('.input').first().type('user@example.com')
    cy.get('.input').last().type('password123')
    cy.get('button').click()
    cy.url().should('not.include', '/login')
  })
})`,
  },
  {
    label: "Playwright : checkout",
    code: `// Playwright : checkout flow
test('completes checkout', async ({ page }) => {
  await page.goto('/cart')
  await page.click('[data-testid="checkout-btn"]')
  await page.fill('#card-number', '4242424242424242')
  await page.fill('#expiry', '12/26')
  await page.fill('#cvv', '123')
  await page.click('[data-testid="pay-btn"]')
  await page.waitForURL('/confirmation')
  await expect(page.locator('h1')).toContainText('Thank you')
})`,
  },
  {
    label: "Revyl : cart total",
    code: `Test: Cart total updates when item quantity changes
1. Navigate to /products
2. Add "Blue Widget" to cart
3. Go to cart page
4. Increase quantity to 3
5. Verify cart total updates`,
  },
  {
    label: "Appium : mobile login",
    code: `# Appium : mobile login
def test_mobile_login(driver):
    driver.find_element(By.ID, "com.app:id/email").send_keys("test@example.com")
    driver.find_element(By.ID, "com.app:id/password").send_keys("secret")
    driver.find_element(By.ID, "com.app:id/login_btn").click()
    time.sleep(3)
    welcome = driver.find_element(By.ID, "com.app:id/welcome_msg")
    assert welcome.is_displayed()`,
  },
];

const LOADING_MESSAGES = [
  "Checking selectors...",
  "Looking for missing assertions...",
  "Simulating edge cases...",
  "Scanning for race conditions...",
  "Scoring confidence...",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<Severity, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

function scoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function SeverityPill({ severity }: { severity: Severity }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 uppercase tracking-widest border"
      style={{ color, backgroundColor: color + "18", borderColor: color + "50" }}
    >
      {severity}
    </span>
  );
}

function AnimatedScore({ score, C }: { score: number; C: PageColors }) {
  const [displayed, setDisplayed] = useState(0);
  const color = scoreColor(score);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 900;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-32 h-32 flex items-center justify-center border-4"
        style={{
          borderColor: color,
          backgroundColor: color + "12",
        }}
      >
        <span className="text-5xl font-black tabular-nums" style={{ color }}>
          {displayed}
        </span>
      </div>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: C.dim }}>
        Confidence Score
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RevylPage() {
  const [testCode, setTestCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);
  const C = CSS_VAR_COLORS;

  async function runAudit() {
    if (!testCode.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setLoadingStep(0);

    for (let i = 0; i < LOADING_MESSAGES.length; i++) {
      setLoadingStep(i);
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      const res = await fetch("https://armaankazi.com/api/demos/revyl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCode }),
      });
      const json = await res.json() as { result?: AuditResult; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result!);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }

  const sorted = result
    ? [...result.weaknesses].sort((a, b) => {
        const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
        return rank[a.severity] - rank[b.severity];
      })
    : [];

  return (
    <div
      className={`min-h-screen company-theme ${jetbrainsMono.variable}`}
      style={{ backgroundColor: C.bg, color: C.text }}
    >
      <CompanyThemeStyle active={true} css={COMPANY_THEME_CSS} />

      {/* Header */}
      <header className="px-6 py-5 border-b" style={{ borderColor: C.headerBorder, backgroundColor: C.headerBg }}>
        <div className="w-full max-w-[900px] mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-2xl font-black tracking-tight" style={{ color: C.headerText }}>
                Test the Tester
              </h1>
              <span
                className="text-[10px] font-bold px-2.5 py-1 border uppercase tracking-widest"
                style={{ borderColor: REVYL_ACCENT + "60", color: "#9ca3af", backgroundColor: REVYL_ACCENT + "15" }}
              >
                Built for Revyl
              </span>
            </div>
            <p className="text-sm" style={{ color: "#9ca3af" }}>
              Paste a test. Find the holes before the bugs do.
            </p>
          </div>
          <div className="flex-shrink-0">
            <span className="text-xs" style={{ color: "#6b7280" }}>
              Demo by{" "}
              <a href="https://armaankazi.com" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70 transition-opacity" style={{ color: "#9ca3af" }}>
                Armaan Kazi
              </a>
            </span>
          </div>
        </div>
      </header>

      <div className="w-full max-w-[900px] mx-auto px-6 py-10">

        <a href="https://armaankazi.com/demos" target="_blank" rel="noopener noreferrer" className="text-xs transition-colors mb-8 inline-block hover:opacity-70" style={{ color: C.muted }}>
          &#8592; Back to Demos
        </a>

        {/* Section A: Who Revyl is */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            About Revyl
          </p>
          <p className="text-sm leading-relaxed mb-6 max-w-2xl" style={{ color: C.muted }}>
            Revyl is a YC Fall 2024 AI-native mobile testing platform. The founders built DragonCrawl at Uber, an LLM-based mobile testing framework that saved Uber $25M in four months. The premise: replace brittle script-based E2E tests that break on every UI change with natural-language tests that run on real cloud iOS and Android devices, wired to OpenTelemetry traces so bugs get caught before production.
          </p>

          {/* Today vs With This Demo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="border p-5" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>Today</p>
              <div className="space-y-3">
                {[
                  "Write tests.",
                  "Hope they catch bugs.",
                  "Find out in production when they didn't.",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5" style={{ color: "#ef4444" }}>&#10005;</span>
                    <span className="text-sm" style={{ color: C.muted }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border p-5" style={{ backgroundColor: C.cardBg, borderColor: REVYL_ACCENT + "40" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: REVYL_ACCENT }}>With This Demo</p>
              <div className="space-y-3">
                {[
                  "Audit your tests before the bugs find them.",
                  "See exactly which assumptions your test is making.",
                  "See which ones are wrong.",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-xs mt-0.5 font-bold" style={{ color: "#22c55e" }}>&#10003;</span>
                    <span className="text-sm" style={{ color: C.text }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2 pr-4 font-bold" style={{ color: C.dim, borderBottom: `1px solid ${C.cardBorder}` }}></th>
                  <th className="text-left py-2 pr-4 font-bold" style={{ color: C.dim, borderBottom: `1px solid ${C.cardBorder}` }}>Script-based E2E</th>
                  <th className="text-left py-2 pr-4 font-bold" style={{ color: C.dim, borderBottom: `1px solid ${C.cardBorder}` }}>Revyl natural-language</th>
                  <th className="text-left py-2 font-bold" style={{ color: REVYL_ACCENT, borderBottom: `1px solid ${C.cardBorder}` }}>This audit layer</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Survives UI changes", "No", "Yes", "N/A"],
                  ["Catches missing assertions", "Never", "Partial", "Yes"],
                  ["Explains why a test is weak", "No", "No", "Yes"],
                  ["Requires writing test code", "Yes", "No", "No"],
                  ["Root cause analysis", "Manual", "Via OTel traces", "Pre-run, structural"],
                  ["Runs on real devices", "Emulators", "Yes", "N/A"],
                ].map(([label, col1, col2, col3]) => (
                  <tr key={label}>
                    <td className="py-2.5 pr-4 font-semibold" style={{ color: C.text, borderBottom: `1px solid ${C.cardBorder}` }}>{label}</td>
                    <td className="py-2.5 pr-4" style={{ color: C.muted, borderBottom: `1px solid ${C.cardBorder}` }}>{col1}</td>
                    <td className="py-2.5 pr-4" style={{ color: C.muted, borderBottom: `1px solid ${C.cardBorder}` }}>{col2}</td>
                    <td className="py-2.5 font-medium" style={{ color: REVYL_ACCENT, borderBottom: `1px solid ${C.cardBorder}` }}>{col3}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section B: Feature cards */}
        <section className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: C.dim }}>
            What the audit covers
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                title: "Adversarial analysis",
                body: "Claude approaches your test as an attacker, not a reviewer. The goal is to find ways the test passes while the feature is broken, not ways to make the test more verbose.",
              },
              {
                title: "Severity-scored weaknesses",
                body: "Every flaw is categorized and rated high, medium, or low. Hard-coded waits and loose selectors are different problems with different blast radii.",
              },
              {
                title: "Confidence score",
                body: "A 0-100 number representing how likely this test is to catch a real bug. Most tests score 40-70. A test that scores 90 is genuinely rare and earns it.",
              },
              {
                title: "Rewrite in Revyl style",
                body: "The audit closes with a rewritten version of the test in Revyl's natural-language format: numbered steps, explicit assertions, no ambiguous verbs.",
              },
            ].map(card => (
              <div key={card.title} className="border p-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                <p className="text-xs font-bold mb-2" style={{ color: C.text }}>{card.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section C: Interactive tool */}
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
          Run an audit
        </p>
        <p className="text-sm mb-6" style={{ color: C.muted }}>
          Paste any test below, or load one of the examples. Works with Cypress, Playwright, Appium, pytest, Revyl natural-language, or plain prose.
        </p>

        {/* Example buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {EXAMPLES.map(ex => (
            <button
              key={ex.label}
              onClick={() => { setTestCode(ex.code); setResult(null); setError(null); }}
              className="text-xs px-3 py-1.5 border transition-colors hover:opacity-70"
              style={{ borderColor: C.cardBorder, color: C.muted, backgroundColor: "transparent" }}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="border mb-4" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
          <textarea
            value={testCode}
            onChange={e => { setTestCode(e.target.value); setResult(null); setError(null); }}
            placeholder="Paste your test here..."
            rows={10}
            className="w-full px-4 py-4 text-sm font-mono focus:outline-none resize-none"
            style={{ backgroundColor: "transparent", color: C.text, caretColor: REVYL_ACCENT }}
          />
        </div>

        <button
          onClick={runAudit}
          disabled={!testCode.trim() || loading}
          className="w-full py-3.5 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:opacity-90 mb-8"
          style={{ backgroundColor: REVYL_ACCENT, color: "#ffffff" }}
        >
          {loading ? "Auditing..." : "Run Audit"}
        </button>

        {error && (
          <div className="border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400 mb-8">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="border p-8 mb-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: C.dim }}>
              Claude is finding holes in your test...
            </p>
            <div className="space-y-2">
              {LOADING_MESSAGES.slice(0, loadingStep + 1).map((msg, i) => (
                <p
                  key={i}
                  className="text-sm font-mono flex items-center gap-2"
                  style={{ color: i === loadingStep ? C.text : C.dim, opacity: i === loadingStep ? 1 : 0.5 }}
                >
                  {i === loadingStep
                    ? <span className="inline-block w-2 h-2 animate-pulse" style={{ backgroundColor: REVYL_ACCENT }} />
                    : <span className="text-xs" style={{ color: "#22c55e" }}>&#10003;</span>
                  }
                  {msg}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !result && !error && (
          <div className="border px-6 py-10 text-center" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
            <p className="text-sm font-mono mb-1" style={{ color: C.muted }}>
              Paste a test, or load an example.
            </p>
            <p className="text-sm font-mono" style={{ color: C.dim }}>
              I'll find the holes.
            </p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-8">

            {/* Reset */}
            <div className="flex justify-end">
              <button
                onClick={() => { setResult(null); setError(null); }}
                className="text-xs transition-colors hover:opacity-70"
                style={{ color: C.muted }}
              >
                &#8592; Run another audit
              </button>
            </div>

            {/* Confidence score */}
            <div className="border px-6 py-8 flex flex-col sm:flex-row items-center gap-8" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
              <AnimatedScore score={result.confidence_score} C={C} />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.dim }}>
                  Rationale
                </p>
                <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
                  {result.confidence_rationale}
                </p>
                <div className="mt-4 flex gap-4 text-xs" style={{ color: C.dim }}>
                  <span><span className="font-bold" style={{ color: "#22c55e" }}>70+</span> reliable</span>
                  <span><span className="font-bold" style={{ color: "#f59e0b" }}>40-69</span> risky</span>
                  <span><span className="font-bold" style={{ color: "#ef4444" }}>0-39</span> unsafe</span>
                </div>
              </div>
            </div>

            {/* Weaknesses */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
                Weaknesses
              </p>
              <p className="text-xs mb-4" style={{ color: C.dim }}>
                Sorted by severity. High first.
              </p>
              <div className="space-y-3">
                {sorted.map((w, i) => (
                  <div
                    key={i}
                    className="border p-5"
                    style={{
                      backgroundColor: C.cardBg,
                      borderColor: C.cardBorder,
                      borderLeftColor: SEVERITY_COLOR[w.severity],
                      borderLeftWidth: 3,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <SeverityPill severity={w.severity} />
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 uppercase tracking-widest border"
                        style={{ color: C.dim, backgroundColor: C.cardBorder + "60", borderColor: C.cardBorder }}
                      >
                        {w.category}
                      </span>
                    </div>
                    <p className="text-sm mb-2" style={{ color: C.text }}>{w.description}</p>
                    <div className="border-l-2 pl-3 mt-3" style={{ borderColor: SEVERITY_COLOR[w.severity] + "60" }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: SEVERITY_COLOR[w.severity] }}>
                        Bug that slips through
                      </p>
                      <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{w.bug_example}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rewrite */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: C.dim }}>
                Suggested Rewrite
              </p>
              <p className="text-xs mb-4" style={{ color: C.dim }}>
                Revyl natural-language style. Explicit assertions at every step.
              </p>
              <div className="border overflow-hidden rounded-lg" style={{ backgroundColor: C.cardBg, borderColor: C.cardBorder }}>
                <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: C.cardBorder }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: REVYL_ACCENT }}>
                    revyl
                  </span>
                </div>
                <pre className="px-5 py-4 text-sm font-mono whitespace-pre-wrap leading-relaxed" style={{ color: C.text }}>
                  {result.rewrite}
                </pre>
              </div>
              <p className="text-xs leading-relaxed mt-3" style={{ color: C.dim }}>
                {result.rewrite_notes}
              </p>
            </div>

          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center mt-12" style={{ borderColor: C.cardBorder }}>
        <p className="text-xs leading-relaxed mb-1" style={{ color: C.dim }}>
          This is a speculative demo built to complement Revyl&apos;s platform. It is not an official Revyl product.
        </p>
        <p className="text-xs" style={{ color: C.dim }}>
          Built by{" "}
          <a href="https://armaankazi.com" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70 transition-opacity">
            Armaan Kazi
          </a>
          . Not affiliated with Revyl.
        </p>
      </footer>
    </div>
  );
}
