# Phase 0 baseline: pre-rebuild state of `/projects/datum`

Captured 2026-09-21 against the current `src/app/projects/datum/page.tsx` (1350 lines) after the
FEMA NFHL host fix (`src/app/api/flood-risk/route.ts`, the `arcgis` path replacing `gis/nfhl`) and
with no `CENSUS_API_KEY` set. Run with `npm run build && npm run e2e:baseline`
(`e2e/baseline.spec.ts`, one Playwright test per site, `workers: 1`). Each test typed the address
into the field, waited 700 ms, pressed Escape, then clicked a neutral point on the page to close
the suggestion list without picking a suggestion (the page has no Escape handler on the address
field, so the suggestion list does not close on Escape alone; this is documented below), then
clicked "Analyze Site".

One fixture note: `e2e/fixtures/sites.ts` uses "NE 25th St & Biscayne Blvd, Miami, FL" for the
Miami site, not the "and" form from `SPEC.md` section 5. Nominatim's search endpoint (the one the
typed path calls directly from the browser) returns zero results for the literal "and" phrasing,
confirmed on two separate runs before the fixture was changed; "&" resolves to the exact
coordinates in `SPEC.md` (25.8011588, -80.1890627). This only affects the query string typed into
the box; the lat/lng used everywhere else are the `SPEC.md` values.

Each `.text.txt` capture is `body.innerText`, so its first lines are the site-wide `AtlasFrame`
chrome (nav labels, the renovation banner, the mock coordinate readout), not site data. That chrome
carries a hard coded Atlanta coordinate on every page, for example "ATLAS · 33.7490°N 84.3880°W",
even on the Miami and WaKeeney captures. Read past that block to reach the actual Datum content.

This capture predates the `bodyKeys` field added to `e2e/baseline.spec.ts` in the baseline spec
hardening pass, so none of the three `.network.json` files here record it; the `.text.txt` files
are what carries the panel evidence (data, error, or default state) for this run.

## Total time and per-call status

| Site | Total time (click to results/error) | `/api/datum` | `/api/heat-island` | `/api/zoning` | `/api/flood-risk` |
|---|---|---|---|---|---|
| Atlanta (Techwood Drive) | 31922 ms | 200, 31406 ms | 200, 165 ms | 200, 5761 ms | 200, 7863 ms |
| Miami (NE 25th & Biscayne) | 35267 ms | 200, 34365 ms | 200, 176 ms | 200, 4156 ms | 200, 7984 ms |
| WaKeeney (300 Main St) | 44339 ms | 200, 43466 ms | 200, 155 ms | 200, 7726 ms | 200, 180 ms |

The three `/api/datum` total times, quoted directly from the `.network.json` files: **31406 ms**
(Atlanta), **34365 ms** (Miami), **43466 ms** (WaKeeney). All within the "30 to 36 s" range from the
original diagnosis summary, except WaKeeney, which ran longer at 43.5 s.

Geocoding drift: the typed path resolves through the browser's direct Nominatim call, not the
`SPEC.md` coordinates. Atlanta resolved to 33.7766729, -84.3920932 (SPEC.md: 33.7751258,
-84.3919750) and WaKeeney and Miami resolved to the exact SPEC.md coordinates. All three are close
enough to sit in the same tract and produce the same class of result.

## Panel state per site

| Site | Demographics | Flood | Heat | Zoning |
|---|---|---|---|---|
| Atlanta | default: all fields "-"; median income "?", travel/transit/parks/dining/schools/health all 0, walkability and bike scores 0/100 | data: ZONE X, Minimal Risk (green), SFHA No, nearby zone types "none" | default: 4.0/10 Moderate Heat Island Effect badge, surface 21.6°C vs rural reference 21.9°C, +0°C difference, 0% green space; the whole score is the green-space term driven by `parksCount=0` from failed Overpass, with `deltaC` clamped to 0 | default: "Unknown", Estimated badge; "could not be determined from available OpenStreetMap data" |
| Miami | default: same as Atlanta; median income "?" | data (misclassified, see note below): ZONE X, **Minimal Risk (green)**, SFHA No, nearby zone types "none" | default: 4.0/10 Moderate Heat Island Effect badge, surface 24.2°C vs rural reference 25.4°C, +0°C difference, 0% green space; same green-space-only mechanism as Atlanta, `deltaC` clamped to 0 | default: `miami-zoning.png` and `miami.text.txt` show "Unknown", Miami, Florida, Estimated badge, "The zoning classification for this parcel in Miami, Florida could not be determined from available OpenStreetMap data" |
| WaKeeney | default: same as Atlanta; median income "?" | data (false minimal, see note below): ZONE X, Minimal Risk (green), SFHA No, nearby zone types "none" | default: 4.5/10 Moderate Heat Island Effect badge, surface 16.0°C vs rural reference 15.1°C, +0.9°C difference, 0% green space; the 4.0 green-space term from failed Overpass plus a genuine, non-clamped +0.9°C delta (the one site where the surface reading exceeds the rural reference) | default: "Unknown", WaKeeney, Kansas, Estimated badge; "could not be determined from available OpenStreetMap data" |

