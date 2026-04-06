import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 30;

function inferZoneType(
  code: string
): "residential" | "commercial" | "industrial" | "mixed" | "agricultural" | "institutional" | "unknown" {
  const c = code.toUpperCase();
  if (c.startsWith("R") && !c.startsWith("RE") && !c.includes("RESEARCH")) return "residential";
  if (c.includes("RES")) return "residential";
  if (c.startsWith("C") || c.includes("COM") || c.startsWith("B") || c.startsWith("NC") || c.startsWith("NB"))
    return "commercial";
  if (c.startsWith("I") || c.includes("IND") || c.startsWith("LI") || c.startsWith("HI")) return "industrial";
  if (c.startsWith("M") || c.includes("MU") || c.includes("MX") || c.includes("MIXED")) return "mixed";
  if (c.includes("AG") || c.includes("FARM") || c.startsWith("A-")) return "agricultural";
  if (c.includes("INST") || c.includes("PF") || c.startsWith("P-") || c.startsWith("CF")) return "institutional";
  return "unknown";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const apiKey = process.env.ZONEOMICS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      zoneCode: "N/A",
      zoneName: "Zoning data unavailable",
      zoneType: "unknown",
      permittedUses: [],
      developmentStandards: {
        maxHeightFt: null,
        maxHeightStories: null,
        minLotSqFt: null,
        maxFAR: null,
        minSetbackFrontFt: null,
        minSetbackSideFt: null,
        minSetbackRearFt: null,
        minParkingSpaces: null,
        maxLotCoverage: null,
      },
      municipality: "",
      aiSummary: "",
      aiDesignNote: "",
      sourceUrl: null,
      error: "Add ZONEOMICS_API_KEY to enable zoning data.",
    });
  }

  try {
    const zoningUrl = `https://zoneomics.com/api/v2/zoning?lat=${lat}&lng=${lng}&apikey=${apiKey}`;
    const zoningRes = await fetch(zoningUrl, { signal: AbortSignal.timeout(10000) });

    if (!zoningRes.ok) {
      throw new Error(`Zoneomics returned ${zoningRes.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await zoningRes.json() as Record<string, any>;

    const zoneCode: string = raw.zone_code ?? raw.zoning_code ?? raw.zone ?? "Unknown";
    const zoneName: string = raw.zone_name ?? raw.zoning_description ?? raw.description ?? zoneCode;
    const municipality: string = raw.city ?? raw.municipality ?? raw.jurisdiction ?? "";
    const permittedUses: string[] = raw.permitted_uses ?? raw.uses ?? [];
    const sourceUrl: string | null = raw.source_url ?? raw.url ?? null;

    const ds = raw.development_standards ?? raw.standards ?? {};
    const developmentStandards = {
      maxHeightFt: ds.max_height_ft ?? ds.height_ft ?? null,
      maxHeightStories: ds.max_stories ?? ds.stories ?? null,
      minLotSqFt: ds.min_lot_size ?? ds.lot_size_sqft ?? null,
      maxFAR: ds.max_far ?? ds.far ?? null,
      minSetbackFrontFt: ds.front_setback ?? ds.setback_front ?? null,
      minSetbackSideFt: ds.side_setback ?? ds.setback_side ?? null,
      minSetbackRearFt: ds.rear_setback ?? ds.setback_rear ?? null,
      minParkingSpaces: ds.parking ?? ds.parking_spaces ?? null,
      maxLotCoverage: ds.max_lot_coverage ?? ds.lot_coverage ?? null,
    };

    const zoneType = inferZoneType(zoneCode);

    // Claude AI analysis
    let aiSummary = "";
    let aiDesignNote = "";
    try {
      const client = new Anthropic();
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Zoning data for an architectural site analysis tool:
Zone: ${zoneCode} (${zoneName})
Type: ${zoneType}
Municipality: ${municipality}
Permitted uses: ${permittedUses.slice(0, 10).join(", ")}
Max height: ${developmentStandards.maxHeightFt ? developmentStandards.maxHeightFt + " ft" : "unknown"}
FAR: ${developmentStandards.maxFAR ?? "unknown"}
Front setback: ${developmentStandards.minSetbackFrontFt != null ? developmentStandards.minSetbackFrontFt + " ft" : "unknown"}

Return ONLY raw JSON with no markdown fences:
{"aiSummary":"2-sentence plain English permitted use summary and key restrictions","aiDesignNote":"1-2 sentence design implication for architects"}`,
          },
        ],
      });
      const text = (msg.content[0] as { type: string; text: string }).text.trim();
      const start = text.indexOf("{");
      const parsed = JSON.parse(start >= 0 ? text.slice(start) : text) as { aiSummary: string; aiDesignNote: string };
      aiSummary = parsed.aiSummary ?? "";
      aiDesignNote = parsed.aiDesignNote ?? "";
    } catch {
      aiSummary = `${zoneCode} — ${zoneName}.${permittedUses.length > 0 ? ` Permitted uses include ${permittedUses.slice(0, 3).join(", ")}.` : ""}`;
      aiDesignNote = "";
    }

    return NextResponse.json({
      zoneCode,
      zoneName,
      zoneType,
      permittedUses,
      developmentStandards,
      municipality,
      aiSummary,
      aiDesignNote,
      sourceUrl,
    });
  } catch (err) {
    console.error("zoning error:", err);
    return NextResponse.json({ error: "Failed to fetch zoning data" }, { status: 500 });
  }
}
