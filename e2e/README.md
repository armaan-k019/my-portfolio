# Datum e2e checks

Three request only specs, no browser. They run against a server you start yourself, because each
run needs different environment variables and `playwright.config.ts` reuses an existing server on
port 3000.

| Spec | What it proves |
|---|---|
| `layers.spec.ts` | The nine layers answer for the three test sites with the values in `docs/datum/PHASE-1-data.md` step 1.10, cold then warm, and the warm run is served from the cache inside the budget |
| `layers-forced-failure.spec.ts` | Every source pointed at an unreachable port degrades to `unavailable` with `data: null` and a real sentence, and writes nothing to `api_cache` |
| `rate-limit.spec.ts` | The twenty first uncached analysis of the day from one client is refused with 429 and a `resetAt` |

`baseline.spec.ts` and `flood-classify.spec.ts` are from Phase 0 and are unrelated.

## Build

Always build with webpack. Turbopack cannot follow the `node_modules` symlink used in the Phase 1
worktrees.

```bash
npx next build --webpack
```

## Run: layers

```bash
DATUM_ALLOW_TEST_FLAG=1 npm run start          # in one shell
npx playwright test e2e/layers.spec.ts         # in another
```

`DATUM_ALLOW_TEST_FLAG=1` is what makes the route honour `{ isTest: true }`, so the site rows the
run creates are marked as test rows.

Restart the server before a run you intend to read as cold. With Supabase offline the cache is a
module level `Map` in the server process, so a second run against the same process is warm
throughout and the cold column means nothing.

## Run: forced failure

Procedure revised 2026-09-24 (owner decision c). Three things it depends on: a development server,
the test flag, and the `overpass` override reaching the mirror.

```bash
DATUM_ALLOW_TEST_FLAG=1 \
DATUM_SOURCE_OVERRIDES='{"fema":"http://127.0.0.1:9","usgs_elev":"http://127.0.0.1:9","usgs_seis":"http://127.0.0.1:9","usda":"http://127.0.0.1:9","openmeteo":"http://127.0.0.1:9","overpass":"http://127.0.0.1:9","census_acs":"http://127.0.0.1:9"}' \
npm run dev

DATUM_E2E_FORCED=1 DATUM_E2E_DB=1 npx playwright test e2e/layers-forced-failure.spec.ts
```

`npm run dev`, not `npm run start`. `buildSourceContext` in `src/lib/datum/layers.ts` reads
`DATUM_SOURCE_OVERRIDES` only when `DATUM_ALLOW_TEST_FLAG=1` **and** `NODE_ENV !== "production"`
(SPEC section 15, owner decision 6), and the webpack build inlines `NODE_ENV` as `"production"` into
the server bundle, so a built server ignores the override map even when `NODE_ENV=development` is
exported into `next start`. Verified on 2026-09-24: with the map above and `npm run start`,
`layers/seismic` answered `ok` from `earthquake.usgs.gov`; with `npm run dev` the same request
answered `unavailable` from `http://127.0.0.1:9`.

`DATUM_ALLOW_TEST_FLAG=1` is required twice over: it is what makes the `site` route honour
`{ isTest: true }`, and it is now also half of the condition that makes the override map readable.

The `overpass` entry covers the kumi.systems mirror as well, through `SOURCE_OVERRIDE_ALIASES` in
`src/lib/datum/constants.ts`. Before that alias existed the override named only the primary host,
the mirror answered for real, and the run wrote an Overpass row to `api_cache` while still passing.

Both tests analyse a cold point rather than a test site: 35.1, -85.3 for the unavailable assertions
and 36.4, -86.2 for the `api_cache` count. Each is at least 0.3 degrees from every site in
`e2e/fixtures/sites.ts` and from the other, which is what keeps the 0.1 degree Open-Meteo climate
cell cold. A warmed cell is never fetched, so the override would have nothing to block and the layer
would answer `ok`: that is how the 2026-09-24 run failed.

`sun` is not in the forced list. Only its timezone comes from Open-Meteo, so with `openmeteo`
overridden it still answers `ok` with `timezoneSource: "utc"`. `census` is in the list: the Census
geocoder still resolves the tract, and the ACS call is the one that fails.

## Run: rate limit

