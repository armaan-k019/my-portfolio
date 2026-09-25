# Open questions

Things the inputs did not settle. Each has a default the spec assumes so work can proceed, and
a note on what changes if the answer differs. The owner edits this file with answers; the build
session reads it before each phase. Items 1 to 19 were resolved on 2026-09-21; item 14 remains
BLOCKED by decision, and item 6 is deferred to after Phase 2.

1. **Diagnosis report.** The interview answer said "pasted below" but no report text arrived. The
   spec works from the one line summary in the original brief (Census key, FEMA moved, Overpass
   406 and 429, Atlanta zoning dead, Claude fills gaps, 30 to 36 s responses, 1352 line page) and
   from direct probes on 2026-09-21. Please paste the report if it contains anything beyond that,
   especially any measurement that should appear as a baseline in `PHASE-0-verify.md`.
    Resolved 2026-09-21: No separate diagnosis report exists. The Phase 0 baselines are the measurement of record.

2. **Census API key.** Answer was "[CONFIRM: done / not yet]". Default assumed: not yet. Phase 1 is
   blocked at step 1.7 until the key exists in `.env.local` and in Vercel.
    Resolved 2026-09-21: `CENSUS_API_KEY` is registered, activated, and set in `.env.local` and in Vercel (Production and Preview).

3. **Supabase project.** Answer was "[CONFIRM: existing / new]". Default assumed: a new free project
   in a US East region (closest to Vercel `iad1`). Region matters for the 3 s timeout budget in
   `memory.ts`; if the project is elsewhere, say so and the budget may need to be 5 s.
    Resolved 2026-09-21: New Supabase project "datum", free plan, Americas region. `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set in `.env.local` and Vercel. "Automatically expose new tables" is off, so migrations grant table privileges to `service_role` explicitly (already in `SPEC.md`). Automatic RLS is on. Keep the 3 s timeout; Phase 1 reports if it measures otherwise.

4. **Visual language.** No Pinterest boards were provided. Proposed in `SPEC.md` section 10:
   monochrome ink figure-ground on paper, hairline streets by class, 45 degree hatches for water
   and flood with density encoding severity, thin contours with heavier index lines, deep green
   (`terracotta` token) reserved for the site marker and walk shed bands, Plex Mono eyebrows,
   Fraunces panel titles. Confirm, or attach boards and the build session adjusts `styles.ts`
   only.
    Resolved 2026-09-21: The visual language in `SPEC.md` section 10 is approved.

5. **Vercel plan.** Answer was "[CONFIRM: Hobby]". Verified from Vercel docs (2026-08-24 revision):
   Hobby function max duration is 300 s default and maximum with Fluid compute; cron once per day
   with hour precision. All routes use 60 s or less regardless. If the project is on Pro, nothing
   changes.
    Resolved 2026-09-21: Vercel Hobby.

6. **Illustrator and Rhino layer behaviour.** The spec emits top level `<g id>` groups in a fixed
   order. Whether Illustrator shows them as layers or as named groups inside one layer, and whether
   Rhino preserves group names on SVG import, could not be verified from this machine. Phase 2
   acceptance asks the owner to open one export in each and record the result here. If Illustrator
   needs its own layer attributes, that is a one line change in `sheet.ts` and the group ids stay.
    Resolved 2026-09-21: The owner tests Illustrator and Rhino after Phase 2. Not a blocker.

7. **Supabase pause heuristic.** Docs say free projects "may" be paused after 7 days of low
   activity. Whether one daily `select` from the cron counts as activity is not documented. The
   offline path is designed so the app survives a pause; the ping is a best effort. If the project
   still pauses, the options are a Pro plan or accepting manual restores.
    Resolved 2026-09-21: Best effort ping plus the offline path is accepted.

8. **Photon rate limits.** The public instance says "be fair" and reserves the right to throttle
   without notice. No number is published. The proxy debounces at 300 ms and caches 7 days; if
   throttling appears in logs, the fallback is to disable suggestions and keep the Nominatim
   submit path (which is the only required one).
    Resolved 2026-09-21: Photon accepted as specified.

9. **Overpass reliability.** On 2026-09-21 `overpass-api.de` returned 504 "server is probably too
   busy" on two of five probes independent of query size, and `overpass.kumi.systems` hung for
   180 s once. The spec treats Overpass as unreliable (mirror order, retries, 30 day cache,
   unavailable state). If the owner wants a guaranteed figure-ground, the alternatives are a self
   hosted Overpass or a pre-extracted building dataset, both out of scope here.
    Resolved 2026-09-21: The unavailable state design is accepted. A second building footprint source (for example Microsoft open building footprints) is noted as a post Phase 2 candidate. Not to be built now.

10. **ACS 2023 5-year tract availability.** The variables endpoint confirms the 2023 vintage
    exists, but tract level data could not be requested without a key. Phase 1 step 1.7 verifies
    with the real key; if 2023 tract rows are missing for any test site, fall back to 2022 and
    record it here.
    Resolved 2026-09-21: ACS 2023. Fall back to 2022 only if tract rows are missing, and record it here.

11. **Open-Meteo usage terms.** The archive endpoint worked without a key. The non commercial
    limits (requests per day) are not stated on the page fetched. The cache keys at 0.1 degree
    with a 365 day TTL keep calls low. A portfolio site is non commercial; confirm you are
    comfortable with that reading. Attribution on the sheet names Open-Meteo and ERA5 without a
    licence string because the licence text was not verified.
    Resolved 2026-09-21: Open-Meteo non commercial use accepted.

12. **User-Agent contact string.** Nominatim requires a User-Agent that identifies the application.
    The spec uses `Datum/1.0 (site analysis; portfolio; +<site URL>)`. Provide the production
    site URL to put there; the default until then is the GitHub profile URL.
    Resolved 2026-09-21: User-Agent contact URL is `https://armaankazi.com/projects/datum`, giving `Datum/1.0 (site analysis; portfolio; +https://armaankazi.com/projects/datum)`.

