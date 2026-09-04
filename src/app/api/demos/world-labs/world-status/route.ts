export const maxDuration = 15;

import type { OperationStatus } from "@/app/demos/world-labs/types";

const API_KEY = process.env.WORLDLABS_API_KEY;
const MARBLE_BASE = "https://api.worldlabs.ai/marble/v1";

interface MarbleOperation {
  operation_id: string;
  done: boolean;
  error: { code?: string; message?: string } | null;
  metadata: { progress?: { status?: string; description?: string }; world_id?: string } | null;
  response: {
    id?: string;
    world_marble_url?: string;
    assets?: { thumbnail_url?: string };
  } | null;
}

export async function GET(request: Request) {
  const op = new URL(request.url).searchParams.get("op") ?? "";
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(op)) {
    return Response.json({ error: "Missing or malformed operation id." }, { status: 400 });
  }
  if (!API_KEY) {
    return Response.json({ error: "Marble is not configured on this deployment." }, { status: 502 });
  }
  try {
    const res = await fetch(`${MARBLE_BASE}/operations/${op}`, {
      headers: { "WLT-Api-Key": API_KEY },
      cache: "no-store",
    });
    if (res.status === 404) return Response.json({ error: "That world generation was not found. It may have expired." }, { status: 404 });
    if (res.status === 401) return Response.json({ error: "Marble rejected the API key." }, { status: 502 });
    if (!res.ok) return Response.json({ error: `Marble returned ${res.status}.` }, { status: 502 });

    const o = (await res.json()) as MarbleOperation;
    const rawStatus = o.metadata?.progress?.status ?? (o.done ? (o.error ? "FAILED" : "SUCCEEDED") : "PENDING");
    const status: OperationStatus["status"] =
      rawStatus === "SUCCEEDED" || rawStatus === "FAILED" || rawStatus === "IN_PROGRESS" ? rawStatus : "PENDING";

    const worldId = o.response?.id ?? o.metadata?.world_id ?? null;
    const out: OperationStatus = {
      operation_id: o.operation_id,
      done: !!o.done,
      status: o.done && o.error ? "FAILED" : status,
      description: o.metadata?.progress?.description ?? null,
      error: o.error ? (o.error.message ?? o.error.code ?? "Generation failed.") : null,
      world:
        o.done && !o.error && worldId
          ? {
              world_id: worldId,
              marble_url: o.response?.world_marble_url ?? `https://marble.worldlabs.ai/world/${worldId}`,
              thumbnail_url: o.response?.assets?.thumbnail_url ?? null,
              created_at: new Date().toISOString(),
            }
          : null,
    };
    return Response.json(out);
  } catch (err) {
    console.error("world-status:", err);
    return Response.json({ error: "Could not reach Marble." }, { status: 502 });
  }
}
