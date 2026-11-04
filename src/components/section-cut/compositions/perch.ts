// PERCH. A stack of floors set into a notch cut from the flank of a rock.
// The rock rises to a jagged crest at the back and falls to a flat apron at
// the front, all on one plinth. The notch is cut out of its west side, open
// to the west and to the front, and walled by rock behind and to the east.
// Four floor plates step up into it, each shorter than the one below, so
// the lowest runs furthest out over the slope on columns. A perforated
// screen hangs along the open west side, a lower screen rails the lowest
// floor's outrigger, two solid walls stand on the floors (a gable on the
// lowest, a raked wall at the back of the top), and an open stair runs
// from the lowest floor down the slope and past the edge of the plinth.
//
// Levels: floors at 9, 12.2, 15.4 and 18.6, the notch's floor at 8, the
// apron at 1.5, the plinth's underside at -1. Contours every 1 m.
// Ground to structure: embedded, cantilevered, perched on columns.
// Secondary: the screens' cells and openings, the internal stairs' treads,
// beams over the top floor.
//
// Life: people on the floors and the stair, and birds round the crest.
import { seg } from "../geometry";
import { Drawing, noise, smooth, type Box } from "../kit";

const X = 28, Z = 46, CONTOUR = 1;

export function build() {
  const n = noise(5207), spikes = noise(611);
  // The rock: high at the back, its crest just east of the notch, falling to the
  // apron at the front. Coarse noise facets the flanks; a sharper one
  // raises points along the crest.
  const natural = (x: number, z: number) => {
    const along = 21 * (1 - smooth(4, 32, z));
    const across = Math.min(1, Math.max(0.12, 1 - ((x - 20) / 16) ** 2));
    const mass = along * across;
    return 1.5 + mass + 2.2 * n(x / 7, z / 7) * smooth(0, 10, mass) + 5 * Math.max(0, spikes(x / 3, z / 3)) * (mass / 21) ** 3;
  };

  const notch: Box = { x0: 5, x1: 16, z0: 8, z1: Z };
  // The notch's floor: level under the back of the floors, then the slope.
  const floorOf = (z: number) => Math.max(1.3, z < 24 ? 8 : 8 - (z - 24) * 0.42);
  const ground = (x: number, z: number) => {
    const h = natural(x, z);
    const w = smooth(notch.x0 - 0.5, notch.x0, x) * (1 - smooth(notch.x1, notch.x1 + 0.5, x)) * smooth(notch.z0 - 0.5, notch.z0, z);
    return h + (Math.min(h, floorOf(z)) - h) * w;
  };

  const d = new Drawing();
  const x0 = 5.3, x1 = 15.7;
  const floors = [
    { y: 9, z1: 36 }, { y: 12.2, z1: 30 }, { y: 15.4, z1: 26.5 }, { y: 18.6, z1: 23 },
  ];
  // Openings for the internal stairs, one flight between each pair of floors.
  const flights: Box[] = [
    { x0: 6.5, x1: 12.5, z0: 9.2, z1: 11.2 },
    { x0: 6.5, x1: 13, z0: 11.2, z1: 13.2 },
    { x0: 6.5, x1: 12.5, z0: 13.2, z1: 15.2 },
  ];
  floors.forEach((f, i) => d.slab({ x0, x1, z0: 9, z1: f.z1 }, f.y, 0.3, i > 0 ? [flights[i - 1]] : []));
  d.stair(7, 12.5, 9.4, 11, 9, 12.2);
  d.stair(12.5, 7, 11.4, 13, 12.2, 15.4);
  d.stair(7, 12.5, 13.4, 15, 15.4, 18.6);
  // The lowest floor's outrigger past the notch, to the west.
  const out: Box = { x0: 2.5, x1: x0, z0: 29, z1: 36 };
  d.slab(out, 9, 0.3);

  // Columns: under the lowest floor down to the slope, and between floors.
  const col = (x: number, z: number, y0: number, y1: number) =>
    d.block({ x0: x - 0.13, x1: x + 0.13, z0: z - 0.13, z1: z + 0.13 }, y0, y1);
  const cx = [5.8, 10.5, 15.2];
  for (const z of [25, 30, 35.4]) for (const x of cx) if (ground(x, z) < 8.6) col(x, z, ground(x, z), 8.7);
  for (const z of [30.5, 35.4]) col(2.9, z, ground(2.9, z), 8.7);
  for (let i = 1; i < floors.length; i++)
    for (const z of [17, 22, 27.5]) if (z < floors[i].z1 - 0.4) for (const x of cx) col(x, z, floors[i - 1].y, floors[i].y - 0.3);

  // A wall standing on the floors: a closed outline in the plane z, drawn
  // true, and cut as strips that each take the outline's height there.
  const wall = (z: number, pts: [number, number][]) => {
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
      seg(d.lines, [ax, ay, z], [bx, by, z]); seg(d.lines, [ax, ay, z + 0.25], [bx, by, z + 0.25]);
    }
    for (const [px, py] of pts) seg(d.lines, [px, py, z], [px, py, z + 0.25]);
    const xs = pts.map((p) => p[0]), lo = Math.min(...xs), hi = Math.max(...xs), base = Math.min(...pts.map((p) => p[1]));
    const top = (x: number) => {
      let y = base;
      for (let k = 0; k < pts.length; k++) {
        const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % pts.length];
        if (ax !== bx && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)) y = Math.max(y, ay + ((by - ay) * (x - ax)) / (bx - ax));
      }
      return y;
    };
    for (let x = lo; x < hi - 1e-6; x += 0.5) {
      const xb = Math.min(hi, x + 0.5);
      d.solids.push({ poly: [[x, z], [xb, z], [xb, z + 0.25], [x, z + 0.25]], y0: base, y1: top((x + xb) / 2) });
    }
  };
  // The gable on the lowest floor, its foot dropping below the slab.
  wall(32, [[7, 7.6], [13, 7.6], [13, 14.2], [10, 16.8], [7, 14.2]]);
  // The raked wall at the back of the top floor.
  wall(9.6, [[6, 18.6], [14, 18.6], [14, 24.4], [6, 22.6]]);
  // Beams across the top floor.
  for (const z of [16.6, 17.6]) d.block({ x0: 6, x1: 15.2, z0: z, z1: z + 0.25 }, 18.6, 18.9);

  // A perforated screen in the plane x: a frame, a grid of square cells,
  // and the openings as inset squares, denser toward its foot.
  const screen = (x: number, z0: number, z1: number, y0: number, y1: number, seed: number, cell = 0.6) => {
    d.solids.push({ poly: [[x, z0], [x + 0.12, z0], [x + 0.12, z1], [x, z1]], y0, y1 });
    for (const [a, b] of [[[z0, y0], [z1, y0]], [[z1, y0], [z1, y1]], [[z1, y1], [z0, y1]], [[z0, y1], [z0, y0]]] as [number, number][][])
      seg(d.lines, [x, a[1], a[0]], [x, b[1], b[0]]);
    const nz = Math.round((z1 - z0) / cell), ny = Math.round((y1 - y0) / cell), cz = (z1 - z0) / nz, cy = (y1 - y0) / ny;
    for (let i = 1; i < nz; i++) seg(d.detail, [x, y0, z0 + i * cz], [x, y1, z0 + i * cz]);
    for (let j = 1; j < ny; j++) seg(d.detail, [x, y0 + j * cy, z0], [x, y0 + j * cy, z1]);
    const pick = noise(seed);
    for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
      const open = 0.15 + 0.35 * (1 - j / ny) + 0.5 * pick(i / 2.3, j / 2.3);
      if (open < 0.42) continue;
      const za = z0 + i * cz + cz * 0.22, zb = z0 + (i + 1) * cz - cz * 0.22, ya = y0 + j * cy + cy * 0.22, yb = y0 + (j + 1) * cy - cy * 0.22;
      seg(d.detail, [x, ya, za], [x, ya, zb]); seg(d.detail, [x, ya, zb], [x, yb, zb]);
      seg(d.detail, [x, yb, zb], [x, yb, za]); seg(d.detail, [x, yb, za], [x, ya, za]);
    }
  };
  screen(4.6, 12, 29, 8.4, 24.6, 71);
  screen(2.5, 29, 36, 9, 11.4, 72);

  // The open stair from the lowest floor down the slope, along Z, its foot
  // running out past the plinth.
  {
    const sx0 = 13.6, sx1 = 15.2, za = 36, zb = 48, ya = 9, yb = 1.5, steps = 20;
    for (let i = 0; i < steps; i++) {
      const z = za + ((zb - za) * i) / steps, z2 = za + ((zb - za) * (i + 1)) / steps, y = ya + ((yb - ya) * (i + 1)) / steps;
      d.solids.push({ poly: [[sx0, z], [sx1, z], [sx1, z2], [sx0, z2]], y0: y - 0.15, y1: y });
      seg(d.detail, [sx0, y, z], [sx1, y, z]);
    }
    for (const x of [sx0, sx1]) { seg(d.lines, [x, ya, za], [x, yb, zb]); seg(d.lines, [x, ya - 0.3, za], [x, yb - 0.3, zb]); }
  }

  // The notch's rim: the top of its east wall and its back wall, and the
  // corner where they meet.
  for (let z = notch.z0; z < Z; z += 1) seg(d.lines, [notch.x1, natural(notch.x1, z), z], [notch.x1, natural(notch.x1, z + 1), z + 1]);
  for (let x = notch.x0; x < notch.x1; x += 1) seg(d.lines, [x, natural(x, notch.z0), notch.z0], [x + 1, natural(x + 1, notch.z0), notch.z0]);
  seg(d.lines, [notch.x1, floorOf(notch.z0), notch.z0], [notch.x1, natural(notch.x1, notch.z0), notch.z0]);

  // The plinth: its underside, the ground's profile round its four edges,
  // and its corners.
  const under = -1;
  const edge = (ax: number, az: number, bx: number, bz: number) => {
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let k = 0; k < steps; k++) {
      const p = [ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps], q = [ax + ((bx - ax) * (k + 1)) / steps, az + ((bz - az) * (k + 1)) / steps];
      seg(d.site, [p[0], ground(p[0], p[1]), p[1]], [q[0], ground(q[0], q[1]), q[1]]);
    }
    seg(d.site, [ax, under, az], [bx, under, bz]);
    seg(d.site, [ax, under, az], [ax, ground(ax, az), az]);
  };
  edge(0, 0, X, 0); edge(X, 0, X, Z); edge(X, Z, 0, Z); edge(0, Z, 0, 0);

  floors.forEach((f, i) => {
    d.walk(x0 + 1.5, 20, x1 - 1.5, 20, () => f.y, 1 + i);
    d.stand(8 + i * 1.6, f.y, f.z1 - 1.2, Math.PI / 2, i === 1 ? "lean" : undefined);
  });
  d.stand(3.4, 9, 33, Math.PI, "talk"); d.stand(4.2, 9, 34, 0);
  d.walk(14.4, 37, 14.4, 46, (_x, z) => 9 - (7.5 * (z - 36)) / 12, 9);
  d.stand(10, 1.5, 44, -Math.PI / 2); d.stand(11, 1.5, 44.4, -Math.PI / 2, undefined, 0.6);

  d.bird(20, 27, 8, 10, 6, 70, 1); d.bird(18, 25, 14, 8, 6, 55, 2); d.bird(22, 20, 22, 8, 8, 80, 3);

  const lo = d.contours(ground, X, Z, CONTOUR);
  return d.model(ground, X, Z, CONTOUR, Math.floor(lo) - 2, 4.5);
}
