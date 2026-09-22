import { test, expect } from "@playwright/test";
import {
  toLocal,
  fromLocal,
  haversineM,
  bboxAround,
  ringAreaM2,
  roundKey,
  siteKey,
} from "../../src/lib/datum/geo";

const ATLANTA = { lat: 33.7751258, lng: -84.3919750 };
const MIAMI = { lat: 25.8011588, lng: -80.1890627 };

test("haversineM matches the Atlanta to Miami distance within 1 percent", () => {
  const d = haversineM(ATLANTA, MIAMI);
  expect(Math.abs(d - 972_000) / 972_000).toBeLessThan(0.01);
});

test("toLocal and fromLocal round trip within 1 cm at 400 m", () => {
  for (const [dx, dy] of [
    [400, 0],
    [0, 400],
    [-400, -400],
    [283, -283],
  ]) {
    const p = fromLocal(dx, dy, ATLANTA);
    const [x, y] = toLocal(p.lat, p.lng, ATLANTA);
    expect(Math.abs(x - dx)).toBeLessThan(0.01);
    expect(Math.abs(y - dy)).toBeLessThan(0.01);
  }
});

test("ringAreaM2 of a 100 m square is 10000 within 0.1 percent", () => {
  const ring: Array<[number, number]> = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  expect(Math.abs(ringAreaM2(ring) - 10_000) / 10_000).toBeLessThan(0.001);
  const reversed = [...ring].reverse();
  expect(ringAreaM2(reversed)).toBeCloseTo(10_000, 3);
});

test("bboxAround spans about twice the radius in each direction", () => {
  const box = bboxAround(ATLANTA, 400);
  const north = haversineM(ATLANTA, { lat: box.maxLat, lng: ATLANTA.lng });
  const east = haversineM(ATLANTA, { lat: ATLANTA.lat, lng: box.maxLng });
  expect(Math.abs(north - 400)).toBeLessThan(5);
  expect(Math.abs(east - 400)).toBeLessThan(5);
});

test("roundKey and siteKey format at the requested precision", () => {
  expect(roundKey(33.7751258, -84.391975, 1)).toBe("33.8,-84.4");
  expect(roundKey(33.7751258, -84.391975, 3)).toBe("33.775,-84.392");
  expect(siteKey(33.7751258, -84.391975)).toBe("33.775,-84.392");
});
