// ============================================================================
// THE LATENT ATLAS: single source of truth.
// ============================================================================
// Every location in the site (pages, projects, demos, research, photography
// stations, experience) lives at one position in a 2D latent space. Display
// coordinates, region membership, and cross references are all derived here.
// No coordinate is hardcoded anywhere else. Change a value here and every
// appearance on the site updates.
//
// Positions are hand tuned now (region centers plus a deterministic scatter).
// They can be replaced later by real embeddings (project text run through a
// sentence model and projected with UMAP or t-SNE) via withEmbedding().

// ----------------------------------------------------------------------------
// Regions: five canonical territories. Color and glyph are dual encoded so
// region is never signalled by color alone (accessibility).
// ----------------------------------------------------------------------------
export type RegionId = "DESIGN" | "ARCHITECTURE" | "RESEARCH" | "SYSTEMS" | "FIELD";

export interface Region {
  id: RegionId;
  name: string;
  color: string;   // "r,g,b", shared by the map, legend, and contour dividers
  glyph: string;   // distinct shape per region
  note: string;    // one line of marginalia
  center: { x: number; y: number };
  labelPos: { x: number; y: number };
}

export const REGIONS: Record<RegionId, Region> = {
  DESIGN: {
    id: "DESIGN", name: "Design", color: "184,134,42", glyph: "◆",
    note: "Where design and computation meet.",
    center: { x: 0.36, y: 0.42 }, labelPos: { x: 0.36, y: 0.30 },
  },
  ARCHITECTURE: {
    id: "ARCHITECTURE", name: "Architecture", color: "44,62,80", glyph: "▲",
    note: "Built space, material, and memory.",
    center: { x: 0.24, y: 0.70 }, labelPos: { x: 0.24, y: 0.58 },
  },
  RESEARCH: {
    id: "RESEARCH", name: "Research", color: "62,86,65", glyph: "■",
    note: "Peer reviewed and in progress inquiry.",
    center: { x: 0.52, y: 0.18 }, labelPos: { x: 0.52, y: 0.07 },
  },
  SYSTEMS: {
    id: "SYSTEMS", name: "Systems", color: "160,82,45", glyph: "●",
    note: "Software, data, and machine learning.",
    center: { x: 0.74, y: 0.44 }, labelPos: { x: 0.74, y: 0.32 },
  },
  FIELD: {
    id: "FIELD", name: "Field", color: "45,95,93", glyph: "✦",
    note: "Surveyed on foot. Photography and expeditions.",
    center: { x: 0.72, y: 0.78 }, labelPos: { x: 0.72, y: 0.90 },
  },
};

export const REGION_ORDER: RegionId[] = ["DESIGN", "ARCHITECTURE", "RESEARCH", "SYSTEMS", "FIELD"];

// ----------------------------------------------------------------------------
// Location types and the raw, hand authored records.
// ----------------------------------------------------------------------------
export type LocationType = "page" | "project" | "demo" | "research" | "field" | "experience";

interface RawLocation {
  id: string;
  title: string;
  type: LocationType;
  region: RegionId;
  route?: string;          // internal navigation target (omit for non navigable points)
  externalLink?: string;   // opens off site
  secondary?: RegionId[];  // faint secondary affinity halos on the map
  date?: string;           // last surveyed, field report flavor
  related?: string[];      // cross reference location ids
}

