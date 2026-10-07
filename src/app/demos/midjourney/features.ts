// Hand-built image features. Pure functions over an RGBA pixel buffer, so the
// same code runs on a canvas in the browser or on a decoded buffer in Node.
// No learned embeddings: every number here has a plain-language meaning.

export const FEATURES = [
  { key: "light", low: "dark", high: "light" },
  { key: "contrast", low: "soft contrast", high: "hard contrast" },
  { key: "chroma", low: "muted", high: "saturated" },
  { key: "warmth", low: "cool", high: "warm" },
  { key: "hues", low: "few hues", high: "many hues" },
  { key: "detail", low: "sparse", high: "busy" },
  { key: "symmetry", low: "asymmetric", high: "symmetric" },
  { key: "weight", low: "weight low", high: "weight high" },
] as const;

export const D = FEATURES.length;

// sRGB 0..255 to CIELAB (D65).
function srgbToLinear(c: number) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function labF(t: number) {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = labF(X);
  const fy = labF(Y);
  const fz = labF(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const HUE_BINS = 12;

// Raw (unnormalized) feature vector for one image.
export function extractFeatures(data: ArrayLike<number>, width: number, height: number): number[] {
  const n = width * height;
  const L = new Float32Array(n);
  let sumL = 0;
  let sumC = 0;
  let sumWarm = 0;
  const hueHist = new Float64Array(HUE_BINS);
  let chromatic = 0;

  for (let i = 0; i < n; i++) {
    const [l, a, b] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    L[i] = l;
    sumL += l;
    const c = Math.hypot(a, b);
    sumC += c;
    // Warmth: projection onto the orange (+a, +b) versus blue (-a, -b) axis.
    sumWarm += (a + b) / Math.SQRT2;
    if (c > 12) {
      const h = (Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI);
      hueHist[Math.floor((h / (2 * Math.PI)) * HUE_BINS) % HUE_BINS] += c;
      chromatic += c;
    }
  }

  const meanL = sumL / n;
  let varL = 0;
  for (let i = 0; i < n; i++) varL += (L[i] - meanL) ** 2;

  // Hue entropy in bits, over chroma-weighted hue bins.
  let hues = 0;
  if (chromatic > 0) {
    for (const v of hueHist) {
      if (v > 0) {
        const p = v / chromatic;
        hues -= p * Math.log2(p);
      }
    }
  }

  // Detail: mean Sobel gradient magnitude on lightness.
  // Weight: vertical centroid of that gradient energy (0 top, 1 bottom), flipped so high = top.
  let grad = 0;
  let gradY = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = (dy: number, dx: number) => L[(y + dy) * width + (x + dx)];
      const gx = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      const gy = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const g = Math.hypot(gx, gy);
      grad += g;
      gradY += g * (y / (height - 1));
    }
  }
  const inner = Math.max(1, (width - 2) * (height - 2));
  const weight = grad > 0 ? 1 - gradY / grad : 0.5;

  // Symmetry: 1 minus normalized mean absolute difference from the mirror image.
  let diff = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < Math.floor(width / 2); x++) {
      diff += Math.abs(L[y * width + x] - L[y * width + (width - 1 - x)]);
    }
  }
  const symmetry = 1 - diff / (Math.max(1, height * Math.floor(width / 2)) * 100);

  return [meanL, Math.sqrt(varL / n), sumC / n, sumWarm / n, hues, grad / inner, symmetry, weight];
}

// Z-score each column across the corpus so weights are comparable.
export function standardize(raw: number[][]): number[][] {
  const m = raw.length;
  const mean = new Array(D).fill(0);
  const sd = new Array(D).fill(0);
  for (const r of raw) r.forEach((v, k) => (mean[k] += v / m));
  for (const r of raw) r.forEach((v, k) => (sd[k] += (v - mean[k]) ** 2 / m));
  return raw.map((r) => r.map((v, k) => (sd[k] > 1e-9 ? (v - mean[k]) / Math.sqrt(sd[k]) : 0)));
}
