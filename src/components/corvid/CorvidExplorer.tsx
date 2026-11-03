"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { communityColor, type CorvidMeeting, type CorvidSnapshot } from "@/lib/corvid";

const CorvidGraph = dynamic(() => import("./CorvidGraph"), { ssr: false });

const NO_MEETINGS: CorvidMeeting[] = [];

// The graph panel plus its community legend and the meeting points. Hovering
// or tapping a legend entry emphasizes that community in the graph; picking a
// meeting point (from the list or its ring in the graph) lights both sides and
// shows why they sit together.
export default function CorvidExplorer({
  snapshot,
  children,
}: {
  snapshot: Pick<CorvidSnapshot, "nodes" | "edges" | "communities" | "meetings">;
  children?: ReactNode; // rendered under the legend, above the meeting points
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [legendAction, setLegendAction] = useState(0);
  const [meeting, setMeeting] = useState<number | null>(null);
  const meetings = snapshot.meetings ?? NO_MEETINGS;
  const active = hover ?? pinned;
  // A legend click hands the graph back to the legend. A legend hover does
  // too, except while a meeting point is open, so the pointer passing over
  // the legend (scrolling, say) does not close it.
  const bump = () => setLegendAction((n) => n + 1);

  return (
    <div>
      <div className="relative h-[58vh] min-h-[360px] overflow-hidden rounded-sm bg-[#121A16]">
        <CorvidGraph
          nodes={snapshot.nodes}
          edges={snapshot.edges}
          highlight={active}
          legendAction={legendAction}
          meetings={meetings}
          activeMeeting={meeting}
          onMeetingSelect={(i) => {
            setMeeting(i);
            if (i !== null) {
              setPinned(null);
              setHover(null);
            }
          }}
        />
        {meeting !== null && meetings[meeting] && (
          <div className="absolute bottom-3 left-3 z-10 max-w-[min(24rem,calc(100%-1.5rem))] rounded-sm bg-[#18221D]/90 px-3 py-2 text-[12px] leading-snug text-[#EFF4EF]">
            <p className="text-[#9FB0A6]">
              {meetings[meeting].between[0]} meets {meetings[meeting].between[1]}
            </p>
            <p className="mt-0.5 font-medium">{meetings[meeting].headline}</p>
            <p className="mt-1.5 flex items-center gap-3 text-[#9FB0A6]">
              <a href="#meeting-detail" className="underline-offset-2 hover:text-[#EFF4EF] hover:underline">
                why
              </a>
              <button type="button" onClick={() => setMeeting(null)} className="underline-offset-2 hover:text-[#EFF4EF] hover:underline">
                clear
              </button>
            </p>
          </div>
        )}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2" onMouseLeave={() => setHover(null)}>
        {snapshot.communities.map((c) => (
          <li key={c.index}>
            <button
              type="button"
              onMouseEnter={() => {
                if (meeting !== null) return;
                setHover(c.index);
                bump();
              }}
              onClick={() => {
                setMeeting(null);
                setPinned((p) => (p === c.index ? null : c.index));
                bump();
              }}
              aria-pressed={pinned === c.index}
              className={`meta flex items-center gap-2 text-left transition-colors ${active === null || active === c.index ? "text-brown" : "text-brown-light/60"}`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: communityColor(c.index) }} />
              {c.label}
              <span className="text-brown-light">{c.size}</span>
            </button>
          </li>
        ))}
      </ul>
      {children}
      {meetings.length > 0 && <MeetingPoints meetings={meetings} nodes={snapshot.nodes} active={meeting} onSelect={setMeeting} />}
    </div>
  );
}

