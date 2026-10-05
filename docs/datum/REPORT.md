# Datum rebuild: final report

Written 2026-09-25 by the orchestrator at the owner's request, before the Phase 3 database
mode checks could run (migration 0002 is at the human gate, unapplied). Everything below is
either verified by the orchestrator's own runs or marked as not measured. PROGRESS.md holds the
full history; STANDING-DECISIONS.md holds the rules this build ran under.

## Pull requests, in merge order, none merged

| Order | PR | Branch | Base | Head |
|---|---|---|---|---|
| 1 | #23 Datum Phase 0: verify | feat/datum-phase-0 | main | a08824f |
| 2 | #24 Datum Phase 1: data | feat/datum-phase-1 | feat/datum-phase-0 | 9eadcec |
| 3 | #26 Datum Phase 2: sheet | feat/datum-phase-2 | feat/datum-phase-1 | 8a30f48 |
| 4 | #27 Datum Phase 3: memory | feat/datum-phase-3 | feat/datum-phase-2 | 20848c3 |

Stack head: 244 files changed against main, 341 unit tests, 5 e2e spec files, 22 unit spec
files. Every Greptile comment on the four PRs is answered (0 unanswered at the time of writing).

## Per phase summary

| Phase | Acceptance (orchestrator verified) | Reviewer findings fixed | Open |
|---|---|---|---|
| 0 | Baseline captured for 3 sites (12 PNG, 3 network, 3 text, README, probes); Playwright added; FEMA host fixed; the 0.2 PCT zone X misclassification fixed with a fixture test; tsc, both builds | 10 of 10 (README truthfulness, evidence files, spec hardening) | Live Miami FEMA check pending (host unreachable since 2026-09-22); three baseline text captures contain em dashes because they are verbatim old page output (question 6) |
| 1 | Migration 0001 applied and verified from the app; nine sources with honest envelopes, no literal fallbacks; 182 unit tests at gate close; database mode rate limit and forced failure specs passing with tightened assertions; both builds; lint at baseline | Round 1: 11 of 11; round 2: 2 of 2; round 3: 3 of 3; round 4: 9 of 11 closed, 2 partly; later closed by the Greptile round (offline site rows, bounded memo, insert race, locality write back, random fallback key, Nominatim pacing, sun timezone source) | SPEC section 16 warm target not demonstrated on the preview (three attempts hit protection, a build without variables, and a main build); local database mode numbers are informational; unique (site_key, is_test) migration (question 7) |
| 2 | Site sheet with the 15 SPEC groups, true vector export parsed and validated for 3 sites (2.47, 1.25, 0.27 MB), brief streaming with server side value aware citation validation, page rebuilt (50 line shell), six routes removed, 266 unit tests at gate close; three sites pass with the brief assertion unconditional | Round 1: 20 of 20 on re-verification; owner directed round: validator delivered, tripwire on false positives resolved by the value aware rule; Greptile round: 10 valid items fixed, 3 later items fixed | "With FEMA up" not demonstrated (host unreachable); brief trust rule design (question 8); brief staleness after retry (9); exported footer and pending chip copy (10); the two extra deletions (1); max_tokens 1400 recorded in SPEC |
| 3 | Migration 0002 written and verified byte identical to SPEC plus grants, NOT applied; metrics, context, map, ping, brief replay, panel and map built; offline run passes end to end; ping refusals pass; 341 unit tests; both builds | Round 1: 12 of 14 closed, 2 partly; round 2: closed the data integrity residual, added coverage, split the ping test; Greptile: 4 fixed | Database mode checks NOT RUN (seed run, percentiles, similar sites, map, page screenshot, brief replay); Urban land soil rule makes urban sites vectorless (11); panel copy (12, 12b, 13); CRON_SECRET unset (14); e2e README stale (15); spec must run on the dev server (16); similar sites cap (17) |

## Performance against SPEC section 16

The measurement of record is PENDING by the owner's decision: it is to be taken from the
production deployment after the stack merges. What exists:

In memory mode (no database), Phase 1 step 1.10, warm reads 280 to 1500 ms, all inside budget.

Local database mode after the fourth round (laptop to the Americas region project, informational,
includes laptop to region latency), warm ms:

