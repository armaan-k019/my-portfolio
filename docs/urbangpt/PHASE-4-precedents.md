# Phase 4: precedent matcher (BLOCKED)

Status: BLOCKED on a dataset decision by the owner. Nothing in this phase may be built until
`OPEN-QUESTIONS.md` item 14 is answered. This file specifies the interface and the data
requirements only. It deliberately does not pick a dataset and does not invent one.

## Intent

Given an analyzed site, show built works whose site conditions resemble it (climate, terrain,
density, flood exposure, seismic category) so an architect can look at how others answered a
similar site. This is a site similarity search over precedents, not a style search.

## Interface

Route: `GET /api/urban-gpt/precedents?site=<siteId>&limit=8`

Response:

```ts
interface PrecedentMatch {
  id: string;                 // dataset native id
  title: string;
  architect: string | null;
  year: number | null;
  location: { lat: number; lng: number; locality: string };
  typology: string | null;    // from the dataset's own vocabulary, not inferred
  sourceUrl: string;          // canonical page in the dataset
  imageUrl: string | null;    // only when the licence permits hotlinking or redistribution
  imageLicence: string | null;
  match: number;              // 0 to 100 from vector distance, same formula as sites
  sharedConditions: string[]; // the metric names that are closest, e.g. ["reliefM", "meanWindMs"]
}
interface PrecedentsResponse {
  status: "ok" | "unavailable";
  dataset: { name: string; version: string; licence: string; count: number };
  matches: PrecedentMatch[];
  unavailable?: { code: string; message: string };
}
```

Panel: a row of cards under the memory panel, each card showing title, architect, year, locality,
match percent, shared conditions, and a link. No image unless the licence allows it. The panel
shows "Precedent matching is not enabled" when the route reports `unavailable` with
`code: "not_configured"`.

## Matching method

Each precedent gets the same 14 component vector as a site (`SPEC.md` section 14) computed from
its coordinates by the same pipeline (climate, topo, seismic, soil, osm, walkshed, flood, census).
That means precedent ingestion is a batch job that runs the phase 1 layers for each precedent's
location and stores a `precedents` table with `metrics_vector`. Non US precedents will have null
for the US only components, so either the vector is reduced to the components available for both
(climate, topo, osm, walkshed: 10 components) or non US precedents are excluded. That choice is
part of the blocked decision.

Table sketch (not to be created yet):

```sql
create table precedents (
  id text primary key, dataset text not null, title text not null, architect text, year int,
  lat double precision not null, lng double precision not null, locality text, typology text,
  source_url text not null, image_url text, image_licence text,
  metrics jsonb, metrics_vector extensions.vector(14), ingested_at timestamptz
);
```

## Data requirements

A usable dataset must provide, per record: a precise location (coordinates or a geocodable street
address, not just a city), title, architect, year, a typology field, a canonical URL, and a licence
that permits storing the metadata and displaying it on a public site. Images are optional and
must carry their own licence.

Minimum useful size: about 500 records with coordinates spread across climates. Below that the
nearest matches will be poor and the feature will read as decoration.

## Candidate datasets, with licensing notes

None of these has been verified for coverage or field quality in this spec. Each note is limited to
what the licence page states; the owner should read the licence before deciding.

| Candidate | What it offers | Licensing note | Concern |
|---|---|---|---|
| Wikidata (items with `instance of` building or architectural work, `architect`, `inception`, `coordinate location`) via SPARQL | Structured metadata, coordinates, links to Commons images | CC0 for Wikidata data; Commons images carry per file licences (CC BY, CC BY-SA, public domain) | Coverage is uneven; typology vocabulary is inconsistent; needs a curated query and a quality filter |
| OpenStreetMap buildings with `architect` or `wikidata` tags via Overpass | Footprints and coordinates for buildings with a named architect | ODbL; attribution required; derived databases are share alike | Sparse `architect` tagging; Overpass reliability as seen in phase 1 |
| ArchDaily | Rich curated projects with images and typologies | Proprietary; terms of use prohibit scraping and reuse; the Archipedia project's 9,800 image corpus is not redistributable | Not usable as a public dataset without a licence agreement |
| Award lists (Pritzker, AIA Twenty-five Year Award, RIBA Stirling) transcribed by hand | Small, high quality, well known works | Lists of facts are not copyrightable in the US; images are | Small (hundreds), heavily skewed to famous works, hand entry effort |
| Owner's own curated corpus (built from the Archipedia metadata without images) | Typology and location fields already exist | Depends on the source of each record; images excluded | Requires per record verification per the repo's anti fabrication rule |

## What the build session may do now

Nothing under `src/`. It may add findings to `OPEN-QUESTIONS.md` item 14 if the owner asks for a
coverage check of a candidate (for example, run a SPARQL count of Wikidata buildings with
coordinates and an architect). Any such check is recorded with the query and the number returned.

## Unblocking

The owner answers `OPEN-QUESTIONS.md` item 14 with: the dataset, the licence they accept, whether
non US precedents are included, and whether images are shown. This file is then rewritten into a
full phase with steps and acceptance checks, and the `precedents` table is added as migration 0003.
