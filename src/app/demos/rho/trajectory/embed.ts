// Prompt 6, Part B: client-side sentence embeddings via Transformers.js.
//
// Loads Xenova/all-MiniLM-L6-v2 from a CDN at runtime, no API key, no npm
// dependency, no server. The model is fetched lazily on first use (a few MB)
// and cached in the browser, so only the first live scoring waits on it. The
// authored example pool ships with precomputed positions, so first paint never
// touches this module.

let pipePromise: Promise<unknown> | null = null;
let ready = false;

export function embedderReady(): boolean {
  return ready;
}

// We import the CDN module through new Function so no bundler (webpack or
// turbopack) tries to resolve the remote URL at build time.
const dynamicImport: (url: string) => Promise<Record<string, unknown>> =
  new Function("u", "return import(u)") as (url: string) => Promise<Record<string, unknown>>;

const CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

async function getPipeline(): Promise<(text: string, opts: object) => Promise<{ data: Float32Array }>> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const mod = await dynamicImport(CDN);
      const env = mod.env as { allowLocalModels: boolean; useBrowserCache: boolean };
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      const pipeline = mod.pipeline as (task: string, model: string) => Promise<unknown>;
      const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
      ready = true;
      return pipe;
    })();
  }
  return pipePromise as Promise<(text: string, opts: object) => Promise<{ data: Float32Array }>>;
}

// Embed each text into a unit-normalized vector (mean pooling + normalize).
export async function embedMany(texts: string[]): Promise<number[][]> {
  const pipe = await getPipeline();
  const out: number[][] = [];
  for (const t of texts) {
    const res = await pipe(t, { pooling: "mean", normalize: true });
    out.push(Array.from(res.data));
  }
  return out;
}

// Cosine similarity. Vectors are already unit-normalized, so this is the dot
// product.
export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
