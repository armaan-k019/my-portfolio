import type { PageSide } from "./paginate";

// Draws page sides and covers onto 2D canvases, which the book scene uploads
// as textures. Browser only.

export const PAPER = "#F5EFE3";
const INK = "#16241A";
const GREEN = "#2D5A27";
const TAN = "#D4A96A";
const CLOTH = "#1C3A1B";
const MUTED = "#6E7D68";

export interface Fonts {
  display: string;
  mono: string;
  sans: string;
}

// The next/font families, read from the CSS variables the root layout sets.
export function readFonts(): Fonts {
  const css = getComputedStyle(document.documentElement);
  const read = (v: string, fallback: string) => css.getPropertyValue(v).trim() || fallback;
  return {
    display: read("--font-fraunces", "Georgia, serif"),
    mono: read("--font-plex-mono", "ui-monospace, monospace"),
    sans: read("--font-inter", "system-ui, sans-serif"),
  };
}

// Canvas text does not trigger a font download on its own, so load each face
// first. Only the first family of each stack is loaded: next/font's local()
// "Fallback" face can fail on machines without Arial, and that failure would
// otherwise reject the load before the real face arrives.
export async function loadFonts(f: Fonts): Promise<void> {
  const first = (stack: string) => stack.split(",")[0].trim();
  const faces = [`600 64px ${first(f.display)}`, `400 64px ${first(f.display)}`, `500 20px ${first(f.mono)}`, `400 24px ${first(f.sans)}`];
  await Promise.all(faces.map((face) => document.fonts.load(face, "Aa").catch(() => [])));
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return [c, ctx];
}

// A small deterministic generator so a page's grain is the same on every draw.
function rng(seed: number) {
  let s = seed * 2654435761 >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, color: string, count: number) {
  const r = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) ctx.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
}

function paper(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, seed, "rgba(90, 70, 40, 0.035)", 5000);
}

// Shade toward the binding, and a faint fall off at the outer edge.
function gutter(ctx: CanvasRenderingContext2D, w: number, h: number, spineOnLeft: boolean) {
  const g = ctx.createLinearGradient(spineOnLeft ? 0 : w, 0, spineOnLeft ? w * 0.12 : w * 0.88, 0);
  g.addColorStop(0, "rgba(60, 45, 20, 0.22)");
  g.addColorStop(0.35, "rgba(60, 45, 20, 0.07)");
  g.addColorStop(1, "rgba(60, 45, 20, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const e = ctx.createLinearGradient(spineOnLeft ? w : 0, 0, spineOnLeft ? w * 0.97 : w * 0.03, 0);
  e.addColorStop(0, "rgba(60, 45, 20, 0.08)");
  e.addColorStop(1, "rgba(60, 45, 20, 0)");
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineH;
}

function drawingGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function cropMarks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number) {
  ctx.strokeStyle = "rgba(22, 36, 26, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
    ctx.moveTo(cx + dx * 8, cy); ctx.lineTo(cx + dx * (8 + len), cy);
    ctx.moveTo(cx, cy + dy * 8); ctx.lineTo(cx, cy + dy * (8 + len));
  }
  ctx.stroke();
}

function folio(ctx: CanvasRenderingContext2D, side: PageSide, w: number, h: number, f: Fonts) {
  const right = side.number % 2 === 1;
  const s = w / 1024;
  ctx.fillStyle = MUTED;
  ctx.font = `500 ${18 * s}px ${f.mono}`;
  ctx.textAlign = right ? "right" : "left";
  ctx.fillText(String(side.number).padStart(2, "0"), right ? w - 64 * s : 64 * s, h - 52 * s);
  ctx.textAlign = "left";
}