All three runs showed the persistent banner: "OpenStreetMap data timed out. Amenity counts may be
incomplete." and "transit, parks, dining, schools, health limited by free tier API (Overpass). Use
the retry buttons per layer," with 0 points shown in the map's layer-count badges for every
category on every site.

## Miami flood classification: does not match the phase file's expected result

The phase file (`docs/datum/PHASE-0-verify.md`, step 0.3) expects Miami's flood tab to show
`isModerateRisk: true` with the subtype "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", and `nearbyZones`
non-empty with `AE` and `VE` entries. The captured baseline shows neither:

- `zoneAtLocation` is `"X"` (correct) but `isModerateRisk` is `false` and `isMinimalRisk` is `true`.
  The badge in `miami-flood.png` reads "Minimal Risk" in green, not "Moderate Risk" in amber.
  Cause, verified independently with a direct `curl` to the FEMA endpoint the route calls: FEMA
  returns `ZONE_SUBTY: "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"` for this point, but
  `classifyZone()` in `src/app/api/flood-risk/route.ts` only recognizes a shaded zone X when the
  subtype string contains `"500"` or `"SHADED"`. Neither substring appears in the real FEMA text,
  so it falls through to the minimal-risk default. This is a pre-existing bug in the classification
  logic, not something the URL host fix touches, and fixing it is out of scope for Phase 0 (the
  allowed change to this file is the URL constant only).
- `nearbyZones` is empty (the UI shows "Nearby Zone Types: none") on all three sites, not just
  Miami. Verified independently and recorded in `docs/datum/baseline/probes.txt` (items c and d):
  the area query the route sends (`returnGeometry=true` over the same roughly 0.1 degree square)
  returns `{"error":{"code":500,"message":"Error performing query operation"}}` from FEMA's ArcGIS
  service. The same query with `returnGeometry=false` succeeds and lists real zone data. This is
  also a pre-existing bug (the area query as written does not work against the current host), also
  out of scope for the one-line URL fix.

Both are recorded here as found, not fixed. "ZONE X" does appear on Miami's badge, and the route
does return HTTP 200 (not the unavailable message), which is the part of the acceptance criteria
that the URL fix alone delivers.

## WaKeeney flood: known false "minimal" (expected, not fixed here)

WaKeeney shows `isMinimalRisk: true` for a location with no NFHL coverage (FEMA layer 0 and layer
28 both return empty features here). The mechanism: `src/app/api/flood-risk/route.ts` initializes
`zoneAtLocation` to `"X"` (line 105) and only overwrites it when the point query's
`features.length > 0` (lines 112 to 116), so an empty FEMA response for an unmapped community
renders as a real minimal-risk zone X rather than as missing data. This is made harder to catch
because the unavailable path itself returns HTTP 200: two of the three failure branches in the
route (lines 102 and 119) return `{ error: UNAVAILABLE_MESSAGE }` with no explicit status, which
defaults to 200 (only the outermost catch, line 154, sets 500), so a status-only capture cannot
distinguish a genuine failure from a genuine result. This is the known issue called out in
`PHASE-0-verify.md` step 0.3 and `SPEC.md` open question 17, fixed by the layer 0 coverage check
planned for phase 1. Not fixed in this phase.

## Known-broken backends, as expected

