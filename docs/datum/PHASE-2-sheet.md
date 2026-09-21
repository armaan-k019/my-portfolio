# Phase 2: sheet

Purpose: rebuild the page around the site sheet, add the streaming brief, add SVG export, and
delete the routes the old page needed. After this phase the public page is the new tool.

Read `SPEC.md` sections 3, 6, 10, 11, 12, 17 before starting. Phase 1 must be complete and merged.

## Scope

1. Pure SVG builders under `src/lib/datum/sheet/`.
2. Brief route with streaming and citation validation.
3. Page rebuild: address entry, confirm map, progressive panels, brief, export.
4. Deletions listed in `SPEC.md` section 17.
5. `content/projects.ts` Datum entry rewritten to match the shipped code.
6. Playwright: screenshots, export validity, layer group list, unavailable states, brief citations.

## Files allowed to change

- `src/lib/datum/sheet/**` (new), `src/lib/datum/brief/**` (new)
- `src/app/api/datum/brief/route.ts` (new)
- `src/app/projects/datum/**` (rewrite; `DatumMap.tsx` deleted)
- `content/projects.ts` (the `datum` entry only)
- `e2e/sheet.spec.ts`, `e2e/unit/sheet.test.ts`, `e2e/fixtures/layers/**` (new)
- Deletions, exactly these six paths and nothing else:
  - `src/app/api/heat-island/route.ts`
  - `src/app/api/zoning/route.ts`
  - `src/app/api/datum/overpass/route.ts`
  - `src/app/api/flood-risk/route.ts`
  - `src/app/api/datum/route.ts`
  - `src/app/projects/datum/DatumMap.tsx`

Not allowed: `src/app/layout.tsx`, `src/app/globals.css` (use existing tokens and primitives;
sheet colours are hard coded hex copies of the tokens inside `sheet/styles.ts` because the SVG must
be self contained), `src/lib/datum/sources/**` (phase 1 code; if a bug is found, stop and ask).

Before deleting anything, run `git grep -n "heat-island\|/api/zoning\|datum/overpass\|flood-risk\|DatumMap"`
and confirm the only consumers are inside `src/app/projects/datum/` (which is being rewritten)
and `e2e/baseline.spec.ts` (which stays as a historical record and is excluded from the default
`e2e` script by renaming it to `e2e/baseline.spec.ts.skip` in step 2.6... see that step).

## Steps

### Step 2.1: sheet layout and styles

`sheet/layout.ts`: constants from `SPEC.md` section 10 (page size, zones as `{ id, x, y, w, h }`
in points, scales, projection helpers `planPx(localM)` and `walkPx(localM)`). `sheet/styles.ts`:
stroke weights, colours, hatch definitions as strings, text styles. `sheet/text.ts`: `wrapText(
text, maxWidthPt, fontSizePt, avgCharEm = 0.5)` returning lines, and `escapeXml`.

Unit test: every zone lies inside the page and no two zones overlap (rectangle intersection test
over all pairs). `escapeXml("<&>\"")` round trips.

Commit: `feat(datum): add sheet layout constants and styles`

### Step 2.2: builders

One file per group id in `sheet/builders/`: `sitePlan.ts`, `walkShed.ts`, `topographySection.ts`,
`soil.ts`, `demographics.ts`, `seismic.ts`, `floodSummary.ts`, `sunPath.ts`, `windRose.ts`,
`climate.ts`, `brief.ts`, `dataAvailability.ts`, `titleBlock.ts`, `attribution.ts`,
`unavailablePanel.ts`, `frame.ts`. Each exports `build(envelope | null, ctx): string` and returns
`<g id="..." data-status="...">...</g>`. Unavailable input routes to `unavailablePanel` with the
zone and the message. `sheet/sheet.ts` exports `buildSheet(layers, site, brief): string` producing
the full document in the fixed group order, and `buildSheetGroups(...)` returning the same groups
as a map for the React panels.

Fixtures: `e2e/fixtures/layers/<site>/<layer>.json` are real envelopes captured from the phase 1
routes (record them with `curl` against the running server; do not hand write).

Unit tests (`e2e/unit/sheet.test.ts`):
- `buildSheet` on the Atlanta fixtures passes a structural check without a DOM library (no new
  dependency in unit tests; the browser `DOMParser` check happens in e2e): every one of the 16 top
  level ids and every nested id from `SPEC.md` section 11 appears exactly once as `<g id="...">`,
  the count of `<g` openings equals the count of `</g>` closings, and the string contains no
  `<image`, no `<foreignObject`, no `data:`, no `<script`.
