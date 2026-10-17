// The Workflow tile's backdrop: the real ark-skills graph (viz/data/graph.json,
// fetched at build), one cluster per family, colored by kind as the ark-skills
// viz page colors them. Edges brighten when the tile is hovered.

export interface SkillsGraphData {
  families: string[];
  nodes: { id: string; kind: string; family: string; lines: number }[];
  edges: { source: string; target: string }[];
}

const KIND_COLOR: Record<string, string> = {
  skill: "#64748b",
  agent: "#f59e0b",
  hook: "#16a34a",
};
const W = 300, H = 300, COLS = 3;

function layout(data: SkillsGraphData) {
  const rows = Math.ceil(data.families.length / COLS);
  const pos = new Map<string, { x: number; y: number; r: number }>();
  const labels = data.families.map((family, i) => {
    const cx = (W / COLS) * (i % COLS + 0.5);
    const cy = (H / rows) * (Math.floor(i / COLS) + 0.5);
    const members = data.nodes.filter((n) => n.family === family);
    const ring = members.length > 1 ? 14 + members.length * 3 : 0;
    members.forEach((n, j) => {
      const a = (j / members.length) * Math.PI * 2 - Math.PI / 2;
      pos.set(n.id, {
        x: cx + Math.cos(a) * ring,
        y: cy + Math.sin(a) * ring,
        r: Math.min(7, 1.5 + Math.sqrt(n.lines) / 3),
      });
    });
    return { family, x: cx, y: cy + ring + 14 };
  });
  return { pos, labels };
}

export default function SkillsGraph({ data }: { data: SkillsGraphData }) {
  const { pos, labels } = layout(data);
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full p-[8%] pb-[26%]">
      <g className="opacity-25 group-hover:opacity-70 transition-opacity duration-500">
        {data.edges.map((e) => {
          const a = pos.get(e.source), b = pos.get(e.target);
          if (!a || !b) return null;
          return <line key={`${e.source}>${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth="0.6" />;
        })}
      </g>
      {data.nodes.map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        return <circle key={n.id} cx={p.x} cy={p.y} r={p.r} fill={KIND_COLOR[n.kind] ?? KIND_COLOR.skill} />;
      })}
      {labels.map((l) => (
        <text key={l.family} x={l.x} y={l.y} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="6" letterSpacing="0.8" fill="#6b7280">
          {l.family.toUpperCase()}
        </text>
      ))}
    </svg>
  );
}
