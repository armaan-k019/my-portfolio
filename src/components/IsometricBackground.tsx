"use client";

import { useEffect, useRef } from "react";

// ── 3D math helpers ──
type Vec3 = [number, number, number];
type Vec2 = [number, number];

function rotateY(p: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [p[0] * cos + p[2] * sin, p[1], -p[0] * sin + p[2] * cos];
}

function project(p: Vec3, cx: number, cy: number, scale: number): Vec2 {
  return [cx + p[0] * scale, cy + p[1] * scale - p[2] * scale * 0.35];
}

const LIGHT: Vec3 = [0.5, -0.7, 0.5];
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return normalize([
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]);
}

interface Face3D { verts: Vec3[] }
interface Form {
  faces: Face3D[];
  cx: number;
  cy: number;
  rotSpeed: number;
  rotOffset: number;
  baseScale: number;
}

// ── Form 1 (bottom-right): Twisted prism - unchanged ──
function twistedPrism(): Face3D[] {
  const faces: Face3D[] = [];
  const steps = 8;
  const h = 320;
  const w = 80;
  const d = 60;
  const totalTwist = Math.PI * 0.4;

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const y0 = -h / 2 + h * t0;
    const y1 = -h / 2 + h * t1;
    const a0 = totalTwist * t0;
    const a1 = totalTwist * t1;
    const cos0 = Math.cos(a0), sin0 = Math.sin(a0);
    const cos1 = Math.cos(a1), sin1 = Math.sin(a1);

    const corners = (cos: number, sin: number, y: number): Vec3[] => [
      [w * cos - d * sin, y, w * sin + d * cos],
      [-w * cos - d * sin, y, -w * sin + d * cos],
      [-w * cos + d * sin, y, -w * sin - d * cos],
      [w * cos + d * sin, y, w * sin - d * cos],
    ];
    const top = corners(cos0, sin0, y0);
    const bot = corners(cos1, sin1, y1);

    for (let j = 0; j < 4; j++) {
      const k = (j + 1) % 4;
      faces.push({ verts: [top[j], top[k], bot[k], bot[j]] });
    }
    if (i === 0) faces.push({ verts: [...top] });
    if (i === steps - 1) faces.push({ verts: [...bot].reverse() });
  }
  return faces;
}

// ── Form 2 (top-left): Parametric twisted ribbon / folded NURBS surface ──
// A thick Möbius-like ribbon approximated with triangular mesh facets
function parametricRibbon(): Face3D[] {
  const faces: Face3D[] = [];
  const uSteps = 28; // along the ribbon length
  const vSteps = 6;  // across the ribbon width
  const ribbonR = 140; // major radius of the loop
  const ribbonW = 80;  // half-width of the ribbon
  const thickness = 14; // ribbon thickness
  const twists = 1.5;  // number of half-twists (1 = Möbius, 1.5 = more complex)

  // Parametric surface: u goes around the loop [0, 2π], v goes across width [-1, 1]
  function ribbonPoint(u: number, v: number, offset: number): Vec3 {
    const halfTwist = twists * u / 2;
    const cosU = Math.cos(u), sinU = Math.sin(u);
    const cosT = Math.cos(halfTwist), sinT = Math.sin(halfTwist);

    const r = ribbonR + ribbonW * v * cosT + offset * sinT;
    const x = r * cosU;
    const z = r * sinU;
    const y = ribbonW * v * sinT - offset * cosT;

    return [x, y * 0.8, z]; // slight vertical compression
  }

  // Generate outer and inner surfaces, then stitch sides
  for (let ui = 0; ui < uSteps; ui++) {
    for (let vi = 0; vi < vSteps; vi++) {
      const u0 = (ui / uSteps) * Math.PI * 2;
      const u1 = ((ui + 1) / uSteps) * Math.PI * 2;
      const v0 = -1 + (vi / vSteps) * 2;
      const v1 = -1 + ((vi + 1) / vSteps) * 2;

      // Outer surface (offset = +thickness/2)
      const ot = thickness / 2;
      const a = ribbonPoint(u0, v0, ot);
      const b = ribbonPoint(u1, v0, ot);
      const c = ribbonPoint(u1, v1, ot);
      const d = ribbonPoint(u0, v1, ot);
      faces.push({ verts: [a, b, c] });
      faces.push({ verts: [a, c, d] });

      // Inner surface (offset = -thickness/2)
      const it = -thickness / 2;
      const e = ribbonPoint(u0, v0, it);
      const f = ribbonPoint(u1, v0, it);
      const g = ribbonPoint(u1, v1, it);
      const h = ribbonPoint(u0, v1, it);
      faces.push({ verts: [e, g, f] });
      faces.push({ verts: [e, h, g] });

      // Edge strips (v = -1 and v = 1)
      if (vi === 0) {
        const ea = ribbonPoint(u0, v0, ot);
        const eb = ribbonPoint(u1, v0, ot);
        const ec = ribbonPoint(u1, v0, it);
        const ed = ribbonPoint(u0, v0, it);
        faces.push({ verts: [ea, eb, ec] });
        faces.push({ verts: [ea, ec, ed] });
      }
      if (vi === vSteps - 1) {
        const ea = ribbonPoint(u0, v1, ot);
        const eb = ribbonPoint(u1, v1, ot);
        const ec = ribbonPoint(u1, v1, it);
        const ed = ribbonPoint(u0, v1, it);
        faces.push({ verts: [ea, ec, eb] });
        faces.push({ verts: [ea, ed, ec] });
      }
    }
  }

  return faces;
}

