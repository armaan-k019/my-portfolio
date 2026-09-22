# Phase 1 shared contract

Status: written 2026-09-22 on `feat/datum-phase-1` after the Phase 0 gate closed.
Audience: the six module agents who build the Datum source modules in parallel, one worktree each.

This document is the interface between you. Everything it names already exists on the branch as a
compiling stub with the right signature. Your job is to replace the body of the files you own and
nothing else. If you find yourself wanting to change a shared file, stop and report instead.

Read first: `CLAUDE.md`, `AGENTS.md`, `SPEC.md` sections 5, 7, 8, 9, 13, 15, and the step in
`PHASE-1-data.md` that names your module.

## 1. What is already built

| File | What it gives you |
|---|---|
| `src/lib/datum/types.ts` | `LayerName`, `LayerStatus`, `LayerEnvelope<T>`, `UnavailableCode`, the nine per layer data interfaces, `LayerInput`, `SourceContext`, `LayerFetcher<T>`, `SiteRecord` |
| `src/lib/datum/constants.ts` | `USER_AGENT`, `SOURCE_BASE_URLS`, `SOURCE_DISPLAY_NAMES`, `SOURCE_LICENCES`, `SOURCE_TIMEOUT_MS`, `TTL_SECONDS`, the extents, `RATE_LIMIT_PER_DAY`, `UNAVAILABLE_MESSAGES`, `withCode`, `resolveBaseUrl` |
| `src/lib/datum/geo.ts` | `toLocal`, `fromLocal`, `haversineM`, `bboxAround`, `ringAreaM2`, `roundKey`, `siteKey`, `publicPoint` |
| `src/lib/datum/http.ts` | `fetchWithPolicy`, `SourceError`, `isSourceError`, `toSourceError`, `ok`, `partial`, `unavailable`, `defaultRetryable`, `fieldPathsOf`, `stripKey` |
| `src/lib/datum/cache.ts` | `cached`, `CacheApi`, `CacheEntry`, `createCacheApi`, `createMemoryCacheApi`, `createSupabaseCacheApi` |
| `src/lib/datum/memory.ts` | `getClient`, `withMemory`, `memoryStatus`, `findSite`, `getOrCreateSite`, `getSiteById`, `touchSite`, `storeLayerResult`, `checkRateLimit`, `hashIp`, `clientIpFrom`, `isLocalSiteId` |
| `src/lib/datum/layers.ts` | `layerFetchers`, `LAYER_RESULT_TTL_SECONDS`, `LAYER_PARAMS`, `buildSourceContext` |
| `src/app/api/datum/site/route.ts` | The site record route |
| `src/app/api/datum/layers/[layer]/route.ts` | The dispatcher. It already calls your fetcher |
| `supabase/migrations/0001_cache_sites_ratelimit.sql` | Written, not applied. The owner applies it |
| `playwright.unit.config.ts`, `npm run test:unit` | The unit runner: `e2e/unit`, no browser, no server |

## 2. Rules that apply to every module

1. **Never edit a shared file.** `types.ts`, `constants.ts`, `geo.ts`, `http.ts`, `cache.ts`,
   `memory.ts`, `layers.ts`, and both routes are frozen. If a per layer data interface is wrong,
   report it; do not widen it yourself, because another agent is compiling against it.
2. **Never throw out of a `LayerFetcher`.** Catch everything, convert with `toSourceError`, and
   return an `unavailable` envelope. The route does not have a try/catch around you.
3. **No literal fallback values.** No `?? 20`, no `?? "X"`, no `: 18`. A missing field is `null`
   and goes in `partial.missing`. The acceptance check greps `src/lib/datum/sources/` for these.
4. **Every outbound request goes through `fetchWithPolicy`.** It is the only place that sets the
   User-Agent, the timeout, the retry, and the 55 s wall clock cap. Do not call `fetch` directly.
5. **Every cacheable payload goes through `cached`.** Write the trimmed payload, never the raw
   response. `ok`, `partial`, and `no_coverage` are cacheable; `timeout`, `http_error`,
   `rate_limited`, `parse_error`, and `upstream_error` are not.
6. **Every base URL goes through `resolveBaseUrl(source, ctx)`**, so `DATUM_SOURCE_OVERRIDES` can
   point your source at an unreachable port in the forced failure run.