```bash
DATUM_ALLOW_TEST_FLAG=1 npm run start          # in one shell
DATUM_E2E_DB=1 npx playwright test e2e/rate-limit.spec.ts
```

The spec generates one synthetic client IP per run (a random address in 10.0.0.0/8) and sends it in
the `x-forwarded-for` header on every request. The `site` route hashes the first entry of that
header, so the daily counter the run exercises is its own: it is not shared with `layers.spec.ts`,
and the spec can be repeated on the same UTC day without clearing anything first. It asserts exactly
20 responses with status 200 and `rateLimit.remaining` counting down 19 to 0, then a 429 with
`resetAt` on the twenty first.

With `DATUM_E2E_DB=1` the run deletes what it created, through `getClient()` in the test process:
the `rate_limits` row for its own hashed IP (computed with `hashIp` from
`src/lib/datum/memory.ts`, since the salt is not exported) and `sites` where `is_test`. It prints
row counts only, never a URL and never a key. Deleting the test sites matters for the next run: a
site re-opened within 30 days is free and would not move the counter. The SQL below stays as the
manual fallback for a run that was interrupted or run without `DATUM_E2E_DB=1`.

## Environment flags

| Flag | Set on | Effect |
|---|---|---|
| `DATUM_ALLOW_TEST_FLAG=1` | the server | the `site` route accepts `isTest` |
| `DATUM_SOURCE_OVERRIDES` | the server | JSON map of source name to base URL, honoured only when `DATUM_ALLOW_TEST_FLAG=1` and `NODE_ENV !== "production"` |
| `DATUM_E2E_FORCED=1` | the test process | runs `layers-forced-failure.spec.ts` instead of skipping it |
| `DATUM_E2E_DB=1` | the test process | runs the assertions that need migration 0001 applied |
| `DATUM_LIVE_FEMA=1` | the test process | Phase 0 live FEMA check in `flood-classify.spec.ts` |

Migration 0001 was applied on 2026-09-24. Without `DATUM_E2E_DB=1` these checks still skip, with a
named reason:

- `layers.spec.ts`: Site Memory reports `online` and the `site` route returns a real row id rather
  than a `local-` id.
- `layers-forced-failure.spec.ts`: `api_cache` row counts for the overridden key prefixes are
  unchanged across a forced failure run.

The `api_cache` count helper calls `getClient()` from `src/lib/datum/memory.ts` inside the test
process, so that process also needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It prints counts
only, never a URL and never a key.

The warm run asserts `source.cached: true` today as well, but with Supabase offline that flag comes
from the in memory `Map` in `cache.ts`, not from `api_cache`. Only a `DATUM_E2E_DB=1` run proves
the Supabase path.

## Cleanup SQL

Run after a rate limit run, and after any run that created rows, against the Datum project:

```sql
-- rate limit counters for today (documented in PHASE-1-data.md step 1.10)
delete from rate_limits where day = current_date;

-- the site rows the specs create, and their layer results by cascade
delete from sites where is_test = true;
```

`api_cache` is deliberately not cleared: the cached payloads are what make a warm run warm, and
they expire on their own TTLs.

## Known allowances

- **Overpass.** `osm` and `walkshed` may answer `unavailable` with `timeout`, `http_error`, or
  `upstream_error`. The spec prints a warning instead of failing, but still requires `data: null`
  and a non empty `unavailable.message`. This is the designed behaviour in SPEC section 16, not a
  bug. Observed on 2026-09-24: an `osm` request timed out at 62 s while the `walkshed` request that
  followed reached Overpass and answered `ok`, so the spec treats "osm failed, walkshed succeeded"
  as a warning. The reverse, osm answering while walkshed fails, is a failure.
- **FEMA.** `hazards.fema.gov` has refused connections from this machine since 2026-09-22 (recorded
  in `docs/datum/PROGRESS.md`, Phase 0 pending live check). `flood` therefore gets the same
  allowance as Overpass when its code is one of the three network codes. On the run of record all
  three sites returned `unavailable` with `upstream_error`, including WaKeeney, where the expected
  answer is `no_coverage`. Re-run the spec once FEMA answers to check the flood row of the step
  1.10 table.
- **Census.** `ok` and `partial` both pass. ACS suppresses estimates for some tracts and those
  fields are listed in `partial.missing`.
