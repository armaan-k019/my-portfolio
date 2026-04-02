// ─── Types ────────────────────────────────────────────────────────────────────

export interface Bus {
  id: string;
  lat: number;
  lng: number;
  routeId: string;
  routeName: string;
  heading: number;
}

export interface Weather {
  temp: number;           // °F
  weathercode: number;    // WMO code
  windspeed: number;      // mph
  description: string;
  icon: string;
}

export interface LocationData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'dining' | 'academic' | 'recreation' | 'outdoor';
  busyness: number;       // 0–100
  status: 'quiet' | 'moderate' | 'busy' | 'very busy';
  waitTime: string | null;
  peakHours: string;
  subScores?: { label: string; score: number }[];
}

export interface PulseData {
  buses: Bus[];
  weather: Weather | null;
  locations: LocationData[];
  timestamp: string;
}

// ─── Building schedule data ───────────────────────────────────────────────────
// MWF slots in decimal hours (e.g. 8:05 = 8.083)
// TR  slots in decimal hours (e.g. 9:30 = 9.5)

interface Building {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'dining' | 'academic' | 'recreation' | 'outdoor';
  capacity: number;
  mwfSlots: number[];
  trSlots: number[];
  peakHours: string;
}

const MWF = [8.083, 9.083, 10.083, 11.083, 12.083, 13.083, 14.083, 15.083];
const TR  = [8.0, 9.5, 11.0, 12.5, 14.0, 15.5, 17.0];

const BUILDINGS: Building[] = [
  { id: 'klaus',     name: 'Klaus (CS)',          lat: 33.7773, lng: -84.3966, type: 'academic',    capacity: 600,  mwfSlots: MWF, trSlots: TR,           peakHours: '9 AM–3 PM' },
  { id: 'van_leer',  name: 'Van Leer',             lat: 33.7763, lng: -84.3960, type: 'academic',    capacity: 400,  mwfSlots: MWF, trSlots: TR,           peakHours: '8 AM–2 PM' },
  { id: 'skiles',    name: 'Skiles',               lat: 33.7755, lng: -84.3975, type: 'academic',    capacity: 500,  mwfSlots: MWF, trSlots: [],           peakHours: '9 AM–2 PM' },
  { id: 'clough',    name: 'Clough / CULC',        lat: 33.7748, lng: -84.3961, type: 'academic',    capacity: 700,  mwfSlots: MWF, trSlots: TR,           peakHours: '10 AM–4 PM' },
  { id: 'design',    name: 'College of Design',    lat: 33.7755, lng: -84.3938, type: 'academic',    capacity: 300,  mwfSlots: MWF.slice(1, 6), trSlots: TR.slice(1, 5), peakHours: '9 AM–1 PM' },
  { id: 'boggs',     name: 'Boggs Chemistry',      lat: 33.7760, lng: -84.3985, type: 'academic',    capacity: 350,  mwfSlots: MWF, trSlots: TR,           peakHours: '8 AM–3 PM' },
  { id: 'mason',     name: 'Mason',                lat: 33.7769, lng: -84.3963, type: 'academic',    capacity: 350,  mwfSlots: MWF, trSlots: TR,           peakHours: '8 AM–2 PM' },
  { id: 'tech_tower',name: 'Tech Tower',           lat: 33.7773, lng: -84.3948, type: 'academic',    capacity: 200,  mwfSlots: [],  trSlots: [],           peakHours: '9 AM–5 PM' },
  { id: 'tech_green',name: 'Tech Green',           lat: 33.7760, lng: -84.3956, type: 'outdoor',     capacity: 1000, mwfSlots: [],  trSlots: [],           peakHours: '11 AM–2 PM' },
  { id: 'student_center', name: 'Student Center',  lat: 33.7734, lng: -84.3962, type: 'academic',    capacity: 800,  mwfSlots: [],  trSlots: [],           peakHours: '11 AM–2 PM, 5–8 PM' },
];

// ─── Popular times: dining + CRC ─────────────────────────────────────────────
// { [day 0=Sun..6=Sat]: { [hour 0–23]: score 0–100 } }

type PopularTimes = { [day: number]: { [hour: number]: number } };

function weekdayPT(profile: Record<number, number>): PopularTimes {
  const result: PopularTimes = {};
  for (let d = 0; d <= 6; d++) {
    result[d] = {};
    for (let h = 0; h <= 23; h++) {
      if (d === 0 || d === 6) {
        // Weekend: 60% of weekday
        result[d][h] = Math.round((profile[h] ?? 5) * 0.6);
      } else {
        result[d][h] = profile[h] ?? 5;
      }
    }
  }
  return result;
}