- Group order: the index of each top level `id="` string increases in the order listed in
  `SPEC.md` section 11.
- With `flood` unavailable (`no_coverage`), the `flood-summary` group carries
  `data-status="unavailable"` and contains the FEMA no coverage message verbatim.
- With every layer except `sun` unavailable, `buildSheet` still returns all 16 groups.
- Site plan: with the Atlanta fixture the `site-plan-buildings` group contains between 60 and 160
  `<path` elements and `site-plan-building-heights` contains 0 `<text` (no heights tagged);
  with the Miami fixture it contains more than 150 `<text`.
- Scale bars: the site plan imperial bar's 200 ft tick is 72 pt from its origin (1 in = 200 ft).
- Text budget: no `<tspan` line in the brief group exceeds 110 characters.

Commit: `feat(datum): add pure SVG builders for every sheet group`

### Step 2.3: brief route

`brief/prompt.ts` (system prompt, serializer, `validateCitations(text, fieldPaths)`),
`brief/route.ts` streaming SSE per `SPEC.md` section 12, reading the site's layer envelopes from
`layer_results` (or, when memory is offline, from the request body `layers` the client sends as
a fallback; the client always sends them, the server prefers the stored copy).

Unit tests:
- `validateCitations("Site elevation is 281.7 m [topo.siteElevationM].", ["topo.siteElevationM"])`
  returns no invalid citations and zero uncited numeric sentences.
- A sentence with a digit and no citation is counted.
- A citation not in `fieldPaths` is returned as invalid.
- The serializer output contains no key named `locality`, `address`, `displayName`, or `city`.

Commit: `feat(datum): add streaming site brief with citation validation`

### Step 2.4: page rebuild

`page.tsx` becomes a server component: eyebrow, title, one paragraph describing what the tool does
(written from the code, no claims about sources that are not wired), then `<SiteSheetApp />`.
`SiteSheetApp.tsx` owns state: `stage` (`idle | geocoding | confirm | analyzing | done`),
`site`, `layers: Record<LayerName, LayerEnvelope | "loading">`, `brief`. `ConfirmMap.tsx` is a
dynamically imported Leaflet map with a draggable marker and Confirm and Change buttons.
`panels/*.tsx` each take an envelope and render `<g dangerouslySetInnerHTML>` from the builder into
one shared on screen `<svg viewBox="0 0 2592 1728">` that scales to the container width. Loading
state per panel: the frame and title with a pulsing hairline, built by `unavailablePanel` with
status `loading` (on screen only; never exported).

Export button: enabled when no layer is `"loading"`. Builds the document with `buildSheet`, checks
it with `DOMParser` in the browser, and downloads it. If the parser reports an error the button
shows "Export failed validation" and logs the error; it never downloads an invalid file.

Retry per panel calls the layer route again. Retrying `osm` also re-fires `walkshed`.

Uses existing primitives (`.eyebrow`, `.card`, `.rule`, `.meta`) for the chrome around the sheet.

Commit: `feat(datum): rebuild page around the site sheet with confirm step and export`

### Step 2.5: deletions and registry

Delete the six files. Rewrite the `datum` entry in `content/projects.ts`:
`blurb`, `description`, and `stack` describe only what phase 1 and 2 shipped (for example stack:
`["Next.js", "Supabase", "OpenStreetMap", "USGS", "FEMA", "Census ACS", "Open-Meteo", "Claude API",
"SVG"]`). Keep `github` only if the linked repository reflects this code; otherwise remove the
field and note it in the phase notes (see `OPEN-QUESTIONS.md` item 13).

Run `npx tsc --noEmit` and `npm run build`. Both must pass with the files gone.

Commit: `chore(datum): remove superseded routes and map component`

### Step 2.6: e2e

Rename `e2e/baseline.spec.ts` to `e2e/baseline.spec.ts.skip` so the default `e2e` script no longer
targets deleted routes (the file stays in git as the record of the phase 0 run).

`e2e/sheet.spec.ts`, one test per site plus two failure tests. Server started with
`DATUM_ALLOW_TEST_FLAG=1`; the client marks these runs as test through a query parameter
`?test=1` that `SiteSheetApp` forwards as `isTest` (only honoured when the server flag is set).

