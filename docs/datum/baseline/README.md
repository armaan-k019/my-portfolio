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
| Atlanta | Default (all fields "-"); median income "?", travel/transit/parks/dining/schools/health all 0, walkability and bike scores 0/100 | ZONE X, Minimal Risk (green), SFHA No, nearby zone types "none" | 91.8°F / 33.2°C surface temp, no heat panel data beyond current temp shown on demographics; see heat tab note below | "Unknown", estimated badge; "could not be determined from available OpenStreetMap data" |
| Miami | Same defaults; median income "?" | ZONE X, **Minimal Risk (green)**, SFHA No, nearby zone types "none" | 4.0/10 Moderate Heat Island Effect, surface 24.2°C vs rural reference 25.4°C, +0°C difference, 0% green space | Not screenshotted separately below (see miami-zoning.png); same "limited by free tier API" banner applies to amenity counts feeding zoning |
| WaKeeney | Same defaults; median income "?" | ZONE X, Minimal Risk (green), SFHA No, nearby zone types "none" | Present, same panel structure as Miami | Present |

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
  Miami. Verified independently: the area query the route sends
  (`returnGeometry=true` over a roughly 0.1 degree square) returns
  `{"error":{"code":500,"message":"Error performing query operation"}}` from FEMA's ArcGIS service,
  reproduced twice in a row with the same envelope. The same query with `returnGeometry=false`
  succeeds and lists `AE`, `AH`, and other zones. This is also a pre-existing bug (the area query
  as written does not work against the current host), also out of scope for the one-line URL fix.

Both are recorded here as found, not fixed. "ZONE X" does appear on Miami's badge, and the route
does return HTTP 200 (not the unavailable message), which is the part of the acceptance criteria
that the URL fix alone delivers.

## WaKeeney flood: known false "minimal" (expected, not fixed here)

WaKeeney shows `isMinimalRisk: true` for a location with no NFHL coverage (FEMA layer 0 and layer
28 both return empty features here). The current route has no coverage check, so absence of data
is indistinguishable from an actual minimal-risk zone X. This is the known issue called out in
`PHASE-0-verify.md` step 0.3 and `SPEC.md` open question 17, fixed by the layer 0 coverage check
planned for phase 1. Not fixed in this phase.

## Known-broken backends, as expected

- **Census**: every ACS request returned an HTML "Missing Key" page (`SyntaxError: Unexpected
  token '<' ... is not valid JSON`, logged server side on every run). No `CENSUS_API_KEY` is set in
  `.env.local` for this baseline capture, matching `PHASE-0-verify.md` prerequisites. Median
  income, mean income, population, and all other Census-derived fields render as `"-"` or `"?"` in
  the Demographics tab on all three sites.
- **Overpass**: every category (transit, dining, schools, parks, health) logged `HTTP 406` on the
  first attempt (no User-Agent sent, per the known diagnosis) and `rate limited (429)` on retry, on
  all three sites. The UI shows the "OpenStreetMap data timed out" and "limited by free tier API"
  banners, and all amenity counts render as 0.
- **Atlanta zoning**: renders "Unknown" with an "Estimated" badge and the message "The zoning
  classification for this Atlanta, Georgia parcel could not be determined from available
  OpenStreetMap data," matching the known "Atlanta zoning dead" diagnosis.
- **Open-Meteo (heat)**: works. Miami and WaKeeney both show live heat island scores derived from
  real surface/rural temperature deltas (Miami: 4.0/10, surface 24.2°C vs rural 25.4°C).
- **FEMA flood**: works (200 status, real zone data) after the host fix, with the two caveats
  above (Miami's moderate misclassification, and empty `nearbyZones` on all three sites).
- **Claude design implications**: works on all three sites, producing a full "AI Design
  Implications" section (community profile, cultural context, data insights, six numbered design
  recommendations) in each `.text.txt` capture and each results screenshot.

## Files

12 PNGs (`<slug>-<tab>.png` for `demographics`, `flood`, `heat`, `zoning`, full page, three sites),
3 `.network.json`, 3 `.text.txt`, this `README.md`.
