import Anthropic from "@anthropic-ai/sdk";

// ─── Exported types ───────────────────────────────────────────────────────────

export interface OverpassPoint {
  id: number;
  lat: number;
  lon: number;
  name: string;
}

export interface OverpassData {
  transit: OverpassPoint[];
  parks: OverpassPoint[];
  restaurants: OverpassPoint[];
  schools: OverpassPoint[];
  hospitals: OverpassPoint[];
  bikeWayCount: number;
  timedOutCategories?: string[];
  radiusCapped?: boolean;
}

export interface IncomeBracket {
  label: string;
  count: number;
  midpoint: number; // used for std dev calc
}

export interface CensusData {
  // Core
  medianIncome: number | null;
  meanIncome: number | null;
  incomeStdDev: number | null;
  incomeBrackets: IncomeBracket[]; // for bell-curve chart
  population: number | null;
  populationDensity: number | null; // per sq mile
  tractName: string;
  // Demographic
  medianAge: number | null;
  malePop: number | null;
  femalePop: number | null;
  malePct: number | null;   // %
  femalePct: number | null; // %
  avgHouseholdSize: number | null;
  nonHispanicWhitePct: number | null; // %
  gini: number | null; // 0–1
  bachelorsOrHigherPct: number | null; // %
  unemployedPop: number | null;
  estHomelessPop: number | null;
  // Housing
  medianHomeValue: number | null;
  medianGrossRent: number | null;
  vacancyRate: number | null; // %
  // Mobility
  meanTravelTime: number | null; // minutes
  // Climate
  tempF: number | null;
  tempC: number | null;
}

export interface ComputedIndicators {
  gentrificationPressure: "Low" | "Medium" | "High" | "Very High" | null;
  affordabilityRatio: number | null;
  incomeInequalityLabel: string | null;
}

export interface Scores {
  walkability: number;
  bikeFriendliness: number;
}

export interface AIDataInsight {
  metric: string;
  insight: string;
}

export interface AIRecommendation {
  title: string;
  explanation: string;
}

export interface AIInsights {
  summary: string;
  communityProfile: string;
  culturalContext: string;
  dataInsights: AIDataInsight[];
  recommendations: AIRecommendation[];
}

export interface UrbanAnalysisResult {
  address: string;
  lat: number;
  lng: number;
  radiusM: number;
  unit: "miles" | "km";
  census: CensusData;
  computed: ComputedIndicators;
  overpass: OverpassData;
  scores: Scores;
  ai: AIInsights;
  overpassError?: boolean;
}

export const maxDuration = 60;

// ─── Server-side cache ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { result: UrbanAnalysisResult; expiresAt: number }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  ms = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function parseIntCensus(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v);
  return isNaN(n) || n < 0 ? null : n;
}

function parseFloatCensus(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? null : n;
}

// ─── Census ───────────────────────────────────────────────────────────────────

// Income bracket midpoints (dollars) - matches B19001 series order
const INCOME_BRACKET_DEFS: { label: string; varName: string; midpoint: number }[] = [
  { label: "<$10k",        varName: "B19001_002E", midpoint:   5000 },
  { label: "$10–15k",      varName: "B19001_003E", midpoint:  12500 },
  { label: "$15–20k",      varName: "B19001_004E", midpoint:  17500 },
  { label: "$20–25k",      varName: "B19001_005E", midpoint:  22500 },
  { label: "$25–30k",      varName: "B19001_006E", midpoint:  27500 },
  { label: "$30–35k",      varName: "B19001_007E", midpoint:  32500 },
  { label: "$35–40k",      varName: "B19001_008E", midpoint:  37500 },
  { label: "$40–45k",      varName: "B19001_009E", midpoint:  42500 },
  { label: "$45–50k",      varName: "B19001_010E", midpoint:  47500 },
  { label: "$50–60k",      varName: "B19001_011E", midpoint:  55000 },
  { label: "$60–75k",      varName: "B19001_012E", midpoint:  67500 },
  { label: "$75–100k",     varName: "B19001_013E", midpoint:  87500 },
  { label: "$100–125k",    varName: "B19001_014E", midpoint: 112500 },
  { label: "$125–150k",    varName: "B19001_015E", midpoint: 137500 },
  { label: "$150–200k",    varName: "B19001_016E", midpoint: 175000 },
  { label: "$200k+",       varName: "B19001_017E", midpoint: 275000 },
];

