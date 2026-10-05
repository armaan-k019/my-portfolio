# Datum: site analysis sheet

Datum turns an address into an architectural site analysis sheet: a 36 by 24 inch ARCH D drawing
built from public data, exportable as true vector SVG with one named group per layer so it opens
in Illustrator and Rhino as a tracing base. The nine layers are listed below; they do not come from
nine separate publishers, so the sheet does not claim a source count.

Every number traces to a named source and a named field. A source that fails shows an unavailable
panel with the reason and a retry button, never a default and never an estimate.

## Flow

1. Type an address. Suggestions come from Photon through `/api/datum/suggest`, debounced 300 ms
   from three characters.
2. Submit. `/api/datum/geocode` makes one Nominatim request. Photon mis-resolves the Miami test
   intersection and Nominatim resolves it, which is why suggestions never drive the submit.
3. Confirm the point on a Leaflet map, dragging the marker if it is wrong. Nothing else runs until
   you confirm.
4. `/api/datum/site` creates or fetches the site record, then the seven independent layers and
   `osm` all fire at once. Nothing waits on the group: the walk shed is fired as soon as `osm`
   alone has settled, because the two share one Overpass fetch through the cache and Overpass
   allows two slots per IP.
5. Each panel renders as its layer arrives. When all nine have settled, the brief opens as a
   Server Sent Event stream from `/api/datum/brief`.
6. Export is enabled once no layer is loading.

## Layers

`sun` (computed from the NOAA solar position equations; the Open-Meteo archive supplies only the
time zone), `climate` and the wind roses (Open-Meteo ERA5 archive), `topo` (USGS 3DEP and EPQS),
`seismic` (USGS ASCE 7-22), `soil` (USDA SSURGO), `osm` and `walkshed` (Overpass),
`flood` (FEMA NFHL), `census` (Census ACS 5-year plus TIGERweb).

Building heights print only where OpenStreetMap carries a height tag. Nothing is derived from
`building:levels`, and there is no shadow study, because the heights to cast them do not exist.

## Files

| File | What it does |
|---|---|
| `page.tsx` | Server component: the heading, the description, and `<SiteSheetApp />` |
| `SiteSheetApp.tsx` | Composition and the SVG export, including the `DOMParser` check |
| `analysis.ts` | The run: geocode, confirm, site record, the nine layers, the streaming brief |
| `AddressField.tsx` | The field and the debounced Photon suggestions |
| `ConfirmMap.tsx` | Leaflet, imported dynamically with `ssr: false` |
| `panels/SheetCanvas.tsx` | One shared on screen `<svg viewBox="0 0 2592 1728">` and the citation chips |
| `panels/CitationChips.tsx` | One chip per citation; a valid chip highlights the panel it cites |
| `panels/LayerRail.tsx` | Per layer status and the retry buttons |

The drawing itself is not here. `src/lib/datum/sheet/` holds pure builders from data to SVG string,
and the on screen sheet and the exported file are the same strings, so what you see is what you
export.

## Environment variables

| Variable | Used by |
|---|---|
| `ANTHROPIC_API_KEY` | the brief route |
| `CENSUS_API_KEY` | the census layer; without it the panel reads `missing_key` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | the cache, the site records, and the rate limit |
| `DATUM_ALLOW_TEST_FLAG` | local and preview only; lets `?test=1` mark a run as a test |

## Run locally

```bash
cp .env.example .env.local   # fill the keys
npm run dev                  # http://localhost:3000/projects/datum
```
