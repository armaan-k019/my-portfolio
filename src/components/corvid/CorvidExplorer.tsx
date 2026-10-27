"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { communityColor, type CorvidSnapshot } from "@/lib/corvid";

const CorvidGraph = dynamic(() => import("./CorvidGraph"), { ssr: false });

// The graph panel plus its community legend. Hovering or tapping a legend
// entry emphasizes that community in the graph.
export default function CorvidExplorer({ snapshot }: { snapshot: Pick<CorvidSnapshot, "nodes" | "edges" | "communities"> }) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hover ?? pinned;

  return (
    <div>
      <div className="h-[58vh] min-h-[360px] overflow-hidden rounded-sm bg-[#121A16]">
        <CorvidGraph nodes={snapshot.nodes} edges={snapshot.edges} highlight={active} />
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2" onMouseLeave={() => setHover(null)}>
        {snapshot.communities.map((c) => (
          <li key={c.index}>
            <button
              type="button"
              onMouseEnter={() => setHover(c.index)}
              onClick={() => setPinned((p) => (p === c.index ? null : c.index))}
              aria-pressed={pinned === c.index}
              className={`meta flex items-center gap-2 transition-colors ${active === null || active === c.index ? "text-brown" : "text-brown-light/60"}`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: communityColor(c.index) }} />
              {c.label}
              <span className="text-brown-light">{c.size}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