const CENSUS_VARS = [
  "B19013_001E", // median household income
  "B19025_001E", // aggregate household income (for mean)
  "B19001_001E", // total households (income universe)
  "B19001_002E", "B19001_003E", "B19001_004E", "B19001_005E",
  "B19001_006E", "B19001_007E", "B19001_008E", "B19001_009E",
  "B19001_010E", "B19001_011E", "B19001_012E", "B19001_013E",
  "B19001_014E", "B19001_015E", "B19001_016E", "B19001_017E",
  "B01003_001E", // total population
  "B01002_001E", // median age
  "B19083_001E", // Gini coefficient
  "B15003_022E", // bachelor's degree
  "B15003_001E", // total educational attainment universe
  "B03002_003E", // non-Hispanic white
  "B03002_001E", // total race universe
  "B25077_001E", // median home value
  "B25064_001E", // median gross rent
  "B25002_003E", // vacant housing units
  "B25002_001E", // total housing units
  "B08303_001E", // mean travel time to work
  "B25010_001E", // average household size
  "B23025_005E", // unemployed population
  "B01001_002E", // male population
  "B01001_026E", // female population
  "B99161_002E", // estimated homeless population (imputed ACS)
].join(",");

function parseCensusRow(
  row: string[],
  header: string[],
  tractName: string,
  areaLandSqM: number
): CensusData {
  const get = (varName: string) => row[header.indexOf(varName)];

  const medianIncome     = parseIntCensus(get("B19013_001E"));
  const aggregateIncome  = parseIntCensus(get("B19025_001E"));
  const totalHouseholds  = parseIntCensus(get("B19001_001E"));
  const population       = parseIntCensus(get("B01003_001E"));
  const medianAgeRaw    = parseFloatCensus(get("B01002_001E"));
  const giniRaw         = parseFloatCensus(get("B19083_001E"));
  const bachelors       = parseIntCensus(get("B15003_022E"));
  const totalEdu        = parseIntCensus(get("B15003_001E"));
  const nhWhite         = parseIntCensus(get("B03002_003E"));
  const totalRace       = parseIntCensus(get("B03002_001E"));
  const medianHomeValue = parseIntCensus(get("B25077_001E"));
  const medianGrossRent = parseIntCensus(get("B25064_001E"));
  const vacantUnits     = parseIntCensus(get("B25002_003E"));
  const totalUnits      = parseIntCensus(get("B25002_001E"));
  const meanTravelTime  = parseIntCensus(get("B08303_001E"));
  const avgHouseholdSizeRaw = parseFloatCensus(get("B25010_001E"));
  const unemployedPop   = parseIntCensus(get("B23025_005E"));
  const malePop         = parseIntCensus(get("B01001_002E"));
  const femalePop       = parseIntCensus(get("B01001_026E"));
  const estHomelessPop  = parseIntCensus(get("B99161_002E"));

  const areaLandSqMiles = areaLandSqM / 2_589_988.11;
  const populationDensity =
    population && areaLandSqMiles > 0 ? Math.round(population / areaLandSqMiles) : null;

  const bachelorsOrHigherPct =
    bachelors !== null && totalEdu && totalEdu > 0
      ? Math.round((bachelors / totalEdu) * 1000) / 10
      : null;

  const nonHispanicWhitePct =
    nhWhite !== null && totalRace && totalRace > 0
      ? Math.round((nhWhite / totalRace) * 1000) / 10
      : null;

  const vacancyRate =
    vacantUnits !== null && totalUnits && totalUnits > 0
      ? Math.round((vacantUnits / totalUnits) * 1000) / 10
      : null;

  const gini = giniRaw !== null && giniRaw <= 1 ? Math.round(giniRaw * 1000) / 1000 : null;

  const totalGender = (malePop ?? 0) + (femalePop ?? 0);
  const malePct = malePop !== null && totalGender > 0
    ? Math.round((malePop / totalGender) * 1000) / 10 : null;
  const femalePct = femalePop !== null && totalGender > 0
    ? Math.round((femalePop / totalGender) * 1000) / 10 : null;

  const avgHouseholdSize = avgHouseholdSizeRaw !== null
    ? Math.round(avgHouseholdSizeRaw * 10) / 10 : null;

  // ── Mean income from aggregate / households ──────────────────────────────
  const meanIncome = aggregateIncome !== null && totalHouseholds && totalHouseholds > 0
    ? Math.round(aggregateIncome / totalHouseholds) : null;

  // ── Income brackets + std dev ─────────────────────────────────────────────
  const incomeBrackets: IncomeBracket[] = [];
  for (const def of INCOME_BRACKET_DEFS) {
    const count = parseIntCensus(get(def.varName));
    if (count !== null) incomeBrackets.push({ label: def.label, count, midpoint: def.midpoint });
  }
  let incomeStdDev: number | null = null;
  if (incomeBrackets.length > 0 && meanIncome !== null) {
    const total = incomeBrackets.reduce((s, b) => s + b.count, 0);
    if (total > 0) {
      const variance = incomeBrackets.reduce(
        (s, b) => s + b.count * Math.pow(b.midpoint - meanIncome, 2), 0
      ) / total;
      incomeStdDev = Math.round(Math.sqrt(variance));
    }
  }

  console.log(
    `[urban-gpt] Parsed census → income=${medianIncome} pop=${population} density=${populationDensity} ` +
    `age=${medianAgeRaw} gini=${gini} homeVal=${medianHomeValue} rent=${medianGrossRent} ` +
    `hhSize=${avgHouseholdSize} unemployed=${unemployedPop} homeless=${estHomelessPop} travel=${meanTravelTime}`
  );

  return {
    medianIncome, meanIncome, incomeStdDev, incomeBrackets,
    population, populationDensity, tractName,
    medianAge: medianAgeRaw,
    malePop, femalePop, malePct, femalePct,
    avgHouseholdSize,
    nonHispanicWhitePct, gini, bachelorsOrHigherPct,
    unemployedPop, estHomelessPop,
    medianHomeValue, medianGrossRent, vacancyRate,
    meanTravelTime,
    tempF: null, tempC: null, // filled in by fetchTemperature
  };
}

