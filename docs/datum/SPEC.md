# Datum rebuild: specification

Status: draft for build. Written 2026-09-21 against `origin/main` at `5fda80e` (PR #20 merged).
Audience: the implementation session (Opus) that builds each phase, and the repo owner who reviews it.

Read `CLAUDE.md` and `AGENTS.md` first. They override anything here on repo conventions
(no em dashes, per step commits, `npx tsc --noEmit` and `npm run build` before "done", path scoping).

Companion documents: `PHASE-0-verify.md`, `PHASE-1-data.md`, `PHASE-2-sheet.md`, `PHASE-3-memory.md`,
`PHASE-4-precedents.md` (BLOCKED), `RISKS.md`, `OPEN-QUESTIONS.md`.

## 1. Goals

1. Turn `/projects/datum` into a tool a working architect would open at the start of a project:
   enter an address, get an architectural site analysis sheet built from verified public data.
2. Every number on the sheet traces to a named source and a named field. A source that fails shows
   an unavailable state, never a default or an estimate.
3. Export the sheet as true vector SVG with one named group per layer, so it opens in Illustrator
   and Rhino with layers intact and can be traced over.
4. Make the site brief (Claude) cite the data field behind every claim and say plainly what is missing.
5. Remember every analysis (Supabase) so a new site can be placed in context: percentiles, a map of
   analyzed sites, and "sites like this" by vector distance over normalized site metrics.
6. Cut response time from 30 to 36 seconds for one blocking request to progressive rendering where
   the first layers appear in under 3 seconds and nothing blocks on the slowest source.
7. Shrink `page.tsx` from 1350 lines to a thin composition of layer components.

## 2. Non-goals

- Zoning. Dropped entirely (product decision). No zoning route, panel, or mention on the sheet.
- Air quality. Dropped: a short forecast window does not change a design decision.
- Urban heat island score. Dropped: the existing score mixes a forecast surface temperature with a
  park count and is not a measurement. Climate and comfort replace it with measured normals.
- Amenity POI counts (dining, schools, health) and the walkability and bike scores. Dropped: the
  scores were invented formulas. Transit stops remain, inside the walk shed layer.
- Building height inference. Never estimate a height. Never derive metres from `building:levels`.
  No neighbour shadow analysis (it would depend on heights that mostly do not exist in OSM).
- Any neighbourhood history, culture, or reputation text from Claude's general knowledge.
- Storing typed addresses. Only the geocoded point and a coarse locality label are stored.
- Authentication, accounts, saved projects. Site Memory is anonymous and public.
- Non US sites. All sources except Open-Meteo, OSM, and geocoding are US only. Outside the US
  those layers show `no_coverage`; the app does not block non US input.
- Raster map tiles in the export. Leaflet tiles are for the on screen confirm step and the sites
  map only.

## 3. Product shape

Three routes inside one page, `/projects/datum`:

| Route | Name | Phase | State |
|---|---|---|---|
| 1 | Site Sheet | 1 and 2 | specified |
| 2 | Site Memory | 3 | specified |
| 3 | Precedent Matcher | 4 | BLOCKED on a dataset decision |

User flow for Route 1:

1. Type an address. Suggestions come from Photon through a server proxy (debounced 300 ms, min 3 chars).
2. Submit. The server geocodes with Nominatim (one request per submit). The page shows the resolved
   point on a small Leaflet map with the display name and asks the user to confirm or adjust by
   dragging the marker. Nothing else runs until confirm. (Photon mis-resolves the Miami test
   intersection; Nominatim resolves it. This step is mandatory, not optional.)
3. On confirm, the client creates or fetches the site record (`POST /api/datum/site`), then fires
   every layer request in parallel. Each layer renders into its sheet panel as it arrives. Panels
   that fail render an unavailable state with the reason and a retry button.
4. When the layers that the brief depends on have settled (ok or unavailable), the client opens the
   streaming brief request. Text streams into the brief panel with citation chips.
5. Export SVG is enabled once all layers have settled. Unavailable panels export as unavailable
   panels (a framed box with the reason), never blank and never with placeholder values.

Fixed extents, no radius slider:

| Layer | Extent |
|---|---|
| Figure-ground, streets, water, flood polygons, contours | 400 m radius, drawn as an 800 m square frame |
| Walk shed | street network fetched to 1200 m radius; 5, 10, 15 minute bands |
| Topography grid | 21 x 21 samples at 40 m spacing (840 m span) centred on the site |
| Demographics | the Census tract containing the point |
| Climate, wind, sun, seismic, soil | point values |

## 4. Layer selection

Test applied to each candidate: does it change a design decision an architect makes in schematic design?

Included:

| Layer | Source | Decision it changes |
|---|---|---|
| Sun path and solar angles | computed (NOAA solar position equations, no API) | Orientation, glazing ratio per facade, overhang depth, court proportions |
| Wind rose (annual, summer, winter) | Open-Meteo ERA5 archive, hourly 10 m wind, 3 years | Natural ventilation openings, entrance and courtyard placement, wind screening |
| Climate and comfort | Open-Meteo ERA5 archive, hourly temperature, humidity, shortwave radiation | Envelope strategy, passive versus mechanical bias, thermal mass, shading season |
| Topography (contours, two sections, slope) | USGS 3DEP `getSamples`, EPQS for the site point | Grading, split levels, entry level, drainage direction, retaining walls |
| Seismic design values | USGS ASCE 7-22 web service | Structural system choice, detailing category, irregularity tolerance |
| Soil | USDA Soil Data Access (SSURGO) | Foundation type, infiltration and stormwater strategy, basement viability |
| Figure-ground and building heights (tagged only) | Overpass (OSM) | Massing, street wall continuity, setbacks, party wall conditions |
| Walk shed and transit stops | computed from OSM street network | Entrance placement, ground floor program, parking demand argument |
| Flood | FEMA NFHL layer 28 (zones), layer 0 (coverage) | Finished floor elevation, ground floor program, flood proofing, insurance |
| Demographics | Census ACS 5-year (tract) plus TIGERweb tract geometry | Unit mix, program, tenure, car-free share for parking and entry design |

Excluded:

| Candidate | Reason |
|---|---|
| Air quality | Only a forecast window is available; no annual profile; does not change a decision |
| Zoning | Product decision; the only working endpoints were city specific and the Atlanta one is dead |
| Urban heat island score | Not a measurement; replaced by measured climate normals |
| POI amenities and walk/bike scores | Invented formulas; transit stops kept inside the walk shed |
| Building height estimation and shadows | OSM heights are mostly absent (11 of 96 buildings in Atlanta); estimating would fabricate |

## 5. Verified endpoints

Every endpoint below was requested on 2026-09-21 from this machine and returned the described result.
Anything not in this table is unverified and belongs in `OPEN-QUESTIONS.md`.

| Source | Endpoint | Key | Verified behaviour |
|---|---|---|---|
| Photon | `GET https://photon.komoot.io/api/?q=&limit=&lang=en&lat=&lon=` | none | GeoJSON FeatureCollection. Terms: "be fair", throttled on heavy use, no availability guarantee |
| Nominatim | `GET https://nominatim.openstreetmap.org/search?q=&format=jsonv2&limit=1&countrycodes=us` | none | Policy: max 1 request per second, descriptive User-Agent required, autocomplete forbidden |
| Nominatim reverse | `GET https://nominatim.openstreetmap.org/reverse?lat=&lon=&format=jsonv2&zoom=10` | none | Used only for the coarse locality label |
| Overpass | `POST https://overpass-api.de/api/interpreter` body `data=<QL>` form encoded | none | 406 without User-Agent. Intermittent 504 "server is probably too busy" independent of query size. Rate limit 2 concurrent slots per IP. Mirror `https://overpass.kumi.systems/api/interpreter` hung 180 s on one probe |
| USGS EPQS | `GET https://epqs.nationalmap.gov/v1/json?x=&y=&units=Meters&wkid=4326&includeDate=false` | none | `{ value: "281.726..." }` string metres |
| USGS 3DEP | `POST https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples` with `geometry` (esriGeometryMultipoint JSON), `geometryType=esriGeometryMultipoint`, `returnFirstValueOnly=true`, `f=json` | none | 100 points in 1.0 s; `samples[i].value` string metres, `locationId` maps to input order |
| USGS seismic | `GET https://earthquake.usgs.gov/ws/building-codes/asce7-22/calculate?latitude=&longitude=&riskCategory=II&siteClass=D&title=Datum` | none | The old `/ws/designmaps/` path 301s here. `response.data` has `ss, s1, sds, sd1, sms, sm1, sdc, pgam, tl, ts, t0`. Site classes A to E accepted |
| USDA SDA | `POST https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest` JSON `{ query, format: "JSON+COLUMNNAME" }` | none | Query uses `SDA_Get_Mukey_from_intersection_with_WktWgs84('point(lng lat)')` joined to `mapunit` and `component`. Max 100000 rows |
| FEMA NFHL zones | `GET https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query` ArcGIS query params, `f=json` | none | The old `/gis/nfhl/` path returns 404. Fields `FLD_ZONE, ZONE_SUBTY, SFHA_TF, STATIC_BFE` |
| FEMA NFHL availability | same service, layer `0`, `outFields=STUDY_ID` | none | Empty `features` at WaKeeney: no NFHL coverage there |
| Census geocoder | `GET https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=&y=&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json` | none | `result.geographies["Census Tracts"][0]` has `GEOID, STATE, COUNTY, TRACT, AREALAND` |
| Census ACS | `GET https://api.census.gov/data/2023/acs/acs5?get=&for=tract:&in=state:%20county:&key=` | `CENSUS_API_KEY` | Without a key every data request returns an HTML "Missing Key" page with HTTP 200. The variables endpoint (`.../variables/B08301_019E.json`) works without a key and confirms the 2023 vintage exists |
| TIGERweb | `GET https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query?where=GEOID='...'&outFields=GEOID,NAME,AREALAND&returnGeometry=true&outSR=4326&f=json` | none | Tract polygon rings |
| Open-Meteo archive | `GET https://archive-api.open-meteo.com/v1/archive?latitude=&longitude=&start_date=2023-01-01&end_date=2025-12-31&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,shortwave_radiation&timezone=auto` | none | 26304 hourly rows, 1.05 MB, 1.7 s, zero nulls. ERA5 has a 5 day delay |
| Vercel Hobby | n/a | n/a | Function max duration 300 s default and maximum with Fluid compute. Cron: once per day, hour precision |
| Supabase | n/a | n/a | Docs say free projects "may" be paused after 7 days of low activity; restore is a one click action in Studio |

Test sites, geocoded by Nominatim on 2026-09-21. Use these coordinates in every acceptance check so
runs are comparable even if geocoding drifts:

| Site | lat, lng | Tract GEOID | Facts verified |
|---|---|---|---|
| Techwood Drive NW, Atlanta, GA 30313 | 33.7751258, -84.3919750 | 13121001002 | EPQS 281.7 m. Soil "Urban land". Seismic (7-22, II, D): ss 0.25, s1 0.094, sds 0.21, sd1 0.13, sdc B, pgam 0.12. Flood: zone X, "AREA OF MINIMAL FLOOD HAZARD", SFHA F. OSM within 400 m (capture of 2026-09-22 in `e2e/fixtures/overpass/atlanta.raw.json`): 140 distinct building features (126 ways, 14 relations with 30 outer rings), 14 with a height tag, 49 with a levels tag. An earlier figure of 96, 11, 0 came from a probe centred about 400 m west and counting ways only; see PROGRESS.md |
| NE 25th St and Biscayne Blvd, Miami, FL | 25.8011588, -80.1890627 | 12086002707 | EPQS 2.0 m. Soil "Urban land, 0 to 2 percent slopes". Seismic sds 0.044, sdc A. Flood at point: X, "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", SFHA F; within 400 m: AE (25 polygons) and VE (15) SFHA T. OSM: about 258 buildings, 214 with height |
| 300 Main St, WaKeeney, KS | 39.0197690, -99.8837310 | 20195955800 | EPQS 744.0 m. Soil "Harney silt loam, 0 to 1 percent slopes", hydrologic group C, well drained. Seismic ss 0.13, s1 0.046, sds 0.11, sd1 0.066, sdc A. Flood: no NFHL coverage (layer 0 and 28 both empty). OSM: about 21 buildings within 400 m |

## 6. Architecture

```
src/app/projects/datum/
  page.tsx                 server component shell: title, intro, <SiteSheetApp />
  SiteSheetApp.tsx         client: address, confirm map, orchestrates layer fetches, brief, export
  ConfirmMap.tsx           Leaflet, dynamic import, ssr false
  panels/                  one React component per sheet panel, each renders a <g> via the builders
  MemoryPanel.tsx          phase 3
  SitesMap.tsx             phase 3, Leaflet
src/lib/datum/
  types.ts                 LayerEnvelope, per layer data types, SiteRecord
  geo.ts                   local projection (metres east/north from lat, lng), haversine, bbox
  solar.ts                 solar position, sun path, no dependency
  climate.ts               wind rose bins, monthly normals, degree days, comfort share
  topo.ts                  grid, contours (d3-contour), sections, slope
  walkshed.ts              graph from OSM ways, Dijkstra, bands
  sources/                 one module per external source: fetch, parse, normalize, never throw
    photon.ts nominatim.ts overpass.ts usgsElevation.ts usgsSeismic.ts usdaSoil.ts fema.ts
    census.ts openMeteo.ts
  cache.ts                 Supabase backed api_cache with in memory fallback
  memory.ts                Supabase client, site records, rate limit, metrics, similar sites
  brief/prompt.ts          system prompt, input serializer, citation validator
  sheet/                   pure SVG builders, no React, no DOM
    layout.ts              sheet constants, zones, scales, projection to sheet px
    builders/*.ts          one builder per <g id>, each (data | unavailable) => string
    sheet.ts               assembles the full document string
    styles.ts              line weights, hatches, colours (from globals.css tokens, hard coded hex)
src/app/api/datum/
  suggest/route.ts         Photon proxy
  geocode/route.ts         Nominatim proxy, 1 rps token bucket
  site/route.ts            create or fetch site record, rate limit check
  layers/[layer]/route.ts  one handler, dispatches on layer name, maxDuration 60
  brief/route.ts           streaming SSE, maxDuration 60
  memory/context/route.ts  phase 3
  memory/map/route.ts      phase 3
  memory/ping/route.ts     phase 3, daily cron target
supabase/migrations/
  0001_cache_sites_ratelimit.sql   phase 1
  0002_memory_pgvector.sql         phase 3
e2e/                       Playwright specs and fixtures
```

Rules:

- Sheet builders are pure functions from data to SVG string. The React panels render the same
  string with `dangerouslySetInnerHTML` inside the on screen `<svg>`. Export concatenates the same
  strings. One code path, so what you see is what you export. Builders are unit testable in Node
  with fixture JSON and no browser.
- Source modules never throw. They return a `LayerEnvelope` (section 8) with `status` set.
- Heavy client libraries (Leaflet) are imported dynamically inside the components that need them.
- New dependencies allowed: `@supabase/supabase-js` (already present), `d3-contour` and
  `@types/d3-contour`, `@playwright/test` (dev). Nothing else without an entry in `OPEN-QUESTIONS.md`.

## 7. API routes

All under `src/app/api/datum/`. All export `maxDuration`. All answer JSON except the brief.
All read the client IP from `x-forwarded-for` (first entry) for the rate limit only.

| Route | Method | maxDuration | Input | Output |
|---|---|---|---|---|
| `suggest` | GET | 15 | `q` (min 3 chars) | `{ suggestions: [{ label, lat, lng }] }` max 6. Photon proxy with User-Agent `Datum/1.0 (site analysis; portfolio; +https://<site domain>)` |
| `geocode` | POST | 15 | `{ q }` | `{ lat, lng, displayName, locality }` or `{ error: { code: "not_found" } }`. Nominatim search plus one reverse call at `zoom=10` for `locality` ("Atlanta, Georgia"). Server side token bucket: 1 request per second per instance, 429 when exhausted |
| `site` | POST | 15 | `{ lat, lng, isTest? }` | `{ siteId, siteKey, locality, tract: { geoid, state, county, tract, areaLandM2 } | null, memoryStatus, rateLimit: { remaining } }`. Creates the `sites` row if new. `isTest` accepted only when `DATUM_ALLOW_TEST_FLAG=1` |
| `layers/[layer]` | GET | 60 | `site=<siteId>` plus per layer params (`siteClass` for seismic) | `LayerEnvelope` |
| `brief` | POST | 60 | `{ siteId }` | `text/event-stream` (section 11) |
| `memory/context` | GET | 15 | `site=` | percentiles and similar sites (phase 3) |
| `memory/map` | GET | 15 | none | snapped public points (phase 3) |
| `memory/ping` | GET | 15 | cron only | `{ ok }` (phase 3) |

Layer names: `sun`, `climate`, `topo`, `seismic`, `soil`, `osm`, `walkshed`, `flood`, `census`.

`walkshed` depends on the street network. It calls the same Overpass fetch as `osm` through the
cache, so whichever route runs first pays for it and the second reads the cache. If Overpass fails,
both report `unavailable` with the same reason.

Concurrency budget on the client: fire `sun`, `climate`, `topo`, `seismic`, `soil`, `flood`, `census`
immediately, and `osm` immediately. Fire `walkshed` after `osm` settles (ok or unavailable), because
the street fetch is shared and firing both at once would double the Overpass load and trip its two
slot limit.

## 8. Layer envelope and unavailable states

```ts
type LayerStatus = "ok" | "partial" | "unavailable";

interface LayerEnvelope<T> {
  layer: LayerName;
  status: LayerStatus;
  data: T | null;                 // null when unavailable; never a default object
  source: {
    name: string;                 // "FEMA National Flood Hazard Layer"
    url: string;                  // the request URL with the key parameter removed
    fetchedAt: string;            // ISO
    cached: boolean;
    licence: string;              // short attribution line, e.g. "© OpenStreetMap contributors, ODbL"
  };
  unavailable?: {
    code: "timeout" | "http_error" | "rate_limited" | "parse_error" | "no_coverage"
        | "missing_key" | "upstream_error" | "dependency_unavailable";
    message: string;              // human sentence for the panel
    httpStatus?: number;
    retryable: boolean;
  };
  partial?: { missing: string[]; message: string };  // which fields are absent and why
  fieldPaths: string[];           // every dotted path in data that the brief may cite
}
```

Rules that apply to every source:

1. A failed request produces `status: "unavailable"` and `data: null`. No source module contains a
   literal fallback value (search the diff for patterns like `?? 20`, `?? "X"`, `: 18` in source
   modules; the acceptance checks grep for them).
2. `no_coverage` is a valid answer, not an error: the request succeeded and the source has no data
   for this point (FEMA at WaKeeney, non US sites for USGS, USDA, Census, FEMA). It is cached.
   `timeout`, `http_error`, `rate_limited`, `parse_error`, `upstream_error` are never cached.
3. `partial` means the request succeeded and most fields parsed but some are null (for example ACS
   returns `-666666666` for suppressed estimates; those become null and are listed in `missing`).
4. The on screen panel and the exported SVG panel both show: the panel title, the source name,
   the word UNAVAILABLE in the eyebrow style, the `message`, and (on screen only) a retry button.
5. The brief receives the list of unavailable layers and must name them.
6. Timeouts per request: Overpass 45 s, 3DEP 20 s, others 12 s. Retries: one retry with 1.5 s backoff
   on `timeout` and on HTTP 502, 503, 504; Overpass tries `overpass-api.de` twice then
   `overpass.kumi.systems` once, each with its own 45 s timeout, inside the 60 s route budget only if
   the previous attempt failed fast. Total wall clock is capped at 55 s; when the cap is hit the
   envelope is `timeout`.
7. Every numeric value is rounded to its field's precision before the envelope leaves the layer
   (amended 2026-09-25). The table is below. `src/lib/datum/precision.ts` holds it and
   `src/lib/datum/layers.ts` applies it to every envelope a fetcher returns, which is the single
   point everything passes through before the page, the sheet, `layer_results`, the metrics, or the
   brief serializer sees it. `brief/store.ts` applies it again to stored rows and to client sent
   envelopes: a row written before this rule is still inside its TTL, and a client is not trusted to
   have rounded anything.

Per source unavailable messages (verbatim, so screenshots are comparable):

| Source | Message |
|---|---|
| Overpass | "OpenStreetMap data could not be loaded (Overpass <code>). Buildings, streets, and the walk shed are unavailable. Retry in a minute." |
| FEMA, no coverage | "FEMA has not published a flood hazard layer for this location. Check the community's status at msc.fema.gov." |
| FEMA, failure | "FEMA flood data could not be reached (<code>). Verify at msc.fema.gov." |
| USGS elevation | "USGS 3DEP elevation could not be reached (<code>). Topography is unavailable." |
| USGS seismic | "USGS seismic design values could not be reached (<code>)." |
| USDA | "USDA soil survey could not be reached (<code>)." |
| USDA, no coverage | "No SSURGO soil map unit intersects this point." |
| Census, missing key | "Census API key is not configured on the server. Demographics are unavailable." |
| Census, no tract | "The Census geocoder returned no tract for this point. Demographics are unavailable." |
| Census, failure | "Census ACS could not be reached (<code>)." |
| Open-Meteo | "Open-Meteo climate archive could not be reached (<code>). Wind and climate are unavailable." |
| Brief dependency | "The brief was written without <layer list>; those sources were unavailable." |

### Rounding precision per field (rule 7)

Why the rule exists. The brief on one Miami site printed "2.660512686 m" for a terrain section.
Nine decimals on a 3DEP elevation is a float, not a measurement. Two causes: `summarise` in
`brief/prompt.ts` collapses an array longer than 16 to a count, a min and a max, and took the
extremes straight off the unrounded values, which is every 21 point terrain section; and `roundLeaf`
applied four decimals to a metre, a degree and a percent alike, which is the "1.8284 m". The value
aware citation check (section 12) then compared what the brief wrote against what the model was
given, so rounding a number cost the brief a citation and the model stopped rounding. The rule fixes
the data, not the prompt: the model is given the number an architect would write, so quoting it
exactly is both correct and what passes the check.

How a precision is chosen. Each field takes the coarser of what its unit deserves and what the sheet
already prints, and where the sheet prints a value the two are the same, so no printed measurement
changes. Rounding uses `toFixed`, because the sheet formats with `toFixed` and a multiply and divide
form disagrees with it at a trailing .5.

| Layer | Field | Decimals | Why |
|---|---|---|---|
| sun | `latitude`, `longitude` | 5 | The title block prints the site point at 5, about a metre. |
| sun | `*.sunriseAzimuthDeg`, `*.sunsetAzimuthDeg`, `*.noonAltitudeDeg` | 1 | Degrees to 0.1. Finer than any shadow study needs. |
| sun | `*.samples[].altitudeDeg`, `*.samples[].azimuthDeg` | 1 | Same, and they only plot the arc. |
| sun | `*.daylightHours`, `daylightHoursByMonth[]` | 1 | Hours to six minutes. |
| sun | `overhangRatioSouthGlazing` | 2 | The sheet prints "1 to 0.18". |
| climate | `wind.*.sectors[].sectorDeg`, `prevailingSectorDeg` | 1 | Degrees to 0.1; sectors are 22.5 apart. |
| climate | `wind.*.sectors[].frequencyPct`, `binsPct[]`, `calmSharePct` | 1 | Single digit percentages where a tenth separates two sectors. |
| climate | `wind.*.binEdgesMs[]` | 1 | Bin edges are 0.5, 2, 4, 6, 8. |
| climate | `wind.*.meanSpeedMs` | 2 | The sheet prints two decimals. |
| climate | `wind.*.resultantLength` | 3 | A 0 to 1 ratio the sheet prints at three. |
| climate | `monthly[].meanC`, `meanDailyMaxC`, `meanDailyMinC` | 1 | Temperature to 0.1 C, which is what ERA5 resolves. |
| climate | `monthly[].meanRhPct` | 1 | |
| climate | `monthly[].meanDailyRadiationKwhM2` | 2 | The sheet prints peak radiation at two. |
| climate | `degreeDays.baseC` | 1 | |
| climate | `degreeDays.hdd`, `cdd` | 0 | Degree days are whole days. |
| climate | `comfortShare.pct` | 1 | |
| climate | `period.years` | 0 | |
| topo | `siteElevationM`, `reliefM`, `grid.values[]`, `sections.ew[]`, `sections.ns[]` | 1 | Elevations and section values to 0.1 m. 3DEP is a 1 m to 10 m surface. |
| topo | `meanSlopePct` | 1 | Slope to 0.1 percent. |
| topo | `aspectDeg` | 1 | Degrees to 0.1. |
| topo | `grid.spacingM`, `contours.intervalM` | 1 | |
| topo | `grid.n` | 0 | A count. |
| seismic | `ss`, `s1`, `sms`, `sm1`, `sds`, `sd1`, `pgam` | 3 | ASCE 7-22 publishes and the sheet prints three. |
| seismic | `tl` | 1 | Seconds, printed at a tenth. |
| soil | `components[].percent` | 0 | SSURGO reports composition in whole percent. |
| soil | `components[].slopePct` | 1 | |
| osm | `buildings[].heightM` | 1 | Tagged metres; the sheet prints them whole. |
| osm | `buildings[].levels`, `*.id`, `stats.buildingCount`, `ringCount`, `withHeight`, `withLevels`, `relationCount` | 0 | Counts and ids. |
| osm | `transitStops[].x`, `transitStops[].y` | 1 | Local metres, to 0.1 m. |
| osm | `stats.coverageRatio` | 3 | A 0 to 1 share; three decimals is a tenth of a percent. |
| osm | `stats.sizeWarning.bytes`, `thresholdBytes` | 0 | |
| walkshed | `reachKm.5`, `.10`, `.15` | 1 | Street kilometres, printed at a tenth. |
| walkshed | `transitWithin.*`, `walkingSpeedMPerMin` | 0 | Counts, and a fixed 80 m per minute. |
| walkshed | `startNodeOffsetM` | 1 | |
| flood | `atPoint.staticBfeFt` | 1 | FEMA publishes base flood elevations to a tenth of a foot. |
| census | all ACS counts and the two medians in dollars | 0 | People, households, units, dollars. |
| census | `medianAge` | 1 | |
| census | `avgHouseholdSize` | 2 | The sheet prints two. |
| census | `tract.areaLandM2` | 0 | |
| census | `derived.densityPerKm2` | 1 | |
| census | `derived.renterSharePct`, `carFreeCommutePct`, `multifamily5plusSharePct` | 1 | Tract shares where a tenth of a percent is a household or two. |
| census | `margins.<field>` | as `<field>` | A margin of error is in the unit of the estimate it qualifies. |

Drawing geometry is deliberately not rounded and is listed in `GEOMETRY_PATHS`: contour lines,
building and water rings, street lines, walk shed bands, flood polygon rings and the tract polygon.
The serializer never sends geometry to the model (section 12), and `pathFrom` in `sheet/panel.ts`
already rounds it as it writes the path, so rounding it here would only move drawn lines.

A numeric field in neither list fails `e2e/unit/precision.spec.ts`, so a new field on any source
cannot reach a brief at whatever precision that source happened to send.

Two consequences on the record. Rounding the values the sheet plots from moves two derived display
scalars: the vertical exaggeration printed on the topography panel (Miami 20.8 to 21.1, WaKeeney 8.5
to 8.6), and two climate axis tick labels at WaKeeney that sat on a `toFixed(0)` boundary. Both are
computed from the data rather than measured, neither is a citable field, and both now describe the
data the sheet actually draws. Atlanta's 294 text nodes are unchanged. Stored metric vectors
computed before this rule differ from new ones below any metric's sensitivity.

## 9. Data per layer

Units stored in metric SI. The sheet formats imperial first with metric in parentheses.

### sun (computed, always ok)

Inputs: lat, lng, IANA timezone (from the Open-Meteo archive response `timezone`; if climate is
unavailable, use `Intl` offset lookup is not possible server side without a library, so fall back to
UTC and mark `partial` with `missing: ["timezone"]`).

Data: for 21 June, 21 March, 21 December: sunrise and sunset azimuth and local time, solar noon
altitude, hourly altitude and azimuth from sunrise to sunset. Plus a full year `hours_of_daylight`
per month. Algorithm: NOAA solar position equations (Meeus based, declination, equation of time,
hour angle). Accuracy requirement: within 0.5 degrees of the analytic checks in `PHASE-1-data.md`.

Sheet: stereographic sun path diagram, 21 June and 21 December arcs, hour ticks, north up, site
latitude printed. A second small table: noon altitude on the three dates, and recommended overhang
projection ratio for south glazing at the summer solstice (`1 / tan(altitude)` printed as a ratio
with the formula shown, labelled "geometry only, no site obstructions").

### climate (Open-Meteo archive)

Request: 3 calendar years ending at the last complete year on the request date (currently 2023 to
2025), hourly `temperature_2m, relative_humidity_2m, wind_speed_10m, wind_direction_10m,
shortwave_radiation`, `timezone=auto`. Cache key rounds lat and lng to 0.1 degree (ERA5 cell is
0.25 degree; sharing within 0.1 degree is safe and cuts calls).

Data:
- `wind.annual`, `wind.summer` (June to August), `wind.winter` (December to February): 16 sectors,
  speed bins in m/s `[0.5, 2, 4, 6, 8, Infinity]` with calm share (< 0.5 m/s), per sector frequency
  percent. Convert km/h to m/s. Also `prevailingSectorDeg`, `meanSpeedMs`, `resultantLength` (0 to 1).
- `monthly[12]`: mean, mean daily max, mean daily min temperature; mean RH; mean daily shortwave
  kWh/m2.
- `degreeDays`: HDD and CDD base 18.3 C per year, averaged over the 3 years.
- `comfortShare`: percent of hours with 18 to 26 C and RH under 70 percent. Label it on the sheet
  as "simple comfort band, not ASHRAE 55".
- `period: { start, end, years: 3 }`, `timezone`.

### topo (USGS)

Request: EPQS for the site point; 3DEP `getSamples` for a 21 x 21 grid at 40 m spacing in local
metres converted to lat, lng. Send as one multipoint (441 points). If the response has fewer than
441 samples, mark `partial` with the missing count; if fewer than 300, `unavailable` with
`parse_error`.

Data: `siteElevationM`, `grid: { spacingM: 40, n: 21, values: number[441] }` (row major, north to
south, west to east), `contours: { intervalM, lines: [[x,y][]] }` in local metres from d3-contour
thresholds chosen so there are 4 to 20 lines (try 1, 2, 5, 10 m), `sections: { ew: number[21],
ns: number[21] }`, `reliefM` (max minus min), `meanSlopePct`, `aspectDeg` of the best fit plane.

### seismic (USGS)

Request: `asce7-22/calculate` with `riskCategory=II`, `siteClass` from the query (default `D`),
`title=Datum`. Cache key rounds to 0.001 degree plus site class.

Data: `ss, s1, sms, sm1, sds, sd1, sdc, pgam, tl`, `assumptions: { reference: "ASCE 7-22",
riskCategory: "II", siteClass, siteClassIsDefault: boolean }`.

Sheet: values table plus the fixed sentence "Site Class D and Risk Category II are defaults. A
site specific geotechnical report is required to confirm site class."

### soil (USDA)

Query (parameterised by lng lat, 6 decimals, no user text ever enters the SQL string):

```sql
SELECT TOP 5 mu.muname, mu.mukey, c.compname, c.comppct_r, c.hydgrp, c.drainagecl, c.taxorder,
       c.slope_r, c.hydricrating
FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(<lng> <lat>)') AS i
INNER JOIN mapunit AS mu ON mu.mukey = i.mukey
INNER JOIN component AS c ON c.mukey = mu.mukey
ORDER BY c.comppct_r DESC
```

Data: `mapUnitName`, `mukey`, `components: [{ name, percent, hydrologicGroup, drainageClass,
taxOrder, slopePct, hydric }]`. Empty table means `no_coverage`. "Urban land" is a valid answer
and the sheet says what it means: "SSURGO maps this as Urban land: the natural profile is disturbed
or covered and no hydrologic group is assigned."

### osm (Overpass)

One query, fetched once per site and shared by `osm` and `walkshed`:

```
[out:json][timeout:45];
(
  way["building"](around:400,<lat>,<lng>);
  relation["building"](around:400,<lat>,<lng>);
  way["natural"="water"](around:400,<lat>,<lng>);
  relation["natural"="water"](around:400,<lat>,<lng>);
  way["waterway"](around:400,<lat>,<lng>);
  way["natural"="coastline"](around:400,<lat>,<lng>);
  way["highway"]["highway"!~"motorway|motorway_link|trunk|trunk_link|proposed|construction|abandoned|raceway"](around:1200,<lat>,<lng>);
  node["highway"="bus_stop"](around:1200,<lat>,<lng>);
  node["railway"~"^(station|tram_stop|halt)$"](around:1200,<lat>,<lng>);
);
out geom;
```

Trim before caching: keep `type, id, tags` (only `building, building:levels, height, name, highway,
foot, sidewalk, natural, waterway, railway`), and `geometry` or `lat, lon`, `members` for relations.
Store the trimmed payload; the 1.2 km Atlanta street set is 3.3 MB raw and should be under 1 MB
trimmed.

Data:
- `buildings: [{ id, ring: [x,y][] local metres, heightM: number | null, levels: number | null,
  name }]`. `heightM` parsed from `height` only when it is a plain number or a number with `m`;
  feet with `'` converted; anything else null. `levels` from `building:levels` integer only.
  Relations: draw outer member ways as rings; inner members are ignored in v1 and the count of
  relations is reported in `stats`.
- `water: [{ ring | line }]`, `streets: [{ id, highway, line: [x,y][], foot: boolean }]`,
  `transitStops: [{ id, kind: "bus" | "rail", x, y, name }]`.
- `stats: { buildingCount, withHeight, withLevels, relationCount, coverageRatio }` where
  `coverageRatio` is building footprint area (rings clipped to the 800 m frame) divided by the
  area of the 400 m fetch circle (pi times 400 squared, about 502655 m2), because buildings are
  fetched within that circle and the frame corners outside it hold no data. Owner decision
  2026-09-24. `buildingCount`, `withHeight`, `withLevels` count distinct features (one per way or
  relation id); `ringCount` counts rings drawn.

Sheet: figure-ground with buildings filled ink, streets as hairlines by class, water hatched,
the site parcel is not known (no parcel source) so the site is a marked point with a 50 m ring,
and heights printed as small labels only where tagged. The panel footer prints "heights known for
<withHeight> of <buildingCount> buildings; levels known for <withLevels>".

### walkshed (computed)

Graph: nodes at every coordinate in the `streets` set (dedupe on 1 cm rounding), edges per
consecutive pair, weight = haversine length. Exclude ways where `foot=no` and where `highway` is
`motorway|trunk` (already filtered) or `service` with `access=private`. Include `footway, path,
steps, pedestrian, living_street, residential, tertiary, secondary, primary, unclassified, track,
cycleway` (cycleway only when `foot` is not `no`). Start node: the nearest graph node to the site
within 150 m; if none, `unavailable` with `no_coverage` and the message "No walkable street within
150 m of this point in OpenStreetMap."

Walking speed 80 m per minute (4.8 km/h). Dijkstra to 1200 m. Band each edge by the arrival time
at its far node: 0 to 5, 5 to 10, 10 to 15 minutes.

Data: `bands: { 5: edges[], 10: edges[], 15: edges[] }` as `[x,y][]` polylines, `reachKm: { 5, 10, 15 }`
total street length reached, `transitWithin: { 5: n, 10: n, 15: n }`, `startNodeOffsetM`.

Sheet: reached streets drawn in three weights (heaviest nearest), unreached streets in the fetch
extent as faint grey, transit stops as symbols, a 5, 10, 15 minute key.

### flood (FEMA)

Requests: layer 0 at the point (`outFields=STUDY_ID`, `returnGeometry=false`). If no features:
`no_coverage`. Else layer 28 at the point (`outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE`)
and layer 28 in the 800 m envelope with `returnGeometry=true&outSR=4326`.

Classification is by fields, not by guess:
- `SFHA_TF === "T"`: special flood hazard area (1 percent annual chance).
- `FLD_ZONE === "X"` and `ZONE_SUBTY` contains `0.2 PCT`: moderate (0.2 percent annual chance).
- `FLD_ZONE === "X"` and `ZONE_SUBTY` contains `MINIMAL`: minimal.
- `FLD_ZONE === "D"`: undetermined.
- Anything else: report the raw zone and subtype as "other" without a risk label.
- `STATIC_BFE` of `-9999` means no static base flood elevation; store null.

Data: `atPoint: { zone, subtype, sfha, staticBfeFt | null, class }`, `polygons: [{ zone, subtype,
sfha, class, rings: [x,y][][] local metres }]` capped at 200 features, `coverage: true`.

Sheet: SFHA polygons with a dense diagonal hatch, 0.2 percent with a sparse hatch, VE with a
cross hatch, drawn under the buildings and over the water. Legend prints the zone codes present.

### census (Census Bureau)

Requests: geocoder for the tract (cached 365 days by 0.001 degree), ACS 2023 5-year for the tract
with `key=`, TIGERweb for the tract polygon (cached 365 days by GEOID).

Variables (all `E` estimates; the matching `M` margins are requested too and stored):

| Field | Variable | Use |
|---|---|---|
| population | B01003_001E | density with AREALAND |
| medianAge | B01002_001E | program |
| avgHouseholdSize | B25010_001E | unit mix |
| householdsTotal, ownerOccupied, renterOccupied | B25003_001E, B25003_002E, B25003_003E | tenure share |
| workersTotal, transitToWork, walkedToWork, bikeToWork, workedFromHome | B08301_001E, B08301_010E, B08301_019E, B08301_018E, B08301_021E | car free share |
| unitsTotal, singleDetached, units5to9, units10to19, units20to49, units50plus | B25024_001E, B25024_002E, B25024_007E, B25024_008E, B25024_009E, B25024_010E | housing type context |
| medianHouseholdIncome | B19013_001E | affordability program |
| medianGrossRent | B25064_001E | affordability program |

Negative sentinel values (`-666666666`, `-999999999`, `-222222222`) become null and are listed in
`partial.missing`. Derived: `densityPerKm2`, `renterSharePct`, `carFreeCommutePct` (transit plus
walked plus bike over workers), `multifamily5plusSharePct`.

Sheet: tract outline as a small locator at 1 inch = 2000 feet with the site marked, and a table.
The tract name and GEOID are printed.

## 10. Sheet composition

Paper: ARCH D landscape, 36 in by 24 in. SVG root:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="36in" height="24in" viewBox="0 0 2592 1728">
```

72 user units per inch, so 1 user unit is 1 point. Illustrator opens this at true size.

Grid: 0.5 in margins. Three columns: A 14 in, B 10 in, C 10 in with 0.5 in gutters
(0.5 + 14 + 0.5 + 10 + 0.5 + 10 + 0.5 = 36). Vertical: 0.5 in top margin, 21.5 in content,
1.5 in title block, 0.5 in bottom margin.

| Zone | Position (in, from top left) | Size (in) | Content | Group id |
|---|---|---|---|---|
| A1 | 0.5, 0.5 | 14 x 14 | Site plan, 1 in = 200 ft (1:2400). 800 m frame is 13.12 in square, centred, leaving room for the frame label, north arrow, scale bars | `site-plan` |
| A2 | 0.5, 15 | 14 x 7 | Two topographic sections (E-W over N-S), vertical exaggeration printed, plus soil card at right | `topography-section`, `soil` |
| B1 | 15, 0.5 | 10 x 10 | Walk shed plan, 1 in = 800 ft (1:9600); 2.4 km extent is 9.84 in | `walk-shed` |
| B2 | 15, 11 | 10 x 5 | Demographics table and tract locator | `demographics` |
| B3 | 15, 16.5 | 10 x 5.5 | Seismic values and assumptions, flood at point summary | `seismic`, `flood-summary` |
| C1 | 25.5, 0.5 | 4.75 x 4.75 | Sun path diagram | `sun-path` |
| C2 | 30.75, 0.5 | 4.75 x 4.75 | Annual wind rose (summer and winter as two small roses beneath at 2.25 in each) | `wind-rose` |
| C3 | 25.5, 5.75 | 10 x 3.25 | Climate strip: 12 monthly columns, temperature band (mean min to mean max), RH line, radiation bar, HDD and CDD printed | `climate` |
| C4 | 25.5, 9.5 | 10 x 12.5 | Site brief text with citations, and the data availability table (one row per layer: status, source, fetched at) | `brief`, `data-availability` |
| T | 0.5, 22 | 35 x 1.5 | Title block: project "Site analysis", locality, lat lng to 5 decimals, date, sheet scale list, north, and attribution line | `title-block`, `attribution` |

Scale bars: imperial (0, 200, 400, 800 ft) above metric (0, 100, 200 m) on the site plan; imperial
(0, 1000, 2000 ft) above metric (0, 500 m) on the walk shed. North arrow true north up on both plans.

Projection: local tangent plane. `x = (lng - lng0) * cos(lat0) * 111320`, `y = (lat - lat0) * 110574`
metres; sheet px `= 72 / 60.96 * metres` at 1 in = 200 ft, `= 72 / 243.84 * metres` at 1 in = 800 ft;
y is flipped. Everything inside a plan zone is clipped with a `<clipPath>` to the zone rectangle.

Visual language (proposed, to be confirmed in `OPEN-QUESTIONS.md` item 4):

| Element | Stroke (pt) | Colour token | Fill |
|---|---|---|---|
| Sheet frame, title block rules | 0.75 | `ink` #16241A | none |
| Buildings | 0 | | `ink` #16241A at 100 percent |
| Site marker and 50 m ring | 1.0 | `terracotta` #2D5A27 (the token name is historic; it is deep green) | none |
| Primary and secondary streets | 0.5 | `brown-light` #4A6B4A | none |
| Residential and tertiary streets | 0.35 | `brown-light` | none |
| Footways and paths | 0.25 dashed 2,2 | `brown-light` | none |
| Water | 0.35 | `darkblue` #1E3A5F | hatch `water-hatch` 45 degree, 4 pt spacing, 0.25 pt |
| Contours | 0.25 (index every 5th at 0.5) | `brown-light` | none |
| Flood SFHA | 0.35 | `darkblue` | hatch 45 degree, 3 pt spacing |
| Flood VE | 0.35 | `darkblue` | cross hatch 3 pt |
| Flood 0.2 percent | 0.25 | `darkblue` | hatch 45 degree, 8 pt spacing |
| Walk shed 5, 10, 15 | 1.2, 0.8, 0.5 | `terracotta` | none |
| Unreached streets | 0.25 | #4A6B4A at 35 percent opacity | none |
| Text: titles | | `ink`, Fraunces 14 pt | |
| Text: eyebrows and data | | `terracotta`, IBM Plex Mono 7 pt, letter spacing 0.15 em, uppercase | |
| Text: body | | `brown` #1A2A1A, Inter 8 pt | |
| Unavailable stamp | 0.75 | `terracotta` | none, text UNAVAILABLE in Plex Mono 10 pt |
| Paper | | `paper` #FBFCFA as a single background `<rect id="paper">` | |

Fonts are referenced by `font-family` only, not embedded. Illustrator will substitute when the
fonts are not installed; that is acceptable for a tracing base and noted on the sheet in the
attribution line ("Fonts: Fraunces, IBM Plex Mono, Inter").

## 11. SVG export structure

The document is assembled by `sheet/sheet.ts`:

```
<svg ...>
  <title>Datum site analysis: <locality></title>
  <desc>Generated <date>. Sources listed in the attribution group. Coordinates <lat>, <lng>.</desc>
  <defs>  hatches: water-hatch, flood-sfha, flood-ve, flood-02pct; clipPaths: clip-site-plan, clip-walk-shed; marker: north-arrow  </defs>
  <rect id="paper" .../>
  <g id="sheet-frame">
  <g id="site-plan">
    <g id="site-plan-water">
    <g id="site-plan-flood">
    <g id="site-plan-contours">
    <g id="site-plan-streets">
    <g id="site-plan-buildings">
    <g id="site-plan-building-heights">
    <g id="site-plan-site-marker">
    <g id="site-plan-annotations">   frame, scale bars, north arrow, labels
  <g id="walk-shed">
    <g id="walk-shed-streets-unreached">
    <g id="walk-shed-15"> <g id="walk-shed-10"> <g id="walk-shed-5">
    <g id="walk-shed-transit">
    <g id="walk-shed-annotations">
  <g id="topography-section">
  <g id="soil">
  <g id="demographics">
  <g id="seismic">
  <g id="flood-summary">
  <g id="sun-path">
  <g id="wind-rose">
  <g id="climate">
  <g id="brief">
  <g id="data-availability">
  <g id="title-block">
  <g id="attribution">
</svg>
```

Rules:

- Every top level group above exists in every export, in this order, even when its layer is
  unavailable. An unavailable layer's group contains the framed unavailable panel and a
  `data-status="unavailable"` attribute. Available ones carry `data-status="ok"` or `"partial"`.
- Group ids are stable strings. Tests assert the exact list.
- No `<image>`, no `<foreignObject>`, no raster data URIs, no external references, no scripts.
- Text is `<text>` elements. Long brief text is wrapped by the builder into `<tspan>` lines using
  a fixed average glyph width of 0.5 em (Inter 8 pt gives about 4 pt per character), capped at the
  zone width, and verified visually in the phase 2 screenshots.
- Attribution group text, always present: "Map data © OpenStreetMap contributors, ODbL 1.0
  (openstreetmap.org/copyright). Flood: FEMA NFHL. Elevation: USGS 3DEP. Seismic: USGS. Soil: USDA
  NRCS SSURGO. Climate: Open-Meteo (ERA5). Demographics: US Census Bureau ACS 5-year
  2023. Geocoding: Nominatim and Photon (OSM)." Each source appears only when its layer was
  attempted, but OSM always appears because the base drawing is OSM.
- The exported file name is `datum-site-<lat5>_<lng5>-<yyyymmdd>.svg`.
- Export is client side: the same builder strings are joined with an XML declaration and served
  through `URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))`.
- Validity: the string must parse with `DOMParser` as `image/svg+xml` with no `parsererror`
  element. Playwright checks this and the group list after every export in the acceptance tests.

### On screen viewer (added 2026-09-25)

The document is 2592 by 1728 units and the smallest authored text is 6 units. Scaled to fit a
1014 px column that is 0.391, which sets the 6 unit text at 2.3 px and makes 284 text nodes
unreadable. The sheet is correct at that size; the container was wrong. The page therefore reads the
sheet through a window rather than scaling it to the column
(`src/app/projects/datum/panels/SheetViewer.tsx`, geometry in `src/lib/datum/sheet/view.ts`):

- Drag pans, scroll and pinch zoom, and the pointer is the zoom origin: the sheet point under it
  before a zoom is the sheet point under it after.
- The default is fit to width. A control jumps to 100 percent, where one sheet unit is one CSS pixel
  and the 6 unit text sets at 6 px.
- The range runs from fit to width to 400 percent. 100 percent stays reachable on a window wider
  than the sheet, where fit to width is already above 1.
- Keyboard: arrows pan, Shift for a longer step, plus and minus zoom, 0 fits. The window is
  focusable and carries its own label.
- Touch: one finger pans, two pinch. `touch-action: none` is set on the window element only, so a
  gesture starting anywhere else on the page still scrolls the page.
- Full screen is a portal to the body, because `.card` sets `backdrop-filter` and would otherwise be
  the containing block for a fixed child. Escape closes it, Tab is trapped inside it, the body does
  not scroll behind it, and focus returns to the control that opened it.
- The current zoom is shown in the `.meta` style.
- Zoom is driven by the `viewBox` attribute and never by a CSS transform, which can be composited
  from a bitmap rasterized at the pre transform size. The sheet stays vector at every zoom.

The viewer holds no sheet state. `buildSheetGroups` is called with its own context and the export is
the same builder strings joined, so what the viewer shows and what the export writes cannot
disagree, and the view never reaches the exported file.

## 12. Site brief (Claude)

Model: `claude-sonnet-4-6` (repo rule: every route on this model). Streaming through the SDK's
`client.messages.stream(...)`, forwarded as Server Sent Events. Max output 1400 tokens (amended
2026-09-25 from 900: at 900 the brief truncated mid section in three of three runs, and a
truncated brief produces uncited sentences of its own).

Input serializer (`brief/prompt.ts`): a JSON object with one key per layer. Available layers carry
their data with every leaf value keyed by its dotted path (the same `fieldPaths` list from the
envelope). Unavailable layers carry `{ status: "unavailable", reason }`. Nothing else: no address,
no locality name, no city. The site is referred to as "the site". Latitude and longitude are
included because the sun path depends on them.

System prompt requirements (the exact text lives in the code; these are the contract):

1. Write for a working architect. Five short sections: Ground, Climate and sun, Context and access,
   Risk, What is missing. About 350 words.
2. Every sentence that states a fact about the site ends with one or more citations of the form
   `[layer.path.to.field]` copied exactly from the input keys.
3. Never mention the neighbourhood, city, history, reputation, or anything not present in the
   input. If a layer is unavailable, say so in "What is missing" and do not reason about it.
4. Numbers are quoted as given, with units, no rounding beyond what the input shows. Since section 8
   rule 7 the input carries values already rounded to their field's precision, so this rule now asks
   the model to copy a number an architect would write rather than to copy a float. It is unchanged
   in wording, and the defect it used to cause was in the data, not here.
5. No headings other than the five section names, no markdown lists, no em dashes.

Server side validation after the stream completes: extract every `[...]` citation, check each
against `fieldPaths` of the available layers, and send a final SSE event with the list of invalid
citations. The client renders valid citations as chips that highlight the matching panel on hover,
and renders invalid ones struck through with the tooltip "not a data field". If more than 2
citations are invalid, or any numeric sentence fails the value aware check below, the client shows
the banner "This brief failed citation checks; treat it as unverified" above the text. The brief
is stored (phase 3) only when it passes.

Value aware numeric check (amended 2026-09-25; replaces "any sentence with a digit has no
citation"). A sentence containing a numeric value passes when it carries a valid citation, or when
every numeric value in it satisfies both conditions: the value matches a value present in the
dataset fetched for that run, compared on the rendered string using the same rounding the
serializer applies to the model's input (never on raw floats), and a path whose value renders to
that string was cited by a valid citation earlier in the same brief. A numeric value that traces to
nothing in the dataset fails the sentence, shows the banner, and fails the acceptance suite. The
validator logs every match decision (sentence index, value string, the matched path or none, and
whether the earlier citation was found) at debug level, so a false pass is diagnosable. Restating a
value already cited is not fabrication; requiring a bracket on every restatement produced citation
spam and false positives (see PROGRESS.md, Phase 2 tripwire).

The check compares against the rounded value, because since section 8 rule 7 the rounded value is
the only value there is: the model is given "1.9" for a 1.9 m elevation, so writing 1.9 matches and
passes. Before that rule the model was given "1.8284" and writing the 1.8 an architect would write
found no match, so the check penalised correct rounding and the model learned to copy the float.
That is what put nine decimal numbers in a brief. The check itself was not loosened to fix it, and
must not be: a number that traces to nothing in the dataset still fails.

SSE events:

```
event: delta   data: {"text":"..."}
event: done    data: {"invalidCitations":["..."],"uncitedNumericSentences":n,"model":"claude-sonnet-4-6","inputHash":"..."}
event: error   data: {"code":"upstream_error","message":"..."}
```

The brief route requires at least the `sun` layer (always available) and runs even when every
external layer failed; the output is then almost entirely "What is missing", which is the correct
behaviour.

## 13. Data model (Supabase, Postgres)

All access is server side with the secret key (an `sb_secret_` key, which `createClient` accepts in
place of the legacy service_role key). RLS is enabled on every table with no policies,
so the anon key (which is never shipped) could not read anything even if leaked. Migrations are
plain SQL files under `supabase/migrations/`, numbered, applied by the owner in the SQL editor.

### 0001_cache_sites_ratelimit.sql (phase 1)

```sql
create extension if not exists pgcrypto;

