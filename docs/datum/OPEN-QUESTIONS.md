# Open questions

Things the inputs did not settle. Each has a default the spec assumes so work can proceed, and
a note on what changes if the answer differs. The owner edits this file with answers; the build
session reads it before each phase.

1. **Diagnosis report.** The interview answer said "pasted below" but no report text arrived. The
   spec works from the one line summary in the original brief (Census key, FEMA moved, Overpass
   406 and 429, Atlanta zoning dead, Claude fills gaps, 30 to 36 s responses, 1352 line page) and
   from direct probes on 2026-09-21. Please paste the report if it contains anything beyond that,
   especially any measurement that should appear as a baseline in `PHASE-0-verify.md`.

2. **Census API key.** Answer was "[CONFIRM: done / not yet]". Default assumed: not yet. Phase 1 is
   blocked at step 1.7 until the key exists in `.env.local` and in Vercel.

3. **Supabase project.** Answer was "[CONFIRM: existing / new]". Default assumed: a new free project
   in a US East region (closest to Vercel `iad1`). Region matters for the 3 s timeout budget in
   `memory.ts`; if the project is elsewhere, say so and the budget may need to be 5 s.

4. **Visual language.** No Pinterest boards were provided. Proposed in `SPEC.md` section 10:
   monochrome ink figure-ground on paper, hairline streets by class, 45 degree hatches for water
   and flood with density encoding severity, thin contours with heavier index lines, deep green
   (`terracotta` token) reserved for the site marker and walk shed bands, Plex Mono eyebrows,
   Fraunces panel titles. Confirm, or attach boards and the build session adjusts `styles.ts`
   only.

5. **Vercel plan.** Answer was "[CONFIRM: Hobby]". Verified from Vercel docs (2026-08-24 revision):
   Hobby function max duration is 300 s default and maximum with Fluid compute; cron once per day
   with hour precision. All routes use 60 s or less regardless. If the project is on Pro, nothing
   changes.

6. **Illustrator and Rhino layer behaviour.** The spec emits top level `<g id>` groups in a fixed
   order. Whether Illustrator shows them as layers or as named groups inside one layer, and whether
   Rhino preserves group names on SVG import, could not be verified from this machine. Phase 2
   acceptance asks the owner to open one export in each and record the result here. If Illustrator
   needs its own layer attributes, that is a one line change in `sheet.ts` and the group ids stay.

7. **Supabase pause heuristic.** Docs say free projects "may" be paused after 7 days of low
   activity. Whether one daily `select` from the cron counts as activity is not documented. The
   offline path is designed so the app survives a pause; the ping is a best effort. If the project
   still pauses, the options are a Pro plan or accepting manual restores.

8. **Photon rate limits.** The public instance says "be fair" and reserves the right to throttle
   without notice. No number is published. The proxy debounces at 300 ms and caches 7 days; if
   throttling appears in logs, the fallback is to disable suggestions and keep the Nominatim
   submit path (which is the only required one).

9. **Overpass reliability.** On 2026-09-21 `overpass-api.de` returned 504 "server is probably too
   busy" on two of five probes independent of query size, and `overpass.kumi.systems` hung for
   180 s once. The spec treats Overpass as unreliable (mirror order, retries, 30 day cache,
   unavailable state). If the owner wants a guaranteed figure-ground, the alternatives are a self
   hosted Overpass or a pre-extracted building dataset, both out of scope here.

10. **ACS 2023 5-year tract availability.** The variables endpoint confirms the 2023 vintage
    exists, but tract level data could not be requested without a key. Phase 1 step 1.7 verifies
    with the real key; if 2023 tract rows are missing for any test site, fall back to 2022 and
    record it here.

11. **Open-Meteo usage terms.** The archive endpoint worked without a key. The non commercial
    limits (requests per day) are not stated on the page fetched. The cache keys at 0.1 degree
    with a 365 day TTL keep calls low. A portfolio site is non commercial; confirm you are
    comfortable with that reading. Attribution on the sheet names Open-Meteo and ERA5 without a
    licence string because the licence text was not verified.

12. **User-Agent contact string.** Nominatim requires a User-Agent that identifies the application.
    The spec uses `Datum/1.0 (site analysis; portfolio; +<site URL>)`. Provide the production
    site URL to put there; the default until then is the GitHub profile URL.

13. **`content/projects.ts` GitHub link.** The entry links to `github.com/armaan-k019/urban-gpt`.
    If that repository does not reflect this rebuild, the link should be removed in phase 2 step
    2.5 (it would otherwise describe code that is not the shipped code). Decide: keep, update, or
    remove. Resolved 2026-09-21: the link was removed in the rename to Datum; that repository does
    not contain this code and will not contain the rebuild.

14. **Precedent dataset (phase 4, BLOCKED).** Choose a dataset from `PHASE-4-precedents.md` or
    name another, state the licence you accept, whether non US precedents are included (which
    reduces the vector to 10 components), and whether images are displayed. Until answered no
    precedent code is written.

15. **Rate cap number.** The spec proposes 20 uncached analyses per IP per day, with re-opens
    free. Confirm or change the number; it is one constant.

16. **New dependency.** `d3-contour` (ISC licence, no transitive dependencies of note) is proposed
    for marching squares. Alternative is about 120 lines of hand written marching squares. Confirm
    the dependency or ask for the hand written version.

17. **FEMA no coverage semantics at WaKeeney.** Layer 0 (NFHL Availability) and layer 28 both
    return nothing there. The spec reports this as "FEMA has not published a flood hazard layer
    for this location". If the owner knows WaKeeney has a paper FIRM that is simply not digitised,
    the wording could add "a paper map may exist". Not verified.

18. **Timezone when climate is unavailable.** The sun layer takes the IANA timezone from the
    Open-Meteo response. If Open-Meteo is down, the spec computes sun times in UTC and marks the
    layer partial. Alternative: add a small timezone lookup dependency. Default: UTC with the
    partial flag, no dependency.

19. Renamed to Datum; resolved.
