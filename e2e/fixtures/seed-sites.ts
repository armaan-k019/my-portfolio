// The twelve sites the Phase 3 memory run analyses. PHASE-3-memory.md step 3.6.
//
// The three SPEC section 5 test sites plus nine public buildings chosen for a
// spread of climate, density, relief, and flood exposure: percentiles mean
// nothing if every site in the population is the same kind of place.
//
// Every coordinate below was resolved by running the address through this
// repo's own POST /api/datum/geocode (Nominatim) against a local production
// build on 2026-09-25, and each entry records the query that was sent and the
// display name Nominatim returned for it. Nothing here was typed from memory
// or copied from a third party: an invented coordinate would put a real place
// in the wrong climate and quietly poison every percentile after it.
//
// All twelve are analysed with ?test=1, so their rows are is_test and never
// reach a production percentile.

import { testSites, type TestSite } from "./sites";

export interface SeedSite extends TestSite {
  /** What the site was chosen for, in one phrase. */
  character: string;
  /** The display name Nominatim returned for `query`, verbatim. */
  resolved: string;
}

/**
 * The nine added for Phase 3. Two of them were re-queried by building name
 * after the plain street address resolved to a neighbouring feature (a tenant
 * at the Minneapolis address, the street itself in Salt Lake City), and the
 * `resolved` line is the answer the recorded coordinates came from.
 */
export const memorySeedSites: SeedSite[] = [
  {
    slug: "seattle",
    query: "600 4th Ave, Seattle, WA 98104",
    lat: 47.6038904,
    lng: -122.3300986,
    character: "marine west coast, dense downtown, steep grid",
    resolved:
      "Seattle City Hall, 600, 4th Avenue, First Hill, Seattle, King County, Washington, 98104, United States",
  },
  {
    slug: "denver",
    query: "1437 Bannock St, Denver, CO 80202",
    lat: 39.7390471,
    lng: -104.9903453,
    character: "semi arid, high plains elevation, civic core",
    resolved:
      "1437, Bannock Street, Civic Center, Denver, Colorado, 80202, United States",
  },
  {
    slug: "phoenix",
    query: "200 W Washington St, Phoenix, AZ 85003",
    lat: 33.4487851,
    lng: -112.0771083,
    character: "hot desert, flat, low rise downtown",
    resolved:
      "Phoenix City Hall, 200, West Washington Street, Warehouse District, Downtown, Central City, Phoenix, Maricopa County, Arizona, 85003, United States",
  },
  {
    slug: "boston",
    query: "1 City Hall Square, Boston, MA 02201",
    lat: 42.3603713,
    lng: -71.0579762,
    character: "humid continental, highest density in the set, coastal",
    resolved:
      "Boston City Hall, 1, Congress Street, Government Center/Faneuil Hall, Downtown, Boston, Suffolk County, Massachusetts, 02201, United States",
  },
  {
    slug: "new-orleans",
    query: "219 Loyola Ave, New Orleans, LA 70112",
    lat: 29.9545068,
    lng: -90.075387,
    character: "humid subtropical, near sea level, high flood exposure",
    resolved:
      "219, Loyola Avenue, Central Business District, Storyville, New Orleans, Orleans Parish, Louisiana, 70112, United States",
  },
  {
    slug: "minneapolis",
    query: "Minneapolis Central Library, Minneapolis, MN",
    lat: 44.9805992,
    lng: -93.2700514,
    character: "cold continental, widest annual temperature range in the set",
    resolved:
      "Minneapolis Central Library, 300, Hennepin Avenue, Downtown West, Gateway District, Central, Minneapolis, Hennepin County, Minnesota, 55401, United States",
  },
  {
    slug: "salt-lake-city",
    query: "Salt Lake City Public Library, Salt Lake City, UT",
    lat: 40.7597728,
    lng: -111.8846995,
    character: "cold semi arid, mountain front, wide low rise blocks",
    resolved:
      "Salt Lake City Public Library, 210, 400 South, Central City, Salt Lake City, Salt Lake County, Utah, 84111, United States",
  },
  {
    slug: "asheville",
    query: "Asheville City Hall, Asheville, NC",
    lat: 35.5954728,
    lng: -82.5484303,
    character: "mountain valley, the most relief in the set",
    resolved:
      "Asheville City Hall, Court Plaza, Asheville, Buncombe County, North Carolina, 28801, United States",
  },
  {
    slug: "marfa",
    query: "Presidio County Courthouse, Marfa, TX",
    lat: 30.3134203,
    lng: -104.0220765,
    character: "high desert, the lowest density in the set",
    resolved:
      "Presidio County Courthouse, 300, North Highland Street, Marfa, Presidio County, Texas, 79843, United States",
  },
];

/**
 * All twelve. The three SPEC section 5 sites keep their recorded coordinates
 * from e2e/fixtures/sites.ts, which were resolved the same way in Phase 0.
 */
export const seedSites: SeedSite[] = [
  ...testSites.map((site) => ({
    ...site,
    character: "SPEC section 5 test site",
    resolved: "see e2e/fixtures/sites.ts, resolved by Nominatim on 2026-09-21",
  })),
  ...memorySeedSites,
];