create table api_cache (
  cache_key   text primary key,               -- "<source>:<params hash>"
  source      text not null,                  -- overpass, fema, usgs_elev, usgs_seis, usda, census_geo, census_acs, tiger, openmeteo, nominatim, photon
  url         text not null,                  -- key parameter stripped
  http_status int  not null,
  body        jsonb not null,                 -- trimmed payload
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index api_cache_expires_idx on api_cache (expires_at);
create index api_cache_source_idx on api_cache (source);

create table sites (
  id               uuid primary key default gen_random_uuid(),
  site_key         text not null unique,      -- "<lat 3dp>,<lng 3dp>" (about 100 m)
  lat              double precision not null, -- confirmed point
  lng              double precision not null,
  public_lat       double precision not null, -- round(lat, 2), about 1 km
  public_lng       double precision not null,
  locality         text,                      -- "Atlanta, Georgia" from Nominatim reverse zoom 10
  tract_geoid      text,
  is_test          boolean not null default false,
  created_at       timestamptz not null default now(),
  last_analyzed_at timestamptz not null default now(),
  analysis_count   int not null default 1,
  schema_version   int not null default 1
);
create index sites_public_idx on sites (public_lat, public_lng) where is_test = false;

create table layer_results (
  site_id     uuid not null references sites(id) on delete cascade,
  layer       text not null,
  status      text not null check (status in ('ok','partial','unavailable')),
  envelope    jsonb not null,                 -- the full LayerEnvelope
  computed_at timestamptz not null default now(),
  expires_at  timestamptz not null,
  primary key (site_id, layer)
);

create table rate_limits (
  ip_hash text not null,                      -- sha256(ip + fixed app salt), hex
  day     date not null,
  count   int  not null default 0,
  primary key (ip_hash, day)
);

alter table api_cache     enable row level security;
alter table sites         enable row level security;
alter table layer_results enable row level security;
alter table rate_limits   enable row level security;

-- The project has "automatically expose new tables" turned off, so grants are explicit.
-- service_role only. Nothing is granted to anon or authenticated.
grant select, insert, update, delete on api_cache, sites, layer_results, rate_limits to service_role;

-- Atomic rate limit increment (owner decision, 2026-09-24). PostgREST cannot express
-- "count = count + 1" in an upsert, so the increment lives in SQL. service_role only.
create or replace function rate_limit_hit(p_ip_hash text, p_day date)
returns int language sql as $$
  insert into rate_limits (ip_hash, day, count) values (p_ip_hash, p_day, 1)
  on conflict (ip_hash, day) do update set count = rate_limits.count + 1
  returning count;
$$;
revoke execute on function rate_limit_hit(text, date) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, date) to service_role;
```

Only `ok` and `partial` and `no_coverage` envelopes are written to `layer_results`; transient
failures are not persisted so a retry is never served a cached failure.

### 0002_memory_pgvector.sql (phase 3)

```sql
create extension if not exists vector with schema extensions;

