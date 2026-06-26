// Prompt 6, Part B: OPTIONAL O*NET enrichment for the slope signal.
//
// Given a role title, this looks up the closest O*NET occupation and its Job
// Zone (1 to 5), real US Department of Labor data, to refine the deterministic
// seniority signal. O*NET Web Services data is free and CC-BY licensed, but it
// requires a registered account; the credential is read server-side only from
// process.env.ONET_API_KEY. If the key or a match is absent, this returns a
// null zone and the client silently uses the deterministic slope alone.
//
// Production note: for the authored demo spine the zone lookups would be
// bundled rather than called live, so the demo never depends on this service.

export const maxDuration = 15;

interface OnetBody {
  title?: string;
}

export async function POST(request: Request) {
  let title = "";
  try {
    const body = (await request.json()) as OnetBody;
    title = (body.title ?? "").trim();
  } catch {
    return Response.json({ zone: null });
  }

  const key = process.env.ONET_API_KEY;
  if (!key || !title) return Response.json({ zone: null, occupation: null });

  // O*NET Web Services uses HTTP Basic auth. Accept either "user:pass" or a
  // value already usable as the Authorization credential.
  const credential = key.includes(":") ? Buffer.from(key).toString("base64") : key;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const url = `https://services.onetcenter.org/ws/online/search?keyword=${encodeURIComponent(title)}&end=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credential}`, Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return Response.json({ zone: null, occupation: null });

    const data = (await res.json()) as { occupation?: Array<{ code?: string; title?: string }> };
    const top = data.occupation?.[0];
    if (!top?.code) return Response.json({ zone: null, occupation: null });

    // Fetch the Job Zone for the matched occupation.
    const zoneRes = await fetch(`https://services.onetcenter.org/ws/online/occupations/${top.code}/details/job_zone`, {
      headers: { Authorization: `Basic ${credential}`, Accept: "application/json" },
    });
    if (!zoneRes.ok) return Response.json({ zone: null, occupation: top.title ?? null });

    const zoneData = (await zoneRes.json()) as { value?: number };
    const zone = typeof zoneData.value === "number" ? zoneData.value : null;
    return Response.json({ zone, occupation: top.title ?? null });
  } catch {
    // Best effort only. Any failure means we fall back to the deterministic score.
    return Response.json({ zone: null, occupation: null });
  }
}
