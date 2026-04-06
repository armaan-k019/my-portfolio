export const maxDuration = 30;

const RIDESYSTEMS_BASE = 'https://bus.gatech.edu/Services/JSONPRelay.svc';

// Only surface the Stinger routes shown on the campus map
const STINGER_ROUTE_IDS = new Set([20, 21, 17, 29]); // Red, Blue, Green, Gold

const ROUTE_META: Record<number, { name: string; color: string }> = {
  20: { name: 'Red',   color: '#E8392A' },
  21: { name: 'Blue',  color: '#1A6FBF' },
  17: { name: 'Green', color: '#2E8B57' },
  29: { name: 'Gold',  color: '#B8952A' },
};

export interface BusRoute {
  id: string;        // RouteID as string
  name: string;      // "Red", "Blue", etc.
  color: string;     // hex
  encodedPolyline: string;  // Google Maps encoded polyline for the full route shape
}

export interface BusRoutesResponse {
  routes: BusRoute[];
}

// 30-minute cache
let cache: { data: BusRoutesResponse; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export async function GET(): Promise<Response> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return Response.json(cache.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(
      `${RIDESYSTEMS_BASE}/GetRoutesForMapWithScheduleWithEncodedLine?apiKey=&isDispatch=false`,
      { signal: controller.signal, next: { revalidate: 0 } }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[bus-routes] RideSystems failed: HTTP ${res.status}`);
      return Response.json({ routes: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any[];
    console.log(`[bus-routes] Got ${data.length} routes from RideSystems`);
    data.forEach(r => console.log(`  RouteID=${r.RouteID} Name=${r.Description} polyline_len=${r.EncodedPolyline?.length ?? 0}`));

    const routes: BusRoute[] = data
      .filter(r => STINGER_ROUTE_IDS.has(Number(r.RouteID)) && r.EncodedPolyline)
      .map(r => {
        const id = Number(r.RouteID);
        const meta = ROUTE_META[id] ?? { name: r.Description ?? `Route ${id}`, color: '#888888' };
        return {
          id:              String(id),
          name:            meta.name,
          color:           meta.color,
          encodedPolyline: r.EncodedPolyline as string,
        };
      });

    console.log(`[bus-routes] Returning ${routes.length} Stinger routes`);
    const result = { routes };
    cache = { data: result, timestamp: Date.now() };
    return Response.json(result);
  } catch (err) {
    console.error('[bus-routes] Error:', err);
    return Response.json({ routes: [] });
  }
}