Per site:
1. Go to `/projects/datum?test=1`, type `query`, wait for the suggestion list (Photon), press
   Enter without selecting. Wait for the confirm map. Assert the marker coordinates shown on screen
   are within 0.002 degrees of the fixture `lat, lng`. Click Confirm.
2. Wait until no panel is loading (poll a `data-loading-count` attribute on the sheet root), up to
   150 s. Record which panels are `ok`, `partial`, `unavailable`.
3. Screenshot the full page to `docs/datum/screenshots/phase-2/<slug>.png`.
4. Wait for the brief `done` event (the app sets `data-brief-status`). Assert at least 8 citation
   chips, zero "unverified" banner unless the run had unavailable layers other than osm and
   walkshed (then the banner is allowed and logged).
5. Click Export. Capture the download, read it as text, and in `page.evaluate` parse with
   `DOMParser` as `image/svg+xml`: assert no `parsererror`. Assert the ordered list of top level
   `svg > g[id]` ids equals the 16 in `SPEC.md` section 11 (plus `rect#paper` before them). Assert
   no `image`, `foreignObject`, `script` elements and no `href` attribute containing `data:`.
   Assert the `attribution` group text contains "OpenStreetMap contributors". Assert the root
   `width` is `36in` and `height` is `24in`.
6. Save the SVG to `docs/datum/screenshots/phase-2/<slug>.svg`.
7. Site specific: WaKeeney's `flood-summary` group has `data-status="unavailable"` and contains
   "FEMA has not published"; Miami's `site-plan-flood` group contains at least one `<path` with
   `fill="url(#flood-ve)"`; Atlanta's `site-plan-building-heights` has no `<text`.

Failure test A (Overpass down): server with `DATUM_SOURCE_OVERRIDES='{"overpass":"http://127.0.0.1:9"}'`.
Run Atlanta. Assert the figure-ground and walk shed panels show UNAVAILABLE with the Overpass
message, export still succeeds, and the exported `site-plan` group has `data-status="unavailable"`
and contains no `<path` in `site-plan-buildings`. Assert the brief's "What is missing" names
OpenStreetMap or the figure-ground.

Failure test B (everything external down): override all sources. Assert every panel except sun
is unavailable, the brief streams and contains "What is missing", the citation chips reference
only `sun.*` paths, and the export is valid.

Commit: `test(datum): add sheet, export, unavailable state, and brief checks`

## Acceptance criteria

- [ ] `npm run test:unit` exits 0 (phase 1 tests plus at least 12 new).
- [ ] `npm run build && DATUM_ALLOW_TEST_FLAG=1 npm run e2e -- e2e/sheet.spec.ts` exits 0.
- [ ] Both failure tests exit 0.
- [ ] `docs/datum/screenshots/phase-2/` contains three PNGs and three SVGs; the SVGs open in a
      browser (manual check by the owner) and each is under 4 MB.
- [ ] Manual, owner: open one SVG in Illustrator and in Rhino; note in `OPEN-QUESTIONS.md` item 6
      whether groups arrive named. This is not automatable here.
- [ ] `git ls-files src/app/api | grep -E "heat-island|zoning|flood-risk|datum/overpass|datum/route.ts"`
      prints nothing.
- [ ] `wc -l src/app/projects/datum/page.tsx` under 80; no single file under
      `src/app/projects/datum/` over 400 lines.
- [ ] `git grep -n "levels \* \|\* 3\.\|assumedHeight\|estimateHeight" src/lib/datum` prints nothing.
- [ ] `content/projects.ts` description mentions only shipped layers (reviewer reads it against
      the sheet).
- [ ] `npx tsc --noEmit` clean; `npm run build` succeeds; `npm run lint` clean.
- [ ] Six commits matching the steps; `git diff --name-only main` shows only allowed paths and
      the six deletions.

## Tripwires: stop and ask

- Any need to touch `globals.css` or `layout.tsx`.
- A phase 1 source module needs a change.
- The brief regularly fails citation validation on the normal (all sources up) run: capture three
  raw outputs to the phase notes and ask before changing the prompt contract.
- Export exceeds 4 MB or the page freezes while building the sheet (likely the untrimmed street
  set); ask before adding simplification.
- The deletion grep shows a consumer outside `src/app/projects/datum/` and `e2e/`.

## Out of scope

Site Memory UI, percentiles, similar sites, sites map, pgvector, cron (phase 3). Precedents.
