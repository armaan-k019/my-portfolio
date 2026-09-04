export const maxDuration = 30;

interface Precedent {
  name: string;
  architect: string;
  year: string;
  location: string;
  why: string;
  steal: string;
}

interface Bubble {
  label: string;
  x: number;
  y: number;
  r: number;
}

interface IllocaResult {
  precedents: Precedent[];
  synthesis: {
    narrative: string;
    bubbles: Bubble[];
  };
}

// Phase A stub: the same three canonical precedents regardless of the brief.
// TODO(phase-b): wire real Anthropic call here. Select precedents against the
// brief from a grounded library, verify architect, year, and location, and
// generate the bubble diagram from the synthesized moves.
const STUB: IllocaResult = {
  precedents: [
    {
      name: "Salk Institute",
      architect: "Louis Kahn",
      year: "1965",
      location: "La Jolla, California",
      why: "Two wings of served rooms flank an empty court, and the emptiness is the point. It shows how a tight program can still give away its best space to the public.",
      steal: "Hold the center open. Put the rooms on the edges and let the void between them be the generous gesture.",
    },
    {
      name: "Yokohama International Port Terminal",
      architect: "Foreign Office Architects",
      year: "2002",
      location: "Yokohama, Japan",
      why: "The roof is the building. Circulation, landscape, and structure fold into one continuous surface, so the public realm never stops at the door.",
      steal: "Make the threshold a ramp, not a line. A floor that rises into a roof lets the street continue inside without a lobby.",
    },
    {
      name: "Therme Vals",
      architect: "Peter Zumthor",
      year: "1996",
      location: "Vals, Switzerland",
      why: "Light enters through narrow slots between stone volumes, so the darkest rooms feel the most calm. Quiet is made with mass and controlled openings, not with silence.",
      steal: "Bring light in from above through slots, not through the facade. On a north lot that is how a reading room gets both quiet and daylight.",
    },
  ],
  synthesis: {
    narrative:
      "Start with a solid mass at the back of the lot holding the reading room, lit from above through slots in the Vals manner. Peel the community room off the front and drop it a half level, so the street can ramp into it after hours as at Yokohama. Between the two, leave a court open to the sky, the Salk move, and let the children's area borrow it. Four rooms, one void, one ramp.",
    bubbles: [
      { label: "reading", x: 130, y: 60, r: 38 },
      { label: "court", x: 100, y: 118, r: 26 },
      { label: "children", x: 48, y: 90, r: 28 },
      { label: "community", x: 70, y: 160, r: 30 },
      { label: "street", x: 150, y: 165, r: 20 },
    ],
  },
};

export async function POST(request: Request) {
  try {
    await request.json();
    return Response.json({ result: STUB });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
