// The public demo cards on /demos. This list, not src/lib/demos.ts, decides
// what is listed publicly. The site guide reads it too.
export interface DemoCard {
  slug: string;
  company: string;
  headline: string;
  pitch: string;
  url: string;
}

export const demoCards: DemoCard[] = [
  {
    slug: "illoca",
    company: "Illoca",
    headline: "The Precedent Interpreter",
    pitch: "Describe a project and get three precedent buildings, what to steal from each, and a first bubble diagram to start from.",
    url: "/demos/illoca",
  },
  {
    slug: "rho",
    company: "Rho",
    headline: "Drift Detection + Candidate Trajectory",
    pitch: "Two builds for Rho: spend anomaly detection for finance teams, and a hiring lens that plots candidates by trajectory and audits their claims against corroborating evidence.",
    url: "/demos/rho",
  },
  {
    slug: "midjourney",
    company: "Midjourney",
    headline: "Prompt Autopsy + 3D Parallax",
    pitch: "Paste any Midjourney prompt and image URL. Get a full token-by-token autopsy, a reusable style DNA block, and a live 3D parallax scene reconstructed from your image.",
    url: "/demos/midjourney",
  },
  {
    slug: "clay",
    company: "Clay",
    headline: "The Commons: cold email when personalization is free",
    pitch: "An agent-based simulation of 1,200 prospects and 48 sellers. Set the price of looking personal and the price of knowing whom to write to, and watch where the channel holds and where it fails.",
    url: "/demos/clay",
  },
];
