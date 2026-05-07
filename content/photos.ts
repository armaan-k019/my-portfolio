/*
 * Photography data — dimensions read from actual PNG headers.
 * Paths: /photography/[slug]/[slug]XX.png
 * Sweden excluded (0 photos).
 */

export interface Photo {
  id: number;
  src: string;
  location: string;
  w: number;
  h: number;
}

// ─── Per-photo data: [width, height] from PNG IHDR ───────────────────────────

const photoData: { slug: string; name: string; dims: [number, number][] }[] = [
  {
    slug: "taiwan", name: "Taiwan",
    dims: [
      [2252, 1502], [1852, 1274], [2248, 1494], [1114, 1196],
      [1414, 1532], [1026, 1186], [1024, 1452], [1012, 1518],
      [ 636, 1058], [2274, 1288], [1014, 1288], [1022, 1520],
      [1646, 1500], [ 990, 1516], [ 876, 1150], [1804, 1004],
      [ 950, 1466], [ 666,  776],
    ],
  },
  {
    slug: "amsterdam", name: "Amsterdam",
    dims: [
      [2128, 1482], [1500, 1500], [2230, 1514], [2290, 1512],
      [2296, 1540], [2244, 1490], [1060, 1190], [1802, 1542],
      [2290, 1252], [2228, 1476], [1994, 1238], [1644, 1478],
      [2402, 1750], [2384, 1628], [2208, 1708], [1934, 1512],
    ],
  },
  {
    slug: "iceland", name: "Iceland",
    dims: [
      [1924, 1460], [1560, 1020], [1616, 1480], [2058, 1462],
      [1772, 1508], [1014, 1522], [2288, 1500], [1692, 1124],
      [2198, 1484], [2246, 1484], [2234, 1428], [2010, 1382],
      [2146, 1468], [1262, 1762],
    ],
  },
  {
    slug: "usa", name: "USA",
    dims: [
      [1318, 1452], [1052,  990], [1952, 1478], [2212, 1452],
      [1026, 1128], [2056, 1382], [1754,  964], [1278, 1528],
      [1364, 1870], [2422, 1802], [1326, 1820], [1346, 1864],
    ],
  },
  {
    slug: "london", name: "London",
    dims: [
      [ 926, 1540], [ 694, 1468], [2296, 1528], [1222, 1566],
      [2190, 1516], [1654,  936], [1762, 1544], [2310, 1412],
      [ 770, 1248], [2226, 1884], [1118, 1144],
    ],
  },
  {
    slug: "switzerland", name: "Switzerland",
    dims: [
      [1078, 1448], [ 952, 1346], [1036, 1420], [1008, 1242],
      [ 992, 1110], [1838, 1216], [1018, 1340], [1068, 1438],
    ],
  },
  {
    slug: "spain", name: "Spain",
    dims: [
      [1382, 1394], [2206, 1488], [1044, 1852], [1278, 1618],
      [1302,  710], [2026, 1820], [2526, 1872],
    ],
  },
  {
    slug: "turkey", name: "Turkey",
    dims: [
      [1000, 1474], [ 980,  632], [1012, 1492], [1824, 1474],
      [ 904, 1338], [2252, 1432], [1080, 1754],
    ],
  },
  {
    slug: "india", name: "India",
    dims: [
      [1608, 1176], [2270, 1794], [ 982, 1326], [1204, 1884],
    ],
  },
];

// ─── Generate PHOTOS ──────────────────────────────────────────────────────────

export const PHOTOS: Photo[] = photoData.flatMap(({ slug, name, dims }, ri) =>
  dims.map(([w, h], fi) => {
    const n = String(fi + 1).padStart(2, "0");
    return {
      id: ri * 100 + fi + 1,
      src: `/photography/${slug}/${slug}${n}.png`,
      location: name,
      w,
      h,
    };
  })
);

// ─── Destinations (for filter pills, sorted by count desc) ───────────────────

export const DESTINATIONS = photoData.map(({ name, dims }) => ({
  name,
  count: dims.length,
}));

export const TOTAL_PHOTOS = PHOTOS.length;
