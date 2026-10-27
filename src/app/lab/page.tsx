import type { Metadata } from "next";
import CorvidExplorer from "@/components/corvid/CorvidExplorer";
import { corvid } from "@/lib/corvid";

export const metadata: Metadata = {
  title: "corvid | Armaan Kazi",
  description: "corvid, a research lab that reads a corpus of papers and maps how fields connect. A read-only view.",
};

const STAGES: { key: string; label: string }[] = [
  { key: "papers", label: "Papers" },
  { key: "synthesis", label: "Synthesis" },
  { key: "critic", label: "Critic" },
  { key: "metrics", label: "Metrics" },
  { key: "crossDomain", label: "Cross-domain" },
  { key: "experiment", label: "Experiment" },
  { key: "document", label: "Document" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

// The public, read-only view of corvid (the lab). Everything here comes from a
// snapshot the lab exports; nothing on this page can start a run or reach the
// lab's database.
export default function LabPage() {
  const { counts } = corvid;
  const stats: [string, number][] = [
    ["Papers", counts.papers],
    ["Fields", counts.communities],
    ["Candidate links", counts.findings],
  ];
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
      <p className="eyebrow">Lab</p>
      <h1 className="font-display display-lg mt-4 font-semibold text-darkblue">{corvid.name}</h1>
      <p className="mt-6 max-w-2xl leading-relaxed text-brown-light">
        A research lab I built that reads a corpus of academic papers, clusters them into fields, and looks for places where
        distant fields share a method or a concept. Agents extract claims and metrics, a critic audits what they propose, and
        the scoring is deterministic code rather than a model&apos;s judgment.
      </p>

      <dl className="mt-10 grid max-w-xl grid-cols-3 gap-6">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="eyebrow">{label}</dt>
            <dd className="font-display display-md mt-2 text-darkblue">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-14">
        <CorvidExplorer snapshot={corvid} />
        <p className="meta mt-3 text-brown-light">
          Each point is a paper; its position comes from its embedding and its color from the field it clustered into. Drag to
          orbit, hover for a title.
        </p>
      </section>

      <section className="mt-20">
        <p className="eyebrow">Candidate links between fields</p>
        <div className="rule mt-4" />
        <p className="mt-6 max-w-2xl leading-relaxed text-brown-light">
          Concepts that connect two fields through papers on each side, ranked by the graph&apos;s score. These are leads for
          the lab to test, not established findings.
        </p>
        <ol className="mt-8 space-y-6">
          {corvid.findings.map((f, i) => (
            <li key={i} className="border-l-2 border-[var(--color-line)] pl-5">
              <p className="font-display text-lg text-darkblue">
                {f.between[0]} <span className="text-sage">&harr;</span> {f.between[1]}
              </p>
              <p className="meta mt-1 text-brown-light">
                via {f.via.join(", ")} · score {f.score.toFixed(2)} · {f.papers} papers
              </p>
              <details className="mt-2">
                <summary className="meta cursor-pointer text-brown-light hover:text-terracotta">evidence</summary>
                <div className="mt-2 grid gap-4 text-sm leading-snug text-brown sm:grid-cols-2">
                  <ul className="space-y-1">
                    {f.aPapers.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <ul className="space-y-1">
                    {f.cPapers.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20">
        <p className="eyebrow">Libraries and their pipeline</p>
        <div className="rule mt-4" />
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="meta text-brown-light">
                <th className="py-2 pr-4 font-normal">Library</th>
                {STAGES.map((s) => (
                  <th key={s.key} className="py-2 pr-4 font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corvid.libraries.map((l) => (
                <tr key={l.name} className="border-t border-[var(--color-line)]">
                  <td className="py-3 pr-4 text-brown">
                    {l.name} <span className="meta text-brown-light">{l.papers}</span>
                  </td>
                  {STAGES.map((s) => (
                    <td key={s.key} className="py-3 pr-4">
                      <StageMark state={l.stages[s.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="meta mt-16 text-brown-light">
        Read-only snapshot. Graph built {formatDate(corvid.webBuiltAt)}; exported {formatDate(corvid.exportedAt)}.
      </p>
    </div>
  );
}

function StageMark({ state }: { state: string | undefined }) {
  const label = state === "done" ? "done" : state === "stale" ? "stale" : state === "none_found" ? "none found" : "not yet";
  const color = state === "done" ? "bg-sage" : state === "stale" ? "bg-tan" : "bg-[var(--color-line)]";
  return (
    <span className="meta inline-flex items-center gap-1.5 text-brown-light">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