function MeetingPoints({
  meetings,
  nodes,
  active,
  onSelect,
}: {
  meetings: CorvidMeeting[];
  nodes: CorvidSnapshot["nodes"];
  active: number | null;
  onSelect: (i: number | null) => void;
}) {
  const m = active === null ? null : meetings[active];
  return (
    <section className="mt-10">
      <p className="eyebrow">Where fields meet</p>
      <div className="rule mt-4" />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-brown-light">
        The rings in the map mark spots where papers from two different fields are each other&apos;s nearest neighbors. For each one
        the lab lists the terms both sides share, ranked by how rare they are across the two fields, and Claude explains the overlap
        from only those terms and the papers&apos; text.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <ol className="space-y-1">
          {meetings.map((x, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(active === i ? null : i)}
                aria-pressed={active === i}
                className={`w-full rounded-sm px-3 py-2 text-left transition-colors ${active === i ? "bg-[var(--color-line)]/60" : "hover:bg-[var(--color-line)]/30"}`}
              >
                <span className="meta flex items-center gap-1.5 text-brown-light">
                  <Dot c={x.communities[0]} />
                  <Dot c={x.communities[1]} />
                  <span className="truncate">
                    {x.between[0]} · {x.between[1]}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-brown">{x.headline}</span>
              </button>
            </li>
          ))}
        </ol>
        {m ? (
          <MeetingCard m={m} nodes={nodes} />
        ) : (
          <p className="meta self-center text-brown-light">Pick a meeting point, here or by its ring in the map.</p>
        )}
      </div>
    </section>
  );
}

function MeetingCard({ m, nodes }: { m: CorvidMeeting; nodes: CorvidSnapshot["nodes"] }) {
  return (
    <article id="meeting-detail" className="scroll-mt-24 border-l-2 border-[var(--color-line)] pl-5">
      <p className="font-display text-lg text-darkblue">
        {m.between[0]} <span className="text-sage">&harr;</span> {m.between[1]}
      </p>
      <p className="mt-1 text-brown">{m.headline}</p>
      <p className="mt-3 max-w-2xl leading-relaxed text-brown">{m.explanation}</p>
      {m.significance && <p className="mt-2 max-w-2xl leading-relaxed text-brown-light">{m.significance}</p>}
      {m.verdict === "surface" && (
        <p className="meta mt-2 text-brown-light">Claude judged this overlap surface level: shared vocabulary or a common foundation more than a shared method.</p>
      )}

      <p className="eyebrow mt-6">What both sides share</p>
      {m.shared.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {m.shared.map((t) => (
            <li
              key={`${t.kind}:${t.label}`}
              className="meta rounded-sm border border-[var(--color-line)] px-2 py-1 text-brown"
              title={`${t.a} of ${m.a.length} papers on one side and ${t.b} of ${m.b.length} on the other carry it, against ${Math.round(t.fieldRate * 100)}% of all papers in the two fields.`}
            >
              {t.label} <span className="text-brown-light">{t.kind}</span>{" "}
              <span className="text-brown-light">
                {t.a}/{m.a.length} · {t.b}/{m.b.length} here, {Math.round(t.fieldRate * 100)}% across both fields
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta mt-2 text-brown-light">No extracted concept, method, or dataset is shared by both sides; they sit together on embedding similarity alone.</p>
      )}

      <div className="mt-6 grid gap-4 text-sm leading-snug text-brown sm:grid-cols-2">
        <PaperList title={m.between[0]} c={m.communities[0]} ids={m.a} nodes={nodes} />
        <PaperList title={m.between[1]} c={m.communities[1]} ids={m.b} nodes={nodes} />
      </div>
    </article>
  );
}

function PaperList({ title, c, ids, nodes }: { title: string; c: number; ids: number[]; nodes: CorvidSnapshot["nodes"] }) {
  return (
    <div>
      <p className="meta flex items-center gap-1.5 text-brown-light">
        <Dot c={c} />
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {ids.map((i) => (
          <li key={i}>{nodes[i]?.label ?? "untitled"}</li>
        ))}
      </ul>
    </div>
  );
}

function Dot({ c }: { c: number }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: communityColor(c) }} />;
}
