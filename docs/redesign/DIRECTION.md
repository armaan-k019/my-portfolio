# Redesign direction

Branch: `feat/site-redesign`. Status: implemented in PR #25 (steps 1 to 6), with owner decisions that override parts of this document. Section 2's campus-scale map is void, and no map plate is built yet. Sections 1 and 7 describe the site before the redesign.

This document does four things: it inventories what the site shows now, proposes one organizing concept (the site as a real map), lists what to cut and what to keep, and specifies a visual reset. Every coordinate below comes from a cited source. Anything the repo does not state is marked **LOCATION NEEDED**.

Out of scope and untouched: `src/app/projects/datum/`, `src/app/api/datum/`, `src/lib/datum/`, `docs/datum/`, `supabase/`, `e2e/`, and the values of existing color tokens in `src/app/globals.css`.

---

## 0. Method

- **Code read:** `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/template.tsx`, `src/app/globals.css`, every homepage component, `/about`, `/journal`, `/demos`, the generic `/projects/[slug]` renderer, `/projects/fine-print`, `/projects/yield`, and `content/*`.
- **Measurements:** `npm run build` (succeeds), then `next start`, then headless Chrome 148 over the DevTools protocol with the viewport set to 1440 x 900 and DPR 1, reading after a 4 s settle. Heights come from `getBoundingClientRect()`. Word counts come from `innerText` of `<main>`, counting tokens that contain a letter or digit. The renovation banner was showing on every page (first visit, nothing in localStorage).
- **Critique:** a report-only pass using the `impeccable` skill's critique rubric and brand register. The skill normally writes `PRODUCT.md` and a `.impeccable/` snapshot first. Both were skipped because this task commits only this file. Its static detector (`detect.mjs`, regex mode on TSX) was run over the in-scope files. The in-page overlay was not injected. Findings are in section 7.
- **Coordinate sources:** the Wikipedia API (`prop=coordinates`) and Wikidata (`P625`), fetched 2026-09-24. Each value is cited next to where it is used.

---

## 1. Inventory

### 1a. Decorative elements

"Real data" means the value is tied to a sourced place and to the item it labels.

