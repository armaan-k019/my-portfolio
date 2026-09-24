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

```bash
DATUM_ALLOW_TEST_FLAG=1 DATUM_E2E_FORCED=1 \
DATUM_SOURCE_OVERRIDES='{"fema":"http://127.0.0.1:9","usgs_elev":"http://127.0.0.1:9","usgs_seis":"http://127.0.0.1:9","usda":"http://127.0.0.1:9","openmeteo":"http://127.0.0.1:9","overpass":"http://127.0.0.1:9","census_acs":"http://127.0.0.1:9"}' \
npm run dev

DATUM_E2E_FORCED=1 npx playwright test e2e/layers-forced-failure.spec.ts
```

Note `npm run dev`, not `npm run start`. `buildSourceContext` in `src/lib/datum/layers.ts` line 67
reads `DATUM_SOURCE_OVERRIDES` only when `NODE_ENV !== "production"` (SPEC section 15), and the
webpack build inlines `NODE_ENV` as `"production"` into the server bundle, so a built server
ignores the override map even when `NODE_ENV=development` is exported into `next start`. Verified
on 2026-09-24: with the map above and `npm run start`, `layers/seismic` answered `ok` from
`earthquake.usgs.gov`; with `npm run dev` the same request answered `unavailable` from
`http://127.0.0.1:9`.

`sun` is not in the forced list. Only its timezone comes from Open-Meteo, so with `openmeteo`
overridden it still answers `ok` with `timezoneSource: "utc"`. `census` is in the list: the Census
geocoder still resolves the tract, and the ACS call is the one that fails.

## Run: rate limit

```bash
DATUM_ALLOW_TEST_FLAG=1 npm run start          # a freshly started server
npx playwright test e2e/rate-limit.spec.ts
```

Fresh matters. In the in memory fallback the counter lives in the server process and a restart
clears it; with Supabase online it is a row and survives, so run the cleanup below before repeating
the spec on the same UTC day.

## Environment flags

| Flag | Set on | Effect |
|---|---|---|
| `DATUM_ALLOW_TEST_FLAG=1` | the server | the `site` route accepts `isTest` |
| `DATUM_SOURCE_OVERRIDES` | the server | JSON map of source name to base URL, honoured outside production only |
| `DATUM_E2E_FORCED=1` | the test process | runs `layers-forced-failure.spec.ts` instead of skipping it |
| `DATUM_E2E_DB=1` | the test process | runs the assertions that need migration 0001 applied |
| `DATUM_LIVE_FEMA=1` | the test process | Phase 0 live FEMA check in `flood-classify.spec.ts` |

Migration 0001 has not been applied, so `DATUM_E2E_DB` is unset and these checks skip with a named
reason:

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
