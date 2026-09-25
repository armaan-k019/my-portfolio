// The buildings the hero draws, one per UTC day. Each model is an
// interpretation after the named architect, not a measured drawing, and its
// geometry loads on demand so a visit only fetches the day's building.
import type { Model } from "../geometry";

export interface BuildingInfo {
  name: string;
  architect: string;
  year: number;
  load: () => Promise<{ build: () => Model }>;
}

export const BUILDINGS: BuildingInfo[] = [
  { name: "Guggenheim Museum", architect: "Frank Lloyd Wright", year: 1959, load: () => import("./guggenheim") },
];

// Whole UTC days since the epoch: the same for every visitor on a given
// calendar day, turning over at midnight UTC.
export const buildingOfTheDay = () => Math.floor(Date.now() / 86_400_000) % BUILDINGS.length;