| # | Element | File | What it does | Coordinate tied to real data? |
|---|---|---|---|---|
| 1 | Constellation clusters | `src/components/IsometricBackground.tsx` (whole file, mounted in `layout.tsx:56`) | A full-viewport fixed canvas drawing 110 to 280 points in 5 clusters. Every 15 s it re-embeds them into new random positions (`REEMBED_PERIOD`, line 71). The cursor pushes points away within 150 px and draws threads to them. Also draws contour ellipses and cluster edges. Its intensity fades with scroll. Runs a rAF loop on every page. | No. Seeded random positions (`rng(0x7a51e)`, line 104). No data behind them. |
| 2 | Region labels | `IsometricBackground.tsx:35`, drawn at 236 to 245 | Letterspaced canvas text DESIGN, ARCHITECTURE, RESEARCH, PHOTOGRAPHY, SYSTEMS above each cluster. | No. Labels are assigned to random clusters. Nothing on the site belongs to a "region". |
| 3 | Legend | `src/components/AtlasFrame.tsx:51-59` (lg and up) | Fixed bottom-left key: "LEGEND" plus five colored diamonds for the regions above. | No. It keys item 2, which keys nothing. |
| 4 | Compass | `AtlasFrame.tsx:19-33` (md and up) | Fixed 40 px compass rose with "N", top right below the nav. | No. |
| 5 | ATLAS footer tag | `AtlasFrame.tsx:62-64` (md and up) | Fixed bottom-right caption "ATLAS · 33.7490°N 84.3880°W". | Approximately Atlanta. Wikipedia's Atlanta is 33.7489, -84.3900, and the repo's longitude is 0.002° (about 190 m) east of that. It is unlabeled and not tied to any item. |
| 6 | Survey margin and paper grain | `AtlasFrame.tsx:38-46` | Tick rulers on both vertical viewport edges and an SVG noise overlay across the whole page. | No. The ticks are a 26 px CSS repeat, not a graticule. |
| 7 | Cursor reticle and live coordinate readout | `src/components/CustomCursor.tsx` | Hides the native cursor on every element (`globals.css` `body.cursor-none *`). Draws a crosshair, a lagging ring, and a lat/lng readout that follows the pointer. | Loosely. It maps the viewport to a fixed 0.05° x 0.06° box around 33.749, -84.388 (lines 46 to 48). So ground scale changes with window size, and aspect is distorted. **The longitude axis is also mirrored:** moving right increases the °W value, which is westward, on what is otherwise a north-up frame. |
| 8 | Scattered coordinate labels | `src/components/AboutSection.tsx:41`, `src/app/page.tsx:24`, `:34`, `:49`, `src/app/template.tsx:29` | Mono coordinate strings beside the hero eyebrow and every section header, plus one on the route-change curtain. | `page.tsx:24` (Experience, 33.7756°N 84.3963°W) is within about 40 m of Georgia Tech (Wikipedia 33.776, -84.396). But it labels a section where most employers are not at Georgia Tech. `AboutSection.tsx:41`, `page.tsx:34` and `template.tsx:29` repeat the approximate Atlanta value from item 5. `page.tsx:49` (Research, 33.7701°N 84.3876°W) matches no source and no item. |
| 9 | Latent atlas module | `src/lib/latent-atlas.ts` | Derives display lat/lng from hand-tuned 2D "latent" positions. | No. It is fake by construction, and nothing imports it (grep finds no consumers). |
| 10 | Wavy dividers | `src/components/ContourDivider.tsx`, used only via `SheetHeader.tsx:33` | Three stacked bezier "contour" lines with end ticks under every homepage section title. | No. |
| 11 | Eyebrow lines | `SheetHeader.tsx:23-28`; `AboutSection.tsx:37-42`; `.eyebrow` in `globals.css:100` (16 uses in 8 files) | "REGION 01 ◆ WHERE I'VE WORKED ... coord" above each homepage section. "BASECAMP ◆ ARCHITECTURE × COMPUTER SCIENCE ... coord" above the hero name. "BUILD LOGS" on `/demos`, "GET IN TOUCH" on contact. | Only via item 8. |
| 12 | Pills | Hero `AboutSection.tsx:88-95` ("📍 Atlanta, GA", "🎓 Georgia Tech '27"); hero CTAs `:97-112`; project status pills `ProjectsSection.tsx`, `projects/[slug]/page.tsx:32-40`; `/demos` "This Demo Worked!" (`demos/page.tsx`, Rho card); "CS" pills on `/projects/fine-print` and `/projects/yield`; carousel dots | Rounded-full badges and buttons. `rounded-full` appears 83 times in 22 files. | "Atlanta, GA" is a real place, shown as a pill with an emoji. |
| 13 | Renovation banner | `src/components/RenovationBanner.tsx`, mounted `layout.tsx:59`; offsets `main` at `layout.tsx:65` | A 34 px dismissible bar: "Renovation in progress. If something looks off, that is why." It sets `--renovation-h` and restyles every `nav`. | n/a |
| 14 | Header subtitle | `src/components/Navbar.tsx:89` | "Architecture + CS · Georgia Tech · Sustainable Arch. Cert." under the name in the nav (sm and up). | n/a |
| 15 | Rotating role word | `AboutSection.tsx:8`, `:16-24`, `:63-84` | Cycles student / researcher / artist / engineer every 3.4 s inside the bio sentence. It uses a hardcoded `#15803D` that is not a token. | n/a |
| 16 | Rounded cards and shadows | `.card` / `.card-hover` (`globals.css:156-172`, 16 px radius, blur, two-layer shadow, 4 px hover lift) used by Projects, Research, Contact feedback and `/demos`. Work logos: `WorkSection.tsx` `rounded-2xl` plus inline `--shadow-card` and JS hover shadow. Carousel frame `rounded-2xl` plus shadow. Contact icon circles `shadow-sm`. | Card chrome. Site-wide counts outside Datum: `shadow-sm` 33, `shadow-md` 7, `shadow-lg` 4, `shadow-xl` 2, `shadow-2xl` 1, `rounded-xl` 109, `rounded-lg` 87. | n/a |
| 17 | Footer watermark | `src/components/Footer.tsx:11-17`, plus gradient hairline `:9` | "Armaan Kazi" at up to 14rem in 4% white behind the footer. | n/a |
| 18 | Route-change curtain | `src/app/template.tsx` | On every navigation, a green full-screen curtain wipes for 0.85 s, showing "RELOCATING" and a coordinate. Its text is inside `<main>`, so it is also counted in word counts. | Approximate Atlanta, as in item 5. |
| 19 | Section tints | `page.tsx:21`, `:41` | 2.5% green wash behind Experience and Research. | n/a |
| 20 | Hover side stripes | `ResearchSection.tsx` (3 px `#4A7A44` stripe) and `demos/page.tsx` (3 px `ACCENT`) | Colored left stripe on hover. This is the impeccable "side-tab" ban. The detector caught only the unused `BlogPreviewSection.tsx:24` `border-l-4`. | n/a |
| 21 | Drawing-aware text emphasis | `src/components/DrawingAwareScope.tsx`, wraps every page in `layout.tsx:60` | On every animation frame, it reads bounding rects for every `p`, `li` and `h1` to `h4` on the page and compares them against `drawingRegions`. | n/a. **`drawingRegions` is never populated:** it is declared empty in `IsometricBackground.tsx:17` and nothing pushes to it. So this is a per-frame layout read across the whole DOM that never has any effect. |

### 1b. Word counts

Visible `<main>` text at 1440 x 900, highest first. Nav (14 words) and footer (29 words on standard pages) are excluded. Each count includes the 3-word route curtain from item 18.

**All pages measured**

| Route | Words visible | Also present but hidden |
|---|---|---|
| `/demos/rho` | 588 | |
| `/demos/world-labs` | 499 | |
| `/demos/midjourney` | 385 | |
| `/projects/datum` | 378 | (off limits, reported only) |
| `/demos/illoca` | 374 | |
| `/` | 372 | +528 in the 9 work modals, and up to 1,002 in research modals (source body words: 543, 313, 82, 64) |
| `/photography` | 135 | |
| `/blog` | 131 | |
| `/research/shape-machine` | 117 | |
| `/about` | 70 | |
| `/projects/fine-print` | 70 | |
| `/projects/archipedia` | 60 | |
| `/demos` | 55 | |
| `/projects/yield` | 52 | |
| `/journal` | 46 | |

