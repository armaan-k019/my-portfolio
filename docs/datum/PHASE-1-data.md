# Phase 1: data

Purpose: replace every data fetch with a verified source module that returns a `LayerEnvelope`,
behind a Supabase cache, exposed as one route per layer. The old page keeps working on the old
routes until phase 2; the new routes ship alongside them.

Read `SPEC.md` sections 5, 7, 8, 9, 13, 15 before starting.

## Scope

1. Supabase migration 0001, `memory.ts` (site records, rate limit, offline handling), `cache.ts`.
2. Source modules under `src/lib/datum/sources/`, one per external service.
3. Computation modules: `geo.ts`, `solar.ts`, `climate.ts`, `topo.ts`, `walkshed.ts`.
4. Routes: `suggest`, `geocode`, `site`, `layers/[layer]`.
5. Unit tests on parsers and computations with recorded fixtures; e2e checks against the running
   server for the three sites, including forced failure of each source.
6. `.env.example` update.

## Files allowed to change

- `supabase/migrations/0001_cache_sites_ratelimit.sql` (new)
- `src/lib/datum/**` (new)
- `src/app/api/datum/suggest/route.ts`, `geocode/route.ts`, `site/route.ts`,
  `layers/[layer]/route.ts` (new)
- `e2e/unit/**`, `e2e/fixtures/**`, `e2e/layers.spec.ts` (new)
- `package.json`, `package-lock.json` (add `d3-contour`, `@types/d3-contour`; add script `test:unit`)
- `.env.example`

Not allowed: `src/app/projects/**`, `src/app/api/datum/route.ts` (old, untouched),
`src/app/api/flood-risk/**`, `src/app/layout.tsx`, `src/app/globals.css`.

## Prerequisites

