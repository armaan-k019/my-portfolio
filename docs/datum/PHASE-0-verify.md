# Phase 0: verify

Purpose: establish a truthful baseline before anything is rebuilt, and land the one hotfix that
is small enough to belong here (the FEMA path).

## Scope

1. Confirm PR #20 is on `origin/main` and the working branch starts from it.
2. Add Playwright and an `e2e/` folder so every later phase can verify itself.
3. Switch the flood route to the verified NFHL path.
4. Capture baseline screenshots and network timings for the three test addresses on the current
   page, with the FEMA fix in place, and commit them.

## Files allowed to change

- `package.json`, `package-lock.json` (add `@playwright/test` as a devDependency, add scripts)
- `playwright.config.ts` (new)
- `e2e/**` (new)
- `.gitignore` (add `/test-results/`, `/playwright-report/`, `/e2e/.auth/`)
- `src/app/api/flood-risk/route.ts` (URL constant only)
- `docs/datum/baseline/**` (new)

Nothing else. In particular not `page.tsx`, not `globals.css`, not `layout.tsx`.

## Prerequisites

- `.env.local` with `ANTHROPIC_API_KEY`. `CENSUS_API_KEY` is not needed yet; the baseline is
  expected to show Census failing.
- `git fetch origin` done and `git status` clean on a branch created from `origin/main`.

## Steps

### Step 0.1: confirm the hotfix

```bash
git fetch origin
git log --oneline origin/main -3
git merge-base --is-ancestor 5fda80e origin/main && echo "PR20 on main"
git merge-base --is-ancestor 5fda80e HEAD && echo "PR20 in this branch"
grep -n "UNAVAILABLE_MESSAGE" src/app/api/flood-risk/route.ts
```

Expected: both `echo` lines print. `grep` finds the constant (it is the marker that #20 is present).
No commit for this step.

### Step 0.2: Playwright scaffold

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

Add to `package.json` scripts:

```json
"e2e": "playwright test",
"e2e:baseline": "playwright test e2e/baseline.spec.ts"
```

`playwright.config.ts`:

- `testDir: "e2e"`, `timeout: 180_000`, `retries: 0`, `workers: 1` (external APIs rate limit;
  parallel workers would fight over Overpass slots and Nominatim's 1 request per second).
- `use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 1000 } }`.
- `webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true,
  timeout: 120_000 }`. The build session runs `npm run build` before `npm run e2e`.

`e2e/fixtures/sites.ts` exports the three test sites exactly as in `SPEC.md` section 5, with
`slug`, `query` (the address string), `lat`, `lng`.

Commit: `test: add Playwright scaffold for Datum verification`

Verify: `git diff --name-only main` lists only `package.json`, `package-lock.json`,
`playwright.config.ts`, `.gitignore`, `e2e/fixtures/sites.ts`.

### Step 0.3: FEMA path

In `src/app/api/flood-risk/route.ts` change the `base` constant from
`https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query` to
`https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query`. Nothing else in the
file changes.

Check before committing:

```bash
npm run build
npm run start &
sleep 5
curl -s "http://localhost:3000/api/flood-risk?lat=25.8011588&lng=-80.1890627" | head -c 400
curl -s "http://localhost:3000/api/flood-risk?lat=39.0197690&lng=-99.8837310" | head -c 400
```

Expected Miami: JSON with `"zoneAtLocation":"X"` and `"isModerateRisk":true` (subtype is
"0.2 PCT ANNUAL CHANCE FLOOD HAZARD"), `nearbyZones` non empty with `AE` and `VE` entries.

Expected WaKeeney: the current code has no coverage check, so it returns `"zoneAtLocation":"X"`
with `isMinimalRisk: true`. That is a known false "minimal" for an unmapped community and is fixed
in phase 1 (layer 0 coverage check). Record this in the baseline notes; do not fix it here.

Commit: `fix(datum): point flood route at the current NFHL ArcGIS host`

Verify: `git diff --name-only main` adds only `src/app/api/flood-risk/route.ts`.

### Step 0.4: baseline capture

`e2e/baseline.spec.ts`, one test per site:

1. Record every response whose URL contains `/api/` as `{ url, status, durationMs }` using
   `page.on("response")` with `request().timing()`.
2. Go to `/projects/datum`. Fill the address input with `query`. Wait 700 ms for the
   suggestion list, press Escape (do not pick a suggestion; the baseline tests the typed path).
   Click "Analyze Site".
3. Wait until either the results block or the error block appears, up to 120 s.
   Then wait a further 20 s for the flood, heat, and zoning panels to settle.
4. Click through the four tabs (Demographics, Flood Risk, Heat Island, Zoning), screenshotting
   each: `docs/datum/baseline/<slug>-<tab>.png`, full page.
5. Write `docs/datum/baseline/<slug>.network.json` with the recorded responses and the total
   time from click to results.
6. Write `docs/datum/baseline/<slug>.text.txt` with `innerText` of the results block, so the
   numbers the old page showed are preserved as text, not just pixels.

Run:

```bash
npm run build && npm run e2e:baseline
ls docs/datum/baseline
```

Expected files: 12 PNGs, 3 network JSONs, 3 text files.

Then write `docs/datum/baseline/README.md` by hand from the captured data (not from memory):
one table with, per site, total time to results, status of each `/api/` call, and which panels
showed data, an error, or a default. Include the WaKeeney false "minimal" flood note and whether
Census returned nulls (expected: yes, no key), and whether Overpass returned 406 (expected: yes,
the current route sends no User-Agent).

Commit: `docs(datum): capture pre-rebuild baseline for three test sites`

Verify: `git diff --name-only main` adds only `e2e/baseline.spec.ts` and `docs/datum/baseline/**`.

## Acceptance criteria

- [ ] `git merge-base --is-ancestor 5fda80e HEAD` exits 0.
- [ ] `npx playwright --version` prints a version; `npm run e2e:baseline` exits 0.
- [ ] `docs/datum/baseline/` contains 12 PNGs, 3 `.network.json`, 3 `.text.txt`, one `README.md`.
- [ ] Miami baseline network JSON shows `/api/flood-risk` status 200 and the flood tab screenshot
      shows "ZONE X" with a moderate badge, not the unavailable message.
- [ ] Each `.network.json` records `/api/datum` total time; README quotes those three numbers.
- [ ] `npx tsc --noEmit` clean (delete `.next/` and rerun if the only errors are inside it).
- [ ] `npm run build` succeeds.
- [ ] Three commits on the branch, each touching only the files listed for its step.
- [ ] No key values in any committed file: `git grep -nE "(sk-ant|eyJhbGci)" -- docs/datum/baseline e2e` prints nothing.

## Tripwires: stop and ask

- The flood route needs any change beyond the one URL constant.
- `npx playwright install` fails or needs system packages.
- The baseline run cannot reach results for any site within 120 s on two consecutive tries
  (record what happened in README and ask before retrying a third time; the external services
  may be rate limiting this IP).
- Any file outside the allowed list shows up in `git diff --name-only main`.

## Out of scope

Everything in phases 1 to 4. No refactor of `page.tsx`, no User-Agent fix for Overpass (that
route is deleted in phase 2), no Census key.