function placeholder(ctx: CanvasRenderingContext2D, side: Extract<PageSide, { kind: "placeholder" }>, w: number, h: number, f: Fonts) {
  const s = w / 1024;
  // A spread is drawn once across a double width sheet, and each half shows its own part.
  const vw = side.half ? w * 2 : w;
  ctx.save();
  if (side.half === "right") ctx.translate(-w, 0);
  drawingGrid(ctx, vw, h, 32 * s, "rgba(45, 90, 39, 0.07)");
  const m = 96 * s;
  const x0 = m, y0 = m * 1.4, x1 = vw - m, y1 = h - m * 1.4;
  ctx.setLineDash([10 * s, 8 * s]);
  ctx.strokeStyle = "rgba(45, 90, 39, 0.45)";
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.setLineDash([]);
  cropMarks(ctx, x0, y0, x1 - x0, y1 - y0, 22 * s);
  // A drafted cross through the empty frame, the convention for "to be placed".
  ctx.strokeStyle = "rgba(45, 90, 39, 0.12)";
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.moveTo(x1, y0); ctx.lineTo(x0, y1);
  ctx.stroke();

  const tx = x0 + 56 * s;
  const ty = y1 - 64 * s;
  ctx.fillStyle = PAPER;
  ctx.fillRect(tx - 16 * s, ty - 150 * s, Math.min(620 * s, x1 - tx - 40 * s), 190 * s);
  ctx.fillStyle = "#9A7438";
  ctx.font = `500 ${17 * s}px ${f.mono}`;
  ctx.fillText(side.half ? "PLACEHOLDER  /  FULL SPREAD" : "PLACEHOLDER", tx, ty - 104 * s);
  ctx.fillStyle = INK;
  ctx.font = `600 ${58 * s}px ${f.display}`;
  ctx.fillText(side.title, tx, ty - 40 * s);
  if (side.note) {
    ctx.fillStyle = MUTED;
    ctx.font = `400 ${24 * s}px ${f.sans}`;
    ctx.fillText(side.note, tx, ty + 4 * s);
  }
  ctx.restore();
}

function textPage(ctx: CanvasRenderingContext2D, side: Extract<PageSide, { kind: "text" }>, w: number, h: number, f: Fonts) {
  const s = w / 1024;
  const x = 120 * s;
  let y = h * 0.34;
  if (side.eyebrow) {
    ctx.fillStyle = GREEN;
    ctx.font = `500 ${18 * s}px ${f.mono}`;
    ctx.fillText(side.eyebrow.toUpperCase().split("").join(String.fromCharCode(8202)), x, y);
    y += 96 * s;
  }
  ctx.fillStyle = INK;
  ctx.font = `600 ${104 * s}px ${f.display}`;
  ctx.fillText(side.title, x, y);
  y += 56 * s;
  ctx.fillStyle = GREEN;
  ctx.fillRect(x, y, 44 * s, 2 * s);
  ctx.fillStyle = "rgba(45, 90, 39, 0.14)";
  ctx.fillRect(x + 44 * s, y, w - x * 2 - 44 * s, 2 * s);
  y += 80 * s;
  ctx.fillStyle = "#3D5A3D";
  ctx.font = `400 ${29 * s}px ${f.sans}`;
  wrap(ctx, side.body, x, y, w - x * 2, 46 * s);
}

function contents(ctx: CanvasRenderingContext2D, side: Extract<PageSide, { kind: "contents" }>, w: number, h: number, f: Fonts) {
  const s = w / 1024;
  const x = 120 * s;
  let y = 220 * s;
  ctx.fillStyle = GREEN;
  ctx.font = `500 ${18 * s}px ${f.mono}`;
  ctx.fillText("CONTENTS", x, y);
  y += 110 * s;
  for (const item of side.items) {
    if (y > h - 160 * s) break;
    ctx.fillStyle = INK;
    ctx.font = `400 ${36 * s}px ${f.display}`;
    ctx.fillText(item.title, x, y);
    const tw = ctx.measureText(item.title).width;
    ctx.font = `500 ${20 * s}px ${f.mono}`;
    const num = String(item.page).padStart(2, "0");
    const nw = ctx.measureText(num).width;
    ctx.fillStyle = GREEN;
    ctx.fillText(num, w - x - nw, y);
    ctx.fillStyle = "rgba(45, 90, 39, 0.35)";
    for (let dx = x + tw + 20 * s; dx < w - x - nw - 20 * s; dx += 14 * s) ctx.fillRect(dx, y - 6 * s, 3 * s, 3 * s);
    y += 74 * s;
  }
}