7. **Never read `process.env` in a source module.** The key you may need is `ctx.env.censusApiKey`.
   Never put a key value in `source.url`; `stripKey` runs inside the envelope builders, but do not
   rely on it as your only defence.
8. **Use the verbatim messages** from `UNAVAILABLE_MESSAGES` with `withCode(message, code)` so the
   panels and screenshots are comparable across sites.
9. **Erasable TypeScript only** inside `src/lib/datum`: no `enum`, no parameter properties, no
   namespaces. Do not use the `@/` alias inside `src/lib/datum`.
10. **No em dashes** anywhere, including comments and commit messages.
11. Fixtures are recorded with `curl` from the real endpoint into `e2e/fixtures/<source>/` with the
    request URL in a sibling `.url.txt`, key stripped. Never hand write a fixture.
12. Your unit spec goes in `e2e/unit/<module>.spec.ts` and uses only `test` and `expect` from
    `@playwright/test`. No `page` fixture.

## 3. The worked example

Copy this shape. It is a hypothetical source, but every helper call and every branch is the one
your module needs.

```ts
// src/lib/datum/sources/example.ts
import {
  SOURCE_DISPLAY_NAMES,
  SOURCE_LICENCES,
  SOURCE_TIMEOUT_MS,
  TTL_SECONDS,
  UNAVAILABLE_MESSAGES,
  resolveBaseUrl,
  withCode,
} from "../constants";
import { cached } from "../cache";
import { SourceError, fetchWithPolicy, ok, partial, toSourceError, unavailable } from "../http";
import { roundKey } from "../geo";
import type { ExampleData, LayerFetcher } from "../types";

interface ExampleRaw {
  reading: string | null;
  quality: string | null;
}

/** Pure parser, unit tested against a recorded fixture with no network. */
export function parseExample(raw: unknown): { data: ExampleData; missing: string[] } {
  if (!raw || typeof raw !== "object") {
    throw new SourceError("parse_error", "Example returned a body that is not an object.");
  }
  const body = raw as ExampleRaw;
  const reading = body.reading === null ? null : Number(body.reading);
  const missing: string[] = [];
  if (reading === null || !Number.isFinite(reading)) missing.push("readingM");
  return {
    data: {
      readingM: Number.isFinite(reading as number) ? (reading as number) : null,
      quality: body.quality,
    },
    missing,
  };
}

export const fetchExample: LayerFetcher<ExampleData> = async (input, ctx) => {
  const base = resolveBaseUrl("example", ctx);
  const url = `${base}?x=${input.lng.toFixed(6)}&y=${input.lat.toFixed(6)}&f=json`;

  // The cache key is the source name, a colon, and the rounded point.
  const key = `example:${roundKey(input.lat, input.lng, 3)}`;

  const source = {
    name: SOURCE_DISPLAY_NAMES.example,
    url,
    licence: SOURCE_LICENCES.example,
    cached: false,
  };

  try {
    const result = await cached(
      key,
      TTL_SECONDS.example,
      async () => {
        const response = await fetchWithPolicy(
          url,
          { method: "GET" },
          {
            timeoutMs: SOURCE_TIMEOUT_MS.example,
            retries: 1,
            retryOn: [502, 503, 504],
            source: "example",
          },
          ctx,
        );
        const body = await response.json();
        // Trim before caching. Store what the parser needs, nothing else.
        const trimmed = { reading: (body as ExampleRaw).reading, quality: (body as ExampleRaw).quality };
        const empty = trimmed.reading === null && trimmed.quality === null;
        return {
          source: "example",
          url,
          status: response.status,
          body: trimmed,
          // no_coverage is a real answer and is cached; failures never reach here.
          cacheable: true,
          noCoverage: empty,
        };
      },
      ctx,
    );

    source.cached = result.cached;

    const trimmed = result.entry.body as ExampleRaw;
    if (trimmed.reading === null && trimmed.quality === null) {
      return unavailable(
        "example",
        source,
        "no_coverage",
        UNAVAILABLE_MESSAGES.exampleNoCoverage,
        { now: ctx.now },
      );
    }

    const { data, missing } = parseExample(trimmed);
    if (missing.length > 0) {
      return partial(
        "example",
        source,
        data,
        missing,
        "Example answered but left some fields empty.",
        { now: ctx.now },
      );
    }
    return ok("example", source, data, { now: ctx.now });
  } catch (raw) {
    const error = toSourceError(raw, "example");
    return unavailable(
      "example",
      source,
      error.code,
      withCode(UNAVAILABLE_MESSAGES.exampleFailure, error.code),
      { now: ctx.now, httpStatus: error.httpStatus },
    );
  }
};
```

