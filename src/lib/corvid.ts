// The read-only corvid snapshot shown at /lab. The file is written by the lab
// itself (kazi_lab: `pnpm --filter web export:public <path>`) and committed
// here; nothing on this site talks to the lab's database.
import raw from "../../content/corvid-snapshot.json";

export interface CorvidNode {
  label: string;
  community: number | null;
  bridge: boolean;
  influence: number;
  p: [number, number, number];
}

export interface CorvidFinding {
  between: [string, string];
  via: string[];
  score: number;
  papers: number;
  aPapers: string[];
  cPapers: string[];
}

export interface CorvidLibrary {
  name: string;
  papers: number;
  stages: Record<string, string>;
}

export interface CorvidSnapshot {
  name: string;
  exportedAt: string;
  webBuiltAt: string | null;
  counts: { papers: number; communities: number; findings: number; libraries: number };
  communities: { index: number; label: string; size: number | null }[];
  nodes: CorvidNode[];
  edges: [number, number, number][]; // [from, to, weight]
  findings: CorvidFinding[];
  libraries: CorvidLibrary[];
}

export const corvid = raw as unknown as CorvidSnapshot;

// Community hues, the same order the lab's own field uses.
export const COMMUNITY_COLORS = ["#7da2d9", "#8fc4a5", "#c79bd9", "#d98f8f", "#76bcc4", "#ccb37a", "#9b90d9", "#d9a3c0", "#90b878", "#8a95a8"];
export const UNASSIGNED_COLOR = "#8a95a8";

export function communityColor(index: number | null): string {
  return index === null || index < 0 ? UNASSIGNED_COLOR : COMMUNITY_COLORS[index % COMMUNITY_COLORS.length];
}

const FIELD_NAMES = new Map(corvid.communities.map((c) => [c.index, c.label]));

export function communityLabel(index: number): string {
  return FIELD_NAMES.get(index) ?? `field ${index}`;
}
