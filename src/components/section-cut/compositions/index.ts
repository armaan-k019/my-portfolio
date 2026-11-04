// The hero's compositions. The first, the rock, is the one shown on arrival;
// the others are a click away. Each loads on demand.
import type { Model } from "../geometry";

export const COMPOSITIONS: (() => Promise<{ build: () => Model }>)[] = [
  () => import("./perch"),
  () => import("./seat"),
  () => import("./span"),
  () => import("./descent"),
];