| layer | Atlanta | Miami | WaKeeney |
|---|---|---|---|
| sun | 2050 | 700 | 928 |
| climate | 2136 | 1902 | 771 |
| topo | 1679 | 985 | 1126 |
| seismic | 726 | 722 | 780 |
| soil | 952 | 721 | 706 |
| osm | 807 | 1553 | 1108 |
| walkshed | 680 | 681 | 580 |
| census | 1492 | 1372 | 1715 |

24 of 27 warm reads inside 1500 ms from the laptop, up from 8 of 24 before the after() and
overlap changes. Cold columns in database mode were served partly from cache and are not true
cold numbers. Flood was unavailable on every run (FEMA unreachable). No preview or production
measurement has been taken.

## What does not work or is weaker than the spec intended

1. FEMA has refused connections from this machine since 2026-09-22. The flood layer has never
   returned live data in this build; its fixtures are constructed from the values verified on
   2026-09-21 and labelled as such; the WaKeeney no coverage stamp and the Miami VE hatch are
   unverified on the page; the Phase 0 live Miami test is pending.
2. Phase 3's database path is untested end to end: no percentile, similar site, map, brief
   replay, or n value has been observed. Migration 0002 is unapplied.
3. Under SPEC section 14 as written, sites on SSURGO "Urban land" (Atlanta, Miami, most dense
   urban sites) have no hydrologic group, therefore no vector, therefore never get "sites like
   this". Question 11.
4. Similar sites are ordered in TypeScript over a capped candidate set; the true nearest
   neighbour can be missed past 2000 sites; the cap flag is not rendered. Question 17.
5. The memory panel can print two "Site Memory holds N" sentences with different N (total sites
   versus sites that measured a metric); the arithmetic is honest, the copy contradicts.
   Question 12b.
6. The brief's trust rule for client supplied layers has three interacting weaknesses (stale
   stored rows after a retry, a fresh site admitting client values, a succeeded layer described
   as "not requested" before its after() write lands). Question 8. Retrying a layer does not
   regenerate the brief. Question 9.
7. The acceptance suite is sensitive to model output: the value aware check catches genuine
   roundings by the model (1.9666 m written as 2 m), so a site can fail a run and pass the next.
   Intended, but it means a green run is a sample, not a guarantee.
8. DATUM_INCLUDE_TEST_SITES and DATUM_SOURCE_OVERRIDES are inert in production builds by
   design, so the forced failure and memory specs run on the dev server; the phase files still
   describe production build runs. Questions 6 (decided) and 16.
9. sites.site_key is unique alone, so a test row and a real row collide at the same rounded
   point. Question 7.
10. A cold serverless instance that never saw a site row still answers 404 for that site while
    Site Memory is offline (recorded residual of the offline fix).
11. Local database mode warm timings miss the 1500 ms budget on some reads; the production
    measurement has not been taken.
12. The e2e README is stale for the memory spec; three baseline text captures carry em dashes as
    verbatim old page output; one Phase 0 commit's co-author line names the Haiku subagent.
13. The two extra deletions (flood classify helper and its spec) await the owner's after the fact
    approval or restoration.

## Owner's remaining manual checks

- Apply migration 0002 (with or without the question 17 function), set CRON_SECRET in .env.local
  and Vercel, and confirm question 16, so the Phase 3 database mode checks can run and be
  recorded before the stack is merged.
- Open one exported SVG (docs/datum/screenshots/phase-2/atlanta.svg) in Illustrator and in Rhino
  and record in OPEN-QUESTIONS.md item 6 whether the 15 top level groups arrive named and
  ordered.
- Review the live preview of feat/datum-phase-3 (the preview needs SUPABASE_URL,
  SUPABASE_SECRET_KEY, CENSUS_API_KEY, DATUM_ALLOW_TEST_FLAG for Preview, which are now set, and
  CRON_SECRET).
- After merging the stack in order, take the SPEC section 16 cold and warm measurements from the
  production deployment for the three test sites and record them in PROGRESS.md; a miss is a
  release blocker for Datum going live.
- Answer open questions 1 to 17 and 12b in PROGRESS.md.
