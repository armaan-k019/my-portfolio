import { NextResponse } from "next/server";

export const maxDuration = 30;

function intensityLabel(score: number): string {
  if (score < 2) return "Minimal";
  if (score < 4) return "Low";
  if (score < 6) return "Moderate";
  if (score < 8) return "High";
  return "Severe";
}

function recommendation(score: number): string {
  if (score < 2)
    return "Minimal heat island effect. Standard passive cooling strategies are sufficient for this site context.";
  if (score < 4)
    return "Consider cool roofs and light-colored paving materials to offset mild urban heat accumulation.";
  if (score < 6)
    return "Design should prioritize shading, vegetated surfaces, and cross-ventilation to mitigate moderate heat island conditions.";
  if (score < 8)
    return "High heat island intensity calls for green roofs, urban tree canopy integration, reflective surfaces, and comprehensive shading of all hardscape areas.";
  return "Severe heat island conditions require a comprehensive passive cooling strategy: extensive green roofs, tree canopy, high-albedo materials, and evaporative features are strongly recommended.";
}

interface OpenMeteoResponse {
  hourly?: { surface_temperature?: number[] };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const parksCount = parseInt(searchParams.get("parksCount") ?? "0", 10);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // Rural reference ~5 miles northwest
  const refLat = lat + 0.07;
  const refLng = lng - 0.07;

  const locUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=surface_temperature&forecast_days=1`;
  const refUrl = `https://api.open-meteo.com/v1/forecast?latitude=${refLat}&longitude=${refLng}&hourly=surface_temperature&forecast_days=1`;

  try {
    const [locRes, refRes] = await Promise.allSettled([
      fetch(locUrl, { signal: AbortSignal.timeout(10000) }),
      fetch(refUrl, { signal: AbortSignal.timeout(10000) }),
    ]);

    let currentTempC = 20;
    let referenceTempC = 18;

    if (locRes.status === "fulfilled" && locRes.value.ok) {
      const data = await locRes.value.json() as OpenMeteoResponse;
      const temps = data.hourly?.surface_temperature ?? [];
      // Prefer midday (hour 12), fall back to first available
      currentTempC = temps[12] ?? temps[0] ?? 20;
    }

    if (refRes.status === "fulfilled" && refRes.value.ok) {
      const data = await refRes.value.json() as OpenMeteoResponse;
      const temps = data.hourly?.surface_temperature ?? [];
      referenceTempC = temps[12] ?? temps[0] ?? currentTempC - 2;
    }

    const deltaC = Math.max(0, currentTempC - referenceTempC);

    // Green space estimate from parks count (0 parks → ~0%, 20+ parks → ~30%)
    const greenSpacePct = Math.min(35, parksCount * 1.5);

    // Score 0–10: temp delta contributes up to 6, inverse green space up to 4
    const tempScore = Math.min(6, deltaC * 0.6);
    const greenScore = (1 - greenSpacePct / 100) * 4;
    const rawScore = tempScore + greenScore;
    const intensityScore = Math.round(Math.min(10, Math.max(0, rawScore)) * 10) / 10;

    return NextResponse.json({
      currentTempC: Math.round(currentTempC * 10) / 10,
      referenceTempC: Math.round(referenceTempC * 10) / 10,
      deltaC: Math.round(deltaC * 10) / 10,
      intensityScore,
      intensityLabel: intensityLabel(intensityScore),
      greenSpacePct: Math.round(greenSpacePct),
      recommendation: recommendation(intensityScore),
    });
  } catch (err) {
    console.error("heat-island error:", err);
    return NextResponse.json({ error: "Failed to fetch heat island data" }, { status: 500 });
  }
}