const POPULAR_TIMES: Record<string, PopularTimes> = {
  chick_fil_a: weekdayPT({ 10:30, 11:70, 12:90, 13:85, 14:55, 15:40, 16:35, 17:50, 18:75, 19:80, 20:55, 21:30 }),
  panda:       weekdayPT({ 10:20, 11:60, 12:85, 13:80, 14:50, 15:35, 16:30, 17:45, 18:70, 19:75, 20:50, 21:25 }),
  north_ave:   weekdayPT({ 7:55, 8:75, 9:60, 10:30, 11:75, 12:90, 13:85, 14:65, 15:35, 16:25, 17:65, 18:85, 19:80, 20:55, 21:30 }),
  west_village:weekdayPT({ 7:50, 8:70, 9:55, 10:25, 11:70, 12:90, 13:88, 14:70, 15:40, 16:30, 17:60, 18:88, 19:85, 20:60, 21:40, 22:25 }),
  crc:         weekdayPT({ 6:40, 7:60, 8:65, 9:50, 10:35, 11:25, 12:20, 13:25, 14:35, 15:45, 16:65, 17:82, 18:90, 19:85, 20:72, 21:55, 22:30 }),
};

// ─── Busyness helpers ─────────────────────────────────────────────────────────

function getPopularBusyness(id: string, now: Date): number {
  const pt = POPULAR_TIMES[id];
  if (!pt) return 20;
  const day  = now.getDay();
  const hour = now.getHours();
  return pt[day]?.[hour] ?? 5;
}

function getBuildingBusyness(b: Building, now: Date): number {
  const day  = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();

  if (day === 0 || day === 6) return 8; // weekend baseline
  if (b.type !== 'academic') return 15;

  const isMWF = day === 1 || day === 3 || day === 5;
  const isTR  = day === 2 || day === 4;
  const slots = isMWF ? b.mwfSlots : isTR ? b.trSlots : [];
  const slotDurMins = isMWF ? 50 : 75;

  let score = 10;
  for (const slotStartHr of slots) {
    const start = Math.round(slotStartHr * 60);
    const end   = start + slotDurMins;
    const mid   = start + slotDurMins / 2;

    if (mins >= start - 10 && mins < start) {
      // Arriving: ramp up
      score = Math.max(score, 30 + ((mins - (start - 10)) / 10) * 40);
    } else if (mins >= start && mins <= end) {
      // In class: high, peaks at midpoint
      const distFrac = Math.abs(mins - mid) / (slotDurMins / 2);
      score = Math.max(score, 72 + (1 - distFrac) * 23);
    } else if (mins > end && mins <= end + 15) {
      // Leaving: ramp down
      score = Math.max(score, 85 * (1 - (mins - end) / 15));
    }
  }
  return Math.min(100, Math.round(score));
}

function getTechGreenBusyness(now: Date): number {
  const day  = now.getDay();
  const hour = now.getHours();
  if (day === 0 || day === 6) return 30 + (hour >= 11 && hour <= 17 ? 30 : 0);
  // Busy at lunch and after classes
  if (hour >= 11 && hour <= 13) return 60;
  if (hour >= 16 && hour <= 18) return 50;
  if (hour >= 9  && hour <= 16) return 35;
  return 10;
}

function getStudentCenterBusyness(now: Date): number {
  const pt = POPULAR_TIMES.chick_fil_a; // proxy
  const day = now.getDay(), hour = now.getHours();
  return Math.min(100, Math.round(((pt[day]?.[hour] ?? 10) + (POPULAR_TIMES.panda[day]?.[hour] ?? 10)) / 2 * 0.85));
}

function busynessStatus(s: number): LocationData['status'] {
  if (s < 30) return 'quiet';
  if (s < 60) return 'moderate';
  if (s < 80) return 'busy';
  return 'very busy';
}

