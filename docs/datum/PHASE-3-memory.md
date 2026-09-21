# Phase 3: memory

Purpose: turn stored analyses into context. Percentiles, a map of analyzed sites, "sites like
this", stored briefs, and the daily ping that keeps the free Supabase project awake.

Read `SPEC.md` sections 13 and 14. Phases 1 and 2 must be merged.

## Scope

1. Migration 0002 (pgvector, metrics columns, briefs, percentile function).
2. Metrics computation after an analysis settles; vector write.
3. Routes `memory/context`, `memory/map`, `memory/ping`; `vercel.json` cron.
4. `MemoryPanel.tsx` and `SitesMap.tsx` on the page.
5. Store passing briefs; serve a stored brief when the input hash matches.

## Files allowed to change

- `supabase/migrations/0002_memory_pgvector.sql` (new)
- `src/lib/datum/metrics.ts` (new), `src/lib/datum/memory.ts` (extend)
- `src/app/api/datum/memory/context/route.ts`, `map/route.ts`, `ping/route.ts` (new)
- `src/app/api/datum/brief/route.ts` (store and serve briefs)
- `src/app/api/datum/site/route.ts` (return `memoryStatus` and analysis count; already does, extend only)
- `src/app/projects/datum/MemoryPanel.tsx`, `SitesMap.tsx` (new), `SiteSheetApp.tsx` (mount them)
- `vercel.json` (new, cron entry only)
- `e2e/memory.spec.ts`, `e2e/unit/metrics.test.ts`, `e2e/fixtures/seed-sites.ts` (new)
- `.env.example` (`CRON_SECRET`, `DATUM_INCLUDE_TEST_SITES`)

Not allowed: sheet builders, sources, `globals.css`, `layout.tsx`.

## Steps

### Step 3.1: migration

Write `0002_memory_pgvector.sql` exactly as in `SPEC.md` section 13. Owner applies it. Verify:

```sql
select extname from pg_extension where extname = 'vector';
select column_name from information_schema.columns where table_name = 'sites' and column_name in ('metrics','metrics_vector','metrics_at');
select metric_percentile('dailyRadiationKwhM2', 4.0);
```

Expected: `vector`; three columns; one row with `percentile` null and `n` small (fewer than 10 sites).

Commit: `feat(datum): add pgvector, site metrics, and brief storage migration`

### Step 3.2: metrics

`metrics.ts`: `computeMetrics(layers) => { named: Record<string, number | null>, vector: number[] | null }`
per `SPEC.md` section 14, with the fixed normalization constants exported so the unit test can
check ranges. `memory.ts` gains `writeMetrics(siteId, named, vector)`,
`percentiles(named)`, `similarSites(vector, siteId, limit = 5)`, `publicSites()`.

The `layers/[layer]` route does not compute metrics (it does not see the other layers). Instead
the client, once all nine layers have settled, calls `POST /api/datum/memory/context` with
`{ siteId }`. That handler computes metrics server side from `layer_results`, writes them, and
returns the context. `GET` on the same route returns the context without recomputing. No new
route name is introduced.

Unit tests:
- Every component of the vector from the Atlanta fixtures lies in [0, 1].
- Removing `flood` from the fixtures yields `vector: null` and `named.sfhaShare` null, while the
  other named metrics are still present.
- WaKeeney fixtures (flood `no_coverage`) yield `vector: null` (no coverage is not zero).
- `hydrologicGroup` for "B/D" is 1 (second letter), for "Urban land" null.

Commit: `feat(datum): compute normalized site metrics and store the vector`

### Step 3.3: routes and cron

`memory/context` (GET and POST as above): returns
`{ memoryStatus, n, percentiles: [{ metric, label, percentile }] | null, similar: [{ siteId,
locality, publicLat, publicLng, match, closest: string[] }] | null, reasonIfNull }`.
Percentiles and similar sites exclude `is_test` rows unless `DATUM_INCLUDE_TEST_SITES=1` and
`NODE_ENV !== "production"`.

`memory/map`: `{ sites: [{ publicLat, publicLng, locality, analyzedAt }] }` for non test sites,
cached in memory for 5 minutes per instance.

`memory/ping`: checks `Authorization: Bearer <CRON_SECRET>`; runs `select count(*) from sites`,
deletes up to 500 expired `api_cache` rows, returns `{ ok: true, sites, swept }`. `vercel.json`:

