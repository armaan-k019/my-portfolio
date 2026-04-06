import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

const client = new Anthropic();

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { projectInfo, materials, totalCarbon, perM2, benchmarkRating } = body;

    const materialList = (materials as { name: string; quantity: number; unit: string; intensity: number; total: number }[])
      .filter(m => m.quantity > 0)
      .map(m => `  • ${m.name}: ${m.quantity} ${m.unit} → ${m.total.toFixed(0)} kgCO₂e (${m.intensity} kgCO₂e/${m.unit})`)
      .join("\n");

    const prompt = `Building: ${projectInfo.name || "Unnamed project"}
Type: ${projectInfo.buildingType}
Gross Floor Area: ${projectInfo.gfa ? `${projectInfo.gfa} m²` : "not specified"}
Storeys: ${projectInfo.storeys || "not specified"}
Location: ${projectInfo.location || "not specified"}

Material Schedule:
${materialList || "  (no quantities entered)"}

Total Embodied Carbon: ${totalCarbon.toFixed(0)} kgCO₂e
${perM2 !== null ? `Carbon per m²: ${perM2.toFixed(0)} kgCO₂e/m²` : ""}
Benchmark Rating: ${benchmarkRating || "not available"}`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `You are an embodied carbon consultant specializing in early-stage architectural design. Given a building's material schedule and carbon data, provide expert recommendations for reducing embodied carbon while maintaining structural and functional performance.

Write a report with these sections:
1. Executive Summary (2-3 sentences, overall carbon performance assessment)
2. Key Findings (3-4 bullet points about the highest-impact materials)
3. Priority Substitutions (ranked list of material swaps with estimated savings — be specific about percentages and absolute kgCO2e savings)
4. Design Strategy (2-3 sentences on broader structural/material strategy for this building type)
5. Industry Context (1-2 sentences comparing to regulatory targets — reference RIBA 2030 Climate Challenge and LETI targets)

Be concise within each section — 2-3 sentences maximum per section. Never truncate mid-sentence. Complete all 5 sections within 350 words total. Be specific, practical, and quantitative. Reference the actual materials the architect has input. Use plain text with section headings marked as "## Heading". Use **bold** for material names and key figures.`,
      messages: [{ role: "user", content: prompt }],
    });

    const block = msg.content.find(b => b.type === "text");
    const report = block?.type === "text" ? block.text : "";
    return Response.json({ report });
  } catch (err) {
    console.error("[carbon-analysis] error:", err);
    return Response.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
