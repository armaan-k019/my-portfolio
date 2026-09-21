// Test sites from SPEC.md section 5, geocoded by Nominatim on 2026-09-21.
// Coordinates are used directly in acceptance checks so runs are comparable
// even if geocoding drifts.

export interface TestSite {
  slug: string;
  query: string;
  lat: number;
  lng: number;
}

export const testSites: TestSite[] = [
  {
    slug: "atlanta",
    query: "Techwood Drive NW, Atlanta, GA 30313",
    lat: 33.7751258,
    lng: -84.391975,
  },
  {
    slug: "miami",
    query: "NE 25th St and Biscayne Blvd, Miami, FL",
    lat: 25.8011588,
    lng: -80.1890627,
  },
  {
    slug: "wakeeney",
    query: "300 Main St, WaKeeney, KS",
    lat: 39.019769,
    lng: -99.883731,
  },
];
