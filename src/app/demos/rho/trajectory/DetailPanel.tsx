"use client";

// The candidate detail panel.
//
// The point of this panel is that both axes are explainable. It reads top to
// bottom as: who they are, the Work Quality breakdown (the signals that drove
// the score plus the corroboration audit), the Role Fit breakdown (which JD
// requirements their work aligned with), and their role timeline. The scores
// are the consequence of these, not numbers from nowhere.

import { computeQuality, qualityClaimed, qualityCorroborated, workStatementsOf, type Candidate } from "./data";
import type { FitDetail } from "./fit";

// "2017-06" to "Jun 2017", null to "Present".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d: string | null): string {
  if (!d) return "Present";
  const [y, m] = d.split("-");
  const mi = Number(m) - 1;
  return `${MONTHS[mi] ?? m} ${y}`;
}

function SignalBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-28 shrink-0" style={{ color: "var(--ct-muted)" }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "var(--ct-card-border)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, backgroundColor: "var(--ct-accent)" }} />
      </div>
      <span className="text-[10px] font-mono w-7 text-right" style={{ color: "var(--ct-dim)" }}>{Math.round(value * 100)}</span>
    </div>
  );
}

export default function DetailPanel({ candidate, fit, fitDetail, onClose }: { candidate: Candidate; fit?: number; fitDetail: FitDetail | null; onClose: () => void }) {
  const corroboratedCount = candidate.claims.filter((c) => c.corroborated).length;
  const { signals } = computeQuality(workStatementsOf(candidate));
  const qClaimed = qualityClaimed(candidate);
  const qCorr = qualityCorroborated(candidate);

  return (
    // Backdrop. Clicking it (outside the panel) dismisses.
    <div
      className="fixed inset-0 z-[200] flex justify-end"
      style={{ backgroundColor: "rgba(26,26,26,0.55)" }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto shadow-xl"
        style={{ backgroundColor: "var(--ct-card-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold leading-tight" style={{ color: "var(--ct-text)" }}>
                {candidate.name}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--ct-muted)" }}>{candidate.headline}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="text-sm rounded-md px-2 py-1 transition-colors hover:opacity-70"
              style={{ color: "var(--ct-muted)", border: "1px solid var(--ct-card-border)" }}
            >
              Close
            </button>
          </div>

          {/* Work Quality breakdown */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--ct-dim)" }}>Work Quality (X)</p>
              <p className="text-[11px] font-mono" style={{ color: "var(--ct-muted)" }}>
                {qClaimed} claimed
                <span style={{ color: "var(--ct-dim)" }}> to </span>
                <span style={{ color: qCorr < qClaimed ? "#C0392B" : "var(--ct-text)" }}>{qCorr} corroborated</span>
              </p>
            </div>
            <p className="text-[11px] mb-2" style={{ color: "var(--ct-muted)" }}>
              Signals from the demonstrated work (no pedigree). Corroboration scales it down where claims do not hold up.
            </p>
            <div className="space-y-1.5">
              <SignalBar label="Quantified outcomes" value={signals.quantified} />
              <SignalBar label="Ownership language" value={signals.ownership} />
              <SignalBar label="Scope of impact" value={signals.scope} />
              <SignalBar label="Breadth" value={signals.breadth} />
            </div>
          </div>

          {/* Role Fit breakdown */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--ct-dim)" }}>
              Role Fit (Y){typeof fit === "number" ? ` - ${fit}` : fitDetail ? ` - ${fitDetail.fit}` : ""}
            </p>
            {fitDetail ? (
              <ul className="space-y-1.5">
                {fitDetail.requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-xs font-bold leading-5 shrink-0" style={{ color: r.aligned ? "#2f7d4f" : "var(--ct-dim)" }} aria-hidden>
                      {r.aligned ? "✓" : "·"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] leading-snug" style={{ color: r.aligned ? "var(--ct-text)" : "var(--ct-dim)" }}>{r.text}</p>
                      <p className="text-[10px]" style={{ color: "var(--ct-dim)" }}>{r.aligned ? "aligned" : "no strong match"} (similarity {r.sim.toFixed(2)})</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : typeof fit === "number" ? (
              <p className="text-[11px]" style={{ color: "var(--ct-muted)" }}>
                Alignment of this candidate&apos;s demonstrated work against the role requirements. Higher means their work matches what the role needs, independent of pedigree.
              </p>
            ) : (
              <p className="text-[11px] italic" style={{ color: "var(--ct-dim)" }}>
                Paste a job description to compute Role Fit. Fit is alignment of their work against the role, not pedigree.
              </p>
            )}
          </div>

          {/* Role timeline */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--ct-dim)" }}>
              Role history
            </p>
            <ol className="space-y-3">
              {candidate.roles.map((r, i) => (
                <li key={i} className="pl-3" style={{ borderLeft: "2px solid var(--ct-card-border)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--ct-text)" }}>{r.title}</p>
                  <p className="text-[10px] mb-1" style={{ color: "var(--ct-dim)" }}>
                    {fmtDate(r.startDate)} to {fmtDate(r.endDate)}
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {r.bullets.map((b, j) => (
                      <li key={j} className="text-[11px] leading-snug" style={{ color: "var(--ct-muted)" }}>{b}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>

          {/* Per-claim breakdown: the corroborated quality explained */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--ct-dim)" }}>
              Claim audit
            </p>
            <p className="text-[11px] mb-2.5" style={{ color: "var(--ct-muted)" }}>
              {corroboratedCount} of {candidate.claims.length} claims corroborate against the second source. Claims that
              do not hold up reduce the corroborated Work Quality above; this is the consequence, not a number from nowhere.
            </p>
            <ul className="space-y-2">
              {candidate.claims.map((claim, i) => {
                const ok = claim.corroborated;
                return (
                  <li
                    key={i}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: ok ? "var(--ct-card-border)" : "#E2B6A8",
                      backgroundColor: ok ? "var(--ct-bg)" : "#FBEDE8",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className="text-xs font-bold leading-5 shrink-0"
                        style={{ color: ok ? "#2f7d4f" : "#C0392B" }}
                        aria-hidden
                      >
                        {ok ? "✓" : "⚑"}
                      </span>
                      <div>
                        <p className="text-[11px] font-medium leading-snug" style={{ color: "var(--ct-text)" }}>
                          {claim.text}
                        </p>
                        <p className="text-[10px] mt-0.5 leading-snug" style={{ color: ok ? "var(--ct-dim)" : "#9A3B2A" }}>
                          {ok ? "Corroborated. " : "Not corroborated. "}{claim.note}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}
