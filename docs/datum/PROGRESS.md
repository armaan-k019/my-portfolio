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

Status: modules merged; step 1.10 (e2e) in progress; migration 0001 at the human gate.
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

### Owner decisions pending (Phase 1)

1. Migration 0001: run as written, or with the atomic `rate_limit_hit` function appended.
2. PHASE-1 step 1.8 asserts Atlanta buildings 80 to 130, withHeight 0, withLevels 8 to 20, from
   the 2026-09-21 probe (ways only). The 2026-09-22 capture with relations gives 151 buildings,
   16 with height, 51 with levels. Module F's test asserts 110 to 200, 5 to 40, 30 to 80 with a
   comment. Approve the widened bands (and a matching SPEC section 5 correction), or require the
   parser to count ways only.
3. SPEC section 9 says the trimmed Atlanta street set "should be under 1 MB". Trimming exactly as
   specified gives 1.42 MB. Accept, or authorise coordinate rounding to 5 decimals.
4. `playwright.config.ts` one line `testIgnore` for `e2e/unit/**` (outside the Phase 1 list).

### Pending live checks

- FEMA fixtures re-record and the Phase 0 live Miami test, when `hazards.fema.gov` answers.
