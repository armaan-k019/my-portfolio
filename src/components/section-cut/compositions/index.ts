// The hero's three compositions, one per UTC day. Each loads on demand.
import type { Model } from "../geometry";

export const COMPOSITIONS: (() => Promise<{ build: () => Model }>)[] = [
  () => import("./seat"),
  () => import("./span"),
  () => import("./descent"),
];

// Whole UTC days since the epoch: the same composition for every visitor on
// a given calendar day, turning over at midnight UTC.
export const compositionOfTheDay = () => Math.floor(Date.now() / 86_400_000) % COMPOSITIONS.length;