-- Amended 2026-09-25 before first application (owner decisions, PROGRESS.md questions 7 and 11).
-- A test row and a real row may coexist at the same rounded point.
alter table sites drop constraint sites_site_key_key;
alter table sites add constraint sites_site_key_is_test_key unique (site_key, is_test);

alter table sites
  add column metrics        jsonb,                      -- named, unnormalized values; absent components omitted
  add column metrics_vector extensions.vector(14),      -- normalized 0..1; absent components hold a placeholder 0
  add column metrics_mask   smallint not null default 0, -- bit i set when component i is present (section 14)
  add column metrics_at     timestamptz;

-- No vector index: distance is masked and computed in code (section 14), so <-> is not used.

create table briefs (
  site_id    uuid not null references sites(id) on delete cascade,
  input_hash text not null,
  model      text not null,
  text       text not null,
  citations  jsonb not null,
  created_at timestamptz not null default now(),
  primary key (site_id, input_hash)
);
alter table briefs enable row level security;
grant select, insert, update, delete on briefs to service_role;

-- percentile helper: rank of one value among non test sites for a named metric
create or replace function metric_percentile(metric text, value double precision)
returns table (percentile double precision, n bigint) language sql stable as $$
  with vals as (
    select (metrics ->> metric)::double precision as v
    from sites where is_test = false and metrics ? metric
  )
  select
    case when count(*) >= 10
         then (count(*) filter (where v < value))::double precision / count(*)
         else null end,
    count(*)
  from vals;
