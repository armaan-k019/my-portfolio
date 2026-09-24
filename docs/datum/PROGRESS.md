# Datum rebuild: progress

Orchestrator log. One section per phase. Updated at each gate. This file is the orchestrator's
memory; the phase files and `SPEC.md` are the contract.

Started 2026-09-21 from `origin/main` at `c2c8517` (PR #22, rename to Datum).

## Branch stack

| Phase | Branch | Base | PR |
|---|---|---|---|
| 0 | `feat/datum-phase-0` | `main` | pending |
| 1 | `feat/datum-phase-1` | `feat/datum-phase-0` | opened 2026-09-22, see Phase 1 |
| 2 | `feat/datum-phase-2` | `feat/datum-phase-1` | pending |
| 3 | `feat/datum-phase-3` | `feat/datum-phase-2` | pending |
| 4 | BLOCKED | | |

## Pre flight

- `docs/datum/SPEC.md` confirmed on `origin/main`.
- `.env.local` variable names present: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `WORLDLABS_API_KEY`,
  `CENSUS_API_KEY`, `SUPABASE_SECRET_KEY`. Not present: `SUPABASE_URL`. Open question 3 says it is
  set; it is not in this file. Raised with the owner before Phase 1 step 1.1 (stop condition:
  requires a key or dashboard action). Phase 0 does not need it.
- Step 0: owner answers recorded in `OPEN-QUESTIONS.md`, items 1 to 18 marked resolved.

## Phase 0

Status: GATE CLOSED 2026-09-22. PR #23. One live check pending (below).
Branch `feat/datum-phase-0`. Builder: Sonnet. Reviewer: Opus. Fix round 1: Sonnet.

Commits: `eeb3fd7` step 0 (orchestrator, docs only, outside the Phase 0 allowed list by the owner's
instruction), `5bfc228` Playwright scaffold, `40dc64a` FEMA host fix, `85ea9a0` baseline capture,
`fb58a2a` README corrections and spec hardening (fix round 1), `f372b46` FEMA 0.2 PCT
classification fix with a Miami request test (owner decision A, fix round 2).

### Owner decisions at the Phase 0 gate (2026-09-22)

- A: fix the old route's classification so a zone X with a "0.2 PCT" subtype is moderate, with a
  test at the Miami point. Applied in `f372b46` (`e2e/flood-classify.spec.ts`).
- B: the step 0 commit and the fix round commits on this branch are an accepted exception to
  "three commits"; the three build commits are each scoped to their allowed files.
- C: "lint clean" for Phases 1 to 3 means eslint clean on the files the phase changes, plus a
  guard checked at every gate: the repo wide eslint error count must never exceed the baseline.
  Baseline measured 2026-09-22 with `npx eslint .` on `main` and on this branch: 16 errors,
  10 warnings.
- `SUPABASE_URL`: checked by name on 2026-09-22 after the owner reported it set; not present in
  `.env.local`. Raised again; Phase 1 step 1.1 waits on it.

### Acceptance table

| Check | Result | Output |
|---|---|---|
| `git merge-base --is-ancestor 5fda80e HEAD` | pass | exit 0 |
| `npx playwright --version` | pass | 1.63.0 |
| `npm run e2e:baseline` | pass | builder run 3 passed (3.1 m); orchestrator re-run 3 passed (4.0 m), then the committed capture was restored |
| Baseline files | pass | 12 PNG, 3 network JSON, 3 text, README, plus probes.txt |
| Miami flood: `/api/flood-risk` 200 | pass | 200 in miami.network.json |
| Miami flood: "ZONE X" with a moderate badge | pass (fixture) | `classifyZone` matched only "500" or "SHADED"; decision A added "0.2 PCT" in `f372b46`. `338b538` exports the function and unit tests it from the verified Miami, Atlanta, and SFHA values (1 passed). The live FEMA request test is gated by `DATUM_LIVE_FEMA=1` and skipped by default |
| Lint guard (decision C) | pass | `npx eslint .` on the branch: 16 errors, 10 warnings, equal to the baseline |
| README quotes the three `/api/datum` times | pass | 31406, 34365, 43466 ms |
| `npx tsc --noEmit` | pass | exit 0 |
| `npm run build` | pass | exit 0 |
| Three commits, each touching only its listed files | pass with exception | the three build commits are correctly scoped; the branch also carries the step 0 commit and the fix round commit. Owner decision B |
| No key values in committed files | pass | grep empty |

Baseline measurement of record (click to results): Atlanta 31.9 s, Miami 35.3 s, WaKeeney 44.3 s.
Orchestrator re-run for flakiness: Atlanta 34.5 s, WaKeeney 32.3 s, Miami 101.3 s with no
`/api/datum` response captured (external services), so any later comparison should use the
committed capture and expect wide variance on the old page.

### Reviewer findings and resolution

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | high | README called the heat score "works"; the 4.0 is the green space default from `parksCount=0` (Overpass failed), delta clamped to 0 at Atlanta and Miami | fixed in fb58a2a; WaKeeney's 4.5 includes a real +0.9 C delta, stated as such |
| 2 | high | README said no Census key is set; the key is set and the old route never sends one | fixed in fb58a2a (bullet) and in the intro line by the orchestrator |
| 3 | medium | Overpass 406/429 and FEMA 500 claims had no committed evidence | probes.txt added with raw curl output; console only observations labelled as such |
| 4 | medium | Flood route defaults `zoneAtLocation` to "X" on empty features, and returns 200 on failure | documented with line numbers; code fix deferred to Phase 1 per the phase file |
| 5 | medium | Files outside the allowed list and four commits | recorded here as the owner directed step 0 exception; decision B |
| 6 | medium | Baseline spec could pass while capturing nothing | hardened: loading state asserted without catch, `apiCalls.length > 0` asserted |
| 7 | medium | Network JSON status only cannot show a 200 with an error body | `bodyKeys` recorded for future runs; committed capture predates it, noted in README |
| 8 | low | text captures include AtlasFrame chrome with a hard coded Atlanta coordinate | noted in README |
| 9 | low | Panel table incomplete | every cell now says data or default with the captured value |
| 10 | low | Claude narrative reported as "works" | reworded: narrates failed source zeros and general knowledge history, quoted from the capture |

### Pending live check

- `DATUM_LIVE_FEMA=1 npx playwright test e2e/flood-classify.spec.ts` against a running build.
  FEMA (`hazards.fema.gov`) refused TLS connections from this machine from about 15:00 UTC on
  2026-09-22 for the whole gate window (poll: 9 attempts, all connection failures). Run when it
  answers and record the output here.

### Deviations recorded

- Phase 1 unit tests will run through Playwright's test runner without a browser
  (`playwright test --config playwright.unit.config.ts`) rather than `node --test`, because Node's
  type stripping requires explicit file extensions in relative imports, which the Next bundler
  build does not use. The acceptance criterion (`npm run test:unit` exits 0 with at least 35 tests)
  is unchanged; only the runner differs.

### Findings for later phases

- FEMA: the old 0.1 degree area query with geometry returns HTTP 500 from the new host. The spec's
  800 m envelope with geometry works but returns about 17 MB at Miami (43 features with rings that
  extend far beyond the frame). Phase 1 flood source must send `geometryPrecision=6` and clip rings
  to the 800 m frame before caching.
- Lint: `main` has 16 pre-existing eslint errors in files no phase touches. Phases 1 to 3 require
  lint clean. Owner decision C.
- Overpass with a User-Agent returned 200 on the probe; the old route's 406 is the missing header.

## Phase 0 addendum (2026-09-22)

- `a08824f` moves `classifyZone` into `src/app/api/flood-risk/classify.ts`. Exporting a helper
  from a route file passed the default Turbopack build but failed `next build --webpack` with
  "classifyZone is not a valid Route export field". Found by the Phase 1 module agents. From this
  point every gate runs both `npm run build` and `npx next build --webpack`.
- The commit's co-author line names the Haiku subagent that wrote it rather than the orchestrator.
  Left as is: amending would rewrite history, which the owner has asked to approve first.

## Phase 1

Status: modules merged, reviewed, fixed once, step 1.10 merged. Waiting on the owner: migration
0001 (human gate) and decisions 1 to 7 below. PR #24.
Branch `feat/datum-phase-1`, base `feat/datum-phase-0`. Contract: Opus. Modules A to G: seven
Opus agents in worktrees, merged by the orchestrator with no conflicts. Fix rounds: none yet.

### Contract (`6fc3a81` to `5947362`)

Migration 0001 verbatim from SPEC section 13; types, constants, geo, http, cache, memory, stubs,
registry, site and layer routes; 21 unit tests. Deviations recorded by the builder: read then write
rate limit (PostgREST cannot increment in an upsert; atomic function proposed to the owner),
`SOURCE_OVERRIDE_ALIASES` so the step 1.10 override names resolve, `buildSourceContext` in
`layers.ts`, verbatim `UNAVAILABLE_MESSAGES` in `constants.ts`, `@types/d3-contour` under
dependencies (to tidy), unit runner is Playwright without a browser (see Phase 0 deviations).

### Module wave (merged in order B, D, E, G, A, F, C)

| Module | Commit | Tests | Notes |
|---|---|---|---|
| A sun and climate | `0c80c40`, `e238a45` | 32 | Fixtures live (1.05 MB each). Calm hours reported separately from sectors; `sunLayer` takes an optional year defaulting to 2025; daylight by month uses the 15th |
| B topo | `002b1fe` | 14 | Fixtures live. 441 of 441 samples at Atlanta, relief 29.9 m, 15 contours at 5 m. EPQS failure gives partial, not unavailable |
| C seismic and soil | `ea9f35e` | 15 | Fixtures live for all three sites, values match SPEC section 5. SDA answers `{}` with no Table key for open ocean; treated as no_coverage |
| D flood | `260e9ae` | 10 | Fixtures CONSTRUCTED from SPEC section 5 values, FEMA unreachable (UNREACHABLE.txt). geometryPrecision=6 and frame clipping in place and tested. Re-record when FEMA answers |
| E census | `c862602` | 7 | Fixtures live with the real key (redacted in .url.txt). ACS 2023 works; no 2022 fallback needed. Keyless ACS answers 302 then the HTML page |
| F osm and walk shed | `034b97c` | 18 | Fixtures live after three 504s. Atlanta raw 3.49 MB, trimmed 1.42 MB (above the 1 MB guidance). Test bands widened versus PHASE-1 step 1.8 (owner decision below) |
| G geocoding | `fed7fb4` | 8 | Fixtures live. Photon puts the Miami intersection 3.5 km north; Nominatim matches SPEC to 7 decimals |

Merged branch gates: tsc exit 0; `npm run test:unit` 130 passed; `npx eslint .` 16 errors, 10
warnings (equal to baseline); `npm run build` exit 0; `npx next build --webpack` exit 0.

### Review round 1 (Opus reviewer, 2026-09-24) and fix round 1

| # | Severity | Finding | Resolution (commit) |
|---|---|---|---|
| 1 | high | climate.ts returned literal 0 for empty months, seasons, wind sets inside an ok envelope; types made null impossible | fields widened to `number \| null`, nulls returned, paths in `partial.missing`, tests for a missing month and an all null archive (`b32c3a0`) |
| 2 | high | layer route `local-` path: no range check, no rate limit, open proxy for every upstream including Census with the server key | range checks, local ids only while memory is offline, rate limit peek with 429, absent point now 400, route unit tests (`cf6f89a`) |
| 3 | high | Overpass mirror loop computed the 55 s cap per attempt, up to 135 s against maxDuration 60 | one shared deadline threaded through `fetchWithPolicy`, timeout once under 2 s remain, budget test (`17d5380`) |
| 4 | medium | topo.ts returned 0 for relief, slope, aspect on degenerate grids | `number \| null`, listed in missing, degenerate grid test (`b32c3a0`) |
| 5 | medium | census geocoder error envelope cached 365 days as no_coverage | parse_error thrown, null only for a present empty tract array, zero cache writes asserted (`5bdb66c`) |
| 6 | medium | relation outer rings counted as buildings; coverageRatio biased low | distinct feature counting, `ringCount` added, rings clipped to the frame for coverage, count asserted from the fixture (`3011e3c`) |
| 7 | medium | invalid siteClass answered as an envelope, not a 400 | route validates with `isValidSiteClass` (`cf6f89a`) |
| 8 | medium | suggest answered 200 with an empty list on any failure | `unavailable: { code, message }` added to the body (`2aa05b6`) |
| 9 | low | every transport error retried | retry only on abort or a retryable status (`17d5380`) |
| 10 | low | unbounded query strings as cache keys | 120 character cap, sha256 keyed (`2aa05b6`) |
| 11 | low | two PHASE-1 acceptance greps unsatisfiable as written | owner decision 5 |
| 12 | low | FEMA fixtures constructed | pending live re-record |
| 13 | medium | missing tests: shared osm and walkshed failure, FEMA no_coverage cached, layer route | added (`c745973`) |

Fix round deviations recorded by the builder: `buildClimate` now returns `{ data, missing }`; a
zero row archive is `parse_error` rather than partial; retryable statuses stay the union of the
policy list and 502, 503, 504. Widened fallback grep over `src/lib/datum/` shows two `?? 0` lines
in `memory.ts`, both rate limit counters where no row means zero requests, not a data value.

### Step 1.10 (e2e, `42b8e62`, merged)

Offline mode (migration not applied): layers spec 3 passed, forced failure spec 1 passed (against
`npm run dev`, see decision 7), rate limit spec 1 passed (429 at request 21). Every non flood layer
ok at every site, warm under 1500 ms with `source.cached: true`. Flood unavailable everywhere with
`upstream_error` (FEMA unreachable). Database gated assertions skip with a named reason until
`DATUM_E2E_DB=1`. Cold timings (ms) from the run of record: Atlanta osm 15483, topo 5076, census
4045, climate 3217; Miami osm 5577; WaKeeney osm 6683. Every cold layer except osm at Atlanta met
the SPEC section 16 cold targets.

Combined branch gates after the merge: tsc exit 0; `npm run test:unit` 159 passed; `npx eslint .`
16 errors, 10 warnings; `npm run build` exit 0; `npx next build --webpack` exit 0.

### Re-verification and fix round 2 (2026-09-24)

Reviewer re-verified findings 1 to 10 and 13 at `bc318ce`: all resolved, finding 6 partially (the
coverage ratio extent, decision 8). Two residuals the fixes introduced were closed in fix round 2:

- `d6a1f7d` local site ids are now `local-<siteKey>-<sig>`, sig = first 32 hex of HMAC-SHA256
  keyed with the secret key over `<siteKey>|<UTC day>`, valid today and yesterday. The layer route
  accepts a verified local id whatever the memory status (an analysis that starts during a Supabase
  outage no longer breaks when memory reconnects), keeps the range checks and the rate limit peek,
  and cannot be forged. Nine new unit tests.
- `73e758b` the Atlanta building count is asserted against an independent loop in the test and an
  absolute band, not only the parser's own rule.
- `fe85f71` contract document updated (buildClimate return shape, hashed geocoding keys, the fix
  round surface changes).

Gates after fix round 2: tsc exit 0; `npm run test:unit` 163 passed; `npx eslint .` 16 errors,
10 warnings; `npm run build` exit 0; `npx next build --webpack` exit 0; key grep empty; no em
dashes. Phase 1 has used both fix rounds. Any further code change waits for the owner.

### Owner decisions answered 2026-09-24

1. Migration 0001: option 1. `rate_limit_hit(p_ip_hash, p_day)` appended to the migration file and
   to SPEC section 13; `memory.ts` switches to `rpc` in the owner directed round below. Owner runs
   the file next.
2. OSM counts, with evidence. SPEC section 5 said "about 96 buildings, 11 with levels, 0 with
   height". That figure came from the orchestrator's probe on 2026-09-21, which was centred at
   33.7756, -84.3963 (about 400 m west of the test site at 33.7751258, -84.3919750) and requested
   `way["building"]` only, so relations were never counted. The committed capture of 2026-09-22
   (`e2e/fixtures/overpass/atlanta.raw.json`, exact test site, the SPEC section 9 query) contains
   126 ways and 14 relations tagged building (140 distinct features; the relations carry 30 outer
   rings), 14 features with a height tag (11 ways, 3 relations) and 49 with a levels tag (41, 8).
   The original number was wrong because of the probe centre and the missing relations, not
   because OSM changed. SPEC section 5 now carries the capture's numbers and the reason.
3. Trimmed Overpass payload 1.42 MB at Atlanta: accepted as a recorded deviation from "under 1 MB".
   A size guard is added in the owner directed round: the trimmed size is logged per cache write
   and anything above 3 MB is flagged (warning log plus a `sizeWarning` field on the envelope).
   Storage math: Supabase free tier database limit is 500 MB. Per site worst case (dense urban)
   about 1.4 MB Overpass plus about 0.8 MB climate (shared within 0.1 degree) plus under 0.1 MB for
   the rest, so about 2.3 MB uncompressed per new dense site and under 0.4 MB rural. Uncompressed
   that is roughly 200 dense sites before the tier fills; Postgres TOAST compresses jsonb
   coordinate arrays several fold, so several hundred is more realistic. Expired rows are swept by
   the Phase 3 ping. Revisit when `select pg_size_pretty(pg_total_relation_size('api_cache'))`
   passes 250 MB.
4. `playwright.config.ts` `testIgnore` for `e2e/unit/**`: approved, applied in the owner directed
   round.
5. Acceptance grep rewordings: before and after text sent to the owner for approval; not applied
   until approved.
6. `DATUM_SOURCE_OVERRIDES` under `DATUM_ALLOW_TEST_FLAG=1`: approved with the condition "both are
   ignored when NODE_ENV is production". That condition leaves the forced failure spec unable to run
   against `next start` (which is production mode), which was the problem. Clarification requested
   before implementing.
7. Coverage ratio over the 400 m circle: approved. SPEC sections 9 and 14 updated; code and test
   updated in the owner directed round.
8. No other decisions are outstanding.

Model note (owner instruction 2026-09-24): from Phase 2 onward, build, review, and verification
subagents run on Opus (the harness's current Opus; the orchestrator can only select the family, not
the point version), Sonnet where the plan says Sonnet, Haiku for one or two file fixes. The
orchestrator's own model is a harness setting the orchestrator cannot change from inside the
session; the owner switches it with the `/model` command.

### Owner directed round (2026-09-24, after the decisions)

`3aa26ce` rpc increment, `251e08c` 3 MB size guard, `9c28b00` coverage over the 400 m circle,
`cccc720` Playwright ignore and types tidy, `af0d248` keeps the fallback grep to the two counters.
Gates: tsc exit 0; 168 unit tests; both builds exit 0; eslint 16 errors; `playwright test --list`
12 tests in 5 files, none under unit.

### Migration 0001 applied (owner, 2026-09-24) and verified from the app side

Through the Supabase client with the secret key: insert, update, delete succeed on api_cache,
sites, layer_results, rate_limits; deleting a site cascades to layer_results; `rate_limit_hit`
returns 1 then 2 on consecutive calls; an unauthenticated REST request is refused with 401. Test
rows were removed afterwards.

### Database gated e2e (2026-09-24): STOP, two fix rounds already used

Run against `next start` with `DATUM_ALLOW_TEST_FLAG=1 DATUM_E2E_DB=1`, cache and rate limit
tables live, from this laptop to the Americas region project.

| Spec | Result | Cause |
|---|---|---|
| layers.spec | 3 failed | warm responses over Supabase exceed the 1500 ms budget: sun 1920 and 1970 ms, climate 2316 and 2580 ms, topo 4434 ms at Atlanta. In memory mode the same assertions passed at 280 to 1500 ms. Each layer request does a site lookup, a cache read, and a layer_results write in series, each a round trip from the laptop to the project |
| rate-limit.spec | passed after clearing `rate_limits` | the first attempt failed because the counter persists across specs within a day (the layers spec had already spent 3 of 20); the spec assumes a fresh day |
| layers-forced-failure.spec (dev server) | 2 failed | climate answered ok because the 0.1 degree climate cache cell was already populated by the layers spec, so the override never had a request to block; the Overpass cache gained a row because the documented override JSON names `overpass` but not `overpass_mirror`, so the mirror answered for real |

Warm timing table, database mode, ms (cold column is itself warm from the previous run's cache):

| layer | Atlanta warm | Miami warm | WaKeeney warm |
|---|---|---|---|
| sun | 1920 | 1970 | 1202 |
| climate | 2580 | 2180 | 2316 |
| topo | 4434 | 1797 | 1444 |
| seismic | 1095 | 1119 | 1147 |
| soil | 1092 | 1111 | 1206 |
| osm | 4472 | 2962 | 1624 |
| walkshed | 3166 | 1869 | 1209 |
| census | 2014 | 1535 | 2030 |

Flood unavailable everywhere (FEMA unreachable). All test rows cleaned up afterwards.

Proposed to the owner (not applied): (a) a third round to run the site lookup and cache read in
parallel and to write layer_results without awaiting it, then re-measure; (b) treat laptop to
Supabase numbers as an upper bound and re-measure on the Vercel preview; (c) forced failure spec
uses a point far from any cached cell and the override alias maps `overpass` onto the mirror too;
(d) rate-limit spec asserts relative to the first response's `remaining` and the README says to
clear the table first.

### Third round authorised (owner, 2026-09-24): recorded exception to the two round limit

Scope: (a) layer route runs the site lookup and the cache read in parallel and schedules the
layer_results write with Next's `after()` so it is guaranteed to run after the response is sent
(never a floating promise: serverless instances can be frozen once the response goes out);
(b) Vercel preview becomes the measurement of record for SPEC section 16 warm targets, the 1500 ms
threshold stays, local database mode timings are informational and include laptop to region
latency, and all three sites cold and warm must be recorded here from the preview before the
stack merges; (c) forced failure procedure revised in PHASE-1 step 1.10 (cold point at least
0.3 degrees away, `overpass` override covers the mirror). What the old procedure failed to catch:
the mirror answered for real while the test still passed in memory mode, because the override
JSON never named `overpass_mirror` and the in memory run happened to hit a mirror timeout;
(d) the rate limit spec isolates itself with a unique synthetic client IP per run and asserts the
exact 429 at request 21; decision 6 implemented as approved (flag and non production both
required, inert in production proven by a test).

### Third round results (2026-09-24)

Commits `99623b3` (layer_results written through `after()`; the commit subject claims an overlap
of the site lookup with the fetch, but the reviewer confirmed nothing asynchronous runs between
starting the lookup and awaiting it, so the lookup and the cache read remain serial and only the
write was removed from the response path; written through `after()` from next/server via a one line wrapper in `src/lib/datum/after.ts` with a test seam,
because a route file may not export helpers), `5947997` (overrides need the flag and non
production, inert in production proven by a unit test; `overpass` alias covers the mirror),
`f75d514` (forced failure spec on cold points 35.1,-85.3 and 36.4,-86.2), `7485a89` (rate limit
spec with a synthetic client IP per run, exact 429 at request 21).

Gates (orchestrator re-run): tsc exit 0; `npm run test:unit` 175 passed; eslint 16 errors and
10 warnings; both builds exit 0; fallback grep only the two counters; no direct `fetch` outside
http.ts; no em dashes.

Database mode e2e (builder run, laptop to region): rate-limit spec passed without any table
clearing; forced failure spec 2 passed on the dev server (climate now unavailable on a cold
cell, `api_cache` gained no row for any overridden prefix, mirror included); layers spec 2
passed, 2 failed on warm latency only: Atlanta climate 2191 ms and WaKeeney sun 1677 ms against
1500. Before the round 8 of 24 warm reads were inside budget; after it 24 of 27 are. Largest
changes: Atlanta topo 4434 to 841 ms, osm 4472 to 1039, walkshed 3166 to 669. The builder notes
that true overlap of the site lookup with the cache read is not possible on the database path
(the cache key needs the site's point, which comes from the row) and that the rate limit peek
must precede any upstream call, so the gain came from `after()`. Informational only; the Vercel
preview is the measurement of record (decision b).

### Third round review (fresh Opus reviewer, 2026-09-24): STOP

| # | Severity | Finding |
|---|---|---|
| 1 | high | The claimed overlap of site lookup and fetch was not delivered (all code between starting and awaiting the lookup is synchronous). Only the layer_results write left the response path |
| 2 | high | Database backed site ids reach every upstream with no rate limit gate; SPEC section 13 exempts only sites created in the last 24 hours, the route exempts every site forever |
| 3 | medium | `Number(null)` is 0, so a null rpc result silently disables the cap instead of failing; a timeout on a successful increment can double charge through the retry |
| 4 | medium | The forced failure api_cache assertion counts rows per prefix; an upsert onto an existing key is invisible, and `census_acs`/`tiger` keys are tract keyed, not point keyed |
| 5 | medium | The 0.3 degree cold point rule does not cover tract keyed caches, so `census` can answer ok from cache on a repeat run |
| 6 | medium | Rate limit spec cleanup deletes every test site in the project, not only its own |
| 7 to 11 | low | README repeatability claim, unguarded test seams in src, env restore writes the string "undefined", a `?? ""` in the size guard, a no-op after() for local ids |

Sound: `after()` usage and error handling, transient envelopes never scheduled, override gating
and the inertness test, the alias without double matching, signed local ids, the synthetic IP
hashing, the cold points' separation, no weakened thresholds.

Phase 1 has used its two fix rounds plus the owner authorised third. A fourth round is proposed to
the owner with a design for the overlap (site lookup and rate limit peek in parallel, peek result
memoised per IP for 60 s in the instance, fetch after both) and the 24 hour exemption rule.

### Owner decisions pending (Phase 1), superseded by the answers above

1. Migration 0001: run as written, or with the atomic `rate_limit_hit` function appended.
2. PHASE-1 step 1.8 asserts Atlanta buildings 80 to 130, withHeight 0, withLevels 8 to 20, from
   the 2026-09-21 probe (ways only). The 2026-09-22 capture with relations gives 151 buildings,
   16 with height, 51 with levels. Module F's test asserts 110 to 200, 5 to 40, 30 to 80 with a
   comment. Approve the widened bands (and a matching SPEC section 5 correction), or require the
   parser to count ways only.
3. SPEC section 9 says the trimmed Atlanta street set "should be under 1 MB". Trimming exactly as
   specified gives 1.42 MB. Accept, or authorise coordinate rounding to 5 decimals.
4. `playwright.config.ts` one line `testIgnore` for `e2e/unit/**` (outside the Phase 1 list).
5. PHASE-1 acceptance text: restate the User-Agent grep as a "no direct fetch in src/lib/datum"
   check and widen the fallback grep to all of `src/lib/datum/` (both stricter).
6. Decision 2 restated after review finding 6: approve distinct feature counting and correct the
   SPEC section 5 Atlanta line to the fixture's counts.
7. SPEC section 15: honour `DATUM_SOURCE_OVERRIDES` also when `DATUM_ALLOW_TEST_FLAG=1`, so the
   forced failure spec can run against a production build (`next start` inlines production).
8. SPEC section 9 defines `coverageRatio` as footprint area inside the 800 m frame over the frame
   area, but buildings are fetched within a 400 m radius, so the frame corners are always empty
   and the ratio reads low. Proposed: define it over the area of the 400 m circle instead.

### Pending live checks

- FEMA fixtures re-record and the Phase 0 live Miami test, when `hazards.fema.gov` answers.
