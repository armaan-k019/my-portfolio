import type { Bus } from "../pulse/route";

export async function GET(): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      'https://passiogo.com/mapGetData.php?getVehicles=1&systemId=109',
      { signal: controller.signal, next: { revalidate: 0 } }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[buses] Passio GO failed: ${res.status} - ${body.slice(0, 200)}`);
      return Response.json({ buses: [], error: `Upstream ${res.status}` });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let vehicleList: any[] = [];
    if (Array.isArray(data?.vehicles)) vehicleList = data.vehicles;
    else if (data?.vehicles && typeof data.vehicles === 'object') vehicleList = Object.values(data.vehicles);
    else if (Array.isArray(data)) vehicleList = data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buses: Bus[] = vehicleList.map((v: any): Bus => ({
      id:        String(v.id ?? v.vehicleId ?? Math.random()),
      lat:       Number(v.latitude  ?? v.lat ?? 0),
      lng:       Number(v.longitude ?? v.lng ?? 0),
      routeId:   String(v.routeId ?? v.route_id ?? ''),
      routeName: String(v.routeName ?? v.route_name ?? v.name ?? 'Stinger'),
      heading:   Number(v.heading ?? v.course ?? 0),
    })).filter((b: Bus) => b.lat !== 0 && b.lng !== 0);

    return Response.json({ buses });
  } catch (err) {
    clearTimeout(timeout);
    console.error('[buses] Error:', err);
    return Response.json({ buses: [], error: 'Fetch failed' });
  }
}
