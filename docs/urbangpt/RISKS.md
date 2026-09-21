# Risks

Top risks per phase, and the acceptance check that catches each. "Catches" means the build session
would fail a listed check, not that a human would notice.

## Phase 0

| Risk | Consequence | Caught by |
|---|---|---|
| Playwright browsers install but the `webServer` never comes up (port in use, build stale) | Baseline never captured; later phases have no verification | Phase 0 acceptance: `npm run e2e:baseline` exits 0 and the 18 baseline files exist |
| The FEMA fix is right but the WaKeeney false "minimal" is mistaken for a bug and fixed here, widening scope | Phase 0 touches classification logic that phase 1 deletes | Step 0.3 states the expected WaKeeney output and the README records it; the allowed file list has one file with one constant; `git diff --name-only main` check |
| Baseline README written from memory rather than the captured data | The record of the old state is wrong | README must quote the three `/api/urban-gpt` timings from the `.network.json` files; the reviewer diffs them |

## Phase 1

| Risk | Consequence | Caught by |
|---|---|---|
| Overpass is unreliable (504 "too busy" seen on two of five probes) and the session "fixes" it with a default empty result | A site renders as an empty field with no buildings and no warning | Envelope rule 1 plus the literal fallback grep; forced failure run asserts `data: null` and a message; the e2e allows unavailable but fails on a fake ok |
| A source's response shape drifts from the fixtures (Census sentinel values, USGS field names) | Nulls or NaN reach the sheet | Fixture based unit tests per source; the tripwire that says record and ask on shape mismatch |
| Cached failures | One bad minute poisons a site for 30 days | Cache rule: transient failures are never written; forced failure run counts `api_cache` rows before and after |
| Supabase paused or unreachable during a build session | Every route 500s | Offline handling in `memory.ts`; phase 3 offline run, and phase 1 `site` route returns `memoryStatus` which the layers test prints |
| Key leakage in `source.url` or fixtures | Census key committed | `git grep -nE "key=[A-Za-z0-9]{10,}"` acceptance check; `.url.txt` files are stripped |
| Rate limit counts cached re-opens | Legitimate users blocked | Rate limit run (21 distinct sites) and the definition that re-opening is free; a second test opening the same site must not increment (add to the run) |
| Nominatim policy breach (autocomplete through Nominatim, missing User-Agent) | IP banned, geocoding dead | `suggest` uses Photon only; the `git grep "User-Agent"` check; the token bucket unit test |
| Solar math sign errors (azimuth convention) | Sun path mirrored east west, a serious drawing error | Equinox sunrise near 90 and sunset near 270 assertions |

## Phase 2

| Risk | Consequence | Caught by |
|---|---|---|
| Two rendering paths (React panels versus export) drift | On screen and exported sheets differ | Single builder string architecture; the export is the same strings; unit test on `buildSheet` structure; e2e parses the download |
| SVG not truly vector or not self contained (a Leaflet canvas or tile sneaks in) | Illustrator import fails or shows raster | e2e asserts no `image`, `foreignObject`, `script`, or `data:` references |
| Group order or ids change during implementation | Illustrator layers unnamed or unordered | e2e and unit tests assert the exact ordered id list |
| Building heights inferred from levels for "nicer" labels | Fabricated data on an architect's drawing | Rule in SPEC section 2; grep for `levels *` and `estimateHeight`; Atlanta e2e asserts zero height labels |
| Claude cites fields that do not exist or writes neighbourhood colour | Brief reads plausible and is wrong | Server side citation validator; e2e asserts chip count and banner rules; serializer test that no locality key is sent; failure test B asserts only `sun.*` citations |
| Unavailable panels export as blank space | The sheet silently hides missing data | Unit test with all layers unavailable still yields 16 groups with `data-status`; WaKeeney flood check in e2e |
| Deleting a route that something else still imports | Build breaks or another page loses data | Pre deletion grep step; `npm run build` after deletion |
| Page bloat returns (a 1000 line client component) | Same maintainability problem as before | `wc -l` limits in acceptance |
| Text overflow in the brief zone at ARCH D | Illegible export | `wrapText` budget unit test and the screenshot review |

## Phase 3

| Risk | Consequence | Caught by |
|---|---|---|
| Percentiles computed over test and dev sites | Numbers driven by the three test addresses | `is_test` exclusion, minimum 10, production SQL count check in acceptance |
| Vector drift as normalization constants change | Old vectors incomparable with new | Constants are fixed and exported; unit test on ranges; `schema_version` on sites for a future re-index |
| Missing components imputed as zero | "No flood coverage" reads as "no flood risk" in similarity | Unit test: WaKeeney (no coverage) yields a null vector |
| Address text stored by accident (display name, suggestion label) | Privacy commitment broken | Acceptance: owner reviews `select * from sites limit 20`; the memory map test asserts no `lat`/`lng` fields leave the server |
| Cron never fires on Hobby (wrong schedule) or the ping is unauthenticated | Database pauses; or anyone can trigger sweeps | Schedule is daily; ping test asserts 401 without the bearer; owner checks the Vercel dashboard |
| Supabase paused despite the ping | Memory offline in production | Offline run proves the app degrades cleanly; the pause heuristic is an open question, not a promise |

## Phase 4

| Risk | Consequence | Caught by |
|---|---|---|
| A dataset is picked by the build session to "make progress" | Licence exposure and fabricated precedents | The phase file forbids any change under `src/`; BLOCKED status; the owner's answer to item 14 is the only unblock |
