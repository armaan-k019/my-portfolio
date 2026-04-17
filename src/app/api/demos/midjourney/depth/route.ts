export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { imageUrl?: string };
    const { imageUrl } = body;

    if (!imageUrl?.trim()) {
      return Response.json({ error: "No image URL provided." }, { status: 400 });
    }

    const hfKey = process.env.HUGGINGFACE_API_KEY ?? "";
    if (!hfKey) {
      return Response.json({ error: "Hugging Face API key not configured." }, { status: 500 });
    }

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

    const response = await fetch(
      "https://api-inference.huggingface.co/models/depth-anything/Depth-Anything-V2-Small-hf",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfKey}`,
          "Content-Type": "application/octet-stream",
        },
        body: imageBuffer,
      }
    );

    if (response.status === 503) {
      return Response.json(
        { error: "Model loading, please retry in 10 seconds" },
        { status: 503 }
      );
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("[midjourney/depth] HF error:", response.status, text);
      return Response.json({ error: `HF error: ${text}` }, { status: 500 });
    }

    const depthBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(depthBuffer).toString("base64");
    const depthMapDataUrl = `data:image/png;base64,${base64}`;

    return Response.json({ depthMap: depthMapDataUrl, originalImage: originalImageDataUrl });
  } catch (err) {
    console.error("[midjourney/depth] unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Depth estimation failed: ${msg}` }, { status: 500 });
  }
}