13. **`content/projects.ts` GitHub link.** The entry links to `github.com/armaan-k019/urban-gpt`.
    If that repository does not reflect this rebuild, the link should be removed in phase 2 step
    2.5 (it would otherwise describe code that is not the shipped code). Decide: keep, update, or
    remove. Resolved 2026-09-21: the link was removed in the rename to Datum; that repository does
    not contain this code and will not contain the rebuild.

14. **Precedent dataset (phase 4, BLOCKED).** Choose a dataset from `PHASE-4-precedents.md` or
    name another, state the licence you accept, whether non US precedents are included (which
    reduces the vector to 10 components), and whether images are displayed. Until answered no
    precedent code is written.
    Resolved 2026-09-21: Phase 4 stays BLOCKED.

15. **Rate cap number.** The spec proposes 20 uncached analyses per IP per day, with re-opens
    free. Confirm or change the number; it is one constant.
    Resolved 2026-09-21: Rate cap is 20 uncached analyses per IP per day.

16. **New dependency.** `d3-contour` (ISC licence, no transitive dependencies of note) is proposed
    for marching squares. Alternative is about 120 lines of hand written marching squares. Confirm
    the dependency or ask for the hand written version.
    Resolved 2026-09-21: `d3-contour` approved.

17. **FEMA no coverage semantics at WaKeeney.** Layer 0 (NFHL Availability) and layer 28 both
    return nothing there. The spec reports this as "FEMA has not published a flood hazard layer
    for this location". If the owner knows WaKeeney has a paper FIRM that is simply not digitised,
    the wording could add "a paper map may exist". Not verified.
    Resolved 2026-09-21: Wording accepted as specified.

18. **Timezone when climate is unavailable.** The sun layer takes the IANA timezone from the
    Open-Meteo response. If Open-Meteo is down, the spec computes sun times in UTC and marks the
    layer partial. Alternative: add a small timezone lookup dependency. Default: UTC with the
    partial flag, no dependency.
    Resolved 2026-09-21: UTC with the partial flag, no timezone dependency.

19. Renamed to Datum; resolved.

20. **A dropped model stream leaves the page on "streaming".** Observed 2026-09-25 on a local
    production build: the Anthropic stream terminated mid brief and the server logged
    `[datum] brief stream failed Error: terminated / TypeError: terminated / Error: read
    ECONNRESET`. The page never reached `data-brief-status="error"`; it sat on `streaming` past a
    120 s wait, so a visitor sees a brief that never finishes and never fails. Transient in
    itself (the same site passed on the run before and on a re run after), but the recovery is
    the defect, not the drop.
    `brief/route.ts` does send an `error` event from its catch, and `sseChannel.send` drops a
    write only once the channel is `over`, so the path from that drop to a stuck client is not
    established. Worth reproducing by killing the upstream connection deliberately before
    choosing a fix. Candidate: a terminal state on the client when the reader ends without a
    `done` or `error` event, which covers every way the stream can end early rather than this one.
    Logged, not fixed: `src/app/api/datum/` and `src/app/projects/datum/analysis.ts` were outside
    the file scope of the round that found it (owner instruction 2026-09-26).

21. **FEMA is flaky, not recovered.** Owner correction 2026-09-26, replacing the "outage ended"
    note in PROGRESS.md. One success and one failure minutes apart in a single session, and the
    owner's good production sample is one sample. The flood layer is not to be treated as
    reliable, and "all sites with FEMA up" is not an acceptance condition that can be met on
    demand. No change requested.