const CENSUS_EMPTY: CensusData = {
  medianIncome: null, meanIncome: null, incomeStdDev: null, incomeBrackets: [],
  population: null, populationDensity: null, tractName: "",
  medianAge: null,
  malePop: null, femalePop: null, malePct: null, femalePct: null,
  avgHouseholdSize: null,
  nonHispanicWhitePct: null, gini: null, bachelorsOrHigherPct: null,
  unemployedPop: null, estHomelessPop: null,
  medianHomeValue: null, medianGrossRent: null, vacancyRate: null,
  meanTravelTime: null,
  tempF: null, tempC: null,
};

async function fetchCensusData(lat: number, lng: number): Promise<CensusData> {
  const geocoderUrl =
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates` +
    `?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current` +
    `&layers=Census%20Tracts&format=json`;

  console.log(`[urban-gpt] Census geocoder URL: ${geocoderUrl}`);

  let state: string | null = null;
  let county: string | null = null;
  let tract: string | null = null;
  let areaLandSqM = 0;
  let tractName = "";

  try {
    const geoRes = await fetchWithTimeout(geocoderUrl, {}, 8000);
    const geoText = await geoRes.text();
    console.log(`[urban-gpt] Geocoder response: ${geoText}`);

    const geoJson = JSON.parse(geoText) as {
      result?: {
        geographies?: {
          "Census Tracts"?: Array<{
            STATE: string; COUNTY: string; TRACT: string;
            NAME?: string; AREALAND?: string | number;
          }>;
        };
      };
    };

    const tracts = geoJson?.result?.geographies?.["Census Tracts"];
    if (tracts && tracts.length > 0) {
      const t = tracts[0];
      state  = t.STATE.padStart(2, "0");
      county = t.COUNTY.padStart(3, "0");
      tract  = t.TRACT.padStart(6, "0");
      areaLandSqM = parseFloat(String(t.AREALAND ?? 0)) || 0;
      tractName = t.NAME ?? "";
      console.log(`[urban-gpt] FIPS → state=${state} county=${county} tract=${tract} area=${areaLandSqM}m²`);
    } else {
      console.warn(`[urban-gpt] Geocoder returned no Census Tracts - geographies keys: ${Object.keys(geoJson?.result?.geographies ?? {}).join(", ")}`);
    }
  } catch (err) {
    console.error(`[urban-gpt] Geocoder error:`, err);
    return CENSUS_EMPTY;
  }

  if (!state || !county || !tract) {
    console.warn(`[urban-gpt] Missing FIPS codes - skipping ACS fetch`);
    return CENSUS_EMPTY;
  }

  const acsUrl =
    `https://api.census.gov/data/2022/acs/acs5` +
    `?get=${CENSUS_VARS}&for=tract:*&in=state:${state}%20county:${county}`;

  console.log(`[urban-gpt] ACS URL: ${acsUrl}`);

  try {
    const acsRes = await fetchWithTimeout(acsUrl, {}, 8000);
    const acsText = await acsRes.text();
    console.log(`[urban-gpt] ACS raw (first 600): ${acsText.slice(0, 600)}`);

    const acsJson = JSON.parse(acsText) as string[][];
    if (!Array.isArray(acsJson) || acsJson.length < 2) {
      console.warn(`[urban-gpt] ACS empty - trying county fallback`);
      return fetchCensusCountyFallback(state, county, tractName, areaLandSqM);
    }

    const header = acsJson[0];
    const tractColIdx = header.indexOf("tract");
    console.log(`[urban-gpt] ACS header: ${JSON.stringify(header)}`);

    let matchRow: string[] | undefined;
    if (tractColIdx !== -1) {
      matchRow = acsJson.slice(1).find(
        (r) => r[tractColIdx]?.padStart(6, "0") === tract
      );
    }
    if (!matchRow) {
      console.warn(`[urban-gpt] Tract ${tract} not found - using first data row`);
      matchRow = acsJson[1];
    }

    console.log(`[urban-gpt] ACS matched row: ${JSON.stringify(matchRow)}`);
    return parseCensusRow(matchRow, header, tractName, areaLandSqM);
  } catch (err) {
    console.error(`[urban-gpt] ACS error:`, err);
    return fetchCensusCountyFallback(state, county, tractName, areaLandSqM);
  }
}