function imageInto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, side: Extract<PageSide, { kind: "image" }>, w: number, h: number) {
  const vw = side.half ? w * 2 : w;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const pad = side.fit === "contain" ? w * 0.08 : 0;
  const bw = vw - pad * 2, bh = h - pad * 2;
  const scale = side.fit === "cover" ? Math.max(bw / iw, bh / ih) : Math.min(bw / iw, bh / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.drawImage(img, (side.half === "right" ? -w : 0) + (vw - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
}

// Draws one page side. Images arrive later, so `onUpdate` fires when the
// canvas changes after it is returned.
export function drawSide(side: PageSide, w: number, h: number, f: Fonts, onUpdate: () => void): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  const spineOnLeft = side.number % 2 === 1;
  const finish = () => {
    if (side.kind !== "blank") folio(ctx, side, w, h, f);
    gutter(ctx, w, h, spineOnLeft);
  };
  paper(ctx, w, h, side.number);

  switch (side.kind) {
    case "placeholder": placeholder(ctx, side, w, h, f); break;
    case "text": textPage(ctx, side, w, h, f); break;
    case "contents": contents(ctx, side, w, h, f); break;
    case "image": {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        paper(ctx, w, h, side.number);
        imageInto(ctx, img, side, w, h);
        finish();
        onUpdate();
      };
      img.onerror = () => {
        ctx.fillStyle = "#A4332F";
        ctx.font = `500 ${18 * (w / 1024)}px ${f.mono}`;
        ctx.fillText(`Image did not load: ${side.src}`, 80 * (w / 1024), h / 2);
        onUpdate();
      };
      img.src = side.src;
      break;
    }
    case "blank": break;
  }
  finish();
  return c;
}

function cloth(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = CLOTH;
  ctx.fillRect(0, 0, w, h);
  // A woven bookcloth: fine crossing threads and a little irregularity.
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 3) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  ctx.stroke();
  ctx.strokeStyle = "#9FC09A";
  ctx.beginPath();
  for (let y = 0; y < h; y += 3) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  grain(ctx, w, h, 7, "rgba(0, 0, 0, 0.12)", 9000);
  grain(ctx, w, h, 11, "rgba(200, 220, 190, 0.05)", 6000);
}

function foil(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = TAN;
  ctx.strokeStyle = TAN;
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 1;
}

// Stamps an alpha mask image (the signature) in foil, centered on (cx, cy),
// once it loads. `onUpdate` fires after the canvas changes.
function stampLogo(ctx: CanvasRenderingContext2D, src: string, cx: number, cy: number, width: number, onUpdate: () => void) {
  const img = new Image();
  img.onload = () => {
    const w = width, h = width * (img.naturalHeight / img.naturalWidth);
    const [tint, t] = makeCanvas(Math.ceil(w), Math.ceil(h));
    t.drawImage(img, 0, 0, w, h);
    t.globalCompositeOperation = "source-in";
    t.fillStyle = TAN;
    t.fillRect(0, 0, w, h);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 1;
    ctx.drawImage(tint, cx - w / 2, cy - h / 2);
    ctx.restore();
    onUpdate();
  };
  img.src = src;
}

export function drawFrontCover(w: number, h: number, cover: { title: string; subtitle: string; logo: string }, f: Fonts, onUpdate: () => void): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  const s = w / 1024;
  cloth(ctx, w, h);
  // The hinge groove a few millimeters in from the spine.
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(34 * s, 0, 5 * s, h);
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(40 * s, 0, 3 * s, h);

  foil(ctx);
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(110 * s, 110 * s, w - 190 * s, h - 220 * s);
  ctx.lineWidth = 1 * s;
  ctx.strokeRect(124 * s, 124 * s, w - 218 * s, h - 248 * s);

  const cx = 110 * s + (w - 190 * s) / 2;
  ctx.textAlign = "center";
  ctx.font = `600 ${92 * s}px ${f.display}`;
  ctx.fillText(cover.title, cx, h * 0.56);
  ctx.fillRect(cx - 30 * s, h * 0.6, 60 * s, 2 * s);
  ctx.font = `500 ${21 * s}px ${f.mono}`;
  ctx.fillText(cover.subtitle.toUpperCase().split("").join(" "), cx, h * 0.65);
  ctx.textAlign = "left";
  ctx.shadowColor = "transparent";
  stampLogo(ctx, cover.logo, cx, h * 0.37, 400 * s, onUpdate);
  return c;
}

export function drawBackCover(w: number, h: number, cover: { logo: string }, onUpdate: () => void): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  const s = w / 1024;
  cloth(ctx, w, h);
  ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
  ctx.fillRect(w - 39 * s, 0, 5 * s, h);
  stampLogo(ctx, cover.logo, w / 2, h * 0.86, 170 * s, onUpdate);
  return c;
}

// The pasted down endpaper inside each cover: tan stock with a fine drafting grid.
export function drawEndpaper(w: number, h: number, spineOnLeft: boolean): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  ctx.fillStyle = "#E4D3B0";
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 3, "rgba(90, 60, 20, 0.05)", 6000);
  drawingGrid(ctx, w, h, w / 32, "rgba(45, 90, 39, 0.10)");
  drawingGrid(ctx, w, h, w / 8, "rgba(45, 90, 39, 0.16)");
  gutter(ctx, w, h, spineOnLeft);
  return c;
}

export function drawCloth(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  cloth(ctx, w, h);
  return c;
}

// The soft contact shadow the book casts on the desk.
export function drawShadow(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  g.addColorStop(0.6, "rgba(0, 0, 0, 0.25)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}
