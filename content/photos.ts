/*
 * Photography data — 82 photos across 9 destinations.
 *
 * TO ADD REAL PHOTOS:
 * 1. Add photos to /public/photos/[destination]/
 *    e.g. /public/photos/iceland/1.jpg, /public/photos/iceland/2.jpg, ...
 * 2. For each photo below, replace the `src` value with the real path:
 *    src: '/photos/iceland/1.jpg'
 * 3. Update `w` and `h` to match your photo's actual dimensions
 *    (or keep them as-is — they just set the intrinsic aspect ratio for
 *    the browser to reserve space; the display size is always 100% width)
 * 4. The `id` and `location` fields stay the same — no other changes needed.
 *
 * Destinations and counts:
 *   Iceland (15) · Amsterdam (15) · Turkey (10) · London (9) ·
 *   Switzerland (8) · Sweden (7) · California (7) · India (7) · Spain (4)
 */

export interface Photo {
  id: number;
  src: string;  // Replace with '/photos/[destination]/[n].jpg' when adding real photos
  location: string;
  w: number;    // intrinsic width for Next.js Image (sets aspect ratio)
  h: number;    // intrinsic height for Next.js Image (sets aspect ratio)
}

export const PHOTOS: Photo[] = [

  // ── Iceland (15) ──────────────────────────────────────────────────────────
  { id:  1, src: "https://picsum.photos/seed/ic01/900/600",  location: "Iceland", w: 900, h: 600  },
  { id:  2, src: "https://picsum.photos/seed/ic02/600/900",  location: "Iceland", w: 600, h: 900  },
  { id:  3, src: "https://picsum.photos/seed/ic03/900/600",  location: "Iceland", w: 900, h: 600  },
  { id:  4, src: "https://picsum.photos/seed/ic04/750/1000", location: "Iceland", w: 750, h: 1000 },
  { id:  5, src: "https://picsum.photos/seed/ic05/900/560",  location: "Iceland", w: 900, h: 560  },
  { id:  6, src: "https://picsum.photos/seed/ic06/600/900",  location: "Iceland", w: 600, h: 900  },
  { id:  7, src: "https://picsum.photos/seed/ic07/900/600",  location: "Iceland", w: 900, h: 600  },
  { id:  8, src: "https://picsum.photos/seed/ic08/700/700",  location: "Iceland", w: 700, h: 700  },
  { id:  9, src: "https://picsum.photos/seed/ic09/600/900",  location: "Iceland", w: 600, h: 900  },
  { id: 10, src: "https://picsum.photos/seed/ic10/900/600",  location: "Iceland", w: 900, h: 600  },
  { id: 11, src: "https://picsum.photos/seed/ic11/900/560",  location: "Iceland", w: 900, h: 560  },
  { id: 12, src: "https://picsum.photos/seed/ic12/600/900",  location: "Iceland", w: 600, h: 900  },
  { id: 13, src: "https://picsum.photos/seed/ic13/900/600",  location: "Iceland", w: 900, h: 600  },
  { id: 14, src: "https://picsum.photos/seed/ic14/750/1000", location: "Iceland", w: 750, h: 1000 },
  { id: 15, src: "https://picsum.photos/seed/ic15/900/600",  location: "Iceland", w: 900, h: 600  },

  // ── Amsterdam (15) ────────────────────────────────────────────────────────
  { id: 16, src: "https://picsum.photos/seed/am01/900/600",  location: "Amsterdam", w: 900, h: 600  },
  { id: 17, src: "https://picsum.photos/seed/am02/600/900",  location: "Amsterdam", w: 600, h: 900  },
  { id: 18, src: "https://picsum.photos/seed/am03/900/560",  location: "Amsterdam", w: 900, h: 560  },
  { id: 19, src: "https://picsum.photos/seed/am04/600/900",  location: "Amsterdam", w: 600, h: 900  },
  { id: 20, src: "https://picsum.photos/seed/am05/900/600",  location: "Amsterdam", w: 900, h: 600  },
  { id: 21, src: "https://picsum.photos/seed/am06/700/700",  location: "Amsterdam", w: 700, h: 700  },
  { id: 22, src: "https://picsum.photos/seed/am07/600/900",  location: "Amsterdam", w: 600, h: 900  },
  { id: 23, src: "https://picsum.photos/seed/am08/900/600",  location: "Amsterdam", w: 900, h: 600  },
  { id: 24, src: "https://picsum.photos/seed/am09/750/1000", location: "Amsterdam", w: 750, h: 1000 },
  { id: 25, src: "https://picsum.photos/seed/am10/900/600",  location: "Amsterdam", w: 900, h: 600  },
  { id: 26, src: "https://picsum.photos/seed/am11/600/900",  location: "Amsterdam", w: 600, h: 900  },
  { id: 27, src: "https://picsum.photos/seed/am12/900/560",  location: "Amsterdam", w: 900, h: 560  },
  { id: 28, src: "https://picsum.photos/seed/am13/900/600",  location: "Amsterdam", w: 900, h: 600  },
  { id: 29, src: "https://picsum.photos/seed/am14/600/900",  location: "Amsterdam", w: 600, h: 900  },
  { id: 30, src: "https://picsum.photos/seed/am15/900/600",  location: "Amsterdam", w: 900, h: 600  },

  // ── Turkey (10) ───────────────────────────────────────────────────────────
  { id: 31, src: "https://picsum.photos/seed/tu01/900/600",  location: "Turkey", w: 900, h: 600  },
  { id: 32, src: "https://picsum.photos/seed/tu02/750/1000", location: "Turkey", w: 750, h: 1000 },
  { id: 33, src: "https://picsum.photos/seed/tu03/900/560",  location: "Turkey", w: 900, h: 560  },
  { id: 34, src: "https://picsum.photos/seed/tu04/600/900",  location: "Turkey", w: 600, h: 900  },
  { id: 35, src: "https://picsum.photos/seed/tu05/900/600",  location: "Turkey", w: 900, h: 600  },
  { id: 36, src: "https://picsum.photos/seed/tu06/700/700",  location: "Turkey", w: 700, h: 700  },
  { id: 37, src: "https://picsum.photos/seed/tu07/600/900",  location: "Turkey", w: 600, h: 900  },
  { id: 38, src: "https://picsum.photos/seed/tu08/900/600",  location: "Turkey", w: 900, h: 600  },
  { id: 39, src: "https://picsum.photos/seed/tu09/750/1000", location: "Turkey", w: 750, h: 1000 },
  { id: 40, src: "https://picsum.photos/seed/tu10/900/600",  location: "Turkey", w: 900, h: 600  },

  // ── London (9) ────────────────────────────────────────────────────────────
  { id: 41, src: "https://picsum.photos/seed/lo01/900/600",  location: "London", w: 900, h: 600  },
  { id: 42, src: "https://picsum.photos/seed/lo02/600/900",  location: "London", w: 600, h: 900  },
  { id: 43, src: "https://picsum.photos/seed/lo03/900/560",  location: "London", w: 900, h: 560  },
  { id: 44, src: "https://picsum.photos/seed/lo04/750/1000", location: "London", w: 750, h: 1000 },
  { id: 45, src: "https://picsum.photos/seed/lo05/900/600",  location: "London", w: 900, h: 600  },
  { id: 46, src: "https://picsum.photos/seed/lo06/600/900",  location: "London", w: 600, h: 900  },
  { id: 47, src: "https://picsum.photos/seed/lo07/900/600",  location: "London", w: 900, h: 600  },
  { id: 48, src: "https://picsum.photos/seed/lo08/700/700",  location: "London", w: 700, h: 700  },
  { id: 49, src: "https://picsum.photos/seed/lo09/900/600",  location: "London", w: 900, h: 600  },

  // ── Switzerland (8) ───────────────────────────────────────────────────────
  { id: 50, src: "https://picsum.photos/seed/sw01/900/600",  location: "Switzerland", w: 900, h: 600  },
  { id: 51, src: "https://picsum.photos/seed/sw02/900/560",  location: "Switzerland", w: 900, h: 560  },
  { id: 52, src: "https://picsum.photos/seed/sw03/600/900",  location: "Switzerland", w: 600, h: 900  },
  { id: 53, src: "https://picsum.photos/seed/sw04/900/600",  location: "Switzerland", w: 900, h: 600  },
  { id: 54, src: "https://picsum.photos/seed/sw05/750/1000", location: "Switzerland", w: 750, h: 1000 },
  { id: 55, src: "https://picsum.photos/seed/sw06/900/600",  location: "Switzerland", w: 900, h: 600  },
  { id: 56, src: "https://picsum.photos/seed/sw07/600/900",  location: "Switzerland", w: 600, h: 900  },
  { id: 57, src: "https://picsum.photos/seed/sw08/900/560",  location: "Switzerland", w: 900, h: 560  },

  // ── Sweden (7) ────────────────────────────────────────────────────────────
  { id: 58, src: "https://picsum.photos/seed/se01/900/600",  location: "Sweden", w: 900, h: 600  },
  { id: 59, src: "https://picsum.photos/seed/se02/600/900",  location: "Sweden", w: 600, h: 900  },
  { id: 60, src: "https://picsum.photos/seed/se03/900/560",  location: "Sweden", w: 900, h: 560  },
  { id: 61, src: "https://picsum.photos/seed/se04/750/1000", location: "Sweden", w: 750, h: 1000 },
  { id: 62, src: "https://picsum.photos/seed/se05/900/600",  location: "Sweden", w: 900, h: 600  },
  { id: 63, src: "https://picsum.photos/seed/se06/600/900",  location: "Sweden", w: 600, h: 900  },
  { id: 64, src: "https://picsum.photos/seed/se07/900/600",  location: "Sweden", w: 900, h: 600  },

  // ── California (7) ────────────────────────────────────────────────────────
  { id: 65, src: "https://picsum.photos/seed/ca01/900/560",  location: "California", w: 900, h: 560  },
  { id: 66, src: "https://picsum.photos/seed/ca02/900/600",  location: "California", w: 900, h: 600  },
  { id: 67, src: "https://picsum.photos/seed/ca03/600/900",  location: "California", w: 600, h: 900  },
  { id: 68, src: "https://picsum.photos/seed/ca04/900/600",  location: "California", w: 900, h: 600  },
  { id: 69, src: "https://picsum.photos/seed/ca05/900/560",  location: "California", w: 900, h: 560  },
  { id: 70, src: "https://picsum.photos/seed/ca06/750/1000", location: "California", w: 750, h: 1000 },
  { id: 71, src: "https://picsum.photos/seed/ca07/900/600",  location: "California", w: 900, h: 600  },

  // ── India (7) ─────────────────────────────────────────────────────────────
  { id: 72, src: "https://picsum.photos/seed/in01/600/900",  location: "India", w: 600, h: 900  },
  { id: 73, src: "https://picsum.photos/seed/in02/900/600",  location: "India", w: 900, h: 600  },
  { id: 74, src: "https://picsum.photos/seed/in03/750/1000", location: "India", w: 750, h: 1000 },
  { id: 75, src: "https://picsum.photos/seed/in04/900/560",  location: "India", w: 900, h: 560  },
  { id: 76, src: "https://picsum.photos/seed/in05/600/900",  location: "India", w: 600, h: 900  },
  { id: 77, src: "https://picsum.photos/seed/in06/900/600",  location: "India", w: 900, h: 600  },
  { id: 78, src: "https://picsum.photos/seed/in07/700/700",  location: "India", w: 700, h: 700  },

  // ── Spain (4) ─────────────────────────────────────────────────────────────
  { id: 79, src: "https://picsum.photos/seed/sp01/900/600",  location: "Spain", w: 900, h: 600  },
  { id: 80, src: "https://picsum.photos/seed/sp02/600/900",  location: "Spain", w: 600, h: 900  },
  { id: 81, src: "https://picsum.photos/seed/sp03/900/560",  location: "Spain", w: 900, h: 560  },
  { id: 82, src: "https://picsum.photos/seed/sp04/750/1000", location: "Spain", w: 750, h: 1000 },

];

// Destinations sorted by photo count descending (for filter pills)
export const DESTINATIONS = [
  { name: "Iceland",     count: 15 },
  { name: "Amsterdam",   count: 15 },
  { name: "Turkey",      count: 10 },
  { name: "London",      count:  9 },
  { name: "Switzerland", count:  8 },
  { name: "Sweden",      count:  7 },
  { name: "California",  count:  7 },
  { name: "India",       count:  7 },
  { name: "Spain",       count:  4 },
];

export const TOTAL_PHOTOS = PHOTOS.length; // 82
