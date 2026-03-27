export interface WorkEntry {
  name: string;
  logo: string;
  role: string;
  dates: string;
  bullets: string[];
  link?: string;
  cardBg?: string;
}

export const workEntries: WorkEntry[] = [
  {
    name: "Jeeves",
    logo: "/logos/jeeves.png",
    role: "AI Research Intern",
    dates: "Sep 2025 – Present",
    bullets: [
      "Building an interactive competitive intelligence agent used across internal teams to autonomously monitor competitor pricing, product changes, and market activity throughout the South American fintech space, at a Y Combinator-backed global fintech startup valued at $2.5 billion",
      "Designing the data pipeline for aggregating and synthesizing financial news into structured insights for internal strategy and product teams",
    ],
    link: "",
    cardBg: "#1a1a1a",
  },
  {
    name: "Shape Computation Lab",
    logo: "/logos/shape-computation-lab.png",
    role: "Undergraduate Research Assistant",
    dates: "May 2025 – Present",
    bullets: [
      "Assisting in researching real-world applications of the Shape Machine, a vector-based computational tool for finding and modifying shapes in CAD files for generative and iterative design",
      "Implementing and evaluating mode-seeking and clustering algorithms across vector-based geometric mediums including points, lines, and arcs",
      "Contributing to academic documentation and experimental workflows exploring computational approaches to architectural form-finding",
    ],
    link: "",
    cardBg: "#ffffff",
  },
  {
    name: "A.G. Rhodes Nursing Home",
    logo: "/logos/ag-rhodes.png",
    role: "Evidence Based Designer",
    dates: "Aug 2025 – Present",
    bullets: [
      "Conducting evidence-based research on the cognitive and emotional benefits of horticulture therapy for elderly nursing home residents",
      "Designing a dedicated therapeutic horticulture space optimized for sensory engagement, accessibility, and measurable resident wellbeing outcomes",
      "Translating research findings into spatial design decisions, bridging architecture and healthcare to improve quality of life",
    ],
    link: "",
    cardBg: "#ffffff",
  },
  {
    name: "Electrify GT",
    logo: "/logos/electrify-gt.png",
    role: "Project Lead",
    dates: "Sep 2025 – Present",
    bullets: [
      "Leading development of a Green Labs documentation standard, establishing guidelines for sustainable operational practices across Georgia Tech's campus buildings and research facilities",
      "Coordinating with campus stakeholders to identify high-impact areas for energy reduction, waste management, and material efficiency",
      "Creating a replicable framework designed to serve as a long-term sustainability guide adaptable to labs and facilities beyond Georgia Tech",
    ],
    link: "",
    cardBg: "#0a1628",
  },
  {
    name: "NCR Voyix",
    logo: "/logos/ncr-voyix.png",
    role: "Software Engineering Intern",
    dates: "Sep 2024 – May 2025",
    bullets: [
      "Trained a machine learning model for resource forecasting, applying architectural space-planning principles to project future workforce movement and company diversification",
      "Developed data preprocessing pipelines and evaluated model performance across multiple forecasting horizons",
      "Collaborated with internal teams to translate model outputs into actionable planning recommendations for leadership",
    ],
    link: "",
    cardBg: "#3d0066",
  },
  {
    name: "Sweet Frog",
    logo: "/logos/sweet-frog.png",
    role: "Assistant Manager",
    dates: "Jul 2022 – Aug 2024",
    bullets: [
      "Managed daily store operations, staff coordination, customer experience, and quality standards as Assistant Manager of a high-volume location",
      "Certified frozen yogurt enthusiast and self-proclaimed mixologist",
    ],
    link: "",
    cardBg: "#ffffff",
  },
];