Points to carry across:

- `fieldPaths` is computed for you by `ok` and `partial`. Do not pass `fieldPaths` unless your data
  contains something the brief must not cite.
- `{ now: ctx.now }` on every builder call. `fetchedAt` must come from the context so tests can pin
  it.
- `source.cached` is set from `result.cached`, so the warm run can assert `source.cached: true`.
- The catch converts once, at the end. Do not catch inside the producer: a throw there is what
  stops the cache write.

## 4. Module A: sun and climate

Files owned: `src/lib/datum/sources/openMeteo.ts`, `src/lib/datum/climate.ts`,
`src/lib/datum/solar.ts`. Spec: section 9 "sun" and "climate". Phase: steps 1.2 and 1.3.

| Export | Signature | Notes |
|---|---|---|
| `fetchArchive` | `(input: LayerInput, ctx: SourceContext) => Promise<ArchiveResponse>` | The shared archive fetch. Throws `SourceError`. Both `climate` and the `sun` timezone read it |
| `fetchClimate` | `LayerFetcher<ClimateData>` | Registered as the `climate` layer |
| `buildWindRose` | `(hours: ArchiveHour[]) => WindRose` | Pure. 16 sectors, bins `[0.5, 2, 4, 6, 8, Infinity]` m/s, calm under 0.5 |
| `buildMonthlyNormals` | `(hours: ArchiveHour[]) => ClimateMonth[]` | Pure. Twelve entries, January first |
| `buildDegreeDays` | `(hours: ArchiveHour[]) => { baseC, hdd, cdd }` | Pure. Base 18.3 C, per year, averaged over the period |
| `buildComfortShare` | `(hours: ArchiveHour[]) => { pct, definition }` | Pure. 18 to 26 C and RH under 70 percent |
| `buildClimate` | `(archive: ArchiveResponse) => ClimateData` | Pure. Assembles the four above |
| `solarPosition` | `(date: Date, lat: number, lng: number) => SolarPosition` | Pure NOAA equations, azimuth clockwise from north |
| `sunPath` | `(lat, lng, tzOffsetMinutes, date) => SunDay` | Pure. Samples every 15 minutes |
| `sunLayer` | `(lat, lng, timezone) => SunData` | Pure. 21 March, 21 June, 21 December |
| `fetchSun` | `LayerFetcher<SunData>` | Registered as the `sun` layer |

- Returns: `ClimateData` and `SunData` from `types.ts`.
- Cache key and TTL: `openmeteo:<roundKey(lat, lng, 1)>:<start>_<end>`, `TTL_SECONDS.openMeteo`
  (365 days). The period is part of the key so a new year rolls over naturally.
- Request: 3 calendar years ending at the last complete year, hourly
  `temperature_2m, relative_humidity_2m, wind_speed_10m, wind_direction_10m, shortwave_radiation`,
  `timezone=auto`. Convert km/h to m/s.
- The `sun` layer is computed and never calls a network. It takes the IANA timezone from the
  archive response. If the archive is unavailable, compute in UTC and return `partial` with
  `missing: ["timezone"]` (OPEN-QUESTIONS item 18). It is never `unavailable`.
- Helpers: `fetchWithPolicy`, `cached`, `ok`, `partial`, `unavailable`, `resolveBaseUrl`.
  Message: `UNAVAILABLE_MESSAGES.openMeteo`.
- Accuracy gate: noon altitude within 0.5 degrees of the analytic checks in `PHASE-1-data.md`
  step 1.2.

## 5. Module B: topo

Files owned: `src/lib/datum/sources/usgsElevation.ts`, `src/lib/datum/topo.ts`.
Spec: section 9 "topo". Phase: step 1.4.

