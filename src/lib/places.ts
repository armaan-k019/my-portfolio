// Where each experience, research item and project happened, for the redesign
// map (docs/redesign/DIRECTION.md). Place names come from the owner or the
// item's own text. Coordinates come from the Wikipedia API (prop=coordinates),
// fetched 2026-09-24; none are typed from memory. Precision says what the
// point stands for: a city centroid, a campus, or a specific facility.

export type Precision = "city" | "campus" | "facility";

export type Place =
  | {
      id: string;
      place: string;
      lat: number;
      lng: number;
      precision: Precision;
      source: string;
      role?: "study" | "presented";
    }
  | { id: string; place: "Remote"; remote: true };

const WIKI = "Wikipedia API prop=coordinates, 2026-09-24";

const NEW_YORK = { lat: 40.7128, lng: -74.0061, precision: "city", source: `${WIKI}: "New York City"` } as const;
const ATLANTA = { lat: 33.74888889, lng: -84.39, precision: "city", source: `${WIKI}: "Atlanta"` } as const;
const GEORGIA_TECH = { lat: 33.776, lng: -84.396, precision: "campus", source: `${WIKI}: "Georgia Tech"` } as const;
const ANNAPOLIS = { lat: 38.97305556, lng: -76.50111111, precision: "city", source: `${WIKI}: "Annapolis, Maryland"` } as const;
const AMHERST = { lat: 42.38333333, lng: -72.51666667, precision: "city", source: `${WIKI}: "Amherst, Massachusetts"` } as const;
const HSINCHU = { lat: 24.81666667, lng: 120.98333333, precision: "city", source: `${WIKI}: "Hsinchu"` } as const;

export const places: Place[] = [
  // Experience (content/work.ts, keyed by name)
  { id: "Rho", place: "New York, NY", ...NEW_YORK },
  { id: "Jeeves", place: "Remote", remote: true },
  { id: "NCR Voyix", place: "Atlanta, GA", ...ATLANTA },
  // agrhodes.org lists several facilities and the repo does not say which one,
  // so this is the city, not a facility.
  { id: "A.G. Rhodes Nursing Home", place: "Atlanta, GA", ...ATLANTA },
  { id: "Sweet Frog", place: "Annapolis, MD", ...ANNAPOLIS },
  { id: "AIAS", place: "Georgia Tech", ...GEORGIA_TECH },
  { id: "Shape Computation Lab", place: "Georgia Tech", ...GEORGIA_TECH },
  { id: "Electrify GT", place: "Georgia Tech", ...GEORGIA_TECH },
  { id: "TEAM Buzz", place: "Georgia Tech", ...GEORGIA_TECH },

  // Research (content/research/*.mdx, keyed by slug)
  { id: "plastic-panel-fabrication", place: "Georgia Tech", ...GEORGIA_TECH },
  { id: "shape-machine", place: "Georgia Tech", ...GEORGIA_TECH },
  // Study site is A.G. Rhodes (owner confirmed), same city caveat as above.
  { id: "designing-for-engagement-horticulture-therapy", place: "Atlanta, GA", ...ATLANTA, role: "study" },
  { id: "designing-for-engagement-horticulture-therapy", place: "Amherst, MA", ...AMHERST, role: "presented" },
  { id: "latent-maps-architectural-reasoning", place: "Hsinchu, Taiwan", ...HSINCHU, role: "presented" },

  // Projects (content/projects.ts, keyed by slug). Datum, Fine Print and
  // Yield are intentionally absent.
  // Owner stated Hsinchu, Taiwan on 2026-09-24. Hsinchu is also the CAADRIA
  // 2026 venue for the Archipedia paper; the owner's statement is the source.
  { id: "archipedia", place: "Hsinchu, Taiwan", ...HSINCHU },
];