async function fetchCensusCountyFallback(
  state: string,
  county: string,
  tractName: string,
  areaLandSqM: number
): Promise<CensusData> {
  const url =
    `https://api.census.gov/data/2022/acs/acs5` +
    `?get=${CENSUS_VARS}&for=county:${county}&in=state:${state}`;
  console.log(`[urban-gpt] County fallback ACS URL: ${url}`);

  try {
    const res = await fetchWithTimeout(url, {}, 8000);
    const text = await res.text();
    console.log(`[urban-gpt] County ACS raw (first 400): ${text.slice(0, 400)}`);

    const json = JSON.parse(text) as string[][];
    if (!Array.isArray(json) || json.length < 2) return { ...CENSUS_EMPTY, tractName };

    const header = json[0];
    return parseCensusRow(json[1], header, `${tractName} (county-level)`, areaLandSqM);
  } catch (err) {
    console.error(`[urban-gpt] County fallback error:`, err);
    return { ...CENSUS_EMPTY, tractName };
  }
}

// ─── Temperature (Open-Meteo - free, no key) ─────────────────────────────────

async function fetchTemperature(lat: number, lng: number): Promise<{ tempF: number | null; tempC: number | null }> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&temperature_unit=celsius&forecast_days=1`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return { tempF: null, tempC: null };
    const data = await res.json() as { current?: { temperature_2m?: number } };
    const c = data.current?.temperature_2m ?? null;
    if (c === null) return { tempF: null, tempC: null };
    const tempC = Math.round(c * 10) / 10;
    const tempF = Math.round((c * 9 / 5 + 32) * 10) / 10;
    return { tempF, tempC };
  } catch {
    return { tempF: null, tempC: null };
  }
}

// ─── Computed indicators ──────────────────────────────────────────────────────

function computeIndicators(census: CensusData): ComputedIndicators {
  const affordabilityRatio =
    census.medianHomeValue && census.medianIncome && census.medianIncome > 0
      ? Math.round((census.medianHomeValue / census.medianIncome) * 10) / 10
      : null;

  const incomeInequalityLabel =
    census.gini !== null
      ? census.gini < 0.3 ? "Low inequality"
        : census.gini < 0.4 ? "Moderate inequality"
        : census.gini < 0.5 ? "High inequality"
        : "Very high inequality"
      : null;

  let gentrificationPressure: ComputedIndicators["gentrificationPressure"] = null;
  if (
    census.medianGrossRent &&
    census.medianIncome && census.medianIncome > 0 &&
    census.bachelorsOrHigherPct !== null
  ) {
    const rentToIncome = (census.medianGrossRent * 12) / census.medianIncome;
    const bachelorsRatio = census.bachelorsOrHigherPct / 100;
    const score = rentToIncome * bachelorsRatio;
    gentrificationPressure =
      score < 0.05 ? "Low" : score < 0.10 ? "Medium" : score < 0.18 ? "High" : "Very High";
  }

  return { affordabilityRatio, incomeInequalityLabel, gentrificationPressure };
}

// ─── Overpass ─────────────────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const OVERPASS_CAP = 50;         // max points per category
const OVERPASS_MAX_RADIUS = 8045; // cap at 5 miles for Overpass queries

async function fetchOverpassData(
  lat: number,
  lng: number,
  radiusM: number
): Promise<{ data: OverpassData; error: boolean }> {
  const R = Math.min(Math.round(radiusM), OVERPASS_MAX_RADIUS);
  const radiusCapped = R < Math.round(radiusM);

  const fetchOptions = (query: string): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  const makeQuery = (body: string) =>
    `[out:json][timeout:25];\n(\n${body}\n);\nout center;`;

  const queries: Record<string, string> = {
    transit: makeQuery(`
  node["highway"="bus_stop"](around:${R},${lat},${lng});
  node["railway"="station"](around:${R},${lat},${lng});
  node["amenity"="subway_entrance"](around:${R},${lat},${lng});`),
    parks: makeQuery(`
  node["leisure"="park"](around:${R},${lat},${lng});
  way["leisure"="park"](around:${R},${lat},${lng});
  node["leisure"="playground"](around:${R},${lat},${lng});`),
    dining: makeQuery(`
  node["amenity"="restaurant"](around:${R},${lat},${lng});
  node["amenity"="cafe"](around:${R},${lat},${lng});
  node["amenity"="fast_food"](around:${R},${lat},${lng});
  node["amenity"="bar"](around:${R},${lat},${lng});`),
    schools: makeQuery(`
  node["amenity"="school"](around:${R},${lat},${lng});
  node["amenity"="university"](around:${R},${lat},${lng});
  node["amenity"="college"](around:${R},${lat},${lng});`),
    health: makeQuery(`
  node["amenity"="hospital"](around:${R},${lat},${lng});
  node["amenity"="pharmacy"](around:${R},${lat},${lng});
  node["amenity"="clinic"](around:${R},${lat},${lng});
  node["amenity"="doctors"](around:${R},${lat},${lng});`),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function runQuery(category: string, query: string): Promise<OverpassPoint[]> {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        console.log(`[urban-gpt] Overpass ${category} → ${endpoint.includes('kumi') ? 'kumi' : 'main'}`);
        const res = await fetchWithTimeout(endpoint, fetchOptions(query), 20000);
        if (!res.ok) {
          console.warn(`[urban-gpt] Overpass ${category}: HTTP ${res.status}`);
          continue;
        }
        const json = await res.json() as {
          elements?: Array<{
            id: number; lat?: number; lon?: number;
            center?: { lat: number; lon: number };
            tags?: Record<string, string>;
          }>;
        };
        const points: OverpassPoint[] = [];
        const seen = new Set<number>();
        for (const el of json.elements ?? []) {
          if (seen.has(el.id)) continue;
          seen.add(el.id);
          const elLat = el.lat ?? el.center?.lat;
          const elLon = el.lon ?? el.center?.lon;
          if (elLat === undefined || elLon === undefined) continue;
          points.push({ id: el.id, lat: elLat, lon: elLon, name: el.tags?.name ?? "" });
          if (points.length >= OVERPASS_CAP) break;
        }
        console.log(`[urban-gpt] Overpass ${category}: ${points.length} points`);
        return points;
      } catch (err) {
        console.error(`[urban-gpt] Overpass ${category} @ ${endpoint}: ${(err as Error).message}`);
      }
    }
    throw new Error(`All Overpass endpoints failed for ${category}`);
  }

  console.log(`[urban-gpt] Overpass parallel queries radius=${R}m (capped=${radiusCapped})`);

  const [transitRes, parksRes, diningRes, schoolsRes, healthRes] = await Promise.allSettled([
    runQuery('transit', queries.transit),
    runQuery('parks',   queries.parks),
    runQuery('dining',  queries.dining),
    runQuery('schools', queries.schools),
    runQuery('health',  queries.health),
  ]);

  const timedOutCategories: string[] = [];
  function getOrEmpty(
    res: PromiseSettledResult<OverpassPoint[]>,
    label: string
  ): OverpassPoint[] {
    if (res.status === 'rejected') { timedOutCategories.push(label); return []; }
    return res.value;
  }

  const transit     = getOrEmpty(transitRes, 'transit');
  const parks       = getOrEmpty(parksRes,   'parks');
  const restaurants = getOrEmpty(diningRes,  'dining');
  const schools     = getOrEmpty(schoolsRes, 'schools');
  const hospitals   = getOrEmpty(healthRes,  'health');

  console.log(
    `[urban-gpt] Overpass done: t=${transit.length} p=${parks.length} r=${restaurants.length}` +
    ` s=${schools.length} h=${hospitals.length} timedOut=[${timedOutCategories.join(',')}]`
  );

  return {
    data: {
      transit, parks, restaurants, schools, hospitals, bikeWayCount: 0,
      ...(timedOutCategories.length > 0 && { timedOutCategories }),
      ...(radiusCapped && { radiusCapped }),
    },
    error: timedOutCategories.length === 5,
  };
}

// ─── Scores ───────────────────────────────────────────────────────────────────

function computeScores(overpass: OverpassData, radiusM: number): Scores {
  const radiusMiles = radiusM / 1609.344;
  const walkabilityRaw =
    (overpass.transit.length * 2 + overpass.parks.length * 1.5 + overpass.restaurants.length) /
    radiusMiles;
  const walkability = Math.min(100, Math.round(walkabilityRaw * 0.1));
  const bikeRaw = (overpass.parks.length + overpass.bikeWayCount) / radiusMiles;
  const bikeFriendliness = Math.min(100, Math.round(bikeRaw * 1.5));
  return { walkability, bikeFriendliness };
}

// ─── AI ───────────────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are an experienced urban designer and community planner analyzing a site for an architecture project. Your analysis should feel like advice from a knowledgeable colleague: warm, practical, and insightful, not dry or clinical.

When specific numbers are available in the data, reference them directly in your writing. For example: "With an average household size of 3.1, there are likely many families with children here. Consider playground space and a unit mix that includes 3-bedrooms." If data is unavailable for a field, skip that metric rather than noting its absence.

You MUST respond with ONLY a raw JSON object. No preamble, no markdown, no code fences. Your entire response must be valid JSON starting with {.

Respond in exactly this format:
{
  "summary": "2-3 sentence high-level overview of what kind of place this is and its key design context.",
  "communityProfile": "A narrative paragraph (3-5 sentences) about who lives here. Synthesize the demographic data into a portrait of the community. Reference actual numbers where possible.",
  "culturalContext": "A paragraph (3-5 sentences) drawing on your knowledge of this location's history, neighborhood identity, cultural character, and any relevant current dynamics. Treat this as genuine local knowledge, not generic filler.",
  "dataInsights": [
    { "metric": "Short metric name", "insight": "1-2 sentences directly referencing the data value and what it means for design decisions." }
  ],
  "recommendations": [
    { "title": "Short action title", "explanation": "2-3 sentences of specific, actionable guidance tied directly to the data." }
  ]
}

Generate 4-6 recommendations. In dataInsights, cover every metric that has actual data (skip unavailable ones). Keep your tone conversational, grounded, and useful to a working architect.`;