Blog posts, as MDX body words from source: `being-less-bored` 1,009, `the-architects-dilemma` 994, `making-a-move` 836, `statements-in-design` 775, `form-follows-feeling` 730, `art-without-an-artist` 691.

Homepage sections at 1440 x 900 (height / words): hero `#about` 678 px / 52, `#work` 998 px / 32, `#projects` 529 px / 31, `#research` 1,067 px / 192, `#contact` 941 px / 62. Document height 4,495 px.

The homepage shows 32 words for nine employers. Role, dates and every bullet sit behind a click. The one text-dense block is Research (192 words), where each row repeats a full paper title plus a two-line preview.

**Project pages only**

| Route | Words |
|---|---|
| `/projects/datum` | 378 |
| `/projects/fine-print` | 70 |
| `/projects/archipedia` | 60 (generic renderer) |
| `/projects/yield` | 52 |

Work modal words per entry, from `content/work.ts`: Jeeves 91, Rho 88, TEAM Buzz 63, Electrify GT 58, Shape Computation Lab 55, AIAS 53, A.G. Rhodes 49, NCR Voyix 46, Sweet Frog 25.

### 1c. Let's talk and footer, now

Measured at 1440 x 900.

| Block | Height | Contents |
|---|---|---|
| `#contact` (`src/components/ContactSection.tsx`) | **941 px** (more than one full viewport) | 112 px top and bottom padding. Header group, 233 px: "GET IN TOUCH" eyebrow, "Let's talk." h2, the sentence "I'm always open to interesting conversations, collaborations, or opportunities.", and two 56 px white icon circles with shadows (Email, LinkedIn). 64 px gap. Feedback `.card`, 420 px: "Leave feedback" h3, a one-sentence intro, a project select with 10 options, an optional email field, a 4-row message textarea, and a "Send feedback" button. It posts to `/api/feedback`. |
| `<footer>` (`src/components/Footer.tsx`) | **184 px** | Gradient hairline, the watermark (item 17), "Armaan Kazi" plus "ARCHITECTURE + CS · GEORGIA TECH", an About link, icons for Email, Instagram, GitHub and LinkedIn, "© 2026 ARMAAN KAZI", and a centered line: "Want to get in touch with someone I've worked with? Reach out and I'll make the introduction." |
| Combined | **1,125 px** | 1.25 viewports of closing matter on the homepage. GitHub and Instagram appear only in the footer. Email and LinkedIn appear in both. |

Three demo routes render their own shorter footer (world-labs 69 px, illoca 69 px, midjourney 57 px). That inconsistency is noted, not addressed here.

---

## 2. Organizing concept: the site as a real map

One idea replaces the atlas costume. The site is a north-up map of the place where the work happened. Every coordinate on screen means something: it is either the pointer's true position on the map, or the sourced location of a named item. A coordinate that is neither does not appear.

### 2a. Projection

**Extent.** The plate is the hero's first screen, below the nav. At 1440 x 900 that is 1440 x 835 px. The map is centered on the midpoint of the two sourced Atlanta points below (Georgia Tech and Atlanta), and its ground scale is fixed, so a pixel is the same distance on the ground at every window size.

| Parameter | Value | Basis |
|---|---|---|
| Center φ0, λ0 | 33.76244°N, 84.39300°W | Midpoint of Georgia Tech (33.776, -84.396) and Atlanta (33.74888889, -84.39), both from Wikipedia |
| Scale | 5 m per CSS px | Design parameter. It fits both anchors with about 117 px margin top and bottom on the 835 px plate. |
| Metres per degree at φ0 | lat 110,918.1 m, lng 92,641.2 m | Standard ellipsoid series, evaluated at φ0 |
| Extent at 1440 x 835 | N 33.7813, S 33.7436, W 84.4319, E 84.3541 | Derived |
| Extent at 390 x 779 (phone) | N 33.7801, S 33.7448, W 84.4035, E 84.3825 | Derived. Both anchors stay inside. |

**Cursor to lat/lng.** Equirectangular projection, local to the plate. Let `x` and `y` be the pointer position relative to the plate's top-left, and `W` and `H` the plate's size in CSS px.

```
lat = φ0 + (H/2 - y) * 5 / 110918.1
lng = λ0 + (x - W/2) * 5 / 92641.2      // λ0 = -84.39300; right is east
```

Equirectangular is correct at this scale: over 4 km, the distortion is well under a pixel. The inverse of this formula places pins. This fixes the current readout's mirrored longitude and its viewport-dependent scale (item 7).

