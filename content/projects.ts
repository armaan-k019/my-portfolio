
export interface Project {
  slug: string;
  title: string;
  description: string;
  blurb: string;
  stack: string[];
  status?: "In Progress" | "Coming Soon";
  link?: string;
  github?: string;
}

export const projects: Project[] = [
  {
    slug: "archipedia",
    title: "Archipedia",
    blurb: "A multi-modal architectural precedent retrieval tool.",
    description: "Archipedia is a real-time architectural precedent search tool that combines patch-level visual embeddings, LLM-expanded metadata, and climate cues to surface nuanced design relationships beyond simple visual similarity. Built on a dataset of 9,800+ ArchDaily images, it enables designers to steer retrieval across visual, contextual, and geographic dimensions through an interactive interface.",
    stack: ["DINOv2", "Python", "Next.js", "LLM", "ArchDaily API"],
    link: "https://archipedia.ai",
  },
  {
    slug: "datum",
    title: "Datum",
    blurb: "An architectural site analysis sheet, drawn from public data and exported as layered vector.",
    description: "Enter an address, confirm the point on a map, and Datum draws a 36 by 24 inch site analysis sheet: figure ground, streets, and water from OpenStreetMap; a walk shed computed from that street network with 5, 10, and 15 minute bands; contours and two sections from USGS 3DEP; seismic design values from the USGS ASCE 7-22 service; soil from the USDA SSURGO survey; flood hazard polygons from the FEMA National Flood Hazard Layer; tract demographics from the Census ACS 5-year tables; and wind roses and monthly climate normals from the Open-Meteo ERA5 archive. The sun path is computed in the app from the NOAA solar position equations, with the archive supplying only the time zone the sun times are printed in. Every number traces to a named source and a named field, and a source that fails shows an unavailable panel with the reason rather than a default. Building heights print only where OpenStreetMap carries a height tag; nothing is inferred from floor counts. A Claude written brief cites the data field behind every claim and the citations are checked on the server. Export is true vector SVG with one named group per layer, so the sheet opens in Illustrator and Rhino as a tracing base.",
    stack: ["Next.js", "Supabase", "OpenStreetMap", "USGS", "FEMA", "Census ACS", "Open-Meteo", "Claude API", "SVG"],
  },
];
