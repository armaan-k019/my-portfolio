// The public ark-skills graph (viz/data/graph.json, generated in that repo
// from its SKILL.md, agent, and hook files), reduced to what /setup draws.
// Fetched at build and revalidated daily. On any failure the caller gets
// null and shows no graph rather than a made-up one.

export const SKILLS_GRAPH_URL = "https://raw.githubusercontent.com/armaan-k019/ark-skills/main/viz/data/graph.json";
export const SKILLS_REPO_URL = "https://github.com/armaan-k019/ark-skills";

export type SkillKind = "skill" | "agent" | "hook";

// One luminous color per family, used by the graph and the index alike.
// Families ark-skills adds later take the next unused color in FALLBACK.
const FAMILY_COLOR: Record<string, string> = {
  "build-discipline": "#7DD3FC",
  "review-and-honesty": "#C4B5FD",
  research: "#5EEAD4",
  "skill-management": "#FDA4AF",
  domain: "#F0ABFC",
  vendored: "#94A3B8",
  agents: "#F5B342",
  hooks: "#4ADE80",
};
const FALLBACK = ["#93C5FD", "#FCA5A5", "#A5B4FC", "#FDE68A", "#99F6E4", "#D8B4FE"];

export interface SkillNode {
  id: string;
  kind: SkillKind;
  name: string;
  family: string;
  color: string;
  description: string | null;
  path: string;
  lines: number;
  vendored: boolean;
  evalStatus: string | null;
}

export interface SkillEdge {
  source: string;
  target: string;
  kind: string;
}

export interface SkillFamily {
  id: string;
  label: string;
  color: string;
}

export interface SkillGraph {
  families: SkillFamily[];
  nodes: SkillNode[];
  edges: SkillEdge[];
}

const KINDS = new Set<SkillKind>(["skill", "agent", "hook"]);

// graph.json is untrusted input to this site: every field is checked and
// anything malformed is dropped, never guessed.
function parse(g: unknown): SkillGraph | null {
  if (!g || typeof g !== "object") return null;
  const raw = g as { families?: unknown; nodes?: unknown; edges?: unknown };
  if (!Array.isArray(raw.families) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);

  const families: SkillFamily[] = [];
  let spare = 0;
  for (const f of raw.families as Record<string, unknown>[]) {
    const id = str(f?.id);
    if (id) families.push({ id, label: str(f.label) ?? id, color: FAMILY_COLOR[id] ?? FALLBACK[spare++ % FALLBACK.length] });
  }
  const familyIds = new Set(families.map((f) => f.id));
  const colorOf = new Map(families.map((f) => [f.id, f.color]));

  const nodes: SkillNode[] = [];
  for (const n of raw.nodes as Record<string, unknown>[]) {
    const id = str(n?.id);
    const kind = str(n?.kind) as SkillKind | null;
    const family = str(n?.family);
    if (!id || !kind || !KINDS.has(kind) || !family || !familyIds.has(family)) continue;
    nodes.push({
      id,
      kind,
      name: str(n.name) ?? id,
      family,
      color: colorOf.get(family)!,
      description: str(n.description),
      path: str(n.path) ?? "",
      lines: typeof n.lines === "number" && n.lines > 0 ? n.lines : 1,
      vendored: n.vendored === true,
      evalStatus: str(n.eval_status),
    });
  }
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: SkillEdge[] = [];
  for (const e of raw.edges as Record<string, unknown>[]) {
    const source = str(e?.source);
    const target = str(e?.target);
    if (source && target && source !== target && nodeIds.has(source) && nodeIds.has(target)) {
      edges.push({ source, target, kind: str(e.kind) ?? "" });
    }
  }

  // families with no members are left out of the drawing
  const used = new Set(nodes.map((n) => n.family));
  return { families: families.filter((f) => used.has(f.id)), nodes, edges };
}

export async function loadSkillGraph(revalidate = 86400): Promise<SkillGraph | null> {
  try {
    const res = await fetch(SKILLS_GRAPH_URL, { next: { revalidate } });
    if (!res.ok) return null;
    return parse(await res.json());
  } catch {
    return null;
  }
}
