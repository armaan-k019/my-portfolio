export const maxDuration = 30;

interface SpatialDNA {
  materiality: string;
  scale: string;
  light: string;
  mood: string;
  composition: string;
  temperature: string;
  summary: string;
  annotations: { element: string; why: string }[];
}

// Phase A stubs, one per preloaded passage, plus a generic reading for pasted text.
const STUBS: Record<string, SpatialDNA> = {
  library: {
    materiality: "Timber shelving, worn paper, a stone floor; surfaces that absorb rather than reflect.",
    scale: "Rooms sized to a person but repeated without end; intimate cell, infinite field.",
    light: "One hanging lamp per gallery, dim and constant, no daylight anywhere.",
    mood: "Reverent and slightly oppressive; order that never resolves.",
    composition: "Hexagonal cells tiled in every direction, a spiral stair threading vertically.",
    temperature: "Cool and still, the air of a place that has never been outside.",
    summary: "A single hexagonal room, rendered so precisely that its repetition implies the rest.",
    annotations: [
      { element: "Hexagonal plan", why: "The passage names six sides and six openings; the plan is literal." },
      { element: "Shelves on five walls", why: "Five walls of books, the sixth reserved for the stair and passage." },
      { element: "Insufficient lamp", why: "The text calls the light insufficient and unceasing, so it is dim and never off." },
      { element: "Stair past sight", why: "The spiral is modeled to vanish above and below the visible range." },
    ],
  },
  home: {
    materiality: "Linoleum, painted plaster the color of weak tea, soft wood; domestic and worn.",
    scale: "Small and low; ceilings a tall adult has to duck under, a kitchen that the whole house leans toward.",
    light: "Late afternoon from a single west window, one long warm rectangle on the floor.",
    mood: "Warm, safe, faintly nostalgic.",
    composition: "Compact rooms gathered around the kitchen as the gravitational center.",
    temperature: "Warm, the warmest room in the house.",
    summary: "A low, tea colored kitchen with one western window, built small on purpose.",
    annotations: [
      { element: "Low ceiling", why: "The father ducks in the doorway; head height is set just under his." },
      { element: "West window", why: "The only named light source, placed so the afternoon rectangle lands on the floor." },
      { element: "Tea colored walls", why: "The passage gives the color directly." },
      { element: "Kitchen at center", why: "The house leans toward it, so adjacent rooms open onto it." },
    ],
  },
  stanza: {
    materiality: "Stone paving, a bare black tree, a wide gray ground with no edge.",
    scale: "A courtyard open to a sky that feels close; one tree at human scale in a vast field.",
    light: "Evening, gray and directionless, lowering.",
    mood: "Hushed, expectant, tender.",
    composition: "A single vertical at the exact center of an unbounded horizontal.",
    temperature: "Cool, late, the chill that arrives as light leaves.",
    summary: "One tree in a gray courtyard under a sky that is coming down slowly.",
    annotations: [
      { element: "Centered tree", why: "The stanza places the tree at the center of a gray without edge." },
      { element: "Edgeless ground", why: "The gray has no edge, so the courtyard floor fades rather than ends." },
      { element: "Lowering sky", why: "The sky descends like a hand on a shoulder; the ceiling of the world is set low and soft." },
    ],
  },
};

const GENERIC: SpatialDNA = {
  materiality: "Read from the passage in Phase B.",
  scale: "Read from the passage in Phase B.",
  light: "Read from the passage in Phase B.",
  mood: "Read from the passage in Phase B.",
  composition: "Read from the passage in Phase B.",
  temperature: "Read from the passage in Phase B.",
  summary: "Custom passages get a live Claude reading in Phase B. This is a placeholder.",
  annotations: [{ element: "Placeholder", why: "Annotations for pasted text arrive with the live extraction." }],
};

// TODO(phase-b): wire real Anthropic call here. The prompt should return the six
// axes plus annotations that quote the passage, for any text, not only the presets.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { passageId?: string | null; text?: string };
    const result = (body.passageId && STUBS[body.passageId]) || GENERIC;
    return Response.json({ result });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
