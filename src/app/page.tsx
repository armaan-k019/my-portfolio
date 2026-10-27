import type { Metadata } from "next";
import { sites } from "../../content/sites";
import ChooserGrid, { type Tile } from "@/components/chooser/ChooserGrid";
import SectionCut from "@/components/section-cut/SectionCut";
import DraftingSheet from "@/components/chooser/DraftingSheet";
import LabField from "@/components/chooser/LabField";
import SkillsGraph, { type SkillsGraphData } from "@/components/chooser/SkillsGraph";
import SignatureMark from "@/components/SignatureMark";

export const metadata: Metadata = {
  title: "Armaan Kazi",
  description: "Website, architecture portfolio, research lab, and workflow.",
};

// Rebuilt daily so the Workflow tile follows the ark-skills repo.
export const revalidate = 86400;

const GRAPH_URL = "https://raw.githubusercontent.com/armaan-k019/ark-skills/main/viz/data/graph.json";

// The public ark-skills graph, reduced to what the tile draws. On any failure
// the tile shows no graph rather than a made-up one.
async function loadSkillsGraph(): Promise<SkillsGraphData | null> {
  try {
    const res = await fetch(GRAPH_URL, { next: { revalidate } });
    if (!res.ok) return null;
    const g = await res.json();
    return {
      families: g.families.map((f: { id: string }) => f.id),
      nodes: g.nodes.map((n: { id: string; kind: string; family: string; lines: number }) => ({
        id: n.id, kind: n.kind, family: n.family, lines: n.lines,
      })),
      edges: g.edges.map((e: { source: string; target: string }) => ({ source: e.source, target: e.target })),
    };
  } catch {
    return null;
  }
}

// The chooser: armaankazi.com opens here, and each tile leads to one site.
export default async function Chooser() {
  const graph = await loadSkillsGraph();
  const [website, portfolio, lab, workflow] = sites;
  const tiles: Tile[] = [
    { site: website, visual: (
        // The hero drawing, kept above the tile's text. Its numeric readout is
        // hidden here, and below md its canvas is pinned to the tile instead
        // of taking the hero's 85vw height.
        <div className="absolute inset-x-0 top-0 bottom-12 md:bottom-16 [&_dl]:hidden [&>div]:absolute [&>div]:inset-0 [&>div>div:first-child]:absolute [&>div>div:first-child]:inset-0 [&>div>div:first-child]:h-auto">
          <SectionCut />
        </div>
      ), dark: false, surface: "bg-[var(--color-paper)]" },
    { site: portfolio, visual: <DraftingSheet />, dark: false, surface: "bg-[#F7F2E8]" },
    { site: lab, visual: <LabField />, dark: true, surface: "bg-[#0C120E]" },
    { site: workflow, visual: graph ? <SkillsGraph data={graph} /> : null, dark: false, surface: "bg-white" },
  ];

  return (
    <div className="-mt-16 flex flex-col min-h-screen">
      <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-3 pt-6 md:pt-8">
        <SignatureMark bold size="h-14 w-[118px] md:h-[68px] md:w-[142px]" className="bg-tan-light" />
        <span className="font-display text-[17px] font-semibold text-[#EFF4EF] tracking-tight">Armaan Kazi</span>
      </header>
      <ChooserGrid tiles={tiles} />
    </div>
  );
}
