// SEAT. A long house sunk into a hillside. Its back is buried and held by a
// retaining wall; its front opens as a glazed line along the contour. The
// section changes as it runs east: a closed two storey wing, a hall open
// front to back under a raised lantern, a courtyard notched out of the
// front and open to the sky down to a sunken garden, and a lower level
// that opens east onto the drop. The upper floor runs out past the house as
// a terrace cantilevered over the drop, with a stair folding down from it,
// and the approach is a sunken court and a ramp laid along the contour.
//
// Levels: lower level -3.6, approach court -1.8, garden -1, ground floor 0,
// upper floor 4.2, roof 8.4, lantern 10.4. Ground to structure: embedded,
// retained, cantilevered, ramping along a contour. Contours every 0.5 m.
// Secondary: facade, lantern and courtyard mullions, joists under the upper
// floor and the terrace, balustrades, the treads of both stairs.
//
// Life: trees on the hillside above and on the lower ground past the drop,
// two cars parked in the approach court (the only way in by road), people
// gathered, sitting, leaning on the terrace rail, and birds over the slope.
import { Drawing, inside, noise, smooth, type Box } from "../kit";

const X = 76, Z = 48, CONTOUR = 0.5;

export function build() {
  const n = noise(311);
  const natural = (x: number, z: number) =>
    (z >= 12 ? 0.34 * (z - 12) : -0.12 * (12 - z)) - 9 * smooth(59, 64, x) + 1.1 * n(x / 11, z / 11);

  const house: Box = { x0: 8, x1: 58, z0: 12, z1: 28.5 };
  const court: Box = { x0: 0, x1: 7, z0: 3, z1: 10 };
  const rampB: Box = { x0: 7, x1: 22, z0: 7.6, z1: 10 };
  const hall: Box = { x0: 22, x1: 32, z0: 12, z1: 24 };
  const yard: Box = { x0: 38, x1: 47, z0: 12, z1: 23 };
  const lower: Box = { x0: 48, x1: 58, z0: 12, z1: 28 };
  const light: Box = { x0: 58, x1: 61, z0: 12, z1: 28 };
  const ground = (x: number, z: number) => {
    let h = natural(x, z);
    if (inside(house, x, z)) h = Math.min(h, -0.4);
    if (inside(yard, x, z)) h = Math.min(h, -1.3);
    if (inside(lower, x, z) || inside(light, x, z)) h = Math.min(h, -4);
    if (inside(court, x, z)) h = Math.min(h, -2.1);
    if (inside(rampB, x, z)) h = Math.min(h, -1.8 + (1.8 * (x - rampB.x0)) / (rampB.x1 - rampB.x0) - 0.3);
    return h;
  };

  const d = new Drawing();
  const plate: Box = { x0: 8, x1: 58, z0: 12, z1: 28 };

  // Floors and roof. The hall is open from ground floor to lantern, front to
  // gallery; the courtyard is open to the sky through every level.
  d.slab(plate, 0, 0.4, [yard, { x0: lower.x0, x1: lower.x1, z0: 12, z1: 16 }]);
  d.slab(plate, 4.2, 0.35, [hall, yard]);
  d.slab(plate, 8.4, 0.35, [hall, yard]);
  d.joists({ x0: 8, x1: 22, z0: 12, z1: 28 }, 4.2);
  d.joists({ x0: 32, x1: 58, z0: 12, z1: 28 }, 4.2);

  // The buried back: a retaining wall full height, end walls.
  d.block({ x0: 8, x1: 58, z0: 28, z1: 28.5 }, -0.4, 8.4);
  d.block({ x0: 8, x1: 8.4, z0: 12, z1: 28 }, -0.4, 8.4);
  d.block({ x0: 57.6, x1: 58, z0: 12, z1: 28 }, 0, 8.4);

  // The open front along the contour.
  for (const [y0, y1] of [[0, 3.85], [4.2, 8.05]]) {
    d.mullions(8.4, 12, 22, 12, y0, y1, 1.5);
    d.mullions(32, 12, 38, 12, y0, y1, 1.5);
    d.mullions(47, 12, 57.6, 12, y0, y1, 1.5);
  }
  d.mullions(22, 12, 32, 12, 0, 8.05, 1.25);

  // The hall: a lantern raised over it, a gallery at its back, and the stair.
  d.slab({ x0: 21.6, x1: 32.4, z0: 11.6, z1: 24.4 }, 10.4, 0.3);
  d.block({ x0: 21.6, x1: 22, z0: 11.6, z1: 24.4 }, 8.4, 10.4);
  d.block({ x0: 32, x1: 32.4, z0: 11.6, z1: 24.4 }, 8.4, 10.4);
  d.mullions(22, 12, 32, 12, 8.4, 10.1, 1.25);
  d.mullions(22, 24.4, 32, 24.4, 8.4, 10.1, 1.25);
  d.balustrade(hall.x0, hall.z1, hall.x1, hall.z1, 4.2);
  d.stair(23, 31, 25.5, 27.5, 0, 4.2);

  // The courtyard: glazed on its three built sides, a garden sunk below the
  // ground floor, and a flight down into it.
  for (const [y0, y1] of [[0, 3.85], [4.2, 8.05]]) {
    d.mullions(yard.x0, yard.z1, yard.x1, yard.z1, y0, y1, 1.2);
    d.mullions(yard.x0, yard.z0, yard.x0, yard.z1, y0, y1, 1.2);
    d.mullions(yard.x1, yard.z0, yard.x1, yard.z1, y0, y1, 1.2);
  }
  d.slab(yard, -1, 0.3);
  d.stair(38.5, 42, 21, 22.8, 0, -1);
  d.balustrade(yard.x0, yard.z1, yard.x1, yard.z1, 8.4);

  // The lower level under the east end, opening onto the drop across a
  // narrow light court; a stair down to it behind the front.
  d.slab({ x0: 48, x1: 61, z0: 12, z1: 28 }, -3.6, 0.4);
  d.block({ x0: 48, x1: 48.4, z0: 12, z1: 28 }, -4, 0);
  d.block({ x0: 48, x1: 61, z0: 28, z1: 28.5 }, -4, 0);
  d.block({ x0: 60.7, x1: 61, z0: 12, z1: 28 }, -4, -2.6);
  d.mullions(58, 12, 58, 28, -3.6, -0.4, 1.4);
  d.stair(49, 56, 13, 15.4, 0, -3.6);
  d.balustrade(49, 16, 57, 16, 0);

  // The terrace cantilevered off the upper floor over the drop, and the
  // stair that folds down from its far end to the lower ground.
  const deck: Box = { x0: 58, x1: 70, z0: 14, z1: 25 };
  d.slab(deck, 4.2, 0.3);
  d.joists(deck, 4.2, 1, 0.4);
  d.balustrade(deck.x1, deck.z0, deck.x1, deck.z1, 4.2);
  d.balustrade(deck.x0, deck.z0, deck.x1, deck.z0, 4.2);
  d.balustrade(deck.x0, deck.z1, 66, deck.z1, 4.2);
  const foot = ground(69, 28);
  let y = 4.2;
  for (let k = 0; y > foot + 0.1; k++) {
    const y1 = Math.max(foot, y - 2.6), fwd = k % 2 === 0;
    d.stair(fwd ? 66 : 74, fwd ? 74 : 66, fwd ? 25 : 27.2, fwd ? 27 : 29.2, y, y1);
    d.balustrade(66, fwd ? 25 : 29.2, 74, fwd ? 25 : 29.2, y1);
    y = y1;
  }

  // The approach: a sunken court, its low retaining walls, and a ramp along
  // the contour up to the ground floor.
  d.slab(court, -1.8, 0.3);
  d.block({ x0: 0, x1: 7, z0: 10, z1: 10.3 }, -1.8, 0.2);
  d.block({ x0: 0, x1: 7, z0: 2.7, z1: 3 }, -1.8, -0.6);
  d.ramp(7, 22, 7.6, 10, -1.8, 0);
  d.balustrade(7, 7.6, 22, 7.6, -1.8);

  const at = (v: number) => () => v;
  d.walk(10, 14, 21, 14, at(0), 1);
  d.walk(33, 14, 37, 14, at(0), 9);
  d.walk(12, 22, 20, 22, at(0), 2);
  d.walk(34, 26, 56, 26, at(4.2), 3);
  d.walk(10, 26, 21, 26, at(4.2), 4);
  d.walk(8, 8.8, 21, 8.8, (x) => -1.8 + (1.8 * (x - 7)) / 15, 5);
  d.walk(60, 20, 69, 20, at(4.2), 6);
  d.walk(50, 20, 57, 24, at(-3.6), 7);
  d.walk(10, 20, 20, 20, at(8.4), 8);
  for (let k = 0; k < 10; k++) d.walk(2 + k * 7, 40, 6 + k * 7, 44, (x, z) => ground(x, z), 20 + k);
  d.walk(16.7, 40, 20.7, 44, (x, z) => ground(x, z), 22);
  d.walk(34, 25.4, 56, 25.4, at(4.2), 3);

  // Trees on the hillside above the house, on the lower ground past the
  // drop, and a few in front along the contour; none on the path.
  const path = (x: number, z: number) => z > 38.5 && z < 45.5;
  d.grove(ground, 12, { x0: 0, x1: 58, z0: 31, z1: 48 }, (x, z) => !path(x, z), 11);
  d.grove(ground, 5, { x0: 63, x1: 76, z0: 31, z1: 48 }, (x, z) => !path(x, z), 12);
  d.grove(ground, 4, { x0: 24, x1: 56, z0: 1, z1: 9 }, () => true, 13, 6);

  d.bird(30, 14, 30, 22, 10, 70, 1); d.bird(55, 17, 20, 18, 14, 90, 2); d.bird(20, 19, 36, 14, 8, 60, 3);
  d.bird(64, 8, 28, 9, 12, 55, 4); d.bird(45, 20, 10, 26, 8, 110, 5); d.bird(10, 13, 22, 9, 12, 50, 6);
  d.bird(70, 15, 38, 8, 6, 45, 7);
  d.stand(42, -1, 16, 0); d.stand(44, -1, 19, 2); d.stand(40, -1, 14, 4);
  d.stand(26, 0, 18, 1); d.stand(28, 0, 16, 3); d.stand(27, 4.2, 25, -1.6);
  d.stand(69.3, 4.2, 18, 0, "lean"); d.stand(69.3, 4.2, 21.5, 0, "lean"); d.stand(68.2, 4.2, 23.4, -0.4, "talk");
  // The approach court: two cars parked, and a group met beside them.
  d.car(1.5, -1.8, 6.6, Math.PI / 2); d.car(3.7, -1.8, 6.4, Math.PI / 2);
  const talkTo = (x: number, z: number) => Math.atan2(6.1 - z, 5.9 - x);
  d.stand(5.3, -1.8, 5.1, talkTo(5.3, 5.1), "talk"); d.stand(6.5, -1.8, 6.2, talkTo(6.5, 6.2));
  d.stand(5.4, -1.8, 7, talkTo(5.4, 7), undefined, 0.6);
  // Sitting on the edge of the ground floor above the sunken garden.
  d.stand(37.8, 0, 16.5, 0, "sit"); d.stand(37.8, 0, 18.4, 0.3, "sit");
  d.stand(52, -3.6, 25, 0); d.stand(55, -3.6, 18, 1);
  for (let k = 0; k < 4; k++) d.stand(10 + k * 3, 0, 13, -Math.PI / 2);

  const lo = d.contours(ground, X, Z, CONTOUR);
  return d.model(ground, X, Z, CONTOUR, Math.floor(lo) - 2, 16);
}
