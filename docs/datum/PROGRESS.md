# Datum rebuild: progress

Orchestrator log. One section per phase. Updated at each gate. This file is the orchestrator's
memory; the phase files and `SPEC.md` are the contract.

Started 2026-09-21 from `origin/main` at `c2c8517` (PR #22, rename to Datum).

## Branch stack

| Phase | Branch | Base | PR |
|---|---|---|---|
| 0 | `feat/datum-phase-0` | `main` | pending |
| 1 | `feat/datum-phase-1` | `feat/datum-phase-0` | pending |
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

Status: built and fixed once; awaiting owner decisions A, B, C (below) before the gate closes.
Branch `feat/datum-phase-0`. Builder: Sonnet. Reviewer: Opus. Fix round 1: Sonnet.

Commits: `eeb3fd7` step 0 (orchestrator, docs only, outside the Phase 0 allowed list by the owner's
instruction), `5bfc228` Playwright scaffold, `40dc64a` FEMA host fix, `85ea9a0` baseline capture,
`fb58a2a` README corrections and spec hardening (fix round 1).

### Acceptance table

| Check | Result | Output |
|---|---|---|
| `git merge-base --is-ancestor 5fda80e HEAD` | pass | exit 0 |
| `npx playwright --version` | pass | 1.63.0 |
| `npm run e2e:baseline` | pass | builder run 3 passed (3.1 m); orchestrator re-run 3 passed (4.0 m), then the committed capture was restored |
| Baseline files | pass | 12 PNG, 3 network JSON, 3 text, README, plus probes.txt |
| Miami flood: `/api/flood-risk` 200 | pass | 200 in miami.network.json |
| Miami flood: "ZONE X" with a moderate badge | FAIL | badge reads Minimal Risk; `classifyZone` matches "500" or "SHADED", FEMA subtype is "0.2 PCT ANNUAL CHANCE FLOOD HAZARD". Owner decision A |
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

### Findings for later phases

- FEMA: the old 0.1 degree area query with geometry returns HTTP 500 from the new host. The spec's
  800 m envelope with geometry works but returns about 17 MB at Miami (43 features with rings that
  extend far beyond the frame). Phase 1 flood source must send `geometryPrecision=6` and clip rings
  to the 800 m frame before caching.
- Lint: `main` has 16 pre-existing eslint errors in files no phase touches. Phases 1 to 3 require
  lint clean. Owner decision C.
- Overpass with a User-Agent returned 200 on the probe; the old route's 406 is the missing header.
