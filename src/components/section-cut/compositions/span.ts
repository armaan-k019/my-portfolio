// SPAN. A gallery that bridges a gorge. It rests on two abutments dug into
// the banks and crosses the void as a long glazed box. Its middle opens
// twice: a hole in the deck that looks straight down into the gorge, and a
// double-height room above it. A stair tower rises from the gorge floor to
// the deck, and a lookout steps down off the side, cantilevered over the
// drop. The approach is a ramp along the contour of the west bank.
//
// Levels: gorge floor -14, bank 0, lookout 1.5, deck 3, gallery 7, roof
// 10.5. Ground to structure: bridging, embedded (abutments), cantilevered,
// ramping along a contour. Secondary: mullions along both long faces,
// joists under the deck, balustrades, the tower's treads.
import { Drawing, inside, noise, smooth, type Box } from "../kit";

const X = 78, Z = 48, CONTOUR = 1;

export function build() {
  const n = noise(523);
  const gx = (z: number) => 39 + 3.5 * Math.sin(z / 9 + 0.6);
  const natural = (x: number, z: number) => {
    const bank = x < gx(z) ? 0.04 * z : 2 + 0.03 * z;
    const depth = 14 * (1 - smooth(8.5, 13.5, Math.abs(x - gx(z))));
    return bank - depth + 1.2 * n(x / 10, z / 10) * (0.4 + 0.6 * smooth(6, 12, Math.abs(x - gx(z))));
  };

  const west: Box = { x0: 12, x1: 22, z0: 16.5, z1: 27.5 }, east: Box = { x0: 56, x1: 66, z0: 16.5, z1: 27.5 };
  const tower: Box = { x0: 36, x1: 41, z0: 29, z1: 34 };
  const rampB: Box = { x0: 1, x1: 13, z0: 13.2, z1: 15.6 };
  const ground = (x: number, z: number) => {
    let h = natural(x, z);
    if (inside(west, x, z)) h = Math.min(h, -4);
    if (inside(east, x, z)) h = Math.min(h, -2);
    if (inside(tower, x, z)) h = Math.min(h, natural(38.5, 31.5));
    if (inside(rampB, x, z)) h = Math.min(h, 0.5 + (2.5 * (x - rampB.x0)) / (rampB.x1 - rampB.x0) - 0.3);
    return h;
  };

  const d = new Drawing();
  const box: Box = { x0: 12, x1: 66, z0: 18, z1: 26 };
  const well: Box = { x0: 34, x1: 42, z0: 20, z1: 24 };
  const upper: Box = { x0: 24, x1: 54, z0: 18, z1: 26 };
  const room: Box = { x0: 31, x1: 45, z0: 19, z1: 25 };

  // Abutments in the banks, then the box across the gorge.
  d.block(west, -4, 3);
  d.block(east, -2, 3);
  d.slab(box, 3, 0.5, [well]);
  d.joists(box, 3, 1.2, 0.8);
  d.slab(upper, 7, 0.35, [room]);
  d.slab(box, 10.5, 0.4);
  // The long faces: solid upstand and head, glazed between.
  for (const z of [18, 25.7]) {
    d.block({ x0: 12, x1: 66, z0: z, z1: z + 0.3 }, 3, 4);
    d.block({ x0: 12, x1: 66, z0: z, z1: z + 0.3 }, 9.6, 10.5);
    d.mullions(12, z === 18 ? 18 : 26, 66, z === 18 ? 18 : 26, 4, 9.6, 1.8);
  }
  d.block({ x0: 12, x1: 12.4, z0: 18, z1: 26 }, 3, 10.5);
  d.block({ x0: 65.6, x1: 66, z0: 18, z1: 26 }, 3, 10.5);
  for (const [a, b] of [[well.x0, well.z0], [well.x1, well.z0]]) d.balustrade(a, b, a, well.z1, 3);
  d.balustrade(well.x0, well.z0, well.x1, well.z0, 3);
  d.balustrade(well.x0, well.z1, well.x1, well.z1, 3);
  d.balustrade(room.x0, room.z0, room.x0, room.z1, 7);
  d.balustrade(room.x1, room.z0, room.x1, room.z1, 7);

  // The stair tower from the gorge floor to the deck, and its bridge.
  const floorY = natural(38.5, 31.5);
  d.block({ x0: 36, x1: 41, z0: 29, z1: 29.3 }, floorY, 10.5);
  d.block({ x0: 36, x1: 41, z0: 33.7, z1: 34 }, floorY, 10.5);
  d.block({ x0: 36, x1: 36.3, z0: 29, z1: 34 }, floorY, 10.5);
  d.block({ x0: 40.7, x1: 41, z0: 29, z1: 34 }, floorY, 10.5);
  let y = floorY;
  for (let k = 0; y < 3 - 0.1; k++) {
    const y1 = Math.min(3, y + 2.8), fwd = k % 2 === 0;
    d.stair(fwd ? 36.5 : 40.5, fwd ? 40.5 : 36.5, fwd ? 29.5 : 31.8, fwd ? 31.6 : 33.5, y, y1);
    y = y1;
  }
  d.slab({ x0: 36.5, x1: 40.5, z0: 26, z1: 29 }, 3, 0.3);
  d.balustrade(36.5, 26, 36.5, 29, 3); d.balustrade(40.5, 26, 40.5, 29, 3);

  // The lookout, a step down off the side, cantilevered over the gorge.
  const look: Box = { x0: 45, x1: 53, z0: 26, z1: 33 };
  d.stair(45.5, 47.5, 26.2, 27.8, 3, 1.5);
  d.slab(look, 1.5, 0.3);
  d.joists(look, 1.5, 1, 0.4);
  d.balustrade(look.x0, look.z1, look.x1, look.z1, 1.5);
  d.balustrade(look.x1, look.z0, look.x1, look.z1, 1.5);
  d.balustrade(look.x0, 28, look.x0, look.z1, 1.5);

  // The approach ramp along the west bank's contour.
  d.ramp(1, 13, 13.2, 15.6, 0.5, 3);
  d.balustrade(1, 13.2, 13, 13.2, 0.5);

  const at = (v: number) => () => v;
  d.walk(14, 21, 32, 21, at(3), 1);
  d.walk(46, 23, 64, 23, at(3), 2);
  d.walk(26, 20, 30, 24, at(7), 3);
  d.walk(46, 24, 53, 20, at(7), 4);
  d.walk(2, 14.4, 12, 14.4, (x) => 0.5 + (2.5 * (x - 1)) / 12, 5);
  d.walk(46, 30, 52, 30, at(1.5), 6);
  for (let k = 0; k < 8; k++) { const z0 = 4 + k * 5.5; d.walk(gx(z0), z0, gx(z0 + 4), z0 + 4, (x, z) => ground(x, z), 10 + k); }
  for (let k = 0; k < 6; k++) d.walk(2 + k * 2, 30 + k * 2, 6 + k * 2, 34 + k * 2, (x, z) => ground(x, z), 30 + k);
  d.stand(38, 3, 21, 0); d.stand(39, 3, 23, 3); d.stand(35, 3, 22, 1.5);
  d.stand(33, 7, 22, 0); d.stand(43, 7, 21, 3);
  d.stand(51, 1.5, 32, 1.6); d.stand(48, 1.5, 32, 1.6); d.stand(52, 1.5, 29, 0);
  d.stand(38.5, 3, 27.5, 1.6); d.stand(60, 10.5, 22, 2); d.stand(20, 10.5, 22, 1);
  for (let k = 0; k < 6; k++) d.stand(14 + k * 9, 3, 25, -Math.PI / 2);
  d.stand(38.5, floorY + 0.2, 36, 0);

  const lo = d.contours(ground, X, Z, CONTOUR);
  return d.model(ground, X, Z, CONTOUR, Math.floor(lo) - 2, 14);
}