```json
{ "crons": [{ "path": "/api/datum/memory/ping", "schedule": "0 9 * * *" }] }
```

Hobby allows once per day with hour precision; this expression complies.

Commit: `feat(datum): add memory context, public sites map, and daily ping routes`

### Step 3.4: brief storage

`brief/route.ts`: before calling Claude, look up `briefs` by `(siteId, inputHash)`; if present,
stream the stored text in one `delta` and a `done` with `cached: true`. After a passing
validation, insert the brief. Failed validations are not stored.

Commit: `feat(datum): store and replay validated site briefs`

### Step 3.5: UI

`MemoryPanel.tsx` under the sheet: memory status line, percentile sentences ("More sun than 62%
of analyzed sites", one per metric with a value), the similar sites list with match percent and
the closest components, and the sentence for the null cases from the spec. `SitesMap.tsx`: Leaflet,
dynamic import, OSM tiles with attribution, circle markers at the public (snapped) points, the
current site highlighted. Both use `.card` and `.meta`.

Commit: `feat(datum): add Site Memory panel and analyzed sites map`

### Step 3.6: e2e

`e2e/fixtures/seed-sites.ts`: the three test sites plus nine more real US addresses chosen by the
build session from public buildings (city halls, main libraries, county courthouses) across
different climates and densities, each verified by running the page once. All twelve are
analyzed with `?test=1` so they are `is_test = true` and never pollute production percentiles.
The server runs with `DATUM_ALLOW_TEST_FLAG=1 DATUM_INCLUDE_TEST_SITES=1` for this spec only.

`e2e/memory.spec.ts`:
1. Analyze all twelve seed sites (reuse the phase 2 flow; skip screenshots). Overpass may fail on
   some; sites whose vector is null are expected and logged.
2. For Atlanta: `GET /api/datum/memory/context?site=` returns `n >= 10`, at least three
   percentile sentences with values between 0 and 100, and either a `similar` list of up to five
   entries with `match` between 0 and 100 or a `reasonIfNull` naming the unavailable layers.
3. `GET /api/datum/memory/map` returns at least 10 sites, every `publicLat` has at most two
   decimals, and no entry has a `lat` or `lng` field (only the snapped `publicLat`, `publicLng`).
4. Screenshot the Atlanta page with the memory panel and map:
   `docs/datum/screenshots/phase-3/atlanta-memory.png`.
5. Brief replay: request the Atlanta brief twice; the second `done` event has `cached: true` and
   the text is identical.
6. Ping: `GET /api/datum/memory/ping` without the header returns 401; with
   `Authorization: Bearer $CRON_SECRET` returns `{ ok: true }`.
7. Offline: start the server with `SUPABASE_URL=http://127.0.0.1:9`. Analyze Atlanta. Assert the
   page completes, the memory panel shows "Site Memory is offline", export works, and no request
   returned 500.

Commit: `test(datum): add memory context, map, replay, ping, and offline checks`

## Acceptance criteria

- [ ] Migration verified (step 3.1 queries).
- [ ] `npm run test:unit` exits 0 with the metrics tests added.
- [ ] `npm run build && DATUM_ALLOW_TEST_FLAG=1 DATUM_INCLUDE_TEST_SITES=1 npm run e2e -- e2e/memory.spec.ts` exits 0.
- [ ] Offline run exits 0.
- [ ] In production (flags unset) `memory/context` for a test site returns `n` counting only non
      test sites: verify by SQL `select count(*) from sites where is_test = false` matching `n`.
- [ ] `select count(*) from sites where locality is null` is 0 for the seed sites (locality lookup
      works) and no column in `sites` contains a street address (`select * from sites limit 20`
      reviewed by the owner).
- [ ] `vercel.json` deploys on a preview without a cron error (owner checks the Vercel dashboard).
- [ ] `npx tsc --noEmit` clean; `npm run build`; `npm run lint`.
- [ ] Six commits matching the steps; allowed paths only.

## Tripwires: stop and ask

- pgvector extension cannot be enabled on the project.
- The HNSW index creation fails (it should not at this size; if it does, ask before switching to
  a sequential scan without an index).
- Fewer than 10 of the 12 seed sites reach a stored analysis after two attempts.
- Any need to widen what is stored per site (for example storing the display name).

## Out of scope

Precedents. Any account or ownership of sites. Deleting sites. Public write access.