**Readout.**
- *Precision.* Pointer readout: 4 decimals, which is 11.1 m of latitude and 9.3 m of longitude (about 2 px at this scale). Pins show the precision of their source, never more. Georgia Tech is sourced to 3 decimals, so its pin reads `33.776°N 84.396°W`, not a padded 4-decimal string. Keep the existing format: degrees, hemisphere letter, `.coord` class, tabular numbers.
- *Position.* One fixed slot, bottom right, where the ATLAS tag sits now. The readout does not follow the pointer. Outside the plate, it shows the coordinate of the item under the pointer or keyboard focus. With neither, it is empty.
- *Throttling.* `pointermove` only stores `x` and `y`. A single `requestAnimationFrame` computes the string and writes `textContent` only when the string changed. No easing and no lag ring.
- *Reduced motion.* The readout still updates, since text changes are not motion. Hover-to-pin highlighting snaps with no transition, and nothing drifts or animates on the plate.
- *Coarse pointer (touch).* The readout starts at the plate center and changes only when an item row is tapped.
- *Accessibility.* The readout is `aria-hidden`. The item list is the accessible form of the map, so each row's coordinate is plain text in the DOM.

**Off-extent places.** Places outside the extent become edge ticks on the plate border, at their initial great-circle bearing from Georgia Tech, labeled with their distance. Computed with haversine on R = 6371 km: Amherst, MA is 1,411 km at bearing 44°; Hsinchu is 12,969 km at bearing 334°.

**What the plate draws.** A graticule at real 0.005° intervals, in hairlines using `--color-line`, labeled at the plate edges in `.coord`. Plus one pin per sourced location. No street tiles and no invented outlines. A basemap layer (for example, a campus boundary from OpenStreetMap) could be added later, but only from a cited dataset with attribution, and only as a separate decision.

### 2b. Placement

Coordinates are from Wikipedia and Wikidata as cited. "Place" is what the repo itself says.

**Anchors**

| Anchor | Coordinate | Place source (repo) | Coordinate source |
|---|---|---|---|
| Georgia Tech | 33.776°N 84.396°W | `AboutSection.tsx:85` "at Georgia Tech"; `README.md:3` | Wikipedia "Georgia Tech" (redirect from Georgia_Institute_of_Technology). Wikidata Q864855 gives 33.77581, -84.39469, which agrees to about 100 m. |
| Atlanta (hero basecamp) | 33.7489°N 84.3900°W | `AboutSection.tsx:90` "📍 Atlanta, GA" | Wikipedia "Atlanta" (33.74888889, -84.39) |

**Experience** (`content/work.ts`)

| Item | Proposed coordinate | Source |
|---|---|---|
| Rho | **LOCATION NEEDED** | `work.ts` names no place. |
| Jeeves | **LOCATION NEEDED** | `work.ts` names no place. |
| Shape Computation Lab | 33.776°N 84.396°W (Georgia Tech) | `content/research/shape-machine.mdx` venue "Shape Computation Lab, Georgia Tech". Building-level location: **LOCATION NEEDED** if wanted. |
| A.G. Rhodes Nursing Home | **LOCATION NEEDED** | The organization is named, but no facility or address is stated. |
| Electrify GT | 33.776°N 84.396°W (Georgia Tech) | `work.ts` bullet: "across Georgia Tech's campus buildings and research facilities". |
| NCR Voyix | **LOCATION NEEDED** | `work.ts` names no place. |
| Sweet Frog | **LOCATION NEEDED** | `work.ts` names no place. |
| AIAS | **LOCATION NEEDED** | Marked `studentOrg`, but `work.ts` names no chapter or campus. |
| TEAM Buzz | 33.776°N 84.396°W (Georgia Tech) | `work.ts` bullet: "a cornerstone of Georgia Tech's campus leadership". Its events span "50+ Atlanta non-profit partners", so a single pin at campus is the organization, not the event sites. |

**Research** (`content/research/*.mdx`)

| Item | Proposed coordinate | Source |
|---|---|---|
| Designing for Engagement (horticulture therapy) | Study site: **LOCATION NEEDED**. Presented: Amherst, MA, 42.38°N 72.52°W (edge tick). | The MDX says "nursing home residents" but names no facility. The A.G. Rhodes work entry describes the same topic, but that link is inferred, so confirm it. Venue: `conferenceDates` "Amherst, Massachusetts". Coordinate: Wikipedia "Amherst, Massachusetts" (42.38333333, -72.51666667, minute precision). |
| Latent Maps for Architectural Reasoning | Where the work was done: **LOCATION NEEDED**. Presented: Hsinchu, 24.82°N 120.98°E (edge tick). | Venue: `conferenceDates` "Hsinchu City, Taiwan". Coordinate: Wikipedia "Hsinchu" (24.81666667, 120.98333333, minute precision). |
| Plastic Panel Fabrication from Campus Waste | 33.776°N 84.396°W (Georgia Tech) | MDX: "conducted under Professor Hyojin Kwon at Georgia Tech" and "Georgia Tech's campus waste stream". |
| The Shape Machine | 33.776°N 84.396°W (Georgia Tech) | MDX venue "Shape Computation Lab, Georgia Tech". |

**Projects**

