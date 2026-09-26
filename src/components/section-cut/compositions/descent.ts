// DESCENT. A run of rooms stepping down a steep face. Each room is dug into
// the face and held by a wall at its back; its roof is the terrace of the
// room above. A cleft splits the run in two, crossed by a bridge, and a
// light well drops through the second room's roof. One stair descends the
// whole face beside the rooms. The fourth room splits into a sunk front
// and a raised back, and the last room runs out past the foot of the face
// as a cantilever whose far end is an open frame with no roof.
//
// Levels: 14, 10, 6, 2 and -2, one per room, the fourth room's sunk front
// at -0.8, and the bridge between 10 and 6.6. Contours every 1 m.
// Ground to structure: embedded, retained, cantilevered, bridging a gap.
// Secondary: glazed fronts, balustrades on every terrace edge, joists under
// the bridge and the cantilever, the stair's treads.
//
// Life: trees on the flat terraces of the face in front of and behind the
// rooms, people sitting on the stair and leaning on the terrace rails, and
// birds along the face. No road reaches it, so no cars.
import { Drawing, inside, noise, smooth, type Box } from "../kit";

const X = 80, Z = 46, CONTOUR = 1;

export function build() {
  const n = noise(887);
  const natural = (x: number, z: number) => {
    const sway = 2 * Math.sin(z / 8);
    const xx = x + sway;
    return 18 - 7 * smooth(12, 19, xx) - 5 * smooth(26, 33, xx) - 7 * smooth(40, 47, xx) - 6 * smooth(55, 62, xx)
      - 3 * Math.exp(-(((z - 34) / 4) ** 2)) * smooth(20, 60, x) + 1.1 * n(x / 9, z / 9);
  };

  const rooms = [
    { x0: 10, x1: 22, y: 14 }, { x0: 22, x1: 34, y: 10 }, { x0: 38, x1: 50, y: 6 },
    { x0: 50, x1: 62, y: 2 }, { x0: 62, x1: 76, y: -2 },
  ];
  const Z0 = 14, Z1 = 28, H = 3.6;
  const cleft: Box = { x0: 34, x1: 38, z0: Z0, z1: Z1 };
  const sunk: Box = { x0: 50.4, x1: 62, z0: Z0, z1: 21 };
  const ground = (x: number, z: number) => {
    let h = natural(x, z);
    for (const r of rooms) if (x >= r.x0 && x <= r.x1 && z >= Z0 && z <= Z1 + 0.5) h = Math.min(h, r.y - 0.4);
    if (inside(sunk, x, z)) h = Math.min(h, -1.2);
    if (inside(cleft, x, z)) h = Math.min(h, 6.5 - 5 * smooth(0, 1, (z - Z0) / (Z1 - Z0)) - 1);
    return h;
  };

  const d = new Drawing();
  const well: Box = { x0: 23, x1: 29, z0: 18, z1: 25 };
  const frame: Box = { x0: 70, x1: 76, z0: Z0, z1: Z1 };
  rooms.forEach((r, i) => {
    const b: Box = { x0: r.x0, x1: r.x1, z0: Z0, z1: Z1 };
    d.slab(b, r.y, 0.4, i === 3 ? [sunk] : []);
    d.slab(i === 4 ? { ...b, x1: frame.x0 } : b, r.y + H, 0.35, i === 1 ? [well] : []);
    // The back wall, held against the face, and the side walls.
    d.block({ x0: r.x0, x1: r.x0 + 0.4, z0: Z0, z1: Z1 }, r.y - 0.4, r.y + H);
    d.block({ x0: r.x0, x1: r.x1, z0: Z1, z1: Z1 + 0.4 }, r.y - 0.4, r.y + H);
    d.mullions(r.x0 + 0.4, Z0, i === 4 ? frame.x0 : r.x1, Z0, i === 3 ? -0.8 : r.y, r.y + H - 0.35, 1.2);
    const top = i === 4 ? frame.x0 : r.x1;
    d.balustrade(r.x0, Z0, top, Z0, r.y + H);
    d.balustrade(top, Z0, top, Z1, r.y + H);
  });
  // The fourth room's sunk front, a step down from its back half.
  d.slab(sunk, -0.8, 0.4);
  d.stair(52, 55, 21, 23, 2, -0.8);
  d.balustrade(55, 21, 62, 21, 2);
  // The open frame at the end of the cantilever: beams without a roof.
  d.joists(frame, -2 + H + 0.35, 1.2, 0);
  d.block({ x0: 75.6, x1: 76, z0: Z0, z1: Z0 + 0.4 }, -2, -2 + H);
  d.block({ x0: 75.6, x1: 76, z0: Z1 - 0.4, z1: Z1 }, -2, -2 + H);
  d.balustrade(well.x0, well.z0, well.x1, well.z0, 10 + H);
  d.balustrade(well.x0, well.z1, well.x1, well.z1, 10 + H);
  d.mullions(well.x0, well.z0, well.x0, well.z1, 10, 10 + H - 0.35, 1);
  d.mullions(well.x1, well.z0, well.x1, well.z1, 10, 10 + H - 0.35, 1);

  // The bridge over the cleft, from the second room's floor level down to
  // the third's, on its own joists.
  d.ramp(34, 38, 18, 21, 10, 6.6, 0.3);
  d.joists({ x0: 34, x1: 38, z0: 18, z1: 21 }, 8.3, 0.8, 0.5);
  d.balustrade(34, 18, 38, 18, 10); d.balustrade(34, 21, 38, 21, 10);

  // The stair down the whole face beside the rooms: a flight between each
  // pair of levels, with landings.
  const SZ0 = 29, SZ1 = 31;
  const levels = rooms.map((r) => r.y + H);
  for (let i = 0; i + 1 < rooms.length; i++) {
    const xa = rooms[i].x1 - 5, xb = rooms[i + 1].x0 + 3;
    d.slab({ x0: xa - 2, x1: xa, z0: SZ0, z1: SZ1 }, levels[i], 0.25);
    d.stair(xa, xb, SZ0, SZ1, levels[i], levels[i + 1]);
    d.balustrade(xa, SZ1, xb, SZ1, levels[i]);
  }

  // The last room runs out past the foot of the face.
  d.joists({ x0: 62, x1: 76, z0: Z0, z1: Z1 }, -2, 1, 0.5);

  rooms.forEach((r, i) => {
    d.walk(r.x0 + 1.5, 17, r.x1 - 1.5, 17, () => r.y, 1 + i);
    d.walk(r.x0 + 2, 24, r.x1 - 2, 24, () => r.y, 10 + i);
    if (i % 2 === 0) d.stand((r.x0 + r.x1) / 2, r.y + H, 14.45, -Math.PI / 2, "lean");
    else d.stand((r.x0 + r.x1) / 2, r.y + H, 16, -Math.PI / 2);
    d.stand(r.x0 + 3, r.y + H, 22, 0);
    d.stand(r.x1 - 2, i === 3 ? -0.8 : r.y, 20, Math.PI);
  });
  for (let i = 0; i + 1 < rooms.length; i++) {
    const xa = rooms[i].x1 - 5, xb = rooms[i + 1].x0 + 3, y0 = levels[i], y1 = levels[i + 1];
    d.walk(xa, 30, xb, 30, (x) => y0 + ((y1 - y0) * (x - xa)) / (xb - xa), 20 + i);
  }
  d.walk(34.5, 19.5, 37.5, 19.5, (x) => 10 - (3.4 * (x - 34)) / 4, 30);
  for (let k = 0; k < 6; k++) d.walk(64 + k * 2, 36 + k, 66 + k * 2, 42, (x, z) => ground(x, z), 40 + k);
  d.walk(64.6, 36.4, 66.6, 42.4, (x, z) => ground(x, z), 40);
  d.stand(74, -2, 20, 0, "talk"); d.stand(75, -2, 21.2, Math.PI, undefined, 0.6); d.stand(75, -2, 24, 0);
  d.stand(56.8, 2, 21.8, -Math.PI / 2, "sit");

  // Sitting on the stair, a few treads down a flight, facing down it.
  const sitOn = (i: number, k: number) => {
    const xa = rooms[i].x1 - 5, xb = rooms[i + 1].x0 + 3, y0 = levels[i], y1 = levels[i + 1];
    const n = Math.max(2, Math.round(Math.abs(y1 - y0) / 0.18));
    d.stand(xa + ((xb - xa) * (k + 0.6)) / n, y0 + ((y1 - y0) * (k + 1)) / n, 29.5, 0, "sit");
  };
  sitOn(1, 7); sitOn(3, 12);

  // Trees on the flat terraces of the face, clear of the rooms, the stair
  // and the path below.
  const flat = (x: number, z: number) => Math.abs(ground(x + 0.8, z) - ground(x - 0.8, z)) < 0.9;
  const clear = (x: number, z: number) => flat(x, z) && !(z > 12.5 && z < 32.5 && x > 8.5 && x < 77.5)
    && !(x > 62 && z > 34.5 && z < 43.5);
  d.grove(ground, 10, { x0: 0, x1: 80, z0: 0, z1: 12.5 }, clear, 31);
  d.grove(ground, 10, { x0: 0, x1: 80, z0: 32.5, z1: 46 }, clear, 32);

  d.bird(40, 23, 22, 26, 10, 90, 1); d.bird(20, 24, 8, 12, 8, 60, 2); d.bird(60, 10, 36, 14, 8, 55, 3);
  d.bird(70, 4, 20, 8, 12, 45, 4); d.bird(30, 19, 38, 10, 6, 50, 5); d.bird(52, 15, 6, 18, 6, 75, 6);

  const lo = d.contours(ground, X, Z, CONTOUR);
  return d.model(ground, X, Z, CONTOUR, Math.floor(lo) - 2, 13);
}
