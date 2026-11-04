// The hero's compositions, each loaded on demand. Only the rock is in
// rotation for now; seat, span and descent stay in this folder, unlisted,
// so they can come back by adding them here.
import type { Model } from "../geometry";

export const COMPOSITIONS: (() => Promise<{ build: () => Model }>)[] = [
  () => import("./perch"),
];