| Item | Proposed coordinate | Source |
|---|---|---|
| Archipedia | **LOCATION NEEDED** | `content/projects.ts` states none. The Latent Maps MDX links to it (`projectLink`), so it shares that open question. |
| Datum | **LOCATION NEEDED** | `content/projects.ts` states none. |
| Fine Print (unlisted, routable) | **LOCATION NEEDED** | Page states none. |
| Yield (unlisted, routable) | **LOCATION NEEDED** | Page states none. |

Demos are company-specific builds with no stated location, so they are not placed. They are **LOCATION NEEDED** if the owner wants them on the map.

**Consequence.** 5 of 17 items are placeable today, all of them at one pin (Georgia Tech). Two more have only a conference venue (edge ticks), and 12 need a location from the owner. The Georgia Tech pin should show a count ("5 items") and list them on hover, not fan out into invented positions. Items without a location render with an empty coordinate column. There is no placeholder coordinate and no pin. The map gets richer as locations are supplied.

### 2c. Where the map shows up in the layout

- **Hero.** The plate fills the first screen behind the name and bio: graticule, the Georgia Tech and Atlanta pins, and edge ticks for Amherst and Hsinchu. The readout slot is live while the pointer is on the plate. The plate scrolls away with the hero. It is not a fixed layer under the whole site.
- **Section markers.** Section headers become a title plus one hairline (`.rule` or `.tick-rule`). No index, no eyebrow, no coordinate. Coordinates move down to the rows, so each work, research or project row carries its own `.coord` column (empty when LOCATION NEEDED).
- **Hover and focus states.** Hovering or focusing a row puts its coordinate in the readout slot. If the hero is in view, its pin highlights and a thin crosshair marks it. Rows at Georgia Tech all light the same pin. Rows with no location do nothing to the map.
- **Removed because the map replaces it.** Constellation canvas and region labels (items 1, 2), legend (3), compass (4; north-up is stated once in the graticule's top-edge label), ATLAS tag (5, its slot becomes the readout), survey ticks and grain (6), custom cursor and reticle (7; the native cursor returns), scattered coordinates (8), `latent-atlas.ts` (9), contour dividers (10), REGION numbering and eyebrows (11), route curtain (18), `DrawingAwareScope` (21).

---

## 3. Cut list and keep list

### Cut

The default applies: everything decorative that is not the real map is cut.

| Cut | Where |
|---|---|
| Renovation banner, its `--renovation-h` variable, the injected `nav { top }` rule, and the `main` padding calc | `RenovationBanner.tsx`, `layout.tsx:59`, `:65` |
| Header subtitle line | `Navbar.tsx:89` |
| Hero tagline "Building at the intersection of design and code." (banned cliche). **No replacement.** | `AboutSection.tsx:57-59` |
| Constellation canvas and region labels | `IsometricBackground.tsx`, `layout.tsx:56` |
| Legend, compass, ATLAS tag, survey ticks, paper grain | `AtlasFrame.tsx` (whole component, `layout.tsx:57`) |
| Custom cursor, `cursor-none` rule | `CustomCursor.tsx`, `layout.tsx:58`, `globals.css` `body.cursor-none` block |
| Drawing-aware emphasis (no-op per-frame layout reads) | `DrawingAwareScope.tsx`, `layout.tsx:60` |
| Scattered coordinate strings | `AboutSection.tsx:41`, `page.tsx:24`, `:34`, `:49`, `template.tsx:29` |
| Route-change curtain and "RELOCATING" | `template.tsx` |
| Latent atlas module (no importers) | `src/lib/latent-atlas.ts` |
| Contour dividers | `ContourDivider.tsx` (via `SheetHeader.tsx:33`) |
| REGION index, diamond, eyebrow row in section headers; BASECAMP row in hero | `SheetHeader.tsx:23-28`, `AboutSection.tsx:37-42` |
| Rotating role word and its hardcoded `#15803D` | `AboutSection.tsx:8`, `:16-24`, `:63-84` (see copy note 4.1) |
| Hero pills | `AboutSection.tsx:88-95` (see copy note 4.1 on "'27") |
| Section tints | `page.tsx:21`, `:41` |
| Hover side stripes | `ResearchSection.tsx`, `demos/page.tsx` |
| Footer watermark and gradient hairline | `Footer.tsx:9-17` |
| Card chrome: radius, blur, shadow, hover lift | See section 6 |
| Empty status pill on the generic project page (renders when `status` is unset, as on Archipedia) | `projects/[slug]/page.tsx:32-40` |

Orphans seen during inventory, for a later `/simplify` pass and not part of this redesign: `BlogPreviewSection.tsx`, `SketchbookGrid.tsx`, `VertexTable.tsx`, `ArchProjectLayout.tsx` (no importers), and the unused `--region-*` / `--atlas-*` custom properties in `globals.css:37-45` (their values are not touched).

### Keep

| Keep | Why |
|---|---|
| Type system: Fraunces display, IBM Plex Mono metadata, Inter body | Committed identity. The impeccable brand reference lists all three as reflex picks and calls this aesthetic lane saturated, but its own rule says identity preservation wins on an existing brand. Treat it as an open question (section 8), not a change. |
| All existing color tokens, unchanged | Out of scope, and they are the palette. |
| `.rule`, `.hairline`, `.tick-rule`, `.meta`, `.coord`, `.prose`, `.display-*` | These become the whole visual vocabulary (section 6). `.coord` now means something. |
| Arabic monogram and name in the nav | Identity, not decoration. |
| Nav structure: Experience, Projects, Research, Demos, Journal | Works as is. |
| Hero photographs (`/images/hero0*.png`) | Imagery is content. Frame treatment changes (section 6). Whether they keep auto-rotating is open. |
| Feedback form and `/api/feedback` | Kept behind a disclosure (section 5). |
| Research modal content, work modal content | Content. Presentation changes. |

---

## 4. Copy: deletions only

Nothing below is rewritten. Each line is text to delete, quoted exactly as rendered. ⚑ marks deletions that would lose meaning; those need an owner decision.

### 4.1 Homepage `/`

| Delete | Note |
|---|---|
| "BASECAMP", "ARCHITECTURE × COMPUTER SCIENCE", "33.7490°N 84.3880°W" (hero eyebrow row) | |
| "Building at the intersection of design and code." | Required cut. |
| The rotation of "student / researcher / artist / engineer" | ⚑ Deleting the rotation leaves one word in the sentence. "student" is the first entry and the only one that reads correctly with "at Georgia Tech, double majoring ...", so keep "student" and delete the other three. Owner decides. |
| "My name is Armaan and" (keeping "I am a student at Georgia Tech, double majoring ...") | The h1 already says the name. |
| "📍 Atlanta, GA" | The map carries this. |
| "🎓 Georgia Tech '27" | ⚑ "'27" is the only place the graduation year appears on the site. Deleting it loses that fact. |
| "REGION 01", "WHERE I'VE WORKED", "33.7756°N 84.3963°W" | |
| "REGION 02", "THINGS I'VE BUILT", "33.7490°N 84.3880°W" | |
| "REGION 03", "PEER-REVIEWED WORK", "33.7701°N 84.3876°W" | "Peer-reviewed" is inaccurate for two of the four entries (Plastic Panel is "In Progress", Shape Machine is a lab role). |
| "Research submitted, accepted, and presented at leading architecture and design conferences." | Also inaccurate for the same two entries. |
| Research status ", Research with Professor Hyojin Kwon, Georgia Tech" (in "In Progress, Research with ...") | It repeats the venue line. Keep "In Progress". |
| Research status ", Currently researching additional applications" (Shape Machine) | Keep "Research Team Member". |
| "GET IN TOUCH" | |
| "I'm always open to interesting conversations, collaborations, or opportunities." | |
| "Spotted a bug, have a feature idea, or want to suggest an improvement to one of the projects? Let me know." | ⚑ It tells the reader what the form is for. It is safe to delete only if the disclosure label "Leave feedback" is judged enough. |
| Feedback select options "Acoustic Form", "Tempo", "Edo Commons", "Intersecting Realms", "Framed" | ⚑ None of these exist in `content/projects.ts` or under `src/app/projects/`. Confirm they are not live elsewhere before deleting. |

Keep: "Student Org" labels (they distinguish jobs from organizations), "More on GitHub.", and "Let's talk."

**Work modals** (`content/work.ts`). These are candidates, all ⚑ because they carry claims:

| Delete | Note |
|---|---|
| Jeeves: ", at a Y Combinator-backed global fintech startup valued at $2.5 billion" | ⚑ This is the only statement of the company's backing and scale. |
| Jeeves: "across one of the most forward-thinking international fintechs" | Puffery. No fact is lost. |
| TEAM Buzz, bullet 2 in full: "Support operations of a 25+ year legacy organization recognized as a cornerstone of Georgia Tech's campus leadership and annual Homecoming Week programming" | ⚑ This bullet is also the source that places TEAM Buzz at Georgia Tech (2b). If deleted, the "Georgia Tech community" wording in bullet 3 still supports that placement. |
| AIAS, bullet 3 in full: "Advise on studio-related operations, providing actionable recommendations that enhance workflows and promote engagement with architectural programming" | Generic. It overlaps bullet 1. |
| Sweet Frog: "Certified frozen yogurt enthusiast and self-proclaimed mixologist" | ⚑ This is voice, not a claim. It is the one line of humor on the page. Owner's call. |

**Research modals.** Where an entry has both a summary paragraph and a full `## Abstract` (horticulture therapy, latent maps), the summary paragraph restates the abstract. ⚑ Delete the summary paragraph only if the modal should open on the abstract.

### 4.2 `/about`

| Delete | Note |
|---|---|
| The six emoji: 🎬 📚 🎵 🏆 🏛️ 🌍 | Decoration. The column labels carry the meaning. |
| "TIMELINE" / "Coming soon" | An empty section. |
| "PAGES FROM MY SKETCHBOOK" / "Coming soon" | An empty section. |

What remains is "More about me" plus Favorites (about 55 words). ⚑ At that size, the hero's "More about me" link points at very little. Whether `/about` stays a page is a structural question, not a copy one.

### 4.3 `/journal`

Nothing to delete. At 46 words it is already minimal.

### 4.4 `/demos`

| Delete | Note |
|---|---|
| "← Back to portfolio" | The nav does this. |
| "BUILD LOGS" | |
| "This Demo Worked!" | ⚑ It marks the Rho demo as successful, and Rho is the current employer (`work.ts`). Deleting it loses that signal. Keep the fact, lose the pill (section 6). Rewording is the owner's call. |

Keep: "Company-specific projects, each built around one problem I wanted to dig into." (it explains what a demo is) and "Additional demos available on GitHub →".

### 4.5 Project pages

| Page | Delete | Note |
|---|---|---|
| `/projects/fine-print` | "CS" pill | |
| `/projects/fine-print` | "📄" | |
| `/projects/yield` | "CS" pill | |
| `/projects/archipedia` (generic) | Empty status pill | This is a defect, not copy. |
| `/projects/archipedia`, `/fine-print`, `/yield` | "← Back to projects" | ⚑ Fine Print and Yield are unlisted, so this link is their only route back to the index besides the nav. Low priority. |
| `/projects/datum` | n/a | Off limits. Not reviewed for copy. |

Keep both disclaimers ("Fine Print is just for fun ...", "Yield is just for fun. Not financial advice."). They carry legal meaning.

### 4.6 Footer

| Delete | Note |
|---|---|
| Watermark "Armaan Kazi" | |
| "ARCHITECTURE + CS · GEORGIA TECH" | It duplicates the cut nav subtitle. |
| The duplicate "Armaan Kazi" line (the copyright line already names him) | |
| "Want to get in touch with someone I've worked with? Reach out and I'll make the introduction." | ⚑ This is a real offer (introductions to references) and appears nowhere else. Deleting it loses that offer. |

---

## 5. Let's talk and footer, compact

Targets are at 1440 x 900. Together they drop from 1,125 px to about 216 px.

**Let's talk (homepage only). Target: 160 px collapsed.**

```
────────────────────────────────────────────────────────────── (.rule)
Let's talk.                                         [email address]
                                         Leave feedback  ▸  (disclosure)
```

- Padding 48 px top and 48 px bottom, instead of 112 px each.
- "Let's talk." at `display-md`, left-aligned, with the email address as a text link on the same baseline at the right. It is the one call to action, written out rather than hidden behind an icon.
- "Leave feedback" is a native `<details>`/`<summary>`. Expanded, it shows the existing form unchanged in function: project select, optional email, message, send. The form is styled per section 6 (hairline fields, no card). Expanded height is about 360 px, and only when asked for.
- No icon circles, no eyebrow, no intro sentence.

**Footer (every page). Target: 56 px, one row.**

```
© 2026 Armaan Kazi        Email   LinkedIn   GitHub   Instagram   About
```

- A top border of 1 px `--color-line`, instead of the gradient. Background stays dark `bg-[#16241A]`, which is the ink value. Or switch to paper; that is a token choice, not a new color.
- The four links as text labels in `.meta` (not icons), plus About. The existing year expression is unchanged.
- On the homepage, email appears in both Let's talk and the footer. That is acceptable, because the footer is the only contact block on every other page.
- On phones, the row wraps to two lines (about 88 px).
- ⚑ If the introductions line (4.6) is kept, it adds one `.meta` line (about 20 px).

---

## 6. Visual reset

Five recurring patterns read as generic. Each is replaced using existing tokens plus hairlines, type and space. No existing token value changes.

| Pattern now | Where | Replace with |
|---|---|---|
| Rounded rectangles: `.card` (16 px), `rounded-2xl`, `rounded-xl` (109 uses), `rounded-lg` (87) | Work, Projects, Research, Contact, `/demos`, Carousel, form fields, buttons | Square corners. Rows separated by 1 px `--color-line` rules, as `/journal` already does with `divide-y`. Form fields get a single bottom hairline and no box. Keep a radius only on the hero image if it is kept, and then only 2 px. |
| Soft shadows: `--shadow-card`, `--shadow-card-hover`, `shadow-sm` to `shadow-2xl` (47 uses) | Cards, work logos, carousel, contact icons, CTA buttons, mobile drawer | None. Keep elevation only for the modal and the mobile drawer, where it signals a layer, using `--shadow-float`. |
| Hover lift (`translateY(-4px)`, `-translate-y-1`) and 3 px side stripes | `.card-hover`, `WorkSection`, `ResearchSection`, `/demos` | Hover changes the title to `--color-terracotta` and lights the row's pin (2c). Nothing moves. |
| Pill badges: `rounded-full` (83 uses) | Hero pills, CTAs, status, "CS", "This Demo Worked!", carousel dots | Plain `.meta` text in the row's metadata column. CTAs become text links with an underline offset (as `.prose a` already does), or a square 1 px `--color-terracotta` outline if a button is needed. |
| Card grids: 3-column logo grid (9 identical tiles), 3-column project cards, 3-column demo cards | `WorkSection`, `ProjectsSection`, `/demos` | Ruled lists. One row per item, on a shared column grid: name (Fraunces), role or blurb (Inter), dates (`.meta`), coordinate (`.coord`, empty when unknown). Work rows show role and dates inline, so the 32-word logo grid stops hiding the facts behind nine modals. Logos become optional and small, or are dropped. |
| Glass blur | `.card`, nav (`backdrop-filter`), renovation banner | Solid `--color-paper` nav with a 1 px `--color-line` bottom border. |
| Eyebrow above every section | `SheetHeader`, `/demos`, contact | The title alone, with `.rule` under it. |

**Rhythm.** Section spacing currently runs `py-20 md:py-24` everywhere. Vary it: tight inside lists (row padding of about 16 px) and generous between sections (about 96 px). Rules do the separating, not boxes.

**Proposed new tokens.** These are additions only, and they belong in `globals.css`. Editing that file is a CLAUDE.md tripwire, so it needs the owner's go-ahead at implementation time.
- `--map-scale-m-per-px: 5;` `--map-center-lat: 33.76244;` `--map-center-lng: -84.39300;` These are the projection constants, readable by CSS and JS.
- `--rule: 1px solid var(--color-line);` A shorthand for the hairline used everywhere above.
- `--measure: 68ch;` Already implied by `.prose`. Reused for bio and abstract text.

---

## 7. Critique summary (impeccable, report only)

**AI-slop verdict: fails.** The site stacks four of the skill's named bans: an eyebrow on every section, numbered section markers (REGION 01/02/03) that are not a sequence, identical card grids, and hover side stripes. It also carries glass blur by default and a hero cliche. The atlas layer is a costume: coordinates, legend and compass signify "map" without any map beneath them.

**Heuristic scores** (0 to 4, Nielsen):

| # | Heuristic | Score | Main reason |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The 0.85 s route curtain hides every navigation. The feedback form states are fine. |
| 2 | Match with the real world | 1 | Coordinates look like data but are not. The readout's longitude runs backwards. "REGION" and "BASECAMP" are jargon. |
| 3 | User control and freedom | 3 | Modals and the banner are dismissible. |
| 4 | Consistency and standards | 2 | Three different footers on demo pages. Pills, circles and rectangles for the same action class. Research dates are wrong by a month (below). |
| 5 | Error prevention | 3 | |
| 6 | Recognition over recall | 1 | Role, dates and duties for all nine positions sit behind clicks. The homepage shows logos only. |
| 7 | Flexibility and efficiency | 2 | |
| 8 | Aesthetic and minimalist design | 1 | Six ambient layers (canvas, grain, ticks, legend, compass, caption) compete with the content on every page. |
| 9 | Error recovery | 2 | "Something went wrong. Please try again." gives no next step. |
| 10 | Help and documentation | 2 | |
| | **Total** | **19 / 40** | "Poor" band. The fix is structural, not polish. |

**Strengths.** The type pairing is applied consistently. `/journal` already shows the target pattern (ruled rows, a date column, no cards). The research content is substantial and real.

**Priority issues.**
- **P1.** Experience is unreadable without nine clicks (`WorkSection.tsx`).
- **P1.** Closing matter is 1.25 viewports (section 1c).
- **P1.** The ambient layers carry no information, and they run continuous rAF loops on every page. `DrawingAwareScope` alone reads layout for every text node on every frame, to no effect.
- **P2.** The custom cursor hides the native cursor on all elements, including inputs.

**Persona red flags.** A recruiter scanning for company, role and dates gets logos. A keyboard user tabbing through Experience opens modals, not content. A visitor on a trackpad sees the coordinate readout move backwards along the east-west axis.

**Detector (`detect.mjs`, regex mode).** It found two items: a side-tab (`BlogPreviewSection.tsx:24`, an unused component) and a width/height transition (`CustomCursor.tsx:85`). It missed the absolutely positioned 3 px hover stripes, recorded by hand in 1a, item 20. The in-page overlay was not run.

**Defects found during the inventory** (not fixed here; this task is direction only):
1. Research dates render one month early. `ResearchSection.tsx` calls `new Date("2026-05")`, which parses as UTC midnight, and `toLocaleDateString` in a US timezone shows "Apr 2026". The same applies to "2026-03", which renders as "Feb 2026".
2. The custom cursor's longitude increases toward the right while labeled °W, so the axis is mirrored (`CustomCursor.tsx:47`).
3. `DrawingAwareScope` runs every frame against an always-empty `drawingRegions` array.
4. The generic project page renders an empty status pill when `status` is unset (`projects/[slug]/page.tsx:32-40`).

---

## 8. Open questions for the owner

1. Locations for the 12 items marked **LOCATION NEEDED**. At minimum: Rho, Jeeves, NCR Voyix and A.G. Rhodes (which facility), and where the Latent Maps / Archipedia work was done.
2. Is A.G. Rhodes the study site for the horticulture therapy paper? The repo implies it but does not say so.
3. Scale and center (5 m/px, midpoint of Georgia Tech and Atlanta) are design choices. If most supplied locations fall outside Atlanta, the extent should widen, or the plate should switch to a regional scale.
4. The ⚑ items in section 4.
5. Hero photographs: keep the rotation, or show one image?
6. Type: the impeccable brand reference lists Fraunces, IBM Plex Mono and Inter as reflex choices, and the display-serif-plus-mono lane as saturated. This direction keeps them for identity. Confirm, or open that separately.