$$;
```

### Cache and TTL rules

| Source | Cache key | TTL | Notes |
|---|---|---|---|
| Photon suggest | normalized query (lowercase, collapsed spaces) | 7 days | |
| Nominatim search | normalized query | 30 days | policy permits caching |
| Nominatim reverse | lat, lng at 3 dp | 365 days | |
| Overpass | lat, lng at 3 dp | 30 days | trimmed payload only |
| USGS EPQS and 3DEP | lat, lng at 3 dp | 365 days | |
| USGS seismic | lat, lng at 3 dp plus site class | 365 days | |
| USDA | lat, lng at 3 dp | 365 days | |
| FEMA (both layers) | lat, lng at 3 dp | 30 days | NFHL updates; `no_coverage` cached 30 days |
| Census geocoder | lat, lng at 3 dp | 365 days | |
| Census ACS | tract GEOID plus vintage | 365 days | |
| TIGERweb | tract GEOID | 365 days | |
| Open-Meteo archive | lat, lng at 1 dp plus period | 365 days | period is part of the key, so a new year rolls over naturally |
| Brief | site id plus input hash | no expiry | regenerated when the input hash changes |

Failed responses (timeout, 5xx, parse error, rate limited) are never cached. `no_coverage` and
`partial` are cached with the TTL above.

A daily sweep is not required: reads ignore expired rows (`expires_at > now()`), and the phase 3
ping route deletes expired rows in batches of 500 as a side effect.

### Rate limit

20 uncached analyses per IP per day (UTC). "Uncached" means the `site` route created a new site
row or the site's `last_analyzed_at` is older than 30 days. Re-opening an analyzed site is free.
The `site` route increments `rate_limits.count` atomically by calling the `rate_limit_hit` SQL
function through `rpc` (the function body is the `insert ... on conflict do update ... returning count`) and returns 429 with `{ error: { code:
"rate_limited", resetAt } }` when the count exceeds 20. Layer routes for a site created in the last
24 hours are not separately limited. The IP is hashed with SHA-256 and a fixed string salt in code;
raw IPs are never stored.

### Paused database

Supabase docs say free projects may be paused after 7 days of low activity. Restore is a manual
click in Studio, so the app must survive a paused database:

1. Every Supabase call goes through `memory.ts` with a 3 second timeout and a single retry.
2. On any failure (timeout, network error, HTTP 5xx, or a 4xx that is not a constraint violation)
   `memory.ts` flips a module level `memoryStatus = "offline"` with a 60 second cool down, during
   which no further Supabase calls are attempted.
3. While offline: caches fall back to an in memory `Map` per instance with the same TTLs; the
   `site` route returns a synthetic `siteId` prefixed `local-` and `memoryStatus: "offline"`; the
   `site` route also always returns `fallbackId`, the signed local id for the point, whether
   memory is online or offline (amended 2026-09-25). The client sends `fallback=<fallbackId>` on
   every layer and brief request. When a layer or brief route cannot read the site row (memory
   offline, or a cold instance that never saw the row), it verifies the fallback id and proceeds
   with its point: the rate limit peek applies, nothing is stored, and the response is the normal
   envelope. A 404 for a database site id is returned only when memory is online, the row does
   not exist, and no valid fallback was sent. The
   rate limit falls back to an in memory per instance counter with the same cap; layers and the
   brief work normally; the Memory panel shows "Site Memory is offline; this analysis will not be
   saved." The sheet still exports.
4. Prevention: `memory/ping` runs from a Vercel cron once a day (Hobby limit) and performs one
   `select` and the expired cache sweep. Whether a daily query counts as activity for Supabase's
   pause heuristic is unverified (`OPEN-QUESTIONS.md` item 7).

## 14. Site metrics and similarity (phase 3)

Fourteen components, each normalized to 0..1 with fixed constants so vectors never drift as the
dataset grows. Clamp to the range.

Absent components (amended 2026-09-25, owner decision; replaces the all or nothing rule). A
component that cannot be measured is recorded as absent, never as a value: soil with no
hydrologic group (SSURGO "Urban land", which is most dense urban sites), flood without NFHL
coverage, or any layer that was unavailable. Absence is not fatal. The site stores the fourteen
normalized values in `metrics_vector` with absent components written as 0 as a storage
placeholder, and a companion `metrics_mask` (smallint, bit i set when component i is present)
that says which entries are real; a placeholder 0 is never read as a value, because distance only
ever uses components whose bit is set in both sites. A site is eligible for similarity when at
least 10 of the 14 components are present. Named metrics omit absent components and the context
lists them under `missing`.

Distance between two sites A and B: over the components present in both (k of them, k at least
10 or the pair is not compared), `d = sqrt((14 / k) * sum over shared i of (A_i - B_i)^2)`. An
absent component contributes nothing in either site, so two sites can never be made similar by a
shared absence; absence only narrows the set of components compared, and the `14 / k` scaling
keeps `d` on the same scale as a complete comparison. Match percent is `round((1 - d /
sqrt(14)) * 100)` on the scaled distance. The context response carries the shared component
count (`sharedComponents`) and the absent components of the current site, as data. Percentiles
are unaffected: a metric is ranked among the sites that measured it.

The null case sentence becomes "Sites like this needs at least ten measures; <layers or
components> were unavailable." and is shown only when fewer than 10 components are present
(copy amended with section 14, since the previous sentence would have been false).

| i | Metric | Source field | Normalization |
|---|---|---|---|
| 0 | annualMeanTempC | climate.monthly mean of means | (v + 10) / 40 |
| 1 | annualTempRangeC | climate: warmest month mean max minus coldest month mean min | v / 60 |
| 2 | meanRhPct | climate | v / 100 |
| 3 | dailyRadiationKwhM2 | climate mean over year | v / 8 |
| 4 | meanWindMs | climate.wind.annual.meanSpeedMs | v / 10 |
| 5 | windConcentration | climate.wind.annual.resultantLength | v |
| 6 | reliefM | topo.reliefM | log10(1 + v) / 2.5 |
| 7 | meanSlopePct | topo.meanSlopePct | v / 30 |
| 8 | buildingCoverage | osm.stats.coverageRatio (footprints over the 400 m circle area, section 9) | v |
| 9 | reach10Km | walkshed.reachKm[10] | v / 25 |
| 10 | sfhaShare | flood: SFHA polygon area inside frame over frame area; 0 when coverage exists and none; null when no coverage | v |
| 11 | sds | seismic.sds | v / 2 |
| 12 | logDensity | census.densityPerKm2 | log10(1 + v) / 5 |
| 13 | hydrologicGroup | soil top component: A 0, B 0.33, C 0.67, D 1; dual groups use the second letter; Urban land with no group is absent (mask bit clear), not a value | v |

Similar sites: candidates are non test sites other than the query site with at least 10 present
components; the masked distance above is computed in code over the candidate set (ordered by
`metrics_at` descending and capped at 2000; the cap is an accepted known limit, PROGRESS.md open
question 17), keeping the five nearest. The pgvector column remains the storage type; the
`<->` operator is not used while masks exist, and no vector index is created.
Display: locality, distance score as "match" percent on the scaled distance, and the three
shared components that differ least. Percentiles use `metric_percentile()` on the named metrics
`dailyRadiationKwhM2` ("more sun than X percent of analyzed sites"), `buildingCoverage`, `reach10Km`,
`reliefM`, `meanWindMs`, `logDensity`, shown only when `n >= 10`.

## 15. Environment variables

| Variable | Required from | Used by | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | existing | brief route | |
| `CENSUS_API_KEY` | phase 1 | `sources/census.ts` | missing key produces the `missing_key` envelope, never a crash |
| `SUPABASE_URL` | phase 1 | `memory.ts`, `cache.ts` | project URL |
| `SUPABASE_SECRET_KEY` | phase 1 | same | an `sb_secret_` key; server only; never prefixed `NEXT_PUBLIC_`. Supabase is retiring legacy service_role keys by the end of 2026 |
| `DATUM_ALLOW_TEST_FLAG` | phase 1, local and preview only | `site` route | `1` lets the client set `isTest`; unset in production |
| `DATUM_SOURCE_OVERRIDES` | tests only | `sources/*` | JSON map of source name to base URL, honoured only when `DATUM_ALLOW_TEST_FLAG=1` and `NODE_ENV !== "production"` (both conditions; inert in any production build, proven by a unit test); used by e2e to point a source at an unreachable port and assert the unavailable state |
| `CRON_SECRET` | phase 3 | `memory/ping` | Vercel sets `Authorization: Bearer <CRON_SECRET>` on cron requests; the route rejects anything else |

`.env.example` is updated in phase 1 to list these and to drop `EVENTBRITE_API_KEY` (already dead;
this is the one out of scope line the owner has flagged as debris in `CLAUDE.md`). Key values are
never printed in logs, responses, or the `source.url` field.

## 16. Performance budget

Measured on the three test sites from a warm cache and a cold cache, recorded in each phase's
acceptance run:

| Milestone | Cold target | Warm target |
|---|---|---|
| First panel painted (sun) | under 1.5 s after confirm | same |
| Climate, seismic, soil, elevation panels | under 6 s | under 1.5 s |
| Flood, census panels | under 8 s | under 1.5 s |
| Figure-ground | under 20 s (Overpass permitting) | under 1.5 s |
| Walk shed | under 25 s | under 2 s |
| Brief first token | under 4 s after the dependency layers settle | same |
| Export ready | when the last layer settles; the button is never blocked by the brief | |

Overpass is the only source expected to miss its cold target regularly. The unavailable state with
retry is the designed behaviour for that, not a bug.

## 17. Removal list

Deleted in phase 2 once their replacements exist (exact paths, pre approved by the owner):

- `src/app/api/heat-island/route.ts`
- `src/app/api/zoning/route.ts`
- `src/app/api/datum/overpass/route.ts`
- `src/app/api/flood-risk/route.ts` (replaced by `layers/flood`)
- `src/app/api/datum/route.ts` (the monolithic POST; replaced by `site`, `layers`, `brief`)
- `src/app/projects/datum/DatumMap.tsx` (replaced by `ConfirmMap.tsx` and `SitesMap.tsx`)

Nothing else is deleted. `content/projects.ts` keeps its Datum entry; its `description`, `blurb`,
and `stack` are rewritten in phase 2 to match the shipped code (anti fabrication rule).