function waitTime(s: number, type: string): string | null {
  if (type !== 'dining') return null;
  if (s < 30) return 'No wait';
  if (s < 60) return '5–10 min';
  if (s < 80) return '10–20 min';
  return '20+ min';
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

const WMO: Record<number, { description: string; icon: string }> = {
  0:  { description: 'Clear sky',        icon: '☀️' },
  1:  { description: 'Mainly clear',     icon: '🌤️' },
  2:  { description: 'Partly cloudy',    icon: '⛅' },
  3:  { description: 'Overcast',         icon: '☁️' },
  45: { description: 'Foggy',            icon: '🌫️' },
  48: { description: 'Icy fog',          icon: '🌫️' },
  51: { description: 'Light drizzle',    icon: '🌦️' },
  61: { description: 'Light rain',       icon: '🌧️' },
  63: { description: 'Rain',             icon: '🌧️' },
  65: { description: 'Heavy rain',       icon: '⛈️' },
  71: { description: 'Light snow',       icon: '❄️' },
  80: { description: 'Rain showers',     icon: '🌦️' },
  95: { description: 'Thunderstorm',     icon: '⛈️' },
};

function celsiusToF(c: number): number { return Math.round(c * 9/5 + 32); }
function mpsToMph(v: number): number   { return Math.round(v * 2.237); }

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const now = new Date();

  const [busResult, weatherResult] = await Promise.allSettled([
    fetchBuses(),
    fetchWeather(),
  ]);

  const buses   = busResult.status   === 'fulfilled' ? busResult.value   : [];
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;

  // Build location list
  const locations: LocationData[] = [
    // Dining
    makeLocation('chick_fil_a',  'Chick-fil-A',          33.7734, -84.3964, 'dining',     now, 'Open 10 AM–8 PM',          getPopularBusyness('chick_fil_a',  now)),
    makeLocation('panda',        'Panda Express',         33.7735, -84.3960, 'dining',     now, 'Open 10:30 AM–8 PM',       getPopularBusyness('panda',        now)),
    makeLocation('north_ave',    'North Ave Dining',      33.7748, -84.3940, 'dining',     now, 'Peak 7–9 AM, 12–1 PM',     getPopularBusyness('north_ave',    now)),
    makeLocation('west_village', 'West Village Dining',  33.7723, -84.3949, 'dining',     now, 'Peak 12–1 PM, 6–7 PM',     getPopularBusyness('west_village', now)),
    // Recreation
    makeLocation('crc',          'Campus Rec Center',    33.7766, -84.3951, 'recreation', now, 'Peak 4–8 PM weekdays',      getPopularBusyness('crc',          now),
      [
        { label: 'Gym floor', score: Math.round(getPopularBusyness('crc', now) * 0.95) },
        { label: 'Pool',      score: Math.round(getPopularBusyness('crc', now) * 0.60) },
        { label: 'Courts',    score: Math.round(getPopularBusyness('crc', now) * 0.70) },
      ]
    ),
    // Academic / study
    ...BUILDINGS.filter(b => b.type === 'academic').map(b =>
      makeLocation(b.id, b.name, b.lat, b.lng, 'academic', now, b.peakHours, getBuildingBusyness(b, now))
    ),
    // Outdoor
    makeLocation('tech_green', 'Tech Green', 33.7760, -84.3956, 'outdoor', now, 'Peak 11 AM–2 PM', getTechGreenBusyness(now)),
  ];

  return Response.json({ buses, weather, locations, timestamp: now.toISOString() } satisfies PulseData);
}

function makeLocation(
  id: string, name: string, lat: number, lng: number,
  type: LocationData['type'], now: Date, peakHours: string,
  busyness: number, subScores?: LocationData['subScores'],
): LocationData {
  return { id, name, lat, lng, type, busyness, status: busynessStatus(busyness), waitTime: waitTime(busyness, type), peakHours, subScores };
}

// ─── External fetches ─────────────────────────────────────────────────────────

async function fetchBuses(): Promise<Bus[]> {
  const res = await fetch('https://feeds.transloc.com/3/vehicle_statuses?agencies=1413', {
    headers: { 'Accept': 'application/json' },
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  const vehicles = data?.vehicles ?? data?.vehicle_statuses ?? [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vehicles.map((v: any): Bus => ({
    id:        String(v.vehicle_id ?? v.id ?? Math.random()),
    lat:       Number(v.position?.lat ?? v.lat ?? 0),
    lng:       Number(v.position?.lng ?? v.lng ?? 0),
    routeId:   String(v.route_id ?? ''),
    routeName: String(v.call_name ?? v.route_name ?? 'Stinger'),
    heading:   Number(v.heading ?? 0),
  })).filter((b: Bus) => b.lat !== 0 && b.lng !== 0);
}

async function fetchWeather(): Promise<Weather> {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=33.7756&longitude=-84.3963&current=temperature_2m,weathercode,windspeed_10m';
  const res  = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error('Weather fetch failed');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  const c    = data.current;
  const code = Number(c.weathercode);
  const wmo  = WMO[code] ?? WMO[Math.floor(code / 10) * 10] ?? { description: 'Unknown', icon: '🌡️' };
  return {
    temp:        celsiusToF(Number(c.temperature_2m)),
    weathercode: code,
    windspeed:   mpsToMph(Number(c.windspeed_10m)),
    description: wmo.description,
    icon:        wmo.icon,
  };
}
