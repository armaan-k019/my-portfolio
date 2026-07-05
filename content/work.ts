export interface WorkEntry {
  name: string;
  logo: string;
  role: string;
  dates: string;
  bullets: string[];
  link?: string;
  cardBg?: string;
  type?: "studentOrg";
}

export const workEntries: WorkEntry[] = [
  {
    name: "Rho",
    logo: "/logos/rho.png",
    role: "Engineering Intern",
    dates: "2026 – Present",
    bullets: [
      "Current role. More details to come.",
    ],
    link: "",
    cardBg: "#ffffff",
  },
  {
    name: "Jeeves",
    logo: "/logos/jeeves.png",
    role: "AI Research Engineering Intern",
    dates: "Sep 2025 – May 2026",
    bullets: [
      "Building an interactive competitive intelligence agent used across internal teams to autonomously monitor competitor pricing, product changes, and market activity throughout North and South American fintech spaces, at a Y Combinator-backed global fintech startup valued at $2.5 billion",
      "Driving the firm's AI-first transformation as a research intern, working directly with the research team to identify and prototype the highest-leverage opportunities for embedding AI across one of the most forward-thinking international fintechs",
      "Reclaiming engineering and operator hours through prompt engineering, hypothesis-driven experimentation, model fine-tuning, and improving transcription pipelines for internal AI services",
    ],
    link: "",
    cardBg: "#ffffff",
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
    dates: "Aug 2025 – Jun 2026",
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
    dates: "Sep 2025 – May 2026",
    bullets: [
      "Leading development of a Green Labs documentation standard, establishing guidelines for sustainable operational practices across Georgia Tech's campus buildings and research facilities",
      "Coordinating with campus stakeholders to identify high-impact areas for energy reduction, waste management, and material efficiency",
      "Creating a replicable framework designed to serve as a long-term sustainability guide adaptable to labs and facilities beyond Georgia Tech",
    ],
    link: "",
    cardBg: "#ffffff",
    type: "studentOrg",
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
    cardBg: "#ffffff",
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
  {
    name: "AIAS",
    logo: "/logos/aias.png",
    role: "Liaison (1st yr) → Secretary (2nd yr)",
    dates: "Aug 2024 – May 2026",
    bullets: [
      "Represent studio interests in executive board meetings, contributing to strategic decisions that align organizational initiatives with design and academic objectives",
      "Coordinate and streamline communication channels between leadership and stakeholders, supporting the execution of AIAS events and initiatives",
      "Advise on studio-related operations, providing actionable recommendations that enhance workflows and promote engagement with architectural programming",
    ],
    link: "",
    cardBg: "#ffffff",
    type: "studentOrg",
  },
  {
    name: "TEAM Buzz",
    logo: "/logos/teambuzz.png",
    role: "Executive Board",
    dates: "Aug 2025 – Present",
    bullets: [
      "Contribute to organizing one of the largest single-day service events in the Southeastern United States, mobilizing 1,500–2,000+ volunteers annually across 50+ Atlanta non-profit partners",
      "Support operations of a 25+ year legacy organization recognized as a cornerstone of Georgia Tech's campus leadership and annual Homecoming Week programming",
      "Coordinate logistics and community outreach efforts that connect the Georgia Tech community with the greater Atlanta area",
    ],
    link: "",
    cardBg: "#ffffff",
    type: "studentOrg",
  },
];
