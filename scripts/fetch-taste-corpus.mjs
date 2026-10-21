// Builds the Midjourney demo's painting corpus from the Art Institute of
// Chicago public API (https://api.artic.edu/docs/). Public-domain paintings
// only. Downloads a 400px wide JPEG per work into public/demos/midjourney/corpus/
// and rewrites src/app/demos/midjourney/corpus.ts with the museum's metadata.
//
//   node scripts/fetch-taste-corpus.mjs            # 150 works
//   node scripts/fetch-taste-corpus.mjs --count 120

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const IMG_DIR = path.join(ROOT, "public/demos/midjourney/corpus");
const OUT = path.join(ROOT, "src/app/demos/midjourney/corpus.ts");
const HEADERS = { "AIC-User-Agent": "armaankazi.com taste demo (kaziarmaan019@gmail.com)" };

const countArg = process.argv.indexOf("--count");
const COUNT = countArg > -1 ? Number(process.argv[countArg + 1]) : 150;

async function search(page) {
  const res = await fetch("https://api.artic.edu/api/v1/artworks/search", {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: { bool: { must: [{ term: { is_public_domain: true } }, { exists: { field: "image_id" } }] } },
      fields: ["id", "title", "artist_title", "date_display", "image_id", "artwork_type_title"],
      limit: 100,
      page,
    }),
  });
  if (!res.ok) throw new Error(`search page ${page}: HTTP ${res.status}`);
  return (await res.json()).data;
}

const picked = [];
const seenArtists = new Map();
for (let page = 1; page <= 10 && picked.length < COUNT; page++) {
  for (const w of await search(page)) {
    if (picked.length >= COUNT) break;
    if (w.artwork_type_title !== "Painting" || !w.image_id) continue;
    // At most three works per artist, so one painter cannot dominate the feature space.
    const artist = w.artist_title ?? "Unknown";
    if ((seenArtists.get(artist) ?? 0) >= 3) continue;
    const url = `https://www.artic.edu/iiif/2/${w.image_id}/full/400,/0/default.jpg`;
    const img = await fetch(url, { headers: HEADERS });
    if (!img.ok) {
      console.warn(`skip ${w.id}: image HTTP ${img.status}`);
      continue;
    }
    await mkdir(IMG_DIR, { recursive: true });
    await writeFile(path.join(IMG_DIR, `${w.id}.jpg`), Buffer.from(await img.arrayBuffer()));
    seenArtists.set(artist, (seenArtists.get(artist) ?? 0) + 1);
    picked.push({ id: w.id, title: w.title, artist, date: w.date_display ?? "", file: `/demos/midjourney/corpus/${w.id}.jpg` });
    console.log(`${picked.length}/${COUNT} ${w.id} ${w.title}`);
  }
}

const header = (await import("node:fs")).readFileSync(OUT, "utf8").split("export const CORPUS")[0];
await writeFile(OUT, `${header}export const CORPUS: Artwork[] = ${JSON.stringify(picked, null, 2)};\n`);
console.log(`wrote ${picked.length} works to ${path.relative(ROOT, OUT)}`);