const RAW: RawLocation[] = [
  // -- Pages (the master locations) -----------------------------------------
  { id: "page-home", title: "Basecamp", type: "page", region: "DESIGN", route: "/", date: "2026.06" },
  { id: "page-projects", title: "Selected Works", type: "page", region: "DESIGN", route: "/#projects", date: "2026.05" },
  { id: "page-research", title: "Research and Publications", type: "page", region: "RESEARCH", route: "/#research", date: "2026.05" },
  { id: "page-demos", title: "Field Stations", type: "page", region: "SYSTEMS", route: "/demos", date: "2026.05" },
  { id: "page-photography", title: "Field Survey", type: "page", region: "FIELD", route: "/photography", date: "2026.05" },
  { id: "page-blog", title: "Field Notes", type: "page", region: "RESEARCH", route: "/blog", secondary: ["DESIGN"], date: "2026.04" },

  // -- Projects (from content/projects.ts) ----------------------------------
  { id: "edo-commons", title: "Guest People", type: "project", region: "ARCHITECTURE", route: "/projects/edo-commons", date: "2025.11", related: ["intersecting-realms"] },
  { id: "intersecting-realms", title: "Intersecting Realms", type: "project", region: "ARCHITECTURE", route: "/projects/intersecting-realms", date: "2025.12", related: ["shape-machine", "exp-shape-computation-lab"] },
  { id: "framed", title: "Framed", type: "project", region: "ARCHITECTURE", route: "/projects/framed", date: "2026.03", related: ["exp-ag-rhodes"] },
  { id: "archipedia", title: "Archipedia", type: "project", region: "DESIGN", route: "/projects/archipedia", externalLink: "https://archipedia.ai", secondary: ["ARCHITECTURE", "SYSTEMS"], date: "2026.04", related: ["latent-maps-architectural-reasoning", "urban-gpt"] },
  { id: "urban-gpt", title: "UrbanGPT", type: "project", region: "DESIGN", route: "/projects/urban-gpt", secondary: ["SYSTEMS"], date: "2026.02", related: ["archipedia", "carbon-lens", "pulse"] },
  { id: "acoustic-form", title: "Acoustic Form", type: "project", region: "DESIGN", route: "/projects/acoustic-form", secondary: ["ARCHITECTURE", "SYSTEMS"], date: "2026.01", related: ["carbon-lens"] },
  { id: "pulse", title: "Pulse", type: "project", region: "SYSTEMS", route: "/projects/pulse", secondary: ["FIELD"], date: "2026.03", related: ["urban-gpt"] },
  { id: "carbon-lens", title: "Carbon Lens", type: "project", region: "SYSTEMS", route: "/projects/carbon-lens", secondary: ["ARCHITECTURE"], date: "2026.02", related: ["urban-gpt", "acoustic-form", "plastic-panel-fabrication"] },

  // -- Demos (company field stations) ---------------------------------------
  { id: "rho", title: "Drift Detection", type: "demo", region: "SYSTEMS", route: "/demos/rho", date: "2026.01" },
  { id: "athena-hq", title: "GEO Visibility Checker", type: "demo", region: "SYSTEMS", route: "/demos/athena-hq", date: "2026.02" },
  { id: "whop", title: "Page Roaster", type: "demo", region: "SYSTEMS", route: "/demos/whop", date: "2026.02" },
  { id: "sideshift", title: "Swap Route Optimizer", type: "demo", region: "SYSTEMS", route: "/demos/sideshift", date: "2026.03" },
  { id: "wisprflow", title: "ASL to Voice", type: "demo", region: "SYSTEMS", route: "/demos/wisprflow", secondary: ["DESIGN"], date: "2026.03" },
  { id: "midjourney", title: "Prompt Autopsy", type: "demo", region: "SYSTEMS", route: "/demos/midjourney", secondary: ["DESIGN"], date: "2026.04" },

  // -- Research (from content/research) --------------------------------------
  { id: "shape-machine", title: "The Shape Machine", type: "research", region: "RESEARCH", route: "/research/shape-machine", secondary: ["DESIGN"], date: "2025.10", related: ["exp-shape-computation-lab", "intersecting-realms"] },
  { id: "latent-maps-architectural-reasoning", title: "Latent Maps for Architectural Reasoning", type: "research", region: "RESEARCH", route: "/research/latent-maps-architectural-reasoning", secondary: ["DESIGN", "SYSTEMS"], date: "2026.01", related: ["archipedia"] },
  { id: "designing-for-engagement-horticulture-therapy", title: "Designing for Engagement", type: "research", region: "RESEARCH", route: "/research/designing-for-engagement-horticulture-therapy", secondary: ["ARCHITECTURE"], date: "2025.12", related: ["exp-ag-rhodes"] },
  { id: "plastic-panel-fabrication", title: "Plastic Panel Fabrication", type: "research", region: "RESEARCH", route: "/research/plastic-panel-fabrication", secondary: ["ARCHITECTURE"], date: "2025.11", related: ["carbon-lens", "exp-electrify-gt"] },

  // -- Photography stations (from content/photos.ts) -------------------------
  { id: "field-taiwan", title: "Taiwan", type: "field", region: "FIELD", route: "/photography", date: "2025.07" },
  { id: "field-amsterdam", title: "Amsterdam", type: "field", region: "FIELD", route: "/photography", date: "2025.06" },
  { id: "field-iceland", title: "Iceland", type: "field", region: "FIELD", route: "/photography", date: "2024.08" },
  { id: "field-usa", title: "USA", type: "field", region: "FIELD", route: "/photography", date: "2025.03" },
  { id: "field-london", title: "London", type: "field", region: "FIELD", route: "/photography", date: "2024.12" },
  { id: "field-switzerland", title: "Switzerland", type: "field", region: "FIELD", route: "/photography", date: "2024.08" },
  { id: "field-spain", title: "Spain", type: "field", region: "FIELD", route: "/photography", date: "2025.01" },
  { id: "field-turkey", title: "Turkey", type: "field", region: "FIELD", route: "/photography", date: "2025.05" },
  { id: "field-india", title: "India", type: "field", region: "FIELD", route: "/photography", date: "2024.06" },

  // -- Experience (from content/work.ts) -------------------------------------
  { id: "exp-jeeves", title: "Jeeves", type: "experience", region: "SYSTEMS", route: "/#work", date: "2025.09", related: ["rho"] },
  { id: "exp-shape-computation-lab", title: "Shape Computation Lab", type: "experience", region: "RESEARCH", route: "/#work", secondary: ["DESIGN"], date: "2025.05", related: ["shape-machine", "intersecting-realms"] },
  { id: "exp-ag-rhodes", title: "A.G. Rhodes", type: "experience", region: "ARCHITECTURE", route: "/#work", secondary: ["RESEARCH"], date: "2025.08", related: ["designing-for-engagement-horticulture-therapy", "framed"] },
  { id: "exp-electrify-gt", title: "Electrify GT", type: "experience", region: "SYSTEMS", route: "/#work", secondary: ["ARCHITECTURE"], date: "2025.09", related: ["plastic-panel-fabrication"] },
  { id: "exp-ncr-voyix", title: "NCR Voyix", type: "experience", region: "SYSTEMS", route: "/#work", date: "2024.09" },
  { id: "exp-sweet-frog", title: "Sweet Frog", type: "experience", region: "FIELD", route: "/#work", date: "2022.07" },
  { id: "exp-aias", title: "AIAS", type: "experience", region: "ARCHITECTURE", route: "/#work", date: "2024.08" },
  { id: "exp-team-buzz", title: "TEAM Buzz", type: "experience", region: "FIELD", route: "/#work", secondary: ["DESIGN"], date: "2025.08" },
];