| Export | Signature | Notes |
|---|---|---|
| `fetchPointElevation` | `(point: LatLng, ctx: SourceContext) => Promise<number>` | EPQS. `{ value: "281.726..." }` is a string, parse it. Throws `SourceError` |
| `fetchGridSamples` | `(points: LatLng[], ctx: SourceContext) => Promise<Array<number \| null>>` | 3DEP `getSamples`, one multipoint of 441. Align on `samples[i].locationId`. Throws `SourceError` |
| `fetchTopo` | `LayerFetcher<TopoData>` | Registered as the `topo` layer |
| `gridPoints` | `(origin: LatLng, n: number, spacingM: number) => LatLng[]` | Pure. Row major, north to south, west to east |
| `contourLines` | `(values, n, spacingM) => { intervalM, lines }` | Pure. d3-contour, thresholds from 1, 2, 5, 10 m so there are 4 to 20 lines |
| `buildTopo` | `(siteElevationM, values, spacingM, n) => TopoData` | Pure. Sections, relief, mean slope, best fit plane aspect |

- Returns: `TopoData`.
- Cache key and TTL: `usgs_epqs:<roundKey(lat, lng, 3)>` and
  `usgs_3dep:<roundKey(lat, lng, 3)>`, both `TTL_SECONDS.usgsElevation` (365 days).
- Timeout: 3DEP is `SOURCE_TIMEOUT_MS.usgs_3dep` (20 s), EPQS is the 12 s default.
- Fewer than 441 samples is `partial` with the missing count; fewer than 300 is `unavailable`
  with `parse_error`.
- `d3-contour` is imported in `topo.ts`, never in the source module.
- Message: `UNAVAILABLE_MESSAGES.usgsElevation`.

## 6. Module C: seismic and soil

Files owned: `src/lib/datum/sources/usgsSeismic.ts`, `src/lib/datum/sources/usdaSoil.ts`.
Spec: section 9 "seismic" and "soil". Phase: step 1.5.

| Export | Signature | Notes |
|---|---|---|
| `isValidSiteClass` | `(value: string) => boolean` | A to E only. Anything else is rejected before the request |
| `SITE_CLASSES`, `DEFAULT_SITE_CLASS`, `RISK_CATEGORY` | constants | `D` and `II` are the defaults, and `assumptions.siteClassIsDefault` records it |
| `fetchSeismic` | `LayerFetcher<SeismicData>` | Reads `input.params.siteClass` |
| `soilQuery` | `(lat: number, lng: number) => string` | Pure. Coordinates at 6 decimals. No user text ever enters the SQL string |
| `fetchSoil` | `LayerFetcher<SoilData>` | POST `{ query, format: "JSON+COLUMNNAME" }` |

- Returns: `SeismicData`, `SoilData`.
- Cache keys and TTLs: `usgs_seismic:<roundKey(lat, lng, 3)>:<siteClass>` and
  `usda:<roundKey(lat, lng, 3)>`, both 365 days (`TTL_SECONDS.usgsSeismic`, `TTL_SECONDS.usda`).
- An empty SDA `Table` is `no_coverage` with `UNAVAILABLE_MESSAGES.usdaNoCoverage`, and it is
  cached. "Urban land" is a valid answer with a null hydrologic group, not a failure.
- An invalid site class is a 400 from the route layer, not an upstream request.
- Messages: `UNAVAILABLE_MESSAGES.usgsSeismic`, `UNAVAILABLE_MESSAGES.usda`.

## 7. Module D: flood

Files owned: `src/lib/datum/sources/fema.ts`. Spec: section 9 "flood". Phase: step 1.6.

| Export | Signature | Notes |
|---|---|---|
| `classifyZone` | `(zone, subtype, sfhaTf) => FloodClass` | By fields, never by guess |
| `clipRingToFrame` | `(ring: LocalPoint[], halfSizeM: number) => LocalPoint[]` | Runs before the payload is cached |
| `fetchFlood` | `LayerFetcher<FloodData>` | Registered as the `flood` layer |

- Returns: `FloodData`.
- Cache key and TTL: `fema:<roundKey(lat, lng, 3)>`, `TTL_SECONDS.fema` (30 days). `no_coverage`
  is cached for the same 30 days.
- Request order: layer `0` at the point with `outFields=STUDY_ID&returnGeometry=false` first. If
  `features` is empty, return `no_coverage` with `UNAVAILABLE_MESSAGES.femaNoCoverage` and make no
  second request. Only then layer `28` at the point, and layer `28` over the 800 m envelope with
  `returnGeometry=true&outSR=4326`.