export default function IsometricBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const GRID_SIZE = 60;
    const DRIFT_CYCLE = 40000;
    const EDGE_COLOR = "rgba(45, 90, 39, 0.18)";

    const forms: Form[] = [
      // Bottom-right: twisted prism (kept as-is)
      {
        faces: twistedPrism(),
        cx: 0.85, cy: 0.72,
        rotSpeed: (2 * Math.PI) / 75,
        rotOffset: 0,
        baseScale: 1.1,
      },
      // Top-left: parametric curved ribbon, partially cropped
      {
        faces: parametricRibbon(),
        cx: 0.1, cy: 0.38,
        rotSpeed: (2 * Math.PI) / 75,
        rotOffset: Math.PI * 0.3,
        baseScale: 1.15,
      },
    ];

    // Accumulated angles per form - avoids jump when speed changes
    const formAngles = forms.map(f => f.rotOffset);
    let lastTime = 0;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    function shadeFace(normal: Vec3): string {
      const d = dot(normal, normalize(LIGHT));
      const brightness = 0.35 + 0.65 * Math.max(0, d);
      // Forest green palette: dark faces ~#1A2A1A, light faces ~#4A7A44
      const r = Math.round(26 + 48 * brightness);
      const g = Math.round(42 + 80 * brightness);
      const b = Math.round(26 + 42 * brightness);
      const alpha = 0.10 + 0.08 * brightness;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function draw(time: number) {
      const dt = lastTime > 0 ? (time - lastTime) * 0.001 : 0;
      lastTime = time;

      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      const w = canvas!.width;
      const h = canvas!.height;

      // ── Layer 1: 2D grid (70% opacity) ──
      const driftProgress = (time % DRIFT_CYCLE) / DRIFT_CYCLE;
      const driftX = -driftProgress * GRID_SIZE;
      const driftY = driftProgress * GRID_SIZE * 0.5;

      ctx!.save();
      ctx!.globalAlpha = 0.70;
      ctx!.strokeStyle = "rgba(45, 90, 39, 0.10)";
      ctx!.lineWidth = 0.5;

      const startX = (driftX % GRID_SIZE) - GRID_SIZE;
      for (let x = startX; x < w + GRID_SIZE; x += GRID_SIZE) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
        ctx!.stroke();
      }
      const startY = (driftY % GRID_SIZE) - GRID_SIZE;
      for (let y = startY; y < h + GRID_SIZE; y += GRID_SIZE) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
      }
      ctx!.restore();

      // ── Layer 2: 3D forms (55% opacity) ──
      ctx!.save();
      ctx!.globalAlpha = 0.55;
      const viewScale = Math.min(w, h) / 900;
      const speed = hoveredRef.current ? 0.5 : 1.0;

      for (let fi = 0; fi < forms.length; fi++) {
        formAngles[fi] += forms[fi].rotSpeed * speed * dt;
      }

      for (let fi = 0; fi < forms.length; fi++) {
        const form = forms[fi];
        const cx = form.cx * w;
        const cy = form.cy * h;
        const angle = formAngles[fi];
        const s = viewScale * form.baseScale;

        const projected: { pts2d: Vec2[]; depth: number; normal: Vec3 }[] = [];

        for (const face of form.faces) {
          const rotated = face.verts.map((v) => rotateY(v, angle));
          const pts2d = rotated.map((v) => project(v, cx, cy, s));
          const avgDepth = rotated.reduce((sum, v) => sum + v[2], 0) / rotated.length;
          const normal = face.verts.length >= 3
            ? faceNormal(rotated[0], rotated[1], rotated[2])
            : [0, 1, 0] as Vec3;
          projected.push({ pts2d, depth: avgDepth, normal });
        }

        projected.sort((a, b) => a.depth - b.depth);

        for (const { pts2d, normal } of projected) {
          if (normal[2] < -0.1) continue;

          ctx!.beginPath();
          ctx!.moveTo(pts2d[0][0], pts2d[0][1]);
          for (let i = 1; i < pts2d.length; i++) ctx!.lineTo(pts2d[i][0], pts2d[i][1]);
          ctx!.closePath();

          ctx!.fillStyle = shadeFace(normal);
          ctx!.fill();
          ctx!.strokeStyle = EDGE_COLOR;
          ctx!.lineWidth = 0.5;
          ctx!.stroke();
        }
      }

      ctx!.restore();
      animationId = requestAnimationFrame(draw);
    }

    const onEnter = () => { hoveredRef.current = true; };
    const onLeave = () => { hoveredRef.current = false; };

    resize();
    animationId = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
}
