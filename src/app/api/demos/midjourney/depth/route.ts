export const maxDuration = 120;

import { HfInference } from "@huggingface/inference";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { imageUrl?: string };
    const { imageUrl } = body;

    if (!imageUrl?.trim()) {
      return Response.json({ error: "No image URL provided." }, { status: 400 });
    }

    // Fetch the image server-side
    const imageRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; portfolio-demo)" },
    });

    if (!imageRes.ok) {
      return Response.json(
        { error: `Failed to fetch image: HTTP ${imageRes.status}` },
        { status: 400 }
      );
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const imageContentType = imageRes.headers.get("content-type") ?? "image/jpeg";
    const originalImageDataUrl = `data:${imageContentType};base64,${Buffer.from(imageBuffer).toString("base64")}`;

    const hfKey = process.env.HUGGINGFACE_API_KEY ?? "";
    if (!hfKey) {
      return Response.json({ error: "Hugging Face API key not configured." }, { status: 500 });
    }

    const hf = new HfInference(hfKey);

    const imageBlob = new Blob([imageBuffer], { type: imageContentType });

    let depthBlob: Blob;
    try {
      depthBlob = await hf.imageToImage({
        model: "Xenova/depth-anything-small-hf",
        inputs: imageBlob,
      });
    } catch (err: unknown) {
      const msg = String(err);
      const isLoading = msg.includes("503") || msg.toLowerCase().includes("loading");
      console.error("[midjourney/depth] HF call failed:", err);
      if (isLoading) {
        return Response.json(
          { error: "Depth model is loading, please try again in 10 seconds." },
          { status: 503 }
        );
      }
      return Response.json(
        { error: `HF error: ${msg}` },
        { status: 500 }
      );
    }

    const depthBuffer = await depthBlob.arrayBuffer();
    const depthContentType = depthBlob.type || "image/png";
    const depthMapDataUrl = `data:${depthContentType};base64,${Buffer.from(depthBuffer).toString("base64")}`;

    return Response.json({ depthMap: depthMapDataUrl, originalImage: originalImageDataUrl });
  } catch (err) {
    console.error("[midjourney/depth] unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Depth estimation failed: ${msg}` }, { status: 500 });
  }
}