- **Two rules that are not optional** (PROGRESS.md Phase 0 finding): the envelope request must
  send `geometryPrecision=6`, and every ring must be clipped to the 800 m frame with
  `clipRingToFrame(ring, 400)` **before the payload is cached**. Unclipped, Miami returns about
  17 MB for 43 features whose rings run far outside the frame.
- Classification: `SFHA_TF === "T"` is `sfha`; `FLD_ZONE === "X"` with `ZONE_SUBTY` containing
  `0.2 PCT` is `moderate`; `FLD_ZONE === "X"` with `MINIMAL` is `minimal`; `FLD_ZONE === "D"` is
  `undetermined`; anything else is `other` with the raw zone and subtype and no risk label.
  `STATIC_BFE` of `-9999` is `null`.
- Cap the polygon list at `FLOOD_POLYGON_CAP` (200).
- Message on failure: `UNAVAILABLE_MESSAGES.femaFailure`.

## 8. Module E: census

Files owned: `src/lib/datum/sources/census.ts`. Spec: section 9 "census". Phase: step 1.7.

| Export | Signature | Notes |
|---|---|---|
| `ACS_VINTAGE` | `string` | `"2023"`. Fall back to 2022 only if tract rows are missing, and record it in OPEN-QUESTIONS item 10 |
| `ACS_VARIABLES` | `Record<string, string>` | Field name to estimate variable. The matching `M` margins are requested too and stored in `data.margins` |
| `ACS_SENTINELS` | `number[]` | `-666666666`, `-999999999`, `-222222222` become null and are listed in `partial.missing` |
| `lookupTract` | `(lat, lng, ctx) => Promise<CensusTract \| null>` | Also called by the site route, which tolerates a throw |
| `fetchCensus` | `LayerFetcher<CensusData>` | Registered as the `census` layer |

- Returns: `CensusData`.
- Cache keys and TTLs: `census_geo:<roundKey(lat, lng, 3)>` 365 days
  (`TTL_SECONDS.censusGeocoder`); `census_acs:<geoid>:<vintage>` 365 days
  (`TTL_SECONDS.censusAcs`); `tiger:<geoid>` 365 days (`TTL_SECONDS.tiger`).
- The key is `ctx.env.censusApiKey`. When it is absent, return `missing_key` with
  `UNAVAILABLE_MESSAGES.censusMissingKey` **before any network call**.
- Without a key the ACS endpoint answers HTTP 200 with an HTML "Missing Key" page. A body that is
  not JSON is `parse_error`, never a crash.
- No tract from the geocoder is `UNAVAILABLE_MESSAGES.censusNoTract`.
- Derived fields: `densityPerKm2`, `renterSharePct`,
  `carFreeCommutePct = (transit + walked + bike) / workers * 100` rounded to 0.1, and
  `multifamily5plusSharePct`. A derived field whose inputs are null is null, never zero.
- The TIGERweb tract polygon goes in `data.geometry.rings` in local metres. A TIGERweb failure
  leaves `geometry: null` and makes the envelope `partial`, not `unavailable`.
- Message on failure: `UNAVAILABLE_MESSAGES.censusFailure`.

## 9. Module F: osm and walk shed

Files owned: `src/lib/datum/sources/overpass.ts`, `src/lib/datum/walkshed.ts`.
Spec: section 9 "osm" and "walkshed". Phase: step 1.8.

| Export | Signature | Notes |
|---|---|---|
| `buildQuery` | `(lat, lng) => string` | The single query from SPEC section 9, verbatim |
| `trimPayload` | `(raw: unknown) => TrimmedOverpass` | Keep `type, id, tags` (only the nine listed tags), `geometry` or `lat, lon`, `members` |
| `parseHeightM` | `(value: string \| undefined) => number \| null` | `"12"` to 12, `"12 m"` to 12, `"40'"` to 12.19, anything else null. Never derive metres from levels |
| `fetchOsmPayload` | `(input, ctx) => Promise<{ payload, url, cached }>` | The one shared fetch. Throws `SourceError` |
| `fetchOsm` | `LayerFetcher<OsmData>` | Registered as the `osm` layer |
| `buildGraph` | `(payload, origin) => WalkGraph` | Pure. Nodes deduped at 1 cm |
| `buildWalkshed` | `(payload, origin) => WalkshedData` | Pure. Dijkstra to 1200 m at 80 m per minute |
| `fetchWalkshed` | `LayerFetcher<WalkshedData>` | Registered as the `walkshed` layer |