- `CENSUS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. If any is missing,
  stop and ask (tripwire) rather than working around it.
- Migration 0001 applied by the owner. Check with the SQL in step 1.1 before writing code that
  depends on it.

## Conventions for this phase

- Source modules never throw. Every exported fetcher has the signature
  `(params, ctx: { fetch, cache, overrides }) => Promise<LayerEnvelope<T>>` so tests can inject a
  fake `fetch`.
- No literal fallback values in `sources/**`. The acceptance grep below enforces it.
- User-Agent on every outbound request: `Datum/1.0 (site analysis; portfolio; +<site URL>)`.
  The site URL comes from a constant in `src/lib/datum/constants.ts` (see `OPEN-QUESTIONS.md`
  item 12 for the value; use `https://github.com/armaan-k019` until answered).
- Unit tests run with Node's built in runner on TypeScript directly:
  `node --test e2e/unit/` (Node 22.18 and later strip types without a flag; this machine has
  Node 25). Write erasable TypeScript only in `src/lib/datum/**`: no `enum`, no parameter
  properties, no namespaces, and import with explicit `.ts` extensions inside `src/lib/datum`
  is not needed because the Next bundler resolves them; for the unit runner add
  `--experimental-transform-types` only if plain `--test` fails, and record which in the phase
  notes. Do not use the `@/` alias inside `src/lib/datum/**`.
- Fixtures are recorded responses from the real endpoints, saved under `e2e/fixtures/<source>/`,
  with the request URL in a sibling `.url.txt`. Record them with `curl` during this phase; never
  hand write a fixture.

## Steps

### Step 1.1: migration and Supabase plumbing

Write `supabase/migrations/0001_cache_sites_ratelimit.sql` exactly as in `SPEC.md` section 13.
Ask the owner to apply it. Verify:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('api_cache','sites','layer_results','rate_limits');
```

Expected: four rows.

`src/lib/datum/memory.ts`:
- `getClient()` singleton from `@supabase/supabase-js` with the service role key, `auth: { persistSession: false }`.
- `withMemory<T>(op: (client) => Promise<T>): Promise<T | undefined>` with the 3 s timeout, single
  retry, and the offline flag with 60 s cool down from `SPEC.md` section 13.
- `getOrCreateSite({ lat, lng, locality, tractGeoid, isTest })`, `touchSite(id)`,
  `checkRateLimit(ipHash)`, `memoryStatus()`.
- In memory fallbacks for sites and rate limits when offline.

`src/lib/datum/cache.ts`:
- `cached<T>(key, ttlSeconds, producer: () => Promise<{ status, body, url } | Failure>)`.
- Reads `api_cache` where `expires_at > now()`; on miss runs the producer; writes only when the
  producer reports a cacheable result (`ok`, `partial`, `no_coverage`).
- Offline fallback: a module level `Map` with the same TTLs.

Commit: `feat(datum): add Supabase cache, site records, and rate limit plumbing`

### Step 1.2: geometry and solar

`geo.ts`: `toLocal(lat, lng, origin)`, `fromLocal`, `haversineM`, `bboxAround(origin, radiusM)`,
`ringAreaM2` (shoelace on local coordinates).

`solar.ts`: NOAA solar position (fractional year, equation of time, declination, hour angle,
altitude, azimuth from north clockwise). `sunPath(lat, lng, tzOffsetMinutes, date)` returns
sunrise, sunset, noon altitude, and samples every 15 minutes. `sunLayer(lat, lng, timezone)` builds
the `sun` layer data from `SPEC.md` section 9. Timezone offset per date is derived with
`Intl.DateTimeFormat(..., { timeZone }).formatToParts` (available in Node without a library).

Unit tests (`e2e/unit/solar.test.ts`):
- Atlanta 33.7751 N on 21 June: noon altitude within 0.5 degrees of `90 - (33.7751 - 23.44) = 79.66`.
- Atlanta 21 December: within 0.5 of `90 - (33.7751 + 23.44) = 32.79`.
- Atlanta 21 March: within 0.7 of `90 - 33.7751 = 56.22` (declination is not exactly zero on the
  21st; the tolerance covers it).
- Equinox sunrise azimuth within 1.5 degrees of 90, sunset within 1.5 of 270.
- WaKeeney 39.0198 N on 21 June noon altitude within 0.5 of 74.42.
- Day length on 21 June at Atlanta between 14.0 and 14.6 hours.

Commit: `feat(datum): add local projection and solar position`

### Step 1.3: Open-Meteo climate

`sources/openMeteo.ts` fetches the archive request from `SPEC.md`. `climate.ts` computes wind
roses, monthly normals, degree days, comfort share. Fixture: record the Atlanta response once
(about 1 MB) and the WaKeeney response.

Unit tests:
- Fixture parses to 26304 hourly rows, `timezone` `America/New_York` for Atlanta.
- Wind rose sector frequencies sum to 100 ± 0.1 including calm.
- Monthly arrays have length 12; July mean max exceeds January mean max at both sites.
- HDD at WaKeeney exceeds HDD at Atlanta; CDD at Atlanta exceeds CDD at WaKeeney.
- A fetch that throws produces `status: "unavailable"`, `code: "timeout"` or `"upstream_error"`,
  `data: null`.

Commit: `feat(datum): add Open-Meteo climate source, wind rose, and comfort normals`

### Step 1.4: USGS elevation and topography

`sources/usgsElevation.ts` (EPQS point and 3DEP grid). `topo.ts` builds the grid coordinates,
calls d3-contour (`contours().size([21, 21]).thresholds(...)`), converts to local metres,
extracts sections, relief, slope. Fixture: record the 441 point Atlanta response.

Unit tests:
- Atlanta fixture: `siteElevationM` between 270 and 295; `reliefM` between 5 and 80;
  `contours.lines.length` between 4 and 20.
- A response with 200 samples yields `unavailable` with `parse_error`; 430 samples yields `partial`.
- Contour coordinates all lie within ±420 m of the origin.

Commit: `feat(datum): add USGS elevation source and contour generation`

### Step 1.5: USGS seismic and USDA soil

`sources/usgsSeismic.ts`, `sources/usdaSoil.ts` per `SPEC.md` section 9. Fixtures for all three
sites for both sources.

Unit tests:
- Atlanta seismic fixture: `sds` 0.21, `sdc` "B", `assumptions.siteClassIsDefault` true when no
  class is passed.
- Site class `F` or any value outside A to E is rejected before the request with `http_error` 400
  semantics in the route (unit test the validator).
- WaKeeney soil fixture: `mapUnitName` starts with "Harney silt loam", top component hydrologic
  group "C", drainage "Well drained".
- Atlanta soil fixture: `mapUnitName` "Urban land", hydrologic group null.
- Empty `Table` yields `no_coverage`.
- The SQL string contains the coordinates formatted with 6 decimals and nothing else variable
  (test with a coordinate containing many decimals).

Commit: `feat(datum): add USGS seismic and USDA soil sources`

### Step 1.6: FEMA flood

`sources/fema.ts` per `SPEC.md`. Fixtures: Miami point and envelope, Atlanta point, WaKeeney layer 0.

Unit tests:
- WaKeeney layer 0 empty yields `no_coverage` and no layer 28 request is made (assert the fake
  fetch was called once).
- Miami point yields `atPoint.class` "moderate", `sfha` false, `staticBfeFt` null (from -9999).
- Miami envelope yields polygons with classes including "sfha" and zone "VE" present.
- Atlanta point yields class "minimal".
- HTTP 500 yields `unavailable` with `http_error`, `httpStatus: 500`, `retryable: true`.

Commit: `feat(datum): add FEMA NFHL flood source with coverage check`

### Step 1.7: Census

`sources/census.ts`: geocoder, ACS with key, TIGERweb. Fixtures for Atlanta (record the ACS
response with the real key; strip the key from the `.url.txt`).

Unit tests:
- Missing `CENSUS_API_KEY` yields `missing_key` before any network call.
- HTML body from the ACS endpoint (record the "Missing Key" page as a fixture) yields
  `unavailable` with `parse_error`, not a crash.
- Sentinel `-666666666` in `B25064_001E` becomes null and appears in `partial.missing`.
- Derived `carFreeCommutePct` equals `(transit + walked + bike) / workers * 100` rounded to 0.1.
- Tract GEOID for the Atlanta fixture is `13121001002`.

Commit: `feat(datum): add Census ACS, geocoder, and TIGERweb sources`

### Step 1.8: Overpass and walk shed

`sources/overpass.ts` with the query from `SPEC.md`, User-Agent, form encoding, mirror order,
retry policy, and payload trimming. `walkshed.ts` with the graph and Dijkstra. Fixtures: Atlanta
and WaKeeney trimmed responses.

Unit tests:
- Atlanta fixture: `buildings.length` between 80 and 130, `stats.withHeight` 0,
  `stats.withLevels` between 8 and 20 (OSM edits move these; the bands are deliberate).
- `height` parsing: `"12"` to 12, `"12 m"` to 12, `"40'"` to 12.19, `"3 levels"` to null.
- Walk shed from the Atlanta fixture: `reachKm[5] < reachKm[10] < reachKm[15]`, start offset
  under 150 m, at least one transit stop within 15 minutes.
- A 406 response yields `unavailable` with `http_error` 406 and the message names Overpass.
- A 504 on the first mirror followed by 200 on the retry yields `ok` (assert two fetch calls).
- WaKeeney fixture: `buildings.length` between 10 and 40.

Commit: `feat(datum): add Overpass source and computed walk shed`

### Step 1.9: routes

`suggest`, `geocode`, `site`, `layers/[layer]` per `SPEC.md` section 7. `layers/[layer]` validates
the layer name against the fixed list and returns 404 JSON for anything else. Every route reads
`DATUM_SOURCE_OVERRIDES` when `NODE_ENV !== "production"` and passes it into the source context.

Commit: `feat(datum): add suggest, geocode, site, and per layer routes`

### Step 1.10: env example and e2e

Update `.env.example`: add the four new variables with one line comments, remove
`EVENTBRITE_API_KEY` and fix the "These four are the only variables" sentence to match.

`e2e/layers.spec.ts` uses `request` (no browser) against the running server:

For each site: `POST /api/datum/site` with `{ lat, lng, isTest: true }` (server started with
`DATUM_ALLOW_TEST_FLAG=1`), then `GET /api/datum/layers/<layer>?site=<id>` for all nine
layers, twice (cold then warm). Assertions:

| Layer | Atlanta | Miami | WaKeeney |
|---|---|---|---|
| sun | ok; noon altitude 21 June 79.2 to 80.2 | ok | ok; 73.9 to 74.9 |
| climate | ok; `timezone` America/New_York; 12 months | ok; America/New_York | ok; America/Chicago |
| topo | ok; site elevation 270 to 295 m | ok; 0 to 6 m | ok; 735 to 755 m |
| seismic | ok; sdc B; sds 0.19 to 0.23 | ok; sdc A | ok; sdc A; sds 0.09 to 0.13 |
| soil | ok; name contains "Urban land" | ok; contains "Urban land" | ok; contains "Harney" and hydgrp C |
| osm | ok or unavailable with code in {timeout, http_error, upstream_error}; if ok, buildings 60 to 160 | same; if ok, withHeight over 150 | same; if ok, buildings 8 to 40 |
| walkshed | same status as osm; if ok, reachKm[10] over 3 | same | same |
| flood | ok; class minimal | ok; class moderate; polygons include VE | unavailable; code no_coverage |
| census | ok or partial; tract 13121001002 | ok or partial; 12086002707 | ok or partial; 20195955800 |

Warm run: every layer that was `ok` cold must be `ok` warm with `source.cached: true` and respond
under 1500 ms. `osm` and `walkshed` are allowed to be unavailable (Overpass is unreliable); the
test prints a warning rather than failing, but fails if the unavailable envelope has `data` not
null or lacks a `message`.

Forced failure run: start the server with
`DATUM_SOURCE_OVERRIDES='{"fema":"http://127.0.0.1:9","usgs_elev":"http://127.0.0.1:9","usgs_seis":"http://127.0.0.1:9","usda":"http://127.0.0.1:9","openmeteo":"http://127.0.0.1:9","overpass":"http://127.0.0.1:9","census_acs":"http://127.0.0.1:9"}'`
and assert every overridden layer returns `status: "unavailable"`, `data: null`, a non empty
`unavailable.message`, and that nothing was written to `api_cache` for those keys (query the table
count before and after).

Rate limit run: call `site` 21 times with distinct coordinates from one client; the 21st returns
429 with `resetAt`. Then delete the test rows:
`delete from rate_limits where day = current_date;` (documented in the spec as the cleanup).

Commit: `test(datum): add layer, cache, forced failure, and rate limit checks`

## Acceptance criteria

- [ ] Migration applied; the four tables exist (step 1.1 query).
- [ ] `npm run test:unit` exits 0 with at least 35 tests.
- [ ] `npm run build && DATUM_ALLOW_TEST_FLAG=1 npm run e2e -- e2e/layers.spec.ts` exits 0.
- [ ] Forced failure run exits 0.
- [ ] Rate limit run exits 0 and the cleanup was executed.
- [ ] `grep -rnE "\?\? *[0-9]+|\?\? *\"X\"|\|\| *[0-9]+\b" src/lib/datum/sources/` prints
      nothing (no literal fallbacks). Any legitimate match is rewritten, not excused.
- [ ] `git grep -n "User-Agent" src/lib/datum/sources/` shows every source module that makes
      an HTTP request (Photon, Nominatim, Overpass at minimum).
- [ ] `git grep -nE "key=[A-Za-z0-9]{10,}" -- src e2e docs` prints nothing.
- [ ] `npx tsc --noEmit` clean; `npm run build` succeeds; `npm run lint` clean.
- [ ] Ten commits, each passing `git diff --name-only main` against its allowed list.
- [ ] The old page still loads and still runs (it uses the old routes, untouched).

## Tripwires: stop and ask

- Any required env var is missing.
- The migration fails to apply, or the owner has not confirmed applying it.
- Overpass fails on every attempt for an hour: record it, ship the fixtures based unit tests,
  and ask before changing mirrors or query shape.
- A source's response shape differs from the fixtures recorded in `SPEC.md` section 5 (for example
  the seismic response lacks `sds`): stop, record the actual response in `OPEN-QUESTIONS.md`, ask.
- A new dependency beyond `d3-contour` seems needed.
- Any change outside the allowed file list.

## Out of scope

The page, the sheet, the brief, deletions, Site Memory features beyond the cache and site row,
pgvector.
