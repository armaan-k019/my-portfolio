
export interface Project {
  slug: string;
  title: string;
  description: string;
  blurb: string;
  stack: string[];
  status?: "In Progress" | "Coming Soon";
  link?: string;
  // A recorded demo shown beside the link, for when the live site is down.
  video?: { src: string; poster?: string };
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
    video: { src: "/projects/archipedia-demo.mp4", poster: "/projects/archipedia-demo-poster.jpg" },
  },
  {
    slug: "tidepool",
    title: "TidePool",
    blurb: "AI sound editing for video: split a clip's audio into layers and edit each sound on its own.",
    description: "TidePool separates the audio in a video into individual layers (dialogue, a barking dog, rain, music) so each sound can be edited on its own. Describe a change in plain language, click an object in the frame, or work directly on the timeline, then export as MP4, WAV or MP3. Vision models (YOLO for detection and tracking, SAM 3.1 for click selection) find what is on screen and when, and AudioSep isolates what it sounds like, returning a target and a residual that sum exactly to the original. Every edit is non-destructive, previewed before it is applied, and undoable.",
    stack: ["React", "Vite", "FastAPI", "AudioSep", "SAM 3.1", "YOLO", "Demucs", "FFmpeg"],
    link: "https://www.youtube.com/watch?v=FIcxfRrs-S8",
  },
  {
    slug: "datum",
    title: "Datum",
    blurb: "An architectural site analysis sheet, drawn from public data and exported as layered vector.",
    description: "Enter an address, confirm the point on a map, and Datum draws a 36 by 24 inch site analysis sheet: figure ground, streets, and water from OpenStreetMap; a walk shed computed from that street network with 5, 10, and 15 minute bands; contours and two sections from USGS 3DEP; seismic design values from the USGS ASCE 7-22 service; soil from the USDA SSURGO survey; flood hazard polygons from the FEMA National Flood Hazard Layer; tract demographics from the Census ACS 5-year tables; and wind roses and monthly climate normals from the Open-Meteo ERA5 archive. The sun path is computed in the app from the NOAA solar position equations, with the archive supplying only the time zone the sun times are printed in. Every number traces to a named source and a named field, and a source that fails shows an unavailable panel with the reason rather than a default. Building heights print only where OpenStreetMap carries a height tag; nothing is inferred from floor counts. A Claude written brief cites the data field behind every claim and the citations are checked on the server. Export is true vector SVG with one named group per layer, so the sheet opens in Illustrator and Rhino as a tracing base.",
    stack: ["Next.js", "Supabase", "OpenStreetMap", "USGS", "FEMA", "Census ACS", "Open-Meteo", "Claude API", "SVG"],
  },
  {
    slug: "options-consistency",
    title: "Options vs. Polymarket",
    blurb: "Do Polymarket BTC and ETH threshold contracts agree with the probabilities implied by Deribit options?",
    description: "A pre-registered study comparing Polymarket \"above $X at time T\" contracts with the probability implied by Deribit options for the same event: which is better calibrated against realized outcomes, where gaps concentrate, and whether any gap survives spread, fees and hedging cost. A live logger snapshots both venues every 60 seconds. The option side is Black-76 on an SVI smile, interpolated in total variance to the contract's resolution time, with the smile slope term in the digital probability. The hypotheses were committed before any code touched real outcomes, and the primary runs are registered for November 1 and December 1, 2026. No results yet.",
    stack: ["Python", "Black-76", "SVI", "Deribit", "Polymarket", "Parquet"],
    status: "In Progress",
  },
  {
    slug: "acoustic-form",
    title: "Acoustic Form",
    blurb: "A 3D acoustic simulation tool for architectural shapes.",
    description: "A browser-based tool that lets architects define a closed 3D shape by inputting vertices or describing it in natural language, then visualizes how sound waves propagate within that volume. Designed to give architects an intuitive, early-stage read on the acoustic behavior of a space before detailed modeling.",
    stack: ["Three.js", "Next.js", "Claude API"],
  },
];