- Returns: `OsmData`, `WalkshedData`.
- Cache key and TTL: `overpass:<roundKey(lat, lng, 3)>`, `TTL_SECONDS.overpass` (30 days).
- **`osm` and `walkshed` share one Overpass fetch through the cache.** Both layers call
  `fetchOsmPayload`, which calls `cached` with that one key. Whichever route runs first pays for
  the request and the second reads the cache. Do not add a second query, a second cache key, or a
  second `around:` radius. If Overpass fails, both layers report `unavailable` with the same code
  and the same message. The client fires `walkshed` only after `osm` settles, because Overpass
  allows two slots per IP.
- Trim before caching. The 1.2 km Atlanta street set is 3.3 MB raw and must be under 1 MB trimmed.
- Timeout `SOURCE_TIMEOUT_MS.overpass` (45 s). Mirror order: `overpass` twice, then
  `overpass_mirror` once, each with its own 45 s timeout, and only inside the remaining budget.
  The 55 s wall clock cap in `fetchWithPolicy` is the outer limit.
- A 406 means the User-Agent did not arrive. It is not retryable.
- Walk shed start node: the nearest graph node within 150 m. If there is none, `no_coverage` with
  `UNAVAILABLE_MESSAGES.walkshedNoStart`.
- Message on failure: `UNAVAILABLE_MESSAGES.overpass`.

## 10. Module G: geocoding

Files owned: `src/lib/datum/sources/photon.ts`, `src/lib/datum/sources/nominatim.ts`, and the two
routes `src/app/api/datum/suggest/route.ts` and `src/app/api/datum/geocode/route.ts`, which this
phase has not created yet. You create them.

| Export | Signature | Notes |
|---|---|---|
| `suggest` | `(query: string, ctx: SourceContext) => Promise<Suggestion[]>` | At most 6. Throws `SourceError` |
| `geocode` | `(query: string, ctx: SourceContext) => Promise<GeocodeResult \| null>` | Null is "not found", which is not an error |
| `reverseLocality` | `(lat, lng, ctx) => Promise<string \| null>` | `zoom=10`, for example "Atlanta, Georgia". The site route already calls this and tolerates a throw |

- Cache keys and TTLs: `photon:<normalized query>` 7 days (`TTL_SECONDS.photonSuggest`);
  `nominatim:<normalized query>` 30 days (`TTL_SECONDS.nominatimSearch`);
  `nominatim_reverse:<roundKey(lat, lng, 3)>` 365 days (`TTL_SECONDS.nominatimReverse`).
  Normalized means lowercase with collapsed spaces.
- Routes: `suggest` is GET, `maxDuration = 15`, requires `q` of at least 3 characters, answers
  `{ suggestions: [{ label, lat, lng }] }`. `geocode` is POST, `maxDuration = 15`, answers
  `{ lat, lng, displayName, locality }` or `{ error: { code: "not_found" } }`, and carries a server
  side token bucket of one request per second per instance which answers 429 when exhausted.
- Nominatim policy is binding: one request per second, a descriptive User-Agent (already sent by
  `fetchWithPolicy`), and **no autocomplete**. Suggestions come from Photon only.
- Photon mis-resolves the Miami test intersection and Nominatim resolves it. The confirm step in
  the UI exists because of that; do not route submits through Photon.

## 11. Done means

Per module, before you hand back:

- `rm -rf .next && npx tsc --noEmit` exits 0.
- `npm run build` exits 0.
- `npm run test:unit` exits 0 and your new tests are in it.
- `npx eslint` on every file you changed reports no errors, and `npx eslint .` reports no more
  than the repo baseline of 16 errors (Phase 0 owner decision C).
- `grep -rnE "\?\? *[0-9]+|\?\? *\"X\"|\|\| *[0-9]+\b" src/lib/datum/sources/` prints nothing.
- `git show --name-only --format="" HEAD` on each commit lists only the files you own.
- You changed no shared file. If you needed to, you reported it instead.
