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
  {
    slug: "warp",
    company: "Warp",
    headline: "Agent Run Reviewer",
    pitch: "Paste a coding agent's terminal session. Fixed rules mark risky steps like force pushes and skipped tests, then Claude checks the agent's final claim against the evidence.",
    url: "/demos/warp",
  },
  {
    slug: "dlr",
    company: "DLR",
    headline: "Reward Hack Probe",
    pitch: "Sample agent rollouts for one coding task run in your browser against a naive grader and a hardened one. Claude reads the reward gap and says which rollouts solved the task and which gamed it.",
    url: "/demos/dlr",
  },  {
    slug: "harmonic",
    company: "Harmonic",
    headline: "Conjecture vs Counterexample",
    pitch: "Claude proposes conjectures about an integer sequence, and a brute-force search in your browser hunts for the first case that breaks each one. Evidence, not proof: it does not run Lean.",
    url: "/demos/harmonic",
  },
  {
    slug: "thinking-machines",
    company: "Thinking Machines",
    headline: "Nondeterminism Probe",
    pitch: "A float32 split-K matmul in your browser shows how batch size, set by server load, flips a temperature 0 token. Claude explains the divergence and what a batch-invariant kernel costs.",
    url: "/demos/thinking-machines",
  },
];