// ----------------------------------------------------------------------------
// Derivation.
// ----------------------------------------------------------------------------
export interface AtlasLocation extends RawLocation {
  x: number;            // latent position, [0,1]
  y: number;
  lat: number;          // derived display coordinate
  lng: number;
  coord: string;        // "33.7490°N 84.3880°W"
}

const SCATTER = 0.12;   // cluster radius around a region center

// Deterministic two channel hash so positions are stable across renders.
function hash2(s: string): [number, number] {
  let h1 = 2166136261, h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return [(h1 % 1000) / 1000, (h2 % 997) / 997];
}

const clamp01 = (v: number) => Math.max(0.05, Math.min(0.95, v));

// x,y in [0,1] mapped to a small box around Atlanta so coordinates read real
// and every location is distinct. Deterministic.
export function toGeoCoord(x: number, y: number): { lat: number; lng: number } {
  return { lat: 33.8 - y * 0.11, lng: -(84.33 + x * 0.12) };
}

export function formatCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns} ${Math.abs(lng).toFixed(4)}°${ew}`;
}

// A position source: maps location id to a latent (x,y). When absent, positions
// derive from region center plus deterministic scatter. A future embedding pass
// (sentence embeddings projected with UMAP or t-SNE) supplies this map instead.
export type EmbeddingSource = Record<string, [number, number]>;

export function withEmbedding(source?: EmbeddingSource): AtlasLocation[] {
  return RAW.map((raw) => {
    let x: number, y: number;
    const fromEmbedding = source?.[raw.id];
    if (fromEmbedding) {
      [x, y] = fromEmbedding;
    } else {
      const c = REGIONS[raw.region].center;
      const [h1, h2] = hash2(raw.id);
      x = clamp01(c.x + (h1 * 2 - 1) * SCATTER);
      y = clamp01(c.y + (h2 * 2 - 1) * SCATTER);
    }
    const { lat, lng } = toGeoCoord(x, y);
    return { ...raw, x, y, lat, lng, coord: formatCoord(lat, lng) };
  });
}

// The default Atlas: hand tuned positions.
export const LOCATIONS: AtlasLocation[] = withEmbedding();

const BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));
const BY_ROUTE = new Map(LOCATIONS.filter((l) => l.route).map((l) => [l.route as string, l]));

export function locationById(id: string): AtlasLocation | undefined {
  return BY_ID.get(id);
}

// Resolve a Next pathname to its Atlas location. Hash and query are ignored, so
// /projects/framed resolves even though the data route may carry a section hash.
export function locationByRoute(pathname: string): AtlasLocation | undefined {
  const clean = pathname.split(/[?#]/)[0] || "/";
  if (BY_ROUTE.has(clean)) return BY_ROUTE.get(clean);
  if (BY_ROUTE.has(pathname)) return BY_ROUTE.get(pathname);
  return BY_ROUTE.get("/"); // fall back to basecamp
}

export function regionMembers(region: RegionId): AtlasLocation[] {
  return LOCATIONS.filter((l) => l.region === region);
}

// Nearest neighbours in latent space, for cross reference fallbacks and the
// "adjacent work" sidebars. Euclidean on (x,y).
export function nearest(id: string, k = 4): AtlasLocation[] {
  const self = BY_ID.get(id);
  if (!self) return [];
  return LOCATIONS
    .filter((l) => l.id !== id)
    .map((l) => ({ l, d: Math.hypot(l.x - self.x, l.y - self.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((e) => e.l);
}

// Explicit cross references declared in the data, resolved to locations.
export function relatedLocations(id: string): AtlasLocation[] {
  const self = BY_ID.get(id);
  if (!self?.related) return [];
  return self.related.map((r) => BY_ID.get(r)).filter((l): l is AtlasLocation => !!l);
}