- **Census**: every ACS request returned an HTML "Missing Key" page (`SyntaxError: Unexpected
  token '<' ... is not valid JSON`, logged server side on every run; observed in the server console
  during the run, not captured in any committed artifact). `CENSUS_API_KEY` **is** set in
  `.env.local` (confirmed by listing variable names only, never values). The failure is not a
  missing key: `src/app/api/datum/route.ts` builds the ACS URL with no key parameter at all, at the
  tract-level query (lines 347 to 349) and again at the county-level fallback (lines 381 to 383),
  so the request goes out unauthenticated regardless of what is configured in the environment.
  Median income, mean income, population, and all other Census-derived fields render as `"-"` or
  `"?"` in the Demographics tab on all three sites.
- **Overpass**: every category (transit, dining, schools, parks, health) logged `HTTP 406` on the
  first attempt and `rate limited (429)` on retry, on all three sites (observed in the server
  console during the run, not captured in any committed artifact, since the recorded `/api/` calls
  are only the app's own routes, not the outbound Overpass request itself). Independently verified
  in `docs/datum/baseline/probes.txt`: the same query sent with no `User-Agent` header returns
  `406`, and the identical query sent with one returns `200`, confirming the route sends no
  `User-Agent` on the Overpass POST. The UI shows the "OpenStreetMap data timed out" and "limited by
  free tier API" banners, and all amenity counts render as 0.
- **Atlanta zoning**: renders "Unknown" with an "Estimated" badge and the message "The zoning
  classification for this Atlanta, Georgia parcel could not be determined from available
  OpenStreetMap data," matching the known "Atlanta zoning dead" diagnosis.
- **Open-Meteo (heat)**: the surface/rural temperature fetch itself works (real values come back
  on all three sites), but the 0 to 10 "heat island score" it produces is not a measurement. In
  `src/app/api/heat-island/route.ts`, `deltaC = Math.max(0, current - reference)` (line 68) and
  `greenScore = (1 - greenSpacePct / 100) * 4` (line 75), where `greenSpacePct =
  Math.min(35, parksCount * 1.5)` (line 71). Every heat-island request in the captured
  `.network.json` files carries `parksCount=0` (Overpass having already failed for all five
  categories), so `greenSpacePct` is 0 and `greenScore` is the full 4.0 on all three sites. For
  Atlanta (surface 21.6°C vs rural 21.9°C) and Miami (surface 24.2°C vs rural 25.4°C) the surface
  reading is at or below the rural reference, so `deltaC` clamps to 0 and the entire 4.0/10 score is
  the green-space term alone. WaKeeney is the one site where the surface reading exceeds the rural
  reference (16.0°C vs 15.1°C, `+0.9°C`), contributing a genuine `tempScore` of roughly 0.5 on top of
  the same 4.0 green-space term, for the captured 4.5/10. Two of the three scores are entirely an
  artifact of Overpass returning zero parks; the third is mostly that artifact plus one small real
  temperature difference.
- **FEMA flood**: works (200 status, real zone data) after the host fix, with the two caveats
  above (Miami's moderate misclassification, and empty `nearbyZones` on all three sites).
- **Claude design implications**: the call itself completes on all three sites, producing a full
  "AI Design Implications" section (community profile, cultural context, data insights, six
  numbered design recommendations) in each `.text.txt` capture and each results screenshot. But it
  is generated on top of the failed source zeros above, not despite them: the Atlanta capture's
  Data Insights section writes directly about the broken score, "A score of 0/100 almost certainly
  reflects a data gap rather than true conditions" (`docs/datum/baseline/atlanta.text.txt`), meaning
  the narrative treats a formula artifact as a data point worth explaining. The Cultural Context
  paragraphs also draw on Claude's general knowledge of each place's history and neighborhood
  identity (Techwood Homes and the 1996 Olympics for Atlanta, Wynwood's spillover gentrification for
  Miami, the "Christmas City of the High Plains" for WaKeeney), which `SPEC.md` section 2 lists as a
  non goal: "Any neighbourhood history, culture, or reputation text from Claude's general
  knowledge."

## Files

12 PNGs (`<slug>-<tab>.png` for `demographics`, `flood`, `heat`, `zoning`, full page, three sites),
3 `.network.json`, 3 `.text.txt`, this `README.md`, and `probes.txt` (independent curl probes for
the Overpass and FEMA claims above, run separately from the Playwright capture).
