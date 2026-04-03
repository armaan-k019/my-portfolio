// Canonical GT campus location data - single source of truth for coordinates.
// Import from here in both the API route and the map page so pins, heatmap,
// and circles are always consistent.

export interface LocationMeta {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Physical footprint radius in metres - drives the circles layer size. */
  physicalRadius: number;
}

export const LOCATION_META: LocationMeta[] = [
  // ── Dining ──────────────────────────────────────────────────────────────────
  // CFA and Panda share the Student Center; offset by ±0.0002° lng so pins
  // don't stack on top of each other.
  { id: 'chick_fil_a',    name: 'Chick-fil-A',          lat: 33.7748, lng: -84.3963, physicalRadius: 25 },
  { id: 'panda',          name: 'Panda Express',         lat: 33.7748, lng: -84.3961, physicalRadius: 25 },
  { id: 'north_ave',      name: 'North Ave Dining',      lat: 33.7721, lng: -84.3902, physicalRadius: 55 },
  { id: 'west_village',   name: 'West Village Dining',   lat: 33.7694, lng: -84.3956, physicalRadius: 55 },

  // ── Recreation ───────────────────────────────────────────────────────────────
  { id: 'crc',            name: 'Campus Rec Center',     lat: 33.7769, lng: -84.4039, physicalRadius: 90 },

  // ── Academic / study ─────────────────────────────────────────────────────────
  { id: 'clough',         name: 'Clough / CULC',         lat: 33.7757, lng: -84.3963, physicalRadius: 45 },
  { id: 'klaus',          name: 'Klaus (CS)',             lat: 33.7775, lng: -84.3958, physicalRadius: 38 },
  { id: 'van_leer',       name: 'Van Leer',               lat: 33.7764, lng: -84.4006, physicalRadius: 35 },
  { id: 'skiles',         name: 'Skiles',                 lat: 33.7742, lng: -84.3964, physicalRadius: 32 },
  { id: 'boggs',          name: 'Boggs Chemistry',        lat: 33.7771, lng: -84.3998, physicalRadius: 32 },
  { id: 'mason',          name: 'Mason',                  lat: 33.7756, lng: -84.3940, physicalRadius: 30 },
  { id: 'design',         name: 'College of Design',      lat: 33.7763, lng: -84.3939, physicalRadius: 30 },
  { id: 'tech_tower',     name: 'Tech Tower',             lat: 33.7756, lng: -84.3963, physicalRadius: 22 },
  // Student Center offset slightly from CFA/Panda so the pin is distinct
  { id: 'student_center', name: 'Student Center',         lat: 33.7748, lng: -84.3965, physicalRadius: 45 },

  // ── Outdoor ──────────────────────────────────────────────────────────────────
  { id: 'tech_green',     name: 'Tech Green',             lat: 33.7751, lng: -84.3963, physicalRadius: 70 },
];

/** Quick lookup: id → LocationMeta */
export const LOCATION_META_MAP: Readonly<Record<string, LocationMeta>> =
  Object.fromEntries(LOCATION_META.map(l => [l.id, l]));
