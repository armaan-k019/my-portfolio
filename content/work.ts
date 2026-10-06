// Summaries are kept in source but not shown on the site for now. Flip to true
// to show them again in the entry modal.
export const SHOW_WORK_SUMMARIES = false;

export interface WorkEntry {
  name: string;
  logo: string;
  role: string;
  dates: string;
  summary: string;
  link?: string;
  links?: { label: string; url: string }[];
  cardBg?: string;
  type?: "studentOrg" | "research" | "award";
}

export const workEntries: WorkEntry[] = [
  {
    name: "Rho",
    logo: "/logos/rho.png",
    role: "Engineering Intern",
    dates: "2026 – Present",
    summary: "Meter, AI native ATS: prototype to production across sourcing, scheduling, offer; headcount as a financial object: seats as budget lines, persistent IDs across backfills + promotions, vacancy ledger; interview panel scheduler against per interviewer availability; candidate synthesis engine: applications + interview feedback",
    link: "",
    cardBg: "#ffffff",
  },
  {
    name: "Jeeves",
    logo: "/logos/jeeves.png",
    role: "AI Research Engineering Intern",
    dates: "Sep 2025 – May 2026",
    summary: "competitive intelligence agent: autonomous monitoring of competitor pricing, product changes, market activity across North + South American fintech; AI first transformation: opportunity prototypes with the research team; prompt engineering, hypothesis driven experimentation, model fine tuning, transcription pipelines for internal AI services",
    link: "",
    cardBg: "#ffffff",
  },
  {
    name: "Shape Computation Lab",
    logo: "/logos/shape-computation-lab.png",
    role: "Undergraduate Research Assistant",
    dates: "May 2025 – Present",
    summary: "mode seeking algorithms, clustering across different vector based mediums: points, lines, arcs; scaling geometric deduplication: spatial indexing, union find clustering, perceptual tolerance metrics + evals",
    link: "",
    links: [
      { label: "Shape Computation Lab", url: "https://shape.gatech.edu/" },
      { label: "Shape Machine", url: "https://shapemachine.design.gatech.edu/" },
    ],
    cardBg: "#ffffff",
    type: "research",
  },
  {
    name: "A.G. Rhodes Nursing Home",
    logo: "/logos/ag-rhodes.png",
    role: "Evidence Based Designer",
    dates: "Aug 2025 – Jun 2026",
    summary: "evidence based research: cognitive + emotional benefits of horticulture therapy for elderly residents; therapeutic horticulture space: sensory engagement, accessibility, measurable wellbeing outcomes; research findings to spatial design decisions",
    link: "",
    cardBg: "#ffffff",
    type: "research",
  },
  {
    name: "TEAM Buzz",
    logo: "/logos/teambuzz.png",
    role: "Executive Board",
    dates: "Aug 2025 – Present",
    summary: "single day service event, one of the Southeast's largest: 1,500 to 2,000+ volunteers annually, 50+ Atlanta nonprofit partners; logistics + community outreach; 25+ year organization, Homecoming Week programming",
    link: "",
    cardBg: "#ffffff",
    type: "studentOrg",
  },
  {
    name: "GT Trading Club",
    logo: "/logos/gt-trading-club.png",
    role: "Quantitative Researcher",
    dates: "Nov 2025 – May 2026",
    summary: "risk neutral probabilities from the Deribit options surface: smile fitting, Breeden Litzenberger, digital pricing; cross asset consistency test against Polymarket BTC + ETH threshold contracts; calibration against realized outcomes, gaps across tails, horizons, liquidity, net of spreads, fees, hedging cost; reproducible repo, one command from raw data to every figure",
    link: "",
    cardBg: "#ffffff",
    type: "studentOrg",
  },
  {
    name: "Electrify GT",
    logo: "/logos/electrify-gt.png",
    role: "Project Lead",
    dates: "Sep 2025 – May 2026",
    summary: "Green Labs documentation standard: sustainable operations guidelines for campus buildings + research facilities; high impact areas with campus stakeholders: energy reduction, waste management, material efficiency; replicable framework adaptable beyond Georgia Tech",
    link: "",
    cardBg: "#ffffff",
    type: "studentOrg",
  },
  {
    name: "NCR Voyix",
    logo: "/logos/ncr-voyix.png",
    role: "Software Engineering Intern",
    dates: "Sep 2024 – May 2025",
    summary: "ML resource forecasting: workforce movement + company diversification via architectural space planning principles; data preprocessing pipelines; model evaluation across multiple forecasting horizons; model outputs to planning recommendations for leadership",
    link: "",
    cardBg: "#ffffff",
  },
  {
    name: "Sweet Frog",
    logo: "/logos/sweet-frog.png",
    role: "Assistant Manager",
    dates: "Jul 2022 – Aug 2024",
    summary: "daily store operations, staff coordination, customer experience, quality standards at a high volume location; certified frozen yogurt enthusiast, self proclaimed mixologist",
    link: "",
    cardBg: "#ffffff",
  },
  {
    name: "AIAS",
    logo: "/logos/aias.png",
    role: "Liaison (1st yr) → Secretary (2nd yr)",
    dates: "Aug 2024 – May 2026",
    summary: "chapter operations + communication channels; studio programming recommendations; liaison to secretary across two years",
    link: "",
    cardBg: "#ffffff",
    type: "studentOrg",
  },
];