function makeFallback(address: string): AIInsights {
  return {
    summary: `Site analysis for ${address}. Some data was unavailable. The insights below are based on available context.`,
    communityProfile: "Demographic data could not be retrieved for this location.",
    culturalContext: "Unable to retrieve contextual data for this location at this time.",
    dataInsights: [],
    recommendations: [
      { title: "Verify Data Sources", explanation: "Census data was unavailable for this tract. Consider checking the address and trying again, or consulting local planning documents directly." },
    ],
  };
}

async function fetchAIInsights(
  client: Anthropic,
  address: string,
  radiusM: number,
  unit: "miles" | "km",
  census: CensusData,
  computed: ComputedIndicators,
  overpass: OverpassData,
  scores: Scores,
): Promise<AIInsights> {
  const n = (v: number | null, suffix = "") => (v !== null ? `${v}${suffix}` : null);
  const c = (v: number | null) => (v !== null ? `$${v.toLocaleString()}` : null);
  const pct = (v: number | null) => (v !== null ? `${v}%` : null);
  const radiusMiles = radiusM / 1609.344;
  const radiusDisplay = unit === "miles"
    ? `${radiusMiles.toFixed(1)} miles`
    : `${(radiusMiles * 1.60934).toFixed(1)} km`;

  // Only include fields that have actual values - omit nulls entirely
  // so Claude sees a clean, honest picture of what's known
  const demographics: Record<string, string | number> = {};
  if (census.medianIncome !== null)        demographics.medianHouseholdIncome = c(census.medianIncome)!;
  if (census.meanIncome !== null)          demographics.meanHouseholdIncome = c(census.meanIncome)!;
  if (census.incomeStdDev !== null)        demographics.incomeStdDev = `±${c(census.incomeStdDev)} (1σ)`;
  if (census.populationDensity !== null)   demographics.populationDensity = `${census.populationDensity.toLocaleString()} people/sq mile`;
  if (census.population !== null)          demographics.tractPopulation = census.population.toLocaleString();
  if (census.medianAge !== null)           demographics.medianAge = `${census.medianAge} years`;
  if (census.malePct !== null)             demographics.genderSplit = `${census.malePct}% male / ${census.femalePct}% female`;
  if (census.avgHouseholdSize !== null)    demographics.avgHouseholdSize = census.avgHouseholdSize;
  if (census.nonHispanicWhitePct !== null) demographics.nonHispanicWhitePct = pct(census.nonHispanicWhitePct)!;
  if (census.gini !== null)               demographics.giniCoefficient = census.gini;
  if (census.bachelorsOrHigherPct !== null) demographics.bachelorsOrHigherPct = pct(census.bachelorsOrHigherPct)!;
  if (census.unemployedPop !== null)       demographics.unemployedPopulation = census.unemployedPop.toLocaleString();
  if (census.estHomelessPop !== null)      demographics.estimatedHomelessPopulation = census.estHomelessPop;

  const housing: Record<string, string | number> = {};
  if (census.medianHomeValue !== null)  housing.medianHomeValue = c(census.medianHomeValue)!;
  if (census.medianGrossRent !== null)  housing.medianGrossRent = c(census.medianGrossRent)!;
  if (census.vacancyRate !== null)      housing.vacancyRate = pct(census.vacancyRate)!;

  const mobility: Record<string, string | number> = {};
  if (census.meanTravelTime !== null) mobility.meanTravelTimeToWork = `${census.meanTravelTime} min`;
  mobility.transitStops = overpass.transit.length;
  mobility.parks = overpass.parks.length;
  mobility.restaurantsAndCafes = overpass.restaurants.length;
  mobility.schoolsAndUniversities = overpass.schools.length;
  mobility.hospitalsAndClinics = overpass.hospitals.length;

  const indicators: Record<string, string | number> = {};
  indicators.walkabilityScore = `${scores.walkability} / 100`;
  indicators.bikeFriendlinessScore = `${scores.bikeFriendliness} / 100`;
  if (computed.affordabilityRatio !== null) indicators.affordabilityRatio = `${computed.affordabilityRatio}x income`;
  if (computed.gentrificationPressure)      indicators.gentrificationPressure = computed.gentrificationPressure;
  if (computed.incomeInequalityLabel)       indicators.incomeInequality = computed.incomeInequalityLabel;

  const climate: Record<string, string | number> = {};
  if (census.tempF !== null && census.tempC !== null) {
    climate.currentTemperature = `${census.tempF}°F / ${census.tempC}°C`;
  }

  const siteData = {
    address,
    studyRadius: radiusDisplay,
    ...(Object.keys(demographics).length > 0 && { demographics }),
    ...(Object.keys(housing).length > 0 && { housing }),
    ...(Object.keys(climate).length > 0 && { climate }),
    mobility,
    computedIndicators: indicators,
  };

  console.log(`[urban-gpt] Sending to Claude:\n${JSON.stringify(siteData, null, 2)}`);

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Analyze this site:\n\n${JSON.stringify(siteData, null, 2)}` }],
    });

    console.log('CLAUDE RESPONSE:', JSON.stringify(message));
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error(`[urban-gpt] Claude returned no text block. Full content:`, JSON.stringify(message.content));
      return makeFallback(address);
    }

    const raw = textBlock.text.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    console.log(`[urban-gpt] Claude raw response (first 600): ${raw.slice(0, 600)}`);

    try {
      return JSON.parse(raw) as AIInsights;
    } catch (parseErr) {
      console.error(`[urban-gpt] Claude JSON parse failed:`, parseErr);
      console.error(`[urban-gpt] Full unparseable response:`, raw);
      return makeFallback(address);
    }
  } catch (err) {
    console.error(`[urban-gpt] Claude API error:`, err);
    return makeFallback(address);
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[urban-gpt] Missing ANTHROPIC_API_KEY env var');
      return Response.json({ error: 'Server misconfiguration: ANTHROPIC_API_KEY is not set. Add it to Vercel → Settings → Environment Variables.' }, { status: 500 });
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const body = (await request.json()) as {
      lat: number;
      lng: number;
      radiusM: number;
      unit: "miles" | "km";
      address: string;
    };

    const { lat, lng, radiusM, unit, address } = body;

    if (!lat || !lng || !radiusM || !unit || !address) {
      return Response.json({ error: "Missing required parameters." }, { status: 400 });
    }

    // Cache lookup
    const cacheKey = `${address}:${radiusM}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[urban-gpt] Cache HIT for "${cacheKey}"`);
      return Response.json(cached.result);
    }

    console.log(`[urban-gpt] POST → address="${address}" lat=${lat} lng=${lng} radius=${radiusM}m unit=${unit}`);

    const [censusRes, overpassRes, tempRes] = await Promise.allSettled([
      fetchCensusData(lat, lng),
      fetchOverpassData(lat, lng, radiusM),
      fetchTemperature(lat, lng),
    ]);

    const census = censusRes.status === "fulfilled" ? censusRes.value : { ...CENSUS_EMPTY };
    const overpassResult = overpassRes.status === "fulfilled"
      ? overpassRes.value
      : { data: { transit: [], parks: [], restaurants: [], schools: [], hospitals: [], bikeWayCount: 0 } as OverpassData, error: true };
    const temp = tempRes.status === "fulfilled" ? tempRes.value : { tempF: null, tempC: null };

    if (censusRes.status === "rejected")   console.error("[urban-gpt] census rejected:", censusRes.reason);
    if (overpassRes.status === "rejected") console.error("[urban-gpt] overpass rejected:", overpassRes.reason);
    if (tempRes.status === "rejected")     console.error("[urban-gpt] temp rejected:", tempRes.reason);

    census.tempF = temp.tempF;
    census.tempC = temp.tempC;

    const computed = computeIndicators(census);
    const scores = computeScores(overpassResult.data, radiusM);
    const ai = await fetchAIInsights(client, address, radiusM, unit, census, computed, overpassResult.data, scores);

    const result: UrbanAnalysisResult = {
      address, lat, lng, radiusM, unit,
      census, computed, overpass: overpassResult.data,
      scores, ai, overpassError: overpassResult.error,
    };

    cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });

    return Response.json(result);
  } catch (err) {
    console.error("UrbanGPT API error:", err);
    return Response.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
