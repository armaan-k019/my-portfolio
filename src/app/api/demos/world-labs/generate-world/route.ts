export const maxDuration = 30;

// Starts a Marble world generation from an already extracted marble_prompt and
// returns the operation id. The client polls /world-status with it. Generation
// takes 5 to 10 minutes; nothing here waits on it.

const API_KEY = process.env.WORLDLABS_API_KEY;
const MARBLE_BASE = "https://api.worldlabs.ai/marble/v1";
const DEFAULT_MODEL = "marble-1.0-draft";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { prompt?: string; display_name?: string; model?: string };
    const prompt = body.prompt?.trim() ?? "";
    if (prompt.length < 20) {
      return Response.json({ error: "No scene description to send to Marble." }, { status: 400 });
    }
    if (!API_KEY) {
      return Response.json(
        { error: "Marble world generation is not configured on this deployment. The interpretation is still visible above." },
        { status: 502 }
      );
    }
    const model = body.model === "marble-1.1" ? "marble-1.1" : DEFAULT_MODEL;

    const res = await fetch(`${MARBLE_BASE}/worlds:generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "WLT-Api-Key": API_KEY },
      body: JSON.stringify({
        display_name: (body.display_name ?? "Ekphrasis").slice(0, 80),
        model,
        world_prompt: { type: "text", text_prompt: prompt.slice(0, 2000) },
      }),
    });

    if (res.status === 401) {
      return Response.json({ error: "Marble rejected the API key. World generation is unavailable until it is fixed." }, { status: 502 });
    }
    if (res.status === 402) {
      return Response.json({ error: "The Marble account is out of API credits." }, { status: 502 });
    }
    if (res.status === 429) {
      return Response.json({ error: "Marble is rate limiting right now. Try again in a minute." }, { status: 503 });
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("generate-world:", res.status, detail.slice(0, 300));
      return Response.json({ error: "Marble could not start the world. Try again." }, { status: 502 });
    }

    const data = (await res.json()) as { operation_id?: string };
    if (!data.operation_id) {
      return Response.json({ error: "Marble did not return an operation id." }, { status: 502 });
    }
    return Response.json({ operation_id: data.operation_id, model });
  } catch (err) {
    console.error("generate-world:", err);
    return Response.json({ error: "Something went wrong starting the world." }, { status: 500 });
  }
}
