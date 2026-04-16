export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { imageUrl?: string };
    const { imageUrl } = body;

    if (!imageUrl?.trim()) {
      return Response.json({ error: "No image URL provided." }, { status: 400 });
    }

    // Fetch the image server-side to avoid CORS and to pass to HuggingFace
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
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    const originalImageDataUrl = `data:${imageContentType};base64,${imageBase64}`;

    // Call Hugging Face depth estimation
    const hfKey = process.env.HUGGINGFACE_API_KEY ?? "";
    if (!hfKey) {
      return Response.json({ error: "Hugging Face API key not configured." }, { status: 500 });
    }

    const hfRes = await fetch(
      "https://router.huggingface.co/hf-inference/models/depth-anything/Depth-Anything-V2-Small-hf",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inputs: imageBase64 }),
      }
    );

    if (!hfRes.ok) {
      const errorText = await hfRes.text();
      if (hfRes.status === 503) {
        return Response.json(
          { error: "Depth model is loading, please try again in 10 seconds." },
          { status: 503 }
        );
      }
      return Response.json(
        { error: `Depth API error ${hfRes.status}: ${errorText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const depthBuffer = await hfRes.arrayBuffer();
    const depthContentType = hfRes.headers.get("content-type") ?? "image/png";
    const depthMapDataUrl = `data:${depthContentType};base64,${Buffer.from(depthBuffer).toString("base64")}`;

    return Response.json({ depthMap: depthMapDataUrl, originalImage: originalImageDataUrl });
  } catch (err) {
    console.error("[midjourney/depth] error:", err);
    return Response.json({ error: "Depth estimation failed. Please try again." }, { status: 500 });
  }
}
